/**
 * Express application factory, dual-bot Telegram webhook/polling router,
 * team WhatsApp notification dispatcher, and end-of-day Next-Day PDF scheduler
 * for Elara Atelier — shared between Node (server.ts) and Vercel Serverless (api/index.js).
 */

import express, { type Express, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLINIC_CONFIG } from '../config/clinicConfig';
import {
  ConciergeStore,
  type ConciergeBookingRecord,
  type ConciergeProfileRecord,
} from './conciergeStore';
import {
  generatePatientSchedulePdf,
  getClinicDateTimeParts,
} from './pdfSchedule';
import {
  buildPatientStatusUpdateMessage,
  buildTeamPatientAlertCard,
  dispatchMorningBookingsDigest,
  dispatchNextDaySchedulePdf,
  processTeamBotUpdate,
  registerTeamBotCommands,
} from './teamTelegramBot';
import {
  buildMainMenuReplyKeyboard,
  dispatchTelegramActions,
  escapeTelegramHtml,
  processTelegramUpdate,
  registerBotCommands,
  type BotWebSyncEvent,
  type TelegramUpdatePayload,
} from './telegramBot';

interface FirebaseAppletConfig {
  apiKey?: string;
  projectId?: string;
}

interface TelegramNotifyBody {
  bookingId?: string;
  isUpdate?: boolean;
  userId?: string;
  fullName?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  phone?: string;
  messagingConsent?: boolean;
  whatsappCountryCode?: string;
  whatsappNumber?: string;
  treatmentId?: string;
  treatmentName?: string;
  preferredDateTime?: string;
  telegramMethod?: string;
  telegramValue?: string;
  chatId?: string;
  createdAtMs?: number;
}

interface SyncRequestBody {
  profile?: Omit<ConciergeProfileRecord, 'userId' | 'updatedAtMs'> | null;
  bookings?: ConciergeBookingRecord[];
}

export interface CreateAppResult {
  app: Express;
  store: ConciergeStore;
  broadcastSyncEvents: (events: BotWebSyncEvent[]) => void;
}

/**
 * Load Firebase public web API key from firebase-applet-config.json for verifying Firebase ID tokens.
 * Inputs: none (reads root firebase-applet-config.json).
 * Output: Firebase Web API key string, or empty string if unavailable.
 */
function loadFirebaseApiKey(): string {
  const candidates = [path.resolve(process.cwd(), 'firebase-applet-config.json')];
  try {
    const moduleDir =
      typeof __dirname !== 'undefined'
        ? __dirname
        : typeof import.meta !== 'undefined' && import.meta.url
          ? path.dirname(fileURLToPath(import.meta.url))
          : null;
    if (moduleDir) {
      candidates.push(path.resolve(moduleDir, '../../firebase-applet-config.json'));
      candidates.push(path.resolve(moduleDir, '../firebase-applet-config.json'));
    }
  } catch {
    // Fallback to process.cwd() candidate only
  }
  for (const configPath of candidates) {
    try {
      if (!fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw) as FirebaseAppletConfig;
      if (parsed.apiKey?.trim()) {
        return parsed.apiKey.trim();
      }
    } catch {
      // Try next candidate path
    }
  }
  return '';
}

/**
 * Verify a client Firebase Auth ID token using Firebase Identity Toolkit accounts:lookup.
 * Inputs: raw Bearer token string and Firebase web apiKey.
 * Output: verified Firebase UID string, or null if invalid/unverified.
 */
async function verifyFirebaseIdToken(idToken: string, apiKey: string): Promise<string | null> {
  if (!idToken || !apiKey) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as { users?: Array<{ localId?: string }> };
    const uid = data.users?.[0]?.localId;
    return typeof uid === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(uid) ? uid : null;
  } catch {
    return null;
  }
}

/**
 * Send an interactive HTML card via Telegram Bot API sendMessage.
 * Inputs: botToken, chatId, HTML text, optional Telegram reply_markup.
 * Output: boolean true if Telegram accepted the message.
 */
async function sendTelegramCard(
  botToken: string,
  chatId: string,
  text: string,
  reply_markup?: unknown
): Promise<boolean> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup,
    }),
  });
  return response.ok;
}

/**
 * Resolve writable concierge store path depending on whether running in Vercel serverless or local Node.
 * Inputs: none.
 * Output: filesystem path string for JSON persistence.
 */
