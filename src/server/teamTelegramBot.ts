/**
 * Dedicated Doctors & Clinical Team Telegram Bot handler for Elara Atelier.
 * Receives individual notifications once when a patient booking is submitted (with a 1-click customized
 * WhatsApp confirmation link pre-filled with the patient's treatment, date, and time),
 * supports instant team confirm/cancel status updates synced back to the website,
 * and delivers a morning list of all scheduled bookings ONLY on days with at least 1 booking.
 */

import { CLINIC_CONFIG } from '../config/clinicConfig';
import { buildTeamWhatsAppConfirmationUrl } from '../utils/booking';
import {
  ConciergeStore,
  type ConciergeBookingRecord,
} from './conciergeStore';
import {
  generatePatientSchedulePdf,
  getClinicDateTimeParts,
  getNextClinicDateIso,
} from './pdfSchedule';
import {
  escapeTelegramHtml,
  formatBotDateTime,
  type BotWebSyncEvent,
  type OutgoingTelegramAction,
  type TelegramInlineButton,
  type TelegramReplyMarkup,
  type TelegramUpdatePayload,
} from './telegramBot';

export const TEAM_MENU_LABELS = {
  pending: '⏳ Pending Confirmations',
  today: '📋 Today Patients',
  tomorrow: '📆 Tomorrow Patients',
  tomorrowPdf: '📄 Tomorrow PDF',
} as const;

export interface TeamPdfSendRequest {
  chatId: string;
  targetIsoDate: string;
  displayDateLabel: string;
}

export interface PatientStatusPushEvent {
  chatId: string;
  booking: ConciergeBookingRecord;
}

export interface ProcessTeamUpdateResult {
  actions: OutgoingTelegramAction[];
  syncEvents: BotWebSyncEvent[];
  sendPdfRequests: TeamPdfSendRequest[];
  patientNotifyEvents: PatientStatusPushEvent[];
}

/**
 * Build the persistent bottom Reply Keyboard for the Doctors / Team Bot.
 * Output: TelegramReplyMarkup keyboard object.
 */
