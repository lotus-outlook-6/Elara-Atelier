/**
 * Express application factory and Telegram Bot polling helper for Elara Atelier.
 * Shared between local/Docker long-running Node server (server.ts) and Vercel
 * Serverless Functions (api/index.ts).
 */

import express, { type Express, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConciergeStore,
  type ConciergeBookingRecord,
  type ConciergeProfileRecord,
} from './conciergeStore';
import {
  buildBookingPushCard,
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
  userId?: string;
  fullName?: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  phone?: string;
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
 * Construct and configure the Express API router for Elara Atelier concierge & Telegram integration.
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
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME?.trim() || 'ElaraAtelierBot').replace(
      /^@/,
      ''
    );
    res.json({
      botConfigured: Boolean(botToken),
      botUsername,
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

  // Register a booking and push an interactive card strictly to that matched user's Telegram chat
  app.post('/api/telegram/notify', async (req, res) => {
    const body = (req.body || {}) as TelegramNotifyBody;
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME?.trim() || 'ElaraAtelierBot').replace(
      /^@/,
      ''
    );
    const bookingId = String(body.bookingId || `bk_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
    const deepLink = `https://t.me/${botUsername}?start=${bookingId}`;

    const phoneFallback = String(body.phone || '').trim();
    const fallbackCodeMatch = /^(\+\d{1,4})\s*(\d+)$/.exec(phoneFallback);

    const record = store.upsertBooking({
      id: bookingId,
      userId: body.userId ? String(body.userId) : null,
      fullName: String(body.fullName || 'Guest'),
      phoneCountryCode: String(body.phoneCountryCode || fallbackCodeMatch?.[1] || '+1'),
      phoneNumber: String(body.phoneNumber || fallbackCodeMatch?.[2] || '').replace(/\D/g, ''),
      treatmentId: String(body.treatmentId || 'consultation'),
      treatmentName: String(body.treatmentName || 'Consultation'),
      preferredDateTime: String(body.preferredDateTime || ''),
      telegramMethod: body.telegramMethod === 'phone' ? 'phone' : 'username',
      telegramValue: String(body.telegramValue || ''),
      status: 'requested',
      createdAtMs: typeof body.createdAtMs === 'number' ? body.createdAtMs : Date.now(),
      updatedAtMs: Date.now(),
      chatId: body.chatId?.trim() || undefined,
    });

    if (!botToken) {
      res.json({
        ok: true,
        sent: false,
        mode: 'deep_link',
        deepLink,
        message: 'TELEGRAM_BOT_TOKEN not configured; deep link returned.',
      });
      return;
    }

    // Strict per-user routing: only send directly if we have a verified chatId matching this user's handle or phone
    const matchedChatId = store.findChatIdForBooking(record);
    if (!matchedChatId) {
      res.json({
        ok: true,
        sent: false,
        mode: 'pending_bot_start',
        deepLink,
        message: 'Tap the Telegram bot link to open your private concierge menu.',
      });
      return;
    }

    const card = buildBookingPushCard(record);
    try {
      const sent = await sendTelegramCard(botToken, matchedChatId, card.text, card.reply_markup);
      res.json({
        ok: true,
        sent,
        mode: sent ? 'bot_api' : 'deep_link',
        deepLink,
      });
    } catch {
      res.json({
        ok: true,
        sent: false,
        mode: 'deep_link',
        deepLink,
      });
    }
  });

  // Interactive Telegram Webhook endpoint for /start, contact verification, inline buttons & rescheduling
  app.post('/api/telegram/webhook', async (req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const update = (req.body || {}) as TelegramUpdatePayload;
    const { actions, syncEvents } = processTelegramUpdate(store, update);

    broadcastSyncEvents(syncEvents);
    if (botToken && actions.length > 0) {
      await dispatchTelegramActions(botToken, actions);
    }

    res.json({ ok: true });
  });

  return {
    app,
    store,
    broadcastSyncEvents,
  };
}

/**
 * Start background Telegram long-polling when running on a persistent Node server (disabled on Vercel).
 * Inputs: ConciergeStore instance and SSE sync broadcaster.
 */
export function startTelegramPollingIfEnabled(
  store: ConciergeStore,
  broadcastSyncEvents: (events: BotWebSyncEvent[]) => void
): void {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  if (!botToken || process.env.TELEGRAM_USE_POLLING === 'false' || process.env.VERCEL) {
    return;
  }

  void registerBotCommands(botToken);
  void (async () => {
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
              const { actions, syncEvents } = processTelegramUpdate(store, upd);
              broadcastSyncEvents(syncEvents);
              if (actions.length > 0) {
                await dispatchTelegramActions(botToken, actions);
              }
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
  })();
}