function resolveStoreFilePath(): string {
  if (process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV)) {
    return '/tmp/.elara-concierge-store.json';
  }
  return path.resolve(process.cwd(), '.elara-concierge-store.json');
}

/**
 * Resolve the Telegram bot token used for Doctors / Team alerts (supports dedicated TELEGRAM_TEAM_BOT_TOKEN
 * with clean fallback to TELEGRAM_BOT_TOKEN when sharing a single bot).
 * Output: token string or empty string.
 */
function resolveTeamBotToken(): string {
  return (
    process.env.TELEGRAM_TEAM_BOT_TOKEN?.trim() ||
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    ''
  );
}

/**
 * Extract the chat ID from a Telegram message or callback query payload.
 * Inputs: TelegramUpdatePayload.
 * Output: chatId string or empty string.
 */
function extractUpdateChatId(update: TelegramUpdatePayload): string {
  if (update.callback_query?.message?.chat?.id !== undefined) {
    return String(update.callback_query.message.chat.id);
  }
  if (update.message?.chat?.id !== undefined) {
    return String(update.message.chat.id);
  }
  return '';
}

/**
 * Dispatch an individual patient booking card (including the 1-click WhatsApp confirmation button)
 * to every registered Doctors / Team Telegram chat.
 * Inputs: store, booking record, optional heading string.
 * Output: count of successfully delivered team alerts.
 */
async function pushIndividualTeamBookingAlert(
  store: ConciergeStore,
  booking: ConciergeBookingRecord,
  heading?: string
): Promise<number> {
  const teamBotToken = resolveTeamBotToken();
  const teamChatIds = store.getTeamChatIds(
    process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CONCIERGE_CHAT_ID
  );
  if (!teamBotToken || teamChatIds.length === 0) {
    return 0;
  }

  const card = buildTeamPatientAlertCard(booking, heading);
  let delivered = 0;
  for (const teamChatId of teamChatIds) {
    try {
      const ok = await sendTelegramCard(teamBotToken, teamChatId, card.text, card.reply_markup);
      if (ok) delivered += 1;
    } catch {
      // Continue notifying remaining team chats
    }
  }
  return delivered;
}

/**
 * Execute an incoming Doctors / Team Bot update end-to-end:
 * state mutation, SSE website broadcast, team message actions, patient confirmation alerts, and PDF dispatches.
 * Inputs: store, teamBotToken, patientBotToken, TelegramUpdatePayload, broadcastSyncEvents fn.
 */
async function executeTeamBotUpdate(
  store: ConciergeStore,
  teamBotToken: string,
  patientBotToken: string,
  update: TelegramUpdatePayload,
  broadcastSyncEvents: (events: BotWebSyncEvent[]) => void
): Promise<void> {
  const result = processTeamBotUpdate(store, update, {
    teamPasscode: process.env.TELEGRAM_TEAM_PASSCODE,
  });

  broadcastSyncEvents(result.syncEvents);

  if (teamBotToken && result.actions.length > 0) {
    await dispatchTelegramActions(teamBotToken, result.actions);
  }

  if (patientBotToken) {
    for (const notify of result.patientNotifyEvents) {
      try {
        await sendTelegramCard(
          patientBotToken,
          notify.chatId,
          buildPatientStatusUpdateMessage(notify.booking),
          buildMainMenuReplyKeyboard(true)
        );
      } catch {
        // Ignore transient patient notification errors
      }
    }
  }

  if (teamBotToken) {
    for (const pdfReq of result.sendPdfRequests) {
      await dispatchNextDaySchedulePdf({
        store,
        teamBotToken,
        targetChatIds: [pdfReq.chatId],
        targetIsoDate: pdfReq.targetIsoDate,
        displayDateLabel: pdfReq.displayDateLabel,
      });
    }
  }
}

/**
 * Execute an incoming Patient Bot update end-to-end, forwarding patient reschedules/cancellations
 * as individual update cards to the Team Bot as well.
 * Inputs: store, patientBotToken, update, broadcastSyncEvents fn.
 */