export function buildTeamMainMenuKeyboard(): TelegramReplyMarkup {
  return {
    keyboard: [
      [{ text: TEAM_MENU_LABELS.pending }, { text: TEAM_MENU_LABELS.tomorrowPdf }],
      [{ text: TEAM_MENU_LABELS.today }, { text: TEAM_MENU_LABELS.tomorrow }],
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Team command or /tomorrowpdf…',
  };
}

/**
 * Resolve effective WhatsApp E.164 digits and formatted display number from a booking record.
 * Inputs: ConciergeBookingRecord.
 * Output: { digits, display }.
 */
export function resolveBookingWhatsAppDisplay(booking: ConciergeBookingRecord): {
  digits: string;
  display: string;
} {
  const code = booking.whatsappCountryCode || booking.phoneCountryCode || '+1';
  const num = booking.whatsappNumber || booking.phoneNumber || '';
  const digits = `${code}${num}`.replace(/\D/g, '');
  const display = num ? `${code} ${num}`.trim() : 'Not provided';
  return { digits, display };
}

/**
 * Build an individual Team Bot notification card for a single patient booking,
 * including a 1-click WhatsApp confirmation link button pre-filled with treatment & schedule details.
 * Inputs: ConciergeBookingRecord, optional heading override.
 * Output: HTML text and inline_keyboard markup.
 */
export function buildTeamPatientAlertCard(
  booking: ConciergeBookingRecord,
  heading = 'ELARA ATELIER · PATIENT BOOKING'
): {
  text: string;
  reply_markup: { inline_keyboard: TelegramInlineButton[][] };
} {
  const allowsMessaging = booking.messagingConsent !== false;
  const wa = resolveBookingWhatsAppDisplay(booking);
  const waUrl =
    allowsMessaging && wa.digits
      ? buildTeamWhatsAppConfirmationUrl({
          patientName: booking.fullName,
          whatsappDigits: wa.digits,
          treatmentName: booking.treatmentName,
          preferredDateTime: booking.preferredDateTime,
        })
      : '';

  const statusBadge =
    booking.status === 'confirmed'
      ? '✅ CONFIRMED'
      : booking.status === 'cancelled'
        ? '❌ CANCELLED'
        : allowsMessaging
          ? '⏳ AWAITING WHATSAPP CONFIRMATION'
          : '📞 AWAITING PHONE CALL CONFIRMATION';

  const lines: string[] = [
    `<b>${escapeTelegramHtml(heading)}</b>`,
    ``,
    `<b>Patient:</b> ${escapeTelegramHtml(booking.fullName)}`,
    `<b>Treatment:</b> ${escapeTelegramHtml(booking.treatmentName)}`,
    `<b>Date &amp; Time:</b> ${escapeTelegramHtml(formatBotDateTime(booking.preferredDateTime))}`,
    allowsMessaging
      ? `<b>WhatsApp:</b> <code>${escapeTelegramHtml(wa.display)}</code>`
      : `<b>Contact Rule:</b> Phone Call Only (No WhatsApp consent)`,
    `<b>Phone (Call):</b> <code>${escapeTelegramHtml(`${booking.phoneCountryCode} ${booking.phoneNumber}`)}</code>`,
    `<b>Status:</b> <b>${statusBadge}</b>`,
    `<b>Ref:</b> <code>${escapeTelegramHtml(booking.id)}</code>`,
  ];

  const inline_keyboard: TelegramInlineButton[][] = [];
  if (waUrl && booking.status !== 'cancelled') {
    inline_keyboard.push([
      {
        text: '💬 Confirm on WhatsApp (1-Click)',
        url: waUrl,
      },
    ]);
  }

  if (booking.status === 'requested') {
    inline_keyboard.push([
      { text: '✅ Mark Confirmed', callback_data: `team:confirm:${booking.id}` },
      { text: '❌ Cancel Visit', callback_data: `team:cancel:${booking.id}` },
    ]);
  } else if (booking.status === 'confirmed') {
    inline_keyboard.push([
      { text: '❌ Cancel Visit', callback_data: `team:cancel:${booking.id}` },
      { text: '📄 Today PDF', callback_data: 'team:pdf:today' },
    ]);
  }

  if (booking.status !== 'confirmed') {
    inline_keyboard.push([{ text: '📄 Send Today PDF', callback_data: 'team:pdf:today' }]);
  }

  return {
    text: lines.join('\n'),
    reply_markup: { inline_keyboard },
  };
}

/**
 * Build a patient-facing Telegram status update message triggered when the clinical team
 * confirms or cancels a booking from the Team Bot.
 * Inputs: ConciergeBookingRecord.
 * Output: Telegram HTML message string.
 */
export function buildPatientStatusUpdateMessage(booking: ConciergeBookingRecord): string {
  if (booking.status === 'confirmed') {
    return [
      `<b>Appointment Confirmed · Elara Atelier</b>`,
      ``,
      `Dear <b>${escapeTelegramHtml(booking.fullName)}</b>, our clinical team has confirmed your consultation:`,
      `• <b>Treatment:</b> ${escapeTelegramHtml(booking.treatmentName)}`,
      `• <b>Date &amp; Time:</b> ${escapeTelegramHtml(formatBotDateTime(booking.preferredDateTime))}`,
      `• <b>Location:</b> ${escapeTelegramHtml(CLINIC_CONFIG.addressLine1)}, ${escapeTelegramHtml(CLINIC_CONFIG.addressLine2)}`,
      ``,
      `We look forward to welcoming you. Reply anytime if you have questions before your visit.`,
    ].join('\n');
  }
  return [
    `<b>Appointment Update · Elara Atelier</b>`,
    ``,
    `Your consultation request for <b>${escapeTelegramHtml(booking.treatmentName)}</b> (${escapeTelegramHtml(formatBotDateTime(booking.preferredDateTime))}) has been marked cancelled by our clinic team.`,
    `Please call <b>${escapeTelegramHtml(CLINIC_CONFIG.phoneDisplay)}</b> or book a new slot on our studio site anytime.`,
  ].join('\n');
}

/**
 * Process an incoming Telegram update directed at the Doctors / Team Bot.
 * Inputs: ConciergeStore instance, TelegramUpdatePayload, optional config options.
 * Output: ProcessTeamUpdateResult with outgoing bot actions, SSE sync events, PDF requests, and patient notifications.
 */
export function processTeamBotUpdate(
  store: ConciergeStore,
  update: TelegramUpdatePayload,
  options?: { teamPasscode?: string; nowMs?: number }
): ProcessTeamUpdateResult {
  const nowMs = options?.nowMs ?? Date.now();
  const actions: OutgoingTelegramAction[] = [];
  const syncEvents: BotWebSyncEvent[] = [];
  const sendPdfRequests: TeamPdfSendRequest[] = [];
  const patientNotifyEvents: PatientStatusPushEvent[] = [];

  // 1. Callback query actions on individual Team Bot cards
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id ? String(cq.message.chat.id) : '';
    const messageId = cq.message?.message_id;
    const data = cq.data || '';

    actions.push({
      method: 'answerCallbackQuery',
      payload: { callback_query_id: cq.id },
    });

    if (!chatId) {
      return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
    }

    if (data.startsWith('team:confirm:') || data.startsWith('team:cancel:')) {
      const isConfirm = data.startsWith('team:confirm:');
      const bookingId = data.slice(isConfirm ? 'team:confirm:'.length : 'team:cancel:'.length);
      const result = store.updateBookingStatusFromTeam(
        bookingId,
        isConfirm ? 'confirmed' : 'cancelled',
        nowMs
      );

      if (!result.ok) {
        actions.push({
          method: 'sendMessage',
          payload: {
            chat_id: chatId,
            text: `<b>Update Failed:</b> ${escapeTelegramHtml(result.error)}`,
            parse_mode: 'HTML',
            reply_markup: buildTeamMainMenuKeyboard(),
          },
        });
        return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
      }

      syncEvents.push({
        type: 'booking_updated',
        booking: result.booking,
        userId: result.booking.userId,
      });

      const patientChatId = store.findChatIdForBooking(result.booking);
      if (patientChatId) {
        patientNotifyEvents.push({
          chatId: patientChatId,
          booking: result.booking,
        });
      }

      const updatedCard = buildTeamPatientAlertCard(
        result.booking,
        isConfirm
          ? 'ELARA ATELIER · CONFIRMED BY TEAM'
          : 'ELARA ATELIER · CANCELLED BY TEAM'
      );

      if (messageId) {
        actions.push({
          method: 'editMessageText',
          payload: {
            chat_id: chatId,
            message_id: messageId,
            text: updatedCard.text,
            parse_mode: 'HTML',
            reply_markup: updatedCard.reply_markup,
          },
        });
      } else {
        actions.push({
          method: 'sendMessage',
          payload: {
            chat_id: chatId,
            text: updatedCard.text,
            parse_mode: 'HTML',
            reply_markup: updatedCard.reply_markup,
          },
        });
      }
      return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
    }

    if (data === 'team:pdf:tomorrow') {
      const nextTarget = getNextClinicDateIso(new Date(nowMs), CLINIC_CONFIG.clinicTimeZone, true);
      sendPdfRequests.push({
        chatId,
        targetIsoDate: nextTarget.targetIsoDate,
        displayDateLabel: nextTarget.displayDateLabel,
      });
      return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
    }

    if (data === 'team:pdf:today') {
      const todayLocal = getClinicDateTimeParts(new Date(nowMs), CLINIC_CONFIG.clinicTimeZone);
      sendPdfRequests.push({
        chatId,
        targetIsoDate: todayLocal.isoDate,
        displayDateLabel: `Today (${todayLocal.isoDate})`,
      });
      return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
    }

    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  // 2. Text /slash commands and Team Reply Keyboard buttons
  const msg = update.message;
  if (!msg?.chat?.id) {
    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  const chatId = String(msg.chat.id);
  const rawText = (msg.text || '').trim();
  const lower = rawText.toLowerCase();
  const teamMenu = buildTeamMainMenuKeyboard();
  const requiredPasscode = options?.teamPasscode?.trim() || '';

  if (lower.startsWith('/chatid') || lower.startsWith('/whoami')) {
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: [
          `<b>Team Chat Identifier</b>`,
          `Chat ID: <code>${escapeTelegramHtml(chatId)}</code>`,
          ``,
          `Set <code>TELEGRAM_TEAM_CHAT_ID="${escapeTelegramHtml(chatId)}"</code> in your environment secrets to pin this chat across serverless restarts.`,
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: teamMenu,
      },
    });
    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  if (lower.startsWith('/start')) {
    const providedCode = rawText.replace(/^\/start\s*/i, '').trim();
    if (requiredPasscode && providedCode !== requiredPasscode) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: [
            `<b>Elara Atelier · Doctors &amp; Clinical Team Bot</b>`,
            `Please enter <code>/start YOUR_TEAM_PASSCODE</code> to activate team patient alerts.`,
          ].join('\n'),
          parse_mode: 'HTML',
        },
      });
      return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
    }

    store.registerTeamChat(chatId);
    const pendingCount = store.getPendingBookings().length;
    const nextDay = getNextClinicDateIso(new Date(nowMs), CLINIC_CONFIG.clinicTimeZone, true);
    const tomorrowCount = store.getBookingsForDate(nextDay.targetIsoDate).length;

    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: [
          `<b>ELARA ATELIER · DOCTORS &amp; TEAM CONSOLE</b>`,
          ``,
          `This chat is now subscribed to receive:`,
          `• <b>Instant booking alert</b> once when each patient books (with a <b>1-click WhatsApp confirmation link</b>)`,
          `• <b>Morning booking list</b> at 8:30 AM PT (sent only when there is at least 1 booking scheduled)`,
          ``,
          `<b>Pending Confirmations:</b> ${pendingCount}`,
          `<b>Next Open Day (${escapeTelegramHtml(nextDay.targetIsoDate)}):</b> ${tomorrowCount} patient${tomorrowCount === 1 ? '' : 's'}`,
          `<b>Chat ID:</b> <code>${escapeTelegramHtml(chatId)}</code>`,
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: teamMenu,
      },
    });
    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  // Register chat cleanly if no passcode gate is enabled and team uses menu directly
  if (!requiredPasscode) {
    store.registerTeamChat(chatId);
  }

  const pushPatientRosterCards = (
    title: string,
    list: ConciergeBookingRecord[],
    emptyNote: string
  ) => {
    if (list.length === 0) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: `<b>${escapeTelegramHtml(title)}</b>\n\n${escapeTelegramHtml(emptyNote)}`,
          parse_mode: 'HTML',
          reply_markup: teamMenu,
        },
      });
      return;
    }

    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: `<b>${escapeTelegramHtml(title)}</b> (${list.length} patient${list.length === 1 ? '' : 's'})`,
        parse_mode: 'HTML',
        reply_markup: teamMenu,
      },
    });

    for (const item of list.slice(0, 12)) {
      const card = buildTeamPatientAlertCard(item, title);
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: card.text,
          parse_mode: 'HTML',
          reply_markup: card.reply_markup,
        },
      });
    }
  };

  if (lower.startsWith('/pending') || rawText === TEAM_MENU_LABELS.pending) {
    const pending = store.getPendingBookings();
    pushPatientRosterCards(
      'PENDING WHATSAPP CONFIRMATIONS',
      pending,
      'All active consultations have been confirmed.'
    );
    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  if (lower.startsWith('/today') || rawText === TEAM_MENU_LABELS.today) {
    const todayLocal = getClinicDateTimeParts(new Date(nowMs), CLINIC_CONFIG.clinicTimeZone);
    const todayList = store.getBookingsForDate(todayLocal.isoDate);
    pushPatientRosterCards(
      `TODAY'S PATIENTS (${todayLocal.isoDate})`,
      todayList,
      `No active patient bookings scheduled for today (${todayLocal.isoDate}).`
    );
    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  if (
    lower.startsWith('/tomorrow') &&
    !lower.startsWith('/tomorrowpdf') ||
    lower.startsWith('/patients') ||
    rawText === TEAM_MENU_LABELS.tomorrow
  ) {
    const nextDay = getNextClinicDateIso(new Date(nowMs), CLINIC_CONFIG.clinicTimeZone, true);
    const tomorrowList = store.getBookingsForDate(nextDay.targetIsoDate);
    pushPatientRosterCards(
      `NEXT CLINIC DAY (${nextDay.targetIsoDate})`,
      tomorrowList,
      `No active patient bookings scheduled for ${nextDay.displayDateLabel}.`
    );
    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  if (
    lower.startsWith('/tomorrowpdf') ||
    lower.startsWith('/pdf') ||
    rawText === TEAM_MENU_LABELS.tomorrowPdf
  ) {
    const explicitDateMatch = /(\d{4}-\d{2}-\d{2})/.exec(rawText);
    if (explicitDateMatch) {
      const iso = explicitDateMatch[1];
      sendPdfRequests.push({
        chatId,
        targetIsoDate: iso,
        displayDateLabel: iso,
      });
    } else {
      const nextDay = getNextClinicDateIso(new Date(nowMs), CLINIC_CONFIG.clinicTimeZone, true);
      sendPdfRequests.push({
        chatId,
        targetIsoDate: nextDay.targetIsoDate,
        displayDateLabel: nextDay.displayDateLabel,
      });
    }
    return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
  }

  actions.push({
    method: 'sendMessage',
    payload: {
      chat_id: chatId,
      text: [
        `<b>Elara Atelier · Team Commands</b>`,
        `• /pending — Patients waiting for WhatsApp confirmation`,
        `• /today — Today's consultation list`,
        `• /tomorrow — Next clinic day's patient list`,
        `• /tomorrowpdf — Download tomorrow's patient roster PDF`,
        `• /chatid — Show this chat's ID`,
      ].join('\n'),
      parse_mode: 'HTML',
      reply_markup: teamMenu,
    },
  });

  return { actions, syncEvents, sendPdfRequests, patientNotifyEvents };
}

/**
 * Send a binary PDF document buffer to a Telegram chat via Bot API sendDocument multipart upload.
 * Inputs: botToken, chatId, pdfBuffer, filename, caption.
 * Output: boolean true if Telegram accepted the document upload.
 */
export async function sendTelegramPdfDocument(
  botToken: string,
  chatId: string,
  pdfBuffer: Buffer,
  filename: string,
  caption: string
): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
    form.append('document', blob, filename);

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Build and dispatch a Next-Day Patient Roster PDF to one or more Team Bot chat IDs.
 * Inputs: store, teamBotToken, targetChatIds, optional targetIsoDate/displayDateLabel/nowMs.
 * Output: summary object with sentCount, patientCount, targetIsoDate, and filename.
 */
export async function dispatchNextDaySchedulePdf(params: {
  store: ConciergeStore;
  teamBotToken: string;
  targetChatIds: string[];
  targetIsoDate?: string;
  displayDateLabel?: string;
  nowMs?: number;
}): Promise<{
  ok: boolean;
  sentCount: number;
  patientCount: number;
  targetIsoDate: string;
  filename: string;
}> {
  const now = new Date(params.nowMs ?? Date.now());
  const nextDay = getNextClinicDateIso(now, CLINIC_CONFIG.clinicTimeZone, true);
  const targetIsoDate = params.targetIsoDate || nextDay.targetIsoDate;
  const displayDateLabel = params.displayDateLabel || nextDay.displayDateLabel;
  const dayBookings = params.store.getBookingsForDate(targetIsoDate);

  const pdfBuffer = generatePatientSchedulePdf({
    targetDateIso: targetIsoDate,
    displayDateLabel,
    bookings: dayBookings,
  });

  const filename = `Elara-Atelier-Patients-${targetIsoDate}.pdf`;
  const caption = [
    `<b>Elara Atelier · Patient Schedule PDF</b>`,
    `<b>Date:</b> ${escapeTelegramHtml(displayDateLabel)}`,
    `<b>Scheduled Patients:</b> ${dayBookings.length}`,
  ].join('\n');

  let sentCount = 0;
  for (const chatId of params.targetChatIds) {
    const sent = await sendTelegramPdfDocument(
      params.teamBotToken,
      chatId,
      pdfBuffer,
      filename,
      caption
    );
    if (sent) sentCount += 1;
  }

  return {
    ok: sentCount > 0,
    sentCount,
    patientCount: dayBookings.length,
    targetIsoDate,
    filename,
  };
}

/**
 * Format an ISO YYYY-MM-DD date string into a readable morning schedule heading.
 * Inputs: isoDate string ('YYYY-MM-DD').
 * Output: readable date label (e.g. 'Friday, Nov 27, 2026').
 * Errors: None.
 */
function formatIsoDateHeading(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return isoDate;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Extract readable 12-hour visit time (e.g. '11:00 AM') from YYYY-MM-DDTHH:mm.
 * Inputs: preferredDateTime string.
 * Output: formatted time string.
 * Errors: None.
 */
function formatVisitTimeShort(preferredDateTime: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(preferredDateTime);
  if (!match) return preferredDateTime;
  const rawHour = Number(match[1]);
  const minute = match[2];
  const suffix = rawHour >= 12 ? 'PM' : 'AM';
  const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

/**
 * Build a single formatted HTML morning list of all active bookings scheduled for a day.
 * Inputs: targetIsoDate, displayDateLabel, bookings array (already filtered and sorted).
 * Output: Telegram HTML message string listing every booking with time, patient, treatment, phone/WhatsApp, and status.
 * Errors: None.
 */
export function buildMorningBookingsListMessage(params: {
  targetIsoDate: string;
  displayDateLabel: string;
  bookings: ConciergeBookingRecord[];
}): string {
  const lines: string[] = [
    `<b>ELARA ATELIER · MORNING BOOKING LIST</b>`,
    `<b>Date:</b> ${escapeTelegramHtml(params.displayDateLabel)}`,
    `<b>Total Bookings:</b> ${params.bookings.length}`,
    ``,
  ];

  params.bookings.forEach((booking, idx) => {
    const timeLabel = formatVisitTimeShort(booking.preferredDateTime);
    const allowsMessaging = booking.messagingConsent !== false;
    const phoneDisplay = `${booking.phoneCountryCode} ${booking.phoneNumber}`.trim();
    const wa = resolveBookingWhatsAppDisplay(booking);
    const contactNote = allowsMessaging
      ? `WhatsApp / Phone: <code>${escapeTelegramHtml(wa.display || phoneDisplay)}</code>`
      : `Phone Call Only: <code>${escapeTelegramHtml(phoneDisplay)}</code>`;
    const statusLabel =
      booking.status === 'confirmed'
        ? 'Confirmed'
        : allowsMessaging
          ? 'Pending WhatsApp'
          : 'Pending Call';

    lines.push(
      `<b>${idx + 1}. ${escapeTelegramHtml(timeLabel)} — ${escapeTelegramHtml(booking.fullName)}</b>`,
      `   • ${escapeTelegramHtml(booking.treatmentName)}`,
      `   • ${contactNote} · <i>${escapeTelegramHtml(statusLabel)}</i>`
    );
  });

  return lines.join('\n');
}

/**
 * Send a plain HTML message to a Telegram chat via Bot API sendMessage.
 * Inputs: botToken, chatId, HTML text, optional reply_markup.
 * Output: boolean true if Telegram accepted the message.
 * Errors: Catches network errors and returns false.
 */
export async function sendTelegramHtmlMessage(
  botToken: string,
  chatId: string,
  text: string,
  reply_markup?: unknown
): Promise<boolean> {
  if (!botToken || !chatId) return false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Dispatch the morning list of all active bookings for today (or a specified date) to Team Bot chats.
 * STRICT ZERO-BOOKING RULE: When there are 0 active bookings for the date, sends NO Telegram messages at all.
 * Inputs: store, teamBotToken, targetChatIds, optional targetIsoDate/displayDateLabel/nowMs/sendMessageFn.
 * Output: summary object with ok, skipped, reason, sentCount, patientCount, and targetIsoDate.
 * Errors: None (returns skipped/sent counts cleanly).
 */
export async function dispatchMorningBookingsDigest(params: {
  store: ConciergeStore;
  teamBotToken: string;
  targetChatIds: string[];
  targetIsoDate?: string;
  displayDateLabel?: string;
  nowMs?: number;
  sendMessageFn?: (
    botToken: string,
    chatId: string,
    text: string,
    reply_markup?: unknown
  ) => Promise<boolean>;
}): Promise<{
  ok: boolean;
  skipped: boolean;
  reason?: string;
  sentCount: number;
  patientCount: number;
  targetIsoDate: string;
}> {
  const now = new Date(params.nowMs ?? Date.now());
  const localNow = getClinicDateTimeParts(now, CLINIC_CONFIG.clinicTimeZone);
  const targetIsoDate = params.targetIsoDate || localNow.isoDate;
  const displayDateLabel = params.displayDateLabel || formatIsoDateHeading(targetIsoDate);
  const dayBookings = params.store.getBookingsForDate(targetIsoDate);

  // Never send a morning message when there are 0 bookings
  if (dayBookings.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: 'no_bookings',
      sentCount: 0,
      patientCount: 0,
      targetIsoDate,
    };
  }

  const text = buildMorningBookingsListMessage({
    targetIsoDate,
    displayDateLabel,
    bookings: dayBookings,
  });
  const replyMarkup = buildTeamMainMenuKeyboard();
  const sender = params.sendMessageFn || sendTelegramHtmlMessage;

  let sentCount = 0;
  for (const chatId of params.targetChatIds) {
    const sent = await sender(params.teamBotToken, chatId, text, replyMarkup);
    if (sent) sentCount += 1;
  }

  return {
    ok: sentCount > 0,
    skipped: false,
    sentCount,
    patientCount: dayBookings.length,
    targetIsoDate,
  };
}

/**
 * Register Team Bot slash commands in Telegram's command menu.
 * Inputs: teamBotToken string.
 */
export async function registerTeamBotCommands(teamBotToken: string): Promise<void> {
  if (!teamBotToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${teamBotToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Activate team patient console' },
          { command: 'pending', description: 'Patients awaiting WhatsApp confirmation' },
          { command: 'today', description: "View today's patients" },
          { command: 'tomorrow', description: "View tomorrow's patients" },
          { command: 'tomorrowpdf', description: 'Generate next-day patient roster PDF' },
          { command: 'chatid', description: 'Show this Team Chat ID' },
        ],
      }),
    });
  } catch {
    // Ignore transient command-registration errors
  }
}