async function executePatientBotUpdate(
  store: ConciergeStore,
  patientBotToken: string,
  update: TelegramUpdatePayload,
  broadcastSyncEvents: (events: BotWebSyncEvent[]) => void
): Promise<void> {
  const { actions, syncEvents } = processTelegramUpdate(store, update);
  broadcastSyncEvents(syncEvents);

  if (patientBotToken && actions.length > 0) {
    await dispatchTelegramActions(patientBotToken, actions);
  }

  for (const ev of syncEvents) {
    if (ev.type === 'booking_updated') {
      const heading =
        ev.booking.status === 'cancelled'
          ? 'ELARA ATELIER · PATIENT CANCELLED VISIT'
          : 'ELARA ATELIER · PATIENT RESCHEDULED VISIT';
      await pushIndividualTeamBookingAlert(store, ev.booking, heading);
    }
  }
}

/**
 * Construct and configure the Express API router for Elara Atelier concierge & dual-bot Telegram workflows.
 * Inputs: none.
 * Output: CreateAppResult holding configured Express instance, store, and SSE broadcaster.
 */
export function createExpressApp(): CreateAppResult {
  const app = express();
  app.use(express.json());

  const store = new ConciergeStore(resolveStoreFilePath());
  const firebaseApiKey = loadFirebaseApiKey();
  const sseClients = new Set<Response>();

  /**
   * Broadcast live bot/website sync events to all open SSE clients.
   * Inputs: array of BotWebSyncEvent objects.
   */
  const broadcastSyncEvents = (events: BotWebSyncEvent[]) => {
    if (events.length === 0) return;
    for (const ev of events) {
      const payload = `data: ${JSON.stringify(ev)}\n\n`;
      for (const client of sseClients) {
        client.write(payload);
      }
    }
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, runtime: process.env.VERCEL ? 'vercel' : 'node' });
  });

  app.get('/api/telegram/status', (_req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const teamBotToken = process.env.TELEGRAM_TEAM_BOT_TOKEN?.trim() || '';
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME?.trim() || 'ElaraAtelierBot').replace(
      /^@/,
      ''
    );
    const teamBotUsername = (
      process.env.TELEGRAM_TEAM_BOT_USERNAME?.trim() || CLINIC_CONFIG.defaultTeamBotUsername
    ).replace(/^@/, '');
    const teamChats = store.getTeamChatIds(
      process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CONCIERGE_CHAT_ID
    );
    res.json({
      botConfigured: Boolean(botToken),
      botUsername,
      teamBotConfigured: Boolean(teamBotToken || teamChats.length > 0),
      teamBotUsername,
    });
  });

  // Real-time Server-Sent Events stream notifying open browser tabs when Telegram Bot updates a booking
  app.get('/api/telegram/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Two-way sync between verified signed-in web client (Firestore) and Telegram concierge store
  app.post('/api/telegram/sync', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const verifiedUid = await verifyFirebaseIdToken(idToken, firebaseApiKey);

    if (!verifiedUid) {
      res.status(401).json({ ok: false, error: 'Unauthorized Firebase session.' });
      return;
    }

    const body = (req.body || {}) as SyncRequestBody;
    const incomingProfile = body.profile ?? null;
    const incomingBookings = Array.isArray(body.bookings) ? body.bookings : [];

    const { botUpdatedBookings, linkedChatId } = store.syncFromWebUser(
      verifiedUid,
      incomingProfile,
      incomingBookings
    );

    res.json({
      ok: true,
      linkedChatId,
      botUpdatedBookings,
    });
  });

  // Load direct concierge chat thread for the signed-in patient
  app.get('/api/telegram/chat', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const verifiedUid = await verifyFirebaseIdToken(idToken, firebaseApiKey);

    if (!verifiedUid) {
      res.status(401).json({ ok: false, error: 'Unauthorized Firebase session.' });
      return;
    }

    const linkedChatId = store.getLinkedChatIdForUser(verifiedUid);
    const messages = store.getMessagesForUser(verifiedUid);
    res.json({
      ok: true,
      linkedChatId,
      messages,
    });
  });

  // Send a direct concierge message from the website Profile and mirror it to Telegram if linked
  app.post('/api/telegram/chat', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const verifiedUid = await verifyFirebaseIdToken(idToken, firebaseApiKey);

    if (!verifiedUid) {
      res.status(401).json({ ok: false, error: 'Unauthorized Firebase session.' });
      return;
    }

    const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!rawText || rawText.length > 1000) {
      res.status(400).json({ ok: false, error: 'Please enter a message up to 1,000 characters.' });
      return;
    }

    const linkedChatId = store.getLinkedChatIdForUser(verifiedUid);
    const record = store.addConciergeMessage({
      chatId: linkedChatId || undefined,
      userId: verifiedUid,
      sender: 'patient',
      text: rawText,
      source: 'website',
    });

    broadcastSyncEvents([
      {
        type: 'concierge_message',
        message: record,
        userId: verifiedUid,
      },
    ]);

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    let sentToTelegram = false;
    if (botToken && linkedChatId) {
      try {
        sentToTelegram = await sendTelegramCard(
          botToken,
          linkedChatId,
          [
            `<b>Concierge Note Sent from Website</b>`,
            ``,
            `<i>“${escapeTelegramHtml(rawText)}”</i>`,
            ``,
            `Our Beverly Hills studio team has received your note. You can reply right below anytime.`,
          ].join('\n'),
          buildMainMenuReplyKeyboard(true)
        );
      } catch {
        sentToTelegram = false;
      }
    }

    res.json({
      ok: true,
      linkedChatId,
      sentToTelegram,
      message: record,
    });
  });

  // Guest booking live state lookup (only exposes non-sensitive treatment/schedule timing by bookingId)
  app.get('/api/telegram/booking/:bookingId', (req, res) => {
    const bookingId = String(req.params.bookingId || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const booking = store.getBookingById(bookingId);
    if (!booking) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json({
      ok: true,
      booking: {
        id: booking.id,
        preferredDateTime: booking.preferredDateTime,
        status: booking.status,
        updatedVia: booking.updatedVia || 'web',
        updatedAtMs: booking.updatedAtMs,
      },
    });
  });

  // Register a booking and notify the clinical Team Bot ONCE when the booking is submitted (or explicitly updated)
  app.post('/api/telegram/notify', async (req, res) => {
    const body = (req.body || {}) as TelegramNotifyBody;
    const bookingId = String(body.bookingId || `bk_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');

    const phoneFallback = String(body.phone || '').trim();
    const fallbackCodeMatch = /^(\+\d{1,4})\s*(\d+)$/.exec(phoneFallback);
    const primaryCode = String(body.phoneCountryCode || fallbackCodeMatch?.[1] || '+1');
    const primaryDigits = String(body.phoneNumber || fallbackCodeMatch?.[2] || '').replace(
      /\D/g,
      ''
    );

    const messagingConsent = body.messagingConsent !== false;
    const whatsappCode = String(body.whatsappCountryCode || primaryCode).trim() || '+1';
    const whatsappDigits = messagingConsent
      ? String(body.whatsappNumber || primaryDigits).replace(/\D/g, '') || primaryDigits
      : '';

    const alreadyExists = Boolean(store.getBookingById(bookingId));
    const isExplicitUpdate = Boolean(body.isUpdate);

    const record = store.upsertBooking({
      id: bookingId,
      userId: body.userId ? String(body.userId) : null,
      fullName: String(body.fullName || 'Guest'),
      phoneCountryCode: primaryCode,
      phoneNumber: primaryDigits,
      messagingConsent,
      whatsappCountryCode: messagingConsent ? whatsappCode : undefined,
      whatsappNumber: messagingConsent ? whatsappDigits : undefined,
      treatmentId: String(body.treatmentId || 'consultation'),
      treatmentName: String(body.treatmentName || 'Consultation'),
      preferredDateTime: String(body.preferredDateTime || ''),
      telegramMethod: 'phone',
      telegramValue: `${primaryCode}${primaryDigits}`,
      status: 'requested',
      createdAtMs: typeof body.createdAtMs === 'number' ? body.createdAtMs : Date.now(),
      updatedAtMs: Date.now(),
      chatId: body.chatId?.trim() || undefined,
    });

    // Notify Doctors / Clinical Team Bot ONCE when a new booking is created (or on explicit edit)
    let teamDeliveredCount = 0;
    if (!alreadyExists || isExplicitUpdate) {
      const heading = isExplicitUpdate
        ? 'ELARA ATELIER · BOOKING UPDATED'
        : 'ELARA ATELIER · NEW PATIENT BOOKING';
      teamDeliveredCount = await pushIndividualTeamBookingAlert(store, record, heading);
    }

    res.json({
      ok: true,
      sent: teamDeliveredCount > 0,
      teamNotified: teamDeliveredCount > 0,
      mode: messagingConsent ? 'whatsapp' : 'call_only',
    });
  });

  // Trigger Morning Bookings List (used by Vercel Cron at 8:30 AM PT or manual clinic trigger)
  // Sends NOTHING when there are 0 active bookings for the date.
  const handleDailyReportRequest = async (
    req: express.Request,
    res: express.Response
  ): Promise<void> => {
    const expectedSecret = process.env.CRON_SECRET?.trim();
    if (expectedSecret) {
      const authHeader = req.headers.authorization || '';
      if (authHeader !== `Bearer ${expectedSecret}`) {
        res.status(401).json({ ok: false, error: 'Unauthorized cron request.' });
        return;
      }
    }

    const requestedDate =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : undefined;

    if (req.query.download === '1' || req.query.format === 'pdf') {
      const todayLocal = getClinicDateTimeParts(new Date(), CLINIC_CONFIG.clinicTimeZone);
      const targetIso = requestedDate || todayLocal.isoDate;
      const displayLabel = requestedDate || todayLocal.isoDate;
      const pdfBuffer = generatePatientSchedulePdf({
        targetDateIso: targetIso,
        displayDateLabel: displayLabel,
        bookings: store.getBookingsForDate(targetIso),
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="Elara-Atelier-Patients-${targetIso}.pdf"`
      );
      res.send(pdfBuffer);
      return;
    }

    const teamBotToken = resolveTeamBotToken();
    const teamChatIds = store.getTeamChatIds(
      process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CONCIERGE_CHAT_ID
    );

    if (!teamBotToken || teamChatIds.length === 0) {
      res.json({
        ok: false,
        skipped: true,
        sentCount: 0,
        message: 'Team Bot token or team chat ID is not configured yet.',
      });
      return;
    }

    const todayLocal = getClinicDateTimeParts(new Date(), CLINIC_CONFIG.clinicTimeZone);
    const targetIsoDate = requestedDate || todayLocal.isoDate;
    const forceSend = req.query.force === '1';

    if (!forceSend && store.getLastDailyPdfSentForDate() === targetIsoDate) {
      res.json({
        ok: true,
        skipped: true,
        reason: 'already_sent_today',
        sentCount: 0,
        patientCount: store.getBookingsForDate(targetIsoDate).length,
        targetIsoDate,
      });
      return;
    }

    const result = await dispatchMorningBookingsDigest({
      store,
      teamBotToken,
      targetChatIds: teamChatIds,
      targetIsoDate,
      displayDateLabel: requestedDate,
    });

    if (!result.skipped && result.ok) {
      store.markDailyPdfSent(result.targetIsoDate);
    }

    res.json(result);
  };

  app.get('/api/telegram/daily-report', (req, res) => {
    void handleDailyReportRequest(req, res);
  });
  app.post('/api/telegram/daily-report', (req, res) => {
    void handleDailyReportRequest(req, res);
  });

  // Patient Bot Webhook endpoint (also routes team-chat updates cleanly when sharing a single bot token)
  app.post('/api/telegram/webhook', async (req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const hasDedicatedTeamToken = Boolean(process.env.TELEGRAM_TEAM_BOT_TOKEN?.trim());
    const update = (req.body || {}) as TelegramUpdatePayload;
    const incomingChatId = extractUpdateChatId(update);
    const configuredTeamIds = store.getTeamChatIds(
      process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CONCIERGE_CHAT_ID
    );

    if (!hasDedicatedTeamToken && incomingChatId && configuredTeamIds.includes(incomingChatId)) {
      await executeTeamBotUpdate(store, botToken, botToken, update, broadcastSyncEvents);
    } else {
      await executePatientBotUpdate(store, botToken, update, broadcastSyncEvents);
    }

    res.json({ ok: true });
  });

  // Dedicated Doctors / Clinical Team Bot Webhook endpoint
  app.post('/api/telegram/team-webhook', async (req, res) => {
    const teamBotToken = resolveTeamBotToken();
    const patientBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const update = (req.body || {}) as TelegramUpdatePayload;

    await executeTeamBotUpdate(store, teamBotToken, patientBotToken, update, broadcastSyncEvents);
    res.json({ ok: true });
  });

  return {
    app,
    store,
    broadcastSyncEvents,
  };
}

/**
 * Start a long-polling loop for a single Telegram Bot token if webhook is not configured.
 * Inputs: botToken, onUpdate async callback.
 */
async function startSingleBotPoller(
  botToken: string,
  onUpdate: (update: TelegramUpdatePayload) => Promise<void>
): Promise<void> {
  try {
    const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const infoJson = (await infoRes.json()) as { ok?: boolean; result?: { url?: string } };
    if (infoJson?.result?.url) {
      return;
    }
    let offset = 0;
    const poll = async () => {
      try {
        const resp = await fetch(
          `https://api.telegram.org/bot${botToken}/getUpdates?timeout=25&offset=${offset}`
        );
        if (resp.ok) {
          const payload = (await resp.json()) as {
            ok?: boolean;
            result?: TelegramUpdatePayload[];
          };
          for (const upd of payload.result || []) {
            if (typeof upd.update_id === 'number') {
              offset = Math.max(offset, upd.update_id + 1);
            }
            await onUpdate(upd);
          }
        }
      } catch {
        // Back off gently on network glitches
      }
      setTimeout(() => {
        void poll();
      }, 1200);
    };
    void poll();
  } catch {
    // Ignore polling startup failure when offline
  }
}

/**
 * Start background Telegram long-polling (Patient Bot + Team Bot) and End-of-Day Next-Day PDF
 * scheduler when running on a persistent Node server (disabled on Vercel serverless).
 * Inputs: ConciergeStore instance and SSE sync broadcaster.
 */
export function startTelegramPollingIfEnabled(
  store: ConciergeStore,
  broadcastSyncEvents: (events: BotWebSyncEvent[]) => void
): void {
  if (process.env.TELEGRAM_USE_POLLING === 'false' || process.env.VERCEL) {
    return;
  }

  const patientBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const dedicatedTeamToken = process.env.TELEGRAM_TEAM_BOT_TOKEN?.trim() || '';
  const effectiveTeamToken = dedicatedTeamToken || patientBotToken;

  if (patientBotToken) {
    void registerBotCommands(patientBotToken);
    const configuredTeamIds = store.getTeamChatIds(
      process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CONCIERGE_CHAT_ID
    );
    void startSingleBotPoller(patientBotToken, async upd => {
      const chatId = extractUpdateChatId(upd);
      if (!dedicatedTeamToken && chatId && configuredTeamIds.includes(chatId)) {
        await executeTeamBotUpdate(store, patientBotToken, patientBotToken, upd, broadcastSyncEvents);
      } else {
        await executePatientBotUpdate(store, patientBotToken, upd, broadcastSyncEvents);
      }
    });
  }

  if (dedicatedTeamToken && dedicatedTeamToken !== patientBotToken) {
    void registerTeamBotCommands(dedicatedTeamToken);
    void startSingleBotPoller(dedicatedTeamToken, async upd => {
      await executeTeamBotUpdate(
        store,
        dedicatedTeamToken,
        patientBotToken,
        upd,
        broadcastSyncEvents
      );
    });
  }

  // Automatic Morning Bookings List scheduler (8:30 AM America/Los_Angeles)
  // Strictly skips sending when there are 0 bookings for today.
  if (effectiveTeamToken) {
    const checkAndSendMorningList = async () => {
      const teamChatIds = store.getTeamChatIds(
        process.env.TELEGRAM_TEAM_CHAT_ID || process.env.TELEGRAM_CONCIERGE_CHAT_ID
      );
      if (teamChatIds.length === 0) return;

      const now = new Date();
      const localNow = getClinicDateTimeParts(now, CLINIC_CONFIG.clinicTimeZone);
      const pastMorningTrigger =
        localNow.hour > CLINIC_CONFIG.morningDigestHour ||
        (localNow.hour === CLINIC_CONFIG.morningDigestHour &&
          localNow.minute >= CLINIC_CONFIG.morningDigestMinute);
      const stillInMorningWindow = localNow.hour < 12;

      if (!pastMorningTrigger || !stillInMorningWindow) return;

      if (store.getLastDailyPdfSentForDate() === localNow.isoDate) {
        return;
      }

      const result = await dispatchMorningBookingsDigest({
        store,
        teamBotToken: effectiveTeamToken,
        targetChatIds: teamChatIds,
        targetIsoDate: localNow.isoDate,
        nowMs: now.getTime(),
      });
      if (!result.skipped && result.ok) {
        store.markDailyPdfSent(localNow.isoDate);
      }
    };

    const timer = setInterval(() => {
      void checkAndSendMorningList();
    }, 60_000);
    timer.unref?.();
  }
}
