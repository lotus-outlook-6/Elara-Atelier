/**
 * Redesigned interactive Telegram Concierge Bot handler for Elara Atelier.
 * Enforces strict per-user booking lookup (matching verified handle, phone contact, or explicit deep link),
 * provides a persistent bottom menu Reply Keyboard matching Telegram's bottom action grid,
 * clean studio messaging with zero technical jargon, live direct concierge chat synced with the website,
 * and interactive appointment rescheduling/cancellation within the 4-hour edit window.
 */

import { CLINIC_CONFIG } from '../config/clinicConfig';
import { TREATMENTS, TREATMENT_CATEGORIES } from '../data/clinicData';
import {
  ConciergeStore,
  isWithinEditWindow,
  type ConciergeBookingRecord,
  type ConciergeMessageRecord,
} from './conciergeStore';

export interface TelegramInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface TelegramReplyKeyboardButton {
  text: string;
  request_contact?: boolean;
}

export type TelegramReplyMarkup =
  | { inline_keyboard: TelegramInlineButton[][] }
  | {
      keyboard: TelegramReplyKeyboardButton[][];
      resize_keyboard?: boolean;
      one_time_keyboard?: boolean;
      is_persistent?: boolean;
      input_field_placeholder?: string;
    }
  | {
      force_reply: true;
      selective?: boolean;
      input_field_placeholder?: string;
    };

export interface OutgoingTelegramAction {
  method: 'sendMessage' | 'editMessageText' | 'answerCallbackQuery';
  payload: Record<string, unknown>;
}

export interface TelegramUpdatePayload {
  update_id?: number;
  message?: {
    message_id?: number;
    chat?: { id?: number | string };
    from?: { id?: number | string; username?: string; first_name?: string };
    text?: string;
    reply_to_message?: {
      message_id?: number;
      text?: string;
    };
    contact?: {
      phone_number?: string;
      user_id?: number | string;
    };
  };
  callback_query?: {
    id: string;
    from?: { id?: number | string; username?: string; first_name?: string };
    message?: {
      message_id?: number;
      chat?: { id?: number | string };
      text?: string;
    };
    data?: string;
  };
}

export type BotWebSyncEvent =
  | {
      type: 'booking_updated';
      booking: ConciergeBookingRecord;
      userId: string | null;
    }
  | {
      type: 'concierge_message';
      message: ConciergeMessageRecord;
      userId: string | null;
    };

export const MENU_BUTTON_LABELS = {
  appointments: '📅 My Appointments',
  changeTiming: '🕒 Change Timing',
  cancelVisit: '❌ Cancel Visit',
  treatments: '✨ Treatments & Pricing',
  clinic: '📍 Clinic & Hours',
  chat: '💬 Message Concierge',
  verifyPhone: '📱 Verify Phone Number',
} as const;

const CLINIC_TIME_SLOTS = [
  { label: '10:00 AM', value: '10:00' },
  { label: '11:30 AM', value: '11:30' },
  { label: '1:00 PM', value: '13:00' },
  { label: '2:30 PM', value: '14:30' },
  { label: '4:00 PM', value: '16:00' },
  { label: '5:30 PM', value: '17:30' },
] as const;

/**
 * Escape HTML special characters for Telegram HTML parse_mode.
 * Inputs: raw string.
 * Output: escaped HTML-safe string.
 */
export function escapeTelegramHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format an ISO local datetime string (YYYY-MM-DDTHH:MM) into clean studio display format.
 * Inputs: isoDateTime string.
 * Output: human-readable string like "Wed, Nov 18 · 11:00 AM".
 */
export function formatBotDateTime(isoDateTime: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(isoDateTime.trim());
  if (!match) return isoDateTime || 'TBD';
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  if (Number.isNaN(date.getTime())) return isoDateTime;
  const datePart = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

/**
 * Format remaining 4-hour modification window label for Telegram cards.
 * Inputs: ConciergeBookingRecord, optional current epoch ms.
 * Output: human-readable countdown string.
 */
function formatEditCountdown(booking: ConciergeBookingRecord, nowMs = Date.now()): string {
  if (booking.status === 'cancelled') return 'Cancelled';
  const remaining = booking.createdAtMs + CLINIC_CONFIG.bookingEditWindowMs - nowMs;
  if (remaining <= 0) return '4h self-edit window closed';
  const mins = Math.ceil(remaining / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m left to reschedule` : `${m}m left to reschedule`;
}

/**
 * Generate the next 6 open clinic days (Mon–Fri, skipping Saturdays & Sundays) starting from tomorrow.
 * Inputs: optional reference Date.
 * Output: array of { iso, label } date choices.
 */
export function getUpcomingClinicDates(referenceDate: Date = new Date()): Array<{ iso: string; label: string }> {
  const dates: Array<{ iso: string; label: string }> = [];
  const cursor = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  for (let i = 0; i < 16 && dates.length < 6; i += 1) {
    const candidate = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + i + 1);
    const weekday = candidate.getDay();
    if (weekday === 0 || weekday === 6) continue;
    const yyyy = candidate.getFullYear();
    const mm = String(candidate.getMonth() + 1).padStart(2, '0');
    const dd = String(candidate.getDate()).padStart(2, '0');
    const label = candidate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    dates.push({ iso: `${yyyy}-${mm}-${dd}`, label });
  }
  return dates;
}

/**
 * Parse natural or formatted date-time text entered by a patient (e.g. "2026-11-20 14:30").
 * Inputs: raw text string.
 * Output: normalized "YYYY-MM-DDTHH:MM" string or error message if invalid/outside Mon–Fri 10:00–18:30 hours.
 */
export function parseCustomClinicDateTime(raw: string): { ok: true; iso: string } | { ok: false; error: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) {
    return {
      ok: false,
      error: 'Please enter date and 24-hour time as YYYY-MM-DD HH:MM (for example: 2026-11-20 14:30).',
    };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const dt = new Date(year, month - 1, day, hour, minute);

  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { ok: false, error: 'That calendar date or time is invalid.' };
  }
  if (dt.getDay() === 0 || dt.getDay() === 6) {
    return { ok: false, error: 'Saturday and Sunday are closed. Please choose Mon–Fri.' };
  }
  if (hour < 10 || hour > 18 || (hour === 18 && minute > 30)) {
    return { ok: false, error: 'Studio hours are Mon–Fri, 10:00 AM – 7:00 PM (last slot 18:30).' };
  }

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { ok: true, iso };
}

/**
 * Build the persistent bottom Reply Keyboard displayed right beneath the Telegram Message composer.
 * Uses a clean 1 - 2 - 2 - 1(or 2) grid so patients can trigger actions or message directly anytime.
 * Inputs: hasVerifiedPhone boolean indicating whether Telegram contact phone has been verified.
 * Output: TelegramReplyMarkup keyboard object.
 */
export function buildMainMenuReplyKeyboard(hasVerifiedPhone: boolean): TelegramReplyMarkup {
  const rows: TelegramReplyKeyboardButton[][] = [
    [{ text: MENU_BUTTON_LABELS.appointments }],
    [
      { text: MENU_BUTTON_LABELS.changeTiming },
      { text: MENU_BUTTON_LABELS.cancelVisit },
    ],
    [
      { text: MENU_BUTTON_LABELS.treatments },
      { text: MENU_BUTTON_LABELS.clinic },
    ],
  ];

  if (hasVerifiedPhone) {
    rows.push([{ text: MENU_BUTTON_LABELS.chat }]);
  } else {
    rows.push([
      { text: MENU_BUTTON_LABELS.chat },
      { text: MENU_BUTTON_LABELS.verifyPhone, request_contact: true },
    ]);
  }

  return {
    keyboard: rows,
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Message Elara Atelier Concierge…',
  };
}

/**
 * Build inline quick-action buttons attached to an appointments card.
 * Inputs: array of user bookings, current epoch ms.
 * Output: inline_keyboard markup.
 */
export function buildBookingInlineKeyboard(
  bookings: ConciergeBookingRecord[],
  nowMs = Date.now()
): { inline_keyboard: TelegramInlineButton[][] } {
  const active = bookings.filter(b => b.status !== 'cancelled');
  const editableActive = active.filter(b => isWithinEditWindow(b.createdAtMs, nowMs, b.status));
  const keyboard: TelegramInlineButton[][] = [];

  if (editableActive.length === 1) {
    keyboard.push([
      { text: 'Change Timing', callback_data: `cb:resched:${editableActive[0].id}` },
      { text: 'Cancel Visit', callback_data: `cb:cancel_ask:${editableActive[0].id}` },
    ]);
  } else if (editableActive.length > 1) {
    keyboard.push([{ text: 'Reschedule an Appointment', callback_data: 'cb:pick_booking' }]);
  }

  keyboard.push([
    { text: 'Refresh Schedule', callback_data: 'cb:list' },
    { text: 'Clinic Hours & Address', callback_data: 'cb:clinic' },
  ]);

  return { inline_keyboard: keyboard };
}

/**
 * Build the personalized welcome + appointments card for a verified patient using clean, natural wording.
 * Inputs: firstName, bookings array, optional nowMs.
 * Output: HTML text and inline_keyboard markup.
 */
export function buildPatientWelcomeCard(
  firstName: string,
  bookings: ConciergeBookingRecord[],
  nowMs = Date.now()
): { text: string; reply_markup: { inline_keyboard: TelegramInlineButton[][] } } {
  const active = bookings.filter(b => b.status !== 'cancelled');
  const displayName = escapeTelegramHtml(
    active[0]?.fullName || bookings[0]?.fullName || firstName || 'Guest'
  );

  const lines: string[] = [
    `<b>ELARA ATELIER · BEVERLY HILLS</b>`,
    `<i>Private Aesthetic &amp; Dental Concierge</i>`,
    ``,
    `Welcome, <b>${displayName}</b>. Your private studio concierge is ready.`,
  ];

  if (bookings.length === 0) {
    lines.push(
      ``,
      `You do not have any upcoming studio visits scheduled right now.`,
      `Use the buttons below to explore treatments, check clinic hours, or send a direct message to our concierge.`
    );
  } else {
    lines.push(``, `<b>Your Studio Appointments (${active.length} active)</b>`);
    bookings.slice(0, 5).forEach((b, index) => {
      const statusBadge = b.status === 'cancelled' ? 'CANCELLED' : b.status.toUpperCase();
      lines.push(
        ``,
        `<b>${index + 1}. ${escapeTelegramHtml(b.treatmentName)}</b>`,
        `• <b>Time:</b> ${escapeTelegramHtml(formatBotDateTime(b.preferredDateTime))}`,
        `• <b>Status:</b> ${escapeTelegramHtml(statusBadge)} (${escapeTelegramHtml(formatEditCountdown(b, nowMs))})`,
        `• <b>Ref:</b> <code>${escapeTelegramHtml(b.id)}</code>`
      );
    });
  }

  return {
    text: lines.join('\n'),
    reply_markup: buildBookingInlineKeyboard(bookings, nowMs),
  };
}

/**
 * Build the formatted Beverly Hills studio details HTML text.
 * Output: Telegram HTML message string.
 */
export function buildClinicDetailsText(): string {
  return [
    `<b>ELARA ATELIER · STUDIO DETAILS</b>`,
    ``,
    `<b>Address:</b> ${escapeTelegramHtml(CLINIC_CONFIG.addressLine1)}, ${escapeTelegramHtml(CLINIC_CONFIG.addressLine2)}`,
    `<b>Hours:</b> ${escapeTelegramHtml(CLINIC_CONFIG.hoursSummary)}`,
    `• Mon–Fri: 10:00 AM – 7:00 PM`,
    `• Sat &amp; Sun: Closed`,
    `<b>Direct Concierge:</b> ${escapeTelegramHtml(CLINIC_CONFIG.phoneDisplay)}`,
    `<b>Email:</b> ${escapeTelegramHtml(CLINIC_CONFIG.email)}`,
  ].join('\n');
}

/**
 * Build a treatments & pricing summary HTML block for a selected category index.
 * Inputs: categoryIndex (0..2).
 * Output: Telegram HTML string and inline category tabs.
 */
export function buildTreatmentsCategoryCard(categoryIndex: number): {
  text: string;
  reply_markup: { inline_keyboard: TelegramInlineButton[][] };
} {
  const safeIdx = Math.max(0, Math.min(TREATMENT_CATEGORIES.length - 1, categoryIndex));
  const category = TREATMENT_CATEGORIES[safeIdx];
  const items = TREATMENTS.filter(t => t.category === category);

  const lines: string[] = [
    `<b>ELARA ATELIER · ${escapeTelegramHtml(category.toUpperCase())}</b>`,
    ``,
  ];

  for (const item of items) {
    lines.push(
      `<b>${escapeTelegramHtml(item.name)}</b>`,
      `• <b>Starting at:</b> ${escapeTelegramHtml(item.startingPrice)} · <i>${escapeTelegramHtml(item.duration)}</i>`,
      `${escapeTelegramHtml(item.benefit)}`,
      ``
    );
  }

  lines.push(`<i>Reply anytime with questions or book via our studio page.</i>`);

  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [
        TREATMENT_CATEGORIES.map((cat, idx) => ({
          text: idx === safeIdx ? `• ${cat} •` : cat,
          callback_data: `cb:treat_cat:${idx}`,
        })),
        [{ text: 'My Appointments', callback_data: 'cb:list' }],
      ],
    },
  };
}

/**
 * Build a confirmation HTML card for a newly booked appointment pushed to Telegram.
 * Inputs: ConciergeBookingRecord.
 * Output: HTML text and inline_keyboard markup.
 */
export function buildBookingPushCard(booking: ConciergeBookingRecord): {
  text: string;
  reply_markup: TelegramReplyMarkup;
} {
  const lines = [
    `<b>ELARA ATELIER · CONSULTATION REQUEST</b>`,
    ``,
    `<b>Patient:</b> ${escapeTelegramHtml(booking.fullName)}`,
    `<b>Treatment:</b> ${escapeTelegramHtml(booking.treatmentName)}`,
    `<b>Requested Time:</b> ${escapeTelegramHtml(formatBotDateTime(booking.preferredDateTime))}`,
    `<b>Phone:</b> ${escapeTelegramHtml(`${booking.phoneCountryCode} ${booking.phoneNumber}`)}`,
    `<b>Reference:</b> <code>${escapeTelegramHtml(booking.id)}</code>`,
    ``,
    `<i>Use the buttons below or your website Profile to reschedule for the next 4 hours.</i>`,
  ];

  return {
    text: lines.join('\n'),
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Change Timing', callback_data: `cb:resched:${booking.id}` },
          { text: 'Cancel Visit', callback_data: `cb:cancel_ask:${booking.id}` },
        ],
        [
          { text: 'My Appointments', callback_data: 'cb:list' },
          { text: 'Clinic Hours & Address', callback_data: 'cb:clinic' },
        ],
      ],
    },
  };
}

/**
 * Match a persistent Reply Keyboard button label or slash command to a canonical action key.
 * Inputs: raw user message text.
 * Output: canonical action key or null if free-form text.
 */
function matchMenuCommand(
  rawText: string
): 'appointments' | 'change_timing' | 'cancel_visit' | 'treatments' | 'clinic' | 'chat' | null {
  const normalized = rawText
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/&]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    rawText === '/appointments' ||
    rawText === '/bookings' ||
    normalized === 'my appointments' ||
    normalized === 'appointments' ||
    normalized === 'refresh schedule' ||
    normalized === 'refresh my bookings'
  ) {
    return 'appointments';
  }
  if (
    rawText === '/reschedule' ||
    normalized === 'change timing' ||
    normalized === 'reschedule'
  ) {
    return 'change_timing';
  }
  if (
    rawText === '/cancel' ||
    normalized === 'cancel visit' ||
    normalized === 'cancel appointment'
  ) {
    return 'cancel_visit';
  }
  if (
    rawText === '/treatments' ||
    normalized === 'treatments pricing' ||
    normalized === 'treatments & pricing' ||
    normalized === 'treatments'
  ) {
    return 'treatments';
  }
  if (
    rawText === '/clinic' ||
    normalized === 'clinic hours' ||
    normalized === 'clinic & hours' ||
    normalized === 'clinic hours & address'
  ) {
    return 'clinic';
  }
  if (
    rawText === '/chat' ||
    rawText === '/message' ||
    normalized === 'message concierge' ||
    normalized === 'chat with concierge'
  ) {
    return 'chat';
  }
  return null;
}

/**
 * Generate a warm, helpful studio reply to a patient's direct Telegram message using verified clinic data.
 * Inputs: firstName, incoming message text, patient's bookings, awaitingConciergeChat flag.
 * Output: HTML reply string and plain-text summary for website chat thread syncing.
 */
function buildDirectChatReply(
  firstName: string,
  text: string,
  bookings: ConciergeBookingRecord[]
): { html: string; plainSummary: string } {
  const displayName = escapeTelegramHtml(firstName || 'Guest');
  const lower = text.trim().toLowerCase();
  const active = bookings.filter(b => b.status !== 'cancelled');

  // 1. Greeting
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|hola|hii+)\b[!.\s]*$/i.test(lower)) {
    const nextVisitNote = active[0]
      ? `\n\nYour next scheduled visit is <b>${escapeTelegramHtml(active[0].treatmentName)}</b> on <b>${escapeTelegramHtml(formatBotDateTime(active[0].preferredDateTime))}</b>.`
      : '';
    const html = `Hello, <b>${displayName}</b> — welcome to <b>Elara Atelier Concierge</b>.${nextVisitNote}\n\nHow may we assist you today? Tap an option below or send us any question right here.`;
    return {
      html,
      plainSummary: `Hello ${firstName || 'Guest'} — how may our Beverly Hills concierge desk assist you today?`,
    };
  }

  // 2. Hours / Address / Location / Phone query
  if (/\b(hour|open|close|sunday|saturday|address|where|location|beverly|phone|call|email|direction|map)\b/i.test(lower)) {
    return {
      html: buildClinicDetailsText(),
      plainSummary: `Studio location: ${CLINIC_CONFIG.addressLine1}, ${CLINIC_CONFIG.addressLine2}. Hours: ${CLINIC_CONFIG.hoursSummary}. Direct phone: ${CLINIC_CONFIG.phoneDisplay}.`,
    };
  }

  // 3. Treatment / Price query matched against TREATMENTS catalog
  const matchedTreatments = TREATMENTS.filter(t => {
    const haystack = `${t.name} ${t.category} ${t.benefit}`.toLowerCase();
    const keywords = lower.split(/[^a-z0-9]+/).filter(w => w.length >= 4);
    return keywords.some(kw => haystack.includes(kw));
  });

  if (matchedTreatments.length > 0 || /\b(price|pricing|cost|how much|menu|service|treatment)\b/i.test(lower)) {
    const list = (matchedTreatments.length > 0 ? matchedTreatments : TREATMENTS).slice(0, 4);
    const lines = [
      `<b>ELARA ATELIER · TREATMENT GUIDE</b>`,
      ``,
      ...list.flatMap(item => [
        `<b>${escapeTelegramHtml(item.name)}</b> (${escapeTelegramHtml(item.startingPrice)} · ${escapeTelegramHtml(item.duration)})`,
        `${escapeTelegramHtml(item.benefit)}`,
        ``,
      ]),
      `<i>Tap Treatments &amp; Pricing below to browse all categories, or reply to ask more.</i>`,
    ];
    return {
      html: lines.join('\n'),
      plainSummary: list.map(t => `${t.name} (${t.startingPrice}, ${t.duration})`).join(' · '),
    };
  }

  // 4. General direct note to studio concierge
  const html = [
    `<b>Message Delivered to Studio Concierge</b>`,
    ``,
    `Thank you, <b>${displayName}</b>. We have received your message:`,
    `<i>“${escapeTelegramHtml(text.slice(0, 500))}”</i>`,
    ``,
    `Our Beverly Hills coordinator will follow up right here in your chat. For immediate assistance, call <b>${escapeTelegramHtml(CLINIC_CONFIG.phoneDisplay)}</b>.`,
  ].join('\n');

  return {
    html,
    plainSummary: `Thank you, ${firstName || 'Guest'}. Your message has been received by our Beverly Hills concierge desk.`,
  };
}

/**
 * Pure update processor turning an incoming Telegram webhook/polling update into
 * strict, user-scoped response actions and real-time website sync events.
 * Inputs: ConciergeStore instance, TelegramUpdatePayload, optional nowMs.
 * Output: { actions: OutgoingTelegramAction[], syncEvents: BotWebSyncEvent[] }.
 */
export function processTelegramUpdate(
  store: ConciergeStore,
  update: TelegramUpdatePayload,
  nowMs = Date.now()
): {
  actions: OutgoingTelegramAction[];
  syncEvents: BotWebSyncEvent[];
} {
  const actions: OutgoingTelegramAction[] = [];
  const syncEvents: BotWebSyncEvent[] = [];

  // 1. Handle Inline Keyboard Callback Queries
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id ? String(cq.message.chat.id) : '';
    const messageId = cq.message?.message_id;
    const username = cq.from?.username;
    const firstName = cq.from?.first_name || 'Guest';
    const data = cq.data || '';

    actions.push({
      method: 'answerCallbackQuery',
      payload: { callback_query_id: cq.id },
    });

    if (!chatId) {
      return { actions, syncEvents };
    }

    const editOrSend = (text: string, reply_markup: TelegramReplyMarkup) => {
      if (messageId) {
        actions.push({
          method: 'editMessageText',
          payload: {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'HTML',
            reply_markup,
          },
        });
      } else {
        actions.push({
          method: 'sendMessage',
          payload: {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup,
          },
        });
      }
    };

    const userLookup = store.findBookingsForChat(chatId, username);

    if (data === 'cb:list') {
      const card = buildPatientWelcomeCard(firstName, userLookup.bookings, nowMs);
      editOrSend(card.text, card.reply_markup);
      return { actions, syncEvents };
    }

    if (data === 'cb:clinic') {
      editOrSend(buildClinicDetailsText(), {
        inline_keyboard: [[{ text: 'Back to My Appointments', callback_data: 'cb:list' }]],
      });
      return { actions, syncEvents };
    }

    if (data.startsWith('cb:treat_cat:')) {
      const idx = Number(data.slice('cb:treat_cat:'.length)) || 0;
      const card = buildTreatmentsCategoryCard(idx);
      editOrSend(card.text, card.reply_markup);
      return { actions, syncEvents };
    }

    if (data === 'cb:pick_booking') {
      const editable = userLookup.bookings.filter(b =>
        isWithinEditWindow(b.createdAtMs, nowMs, b.status)
      );
      if (editable.length === 0) {
        editOrSend(
          'No active appointments are within the 4-hour self-reschedule window. Please call ' +
            escapeTelegramHtml(CLINIC_CONFIG.phoneDisplay) +
            ' for assistance.',
          { inline_keyboard: [[{ text: 'Back to My Appointments', callback_data: 'cb:list' }]] }
        );
        return { actions, syncEvents };
      }
      const rows: TelegramInlineButton[][] = editable.slice(0, 5).map(b => [
        {
          text: `${b.treatmentName.slice(0, 22)} · ${formatBotDateTime(b.preferredDateTime)}`,
          callback_data: `cb:resched:${b.id}`,
        },
      ]);
      rows.push([{ text: 'Back', callback_data: 'cb:list' }]);
      editOrSend('<b>Select an appointment to change its timing:</b>', { inline_keyboard: rows });
      return { actions, syncEvents };
    }

    if (data.startsWith('cb:resched:')) {
      const bookingId = data.slice('cb:resched:'.length);
      const target = userLookup.bookings.find(b => b.id === bookingId);
      if (!target) {
        editOrSend('That appointment could not be found in your schedule.', {
          inline_keyboard: [[{ text: 'My Appointments', callback_data: 'cb:list' }]],
        });
        return { actions, syncEvents };
      }
      if (!isWithinEditWindow(target.createdAtMs, nowMs, target.status)) {
        editOrSend(
          `The 4-hour reschedule window for <b>${escapeTelegramHtml(target.treatmentName)}</b> has ended. Call ${escapeTelegramHtml(CLINIC_CONFIG.phoneDisplay)} for concierge changes.`,
          { inline_keyboard: [[{ text: 'Back to My Appointments', callback_data: 'cb:list' }]] }
        );
        return { actions, syncEvents };
      }
      const days = getUpcomingClinicDates(new Date(nowMs));
      const rows: TelegramInlineButton[][] = [];
      for (let i = 0; i < days.length; i += 2) {
        const pair = days.slice(i, i + 2).map(d => ({
          text: d.label,
          callback_data: `cb:date:${bookingId}:${d.iso}`,
        }));
        rows.push(pair);
      }
      rows.push([{ text: 'Enter Custom Date & Time', callback_data: `cb:custom:${bookingId}` }]);
      rows.push([{ text: 'Back to My Appointments', callback_data: 'cb:list' }]);

      editOrSend(
        [
          `<b>Reschedule · ${escapeTelegramHtml(target.treatmentName)}</b>`,
          `Current Time: <b>${escapeTelegramHtml(formatBotDateTime(target.preferredDateTime))}</b>`,
          ``,
          `Select a new clinic day (Mon–Fri):`,
        ].join('\n'),
        { inline_keyboard: rows }
      );
      return { actions, syncEvents };
    }

    if (data.startsWith('cb:date:')) {
      const parts = data.split(':');
      const bookingId = parts[2] || '';
      const isoDate = parts[3] || '';
      const target = userLookup.bookings.find(b => b.id === bookingId);
      if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        editOrSend('Unable to find that appointment.', {
          inline_keyboard: [[{ text: 'My Appointments', callback_data: 'cb:list' }]],
        });
        return { actions, syncEvents };
      }

      const rows: TelegramInlineButton[][] = [];
      for (let i = 0; i < CLINIC_TIME_SLOTS.length; i += 2) {
        rows.push(
          CLINIC_TIME_SLOTS.slice(i, i + 2).map(slot => ({
            text: slot.label,
            callback_data: `cb:time:${bookingId}:${isoDate}:${slot.value.replace(':', '')}`,
          }))
        );
      }
      rows.push([{ text: 'Choose Another Day', callback_data: `cb:resched:${bookingId}` }]);

      editOrSend(
        [
          `<b>Select New Time · ${escapeTelegramHtml(target.treatmentName)}</b>`,
          `Selected Date: <b>${escapeTelegramHtml(isoDate)}</b>`,
        ].join('\n'),
        { inline_keyboard: rows }
      );
      return { actions, syncEvents };
    }

    if (data.startsWith('cb:time:')) {
      const parts = data.split(':');
      const bookingId = parts[2] || '';
      const isoDate = parts[3] || '';
      const hhmm = parts[4] || '';
      const formattedTime =
        hhmm.length === 4 ? `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}` : '';
      const nextDateTime = `${isoDate}T${formattedTime}`;

      const result = store.rescheduleBookingFromBot(chatId, bookingId, nextDateTime, nowMs);
      if (!result.ok) {
        editOrSend(escapeTelegramHtml(result.error), {
          inline_keyboard: [[{ text: 'My Appointments', callback_data: 'cb:list' }]],
        });
        return { actions, syncEvents };
      }

      syncEvents.push({
        type: 'booking_updated',
        booking: result.booking,
        userId: result.booking.userId,
      });

      editOrSend(
        [
          `<b>Timing Updated &amp; Synced to Website</b>`,
          ``,
          `<b>Treatment:</b> ${escapeTelegramHtml(result.booking.treatmentName)}`,
          `<b>New Visit Time:</b> ${escapeTelegramHtml(formatBotDateTime(result.booking.preferredDateTime))}`,
          `<b>Ref:</b> <code>${escapeTelegramHtml(result.booking.id)}</code>`,
          ``,
          `<i>Your Elara Atelier web Profile and Calendar have been updated automatically.</i>`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              { text: 'Change Again', callback_data: `cb:resched:${result.booking.id}` },
              { text: 'My Appointments', callback_data: 'cb:list' },
            ],
          ],
        }
      );
      return { actions, syncEvents };
    }

    if (data.startsWith('cb:custom:')) {
      const bookingId = data.slice('cb:custom:'.length);
      const target = userLookup.bookings.find(b => b.id === bookingId);
      if (!target) {
        editOrSend('Appointment not found in your schedule.', {
          inline_keyboard: [[{ text: 'My Appointments', callback_data: 'cb:list' }]],
        });
        return { actions, syncEvents };
      }
      store.upsertChatIdentity({
        chatId,
        awaitingCustomTimeForBookingId: bookingId,
        awaitingConciergeChat: false,
      });
      editOrSend(
        [
          `<b>Enter Custom Visit Time</b>`,
          `Reply with your preferred clinic date and time (Mon–Fri, 10:00–18:30) as:`,
          `<code>YYYY-MM-DD HH:MM</code> (example: <code>2026-11-20 14:30</code>)`,
        ].join('\n'),
        { inline_keyboard: [[{ text: 'Cancel', callback_data: 'cb:list' }]] }
      );
      return { actions, syncEvents };
    }

    if (data.startsWith('cb:cancel_ask:')) {
      const bookingId = data.slice('cb:cancel_ask:'.length);
      const target = userLookup.bookings.find(b => b.id === bookingId);
      if (!target) {
        editOrSend('Appointment not found in your schedule.', {
          inline_keyboard: [[{ text: 'My Appointments', callback_data: 'cb:list' }]],
        });
        return { actions, syncEvents };
      }
      editOrSend(
        [
          `<b>Confirm Cancellation</b>`,
          `Are you sure you want to cancel <b>${escapeTelegramHtml(target.treatmentName)}</b> on <b>${escapeTelegramHtml(formatBotDateTime(target.preferredDateTime))}</b>?`,
        ].join('\n'),
        {
          inline_keyboard: [
            [
              { text: 'Yes, Cancel Visit', callback_data: `cb:cancel_yes:${bookingId}` },
              { text: 'Keep Visit', callback_data: 'cb:list' },
            ],
          ],
        }
      );
      return { actions, syncEvents };
    }

    if (data.startsWith('cb:cancel_yes:')) {
      const bookingId = data.slice('cb:cancel_yes:'.length);
      const result = store.cancelBookingFromBot(chatId, bookingId, nowMs);
      if (!result.ok) {
        editOrSend(escapeTelegramHtml(result.error), {
          inline_keyboard: [[{ text: 'My Appointments', callback_data: 'cb:list' }]],
        });
        return { actions, syncEvents };
      }

      syncEvents.push({
        type: 'booking_updated',
        booking: result.booking,
        userId: result.booking.userId,
      });

      editOrSend(
        [
          `<b>Appointment Cancelled</b>`,
          `<b>${escapeTelegramHtml(result.booking.treatmentName)}</b> has been cancelled and updated on your Elara Atelier web profile.`,
        ].join('\n'),
        { inline_keyboard: [[{ text: 'View My Appointments', callback_data: 'cb:list' }]] }
      );
      return { actions, syncEvents };
    }

    return { actions, syncEvents };
  }

  // 2. Handle Regular Messages, Persistent Menu Button Presses, /start Commands, Shared Contact, or Custom Date Input
  const msg = update.message;
  if (!msg?.chat?.id) {
    return { actions, syncEvents };
  }

  const chatId = String(msg.chat.id);
  const username = msg.from?.username;
  const firstName = msg.from?.first_name || 'Guest';
  const sharedPhone = msg.contact?.phone_number;
  const text = (msg.text || '').trim();

  // If user shared their Telegram phone number via Verify Phone Number
  if (sharedPhone) {
    const lookup = store.findBookingsForChat(chatId, username, sharedPhone);
    store.upsertChatIdentity({ chatId, awaitingConciergeChat: false });
    const card = buildPatientWelcomeCard(firstName, lookup.bookings, nowMs);
    const persistentMenu = buildMainMenuReplyKeyboard(true);

    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text:
          lookup.bookings.length > 0
            ? card.text
            : [
                `<b>Phone Number Verified</b>`,
                ``,
                `Thank you, <b>${escapeTelegramHtml(firstName)}</b>. Your phone is now verified for private studio updates.`,
                `You do not have any upcoming studio visits scheduled right now. Choose any menu option below or send us a message anytime.`,
              ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: persistentMenu,
      },
    });

    if (lookup.bookings.some(b => isWithinEditWindow(b.createdAtMs, nowMs, b.status))) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: '<i>Manage your upcoming visit below:</i>',
          parse_mode: 'HTML',
          reply_markup: card.reply_markup,
        },
      });
    }
    return { actions, syncEvents };
  }

  // Handle /start [optional bookingId]
  if (text.startsWith('/start')) {
    const payload = text.replace(/^\/start\s*/i, '').trim();
    const lookup = store.findBookingsForChat(
      chatId,
      username,
      undefined,
      payload && /^[a-zA-Z0-9_-]{3,80}$/.test(payload) ? payload : undefined
    );
    store.upsertChatIdentity({ chatId, awaitingConciergeChat: false });
    const hasVerifiedPhone = Boolean(lookup.identity.verifiedPhoneDigits);
    const persistentMenu = buildMainMenuReplyKeyboard(hasVerifiedPhone);

    if (lookup.needsPhoneVerification) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: [
            `<b>ELARA ATELIER · BEVERLY HILLS</b>`,
            `<i>Private Aesthetic &amp; Dental Concierge</i>`,
            ``,
            `Welcome, <b>${escapeTelegramHtml(firstName)}</b>.`,
            `Tap <b>Verify Phone Number</b> below to inspect your private appointments, or use the menu to explore treatments and chat with our concierge.`,
          ].join('\n'),
          parse_mode: 'HTML',
          reply_markup: persistentMenu,
        },
      });
      return { actions, syncEvents };
    }

    const card = buildPatientWelcomeCard(firstName, lookup.bookings, nowMs);
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: card.text,
        parse_mode: 'HTML',
        reply_markup: persistentMenu,
      },
    });

    if (lookup.bookings.some(b => isWithinEditWindow(b.createdAtMs, nowMs, b.status))) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: '<i>Quick appointment actions:</i>',
          parse_mode: 'HTML',
          reply_markup: card.reply_markup,
        },
      });
    }
    return { actions, syncEvents };
  }

  const currentLookup = store.findBookingsForChat(chatId, username);
  const hasVerifiedPhone = Boolean(currentLookup.identity.verifiedPhoneDigits);
  const persistentMenu = buildMainMenuReplyKeyboard(hasVerifiedPhone);
  const menuCmd = matchMenuCommand(text);

  if (menuCmd === 'appointments') {
    store.upsertChatIdentity({ chatId, awaitingConciergeChat: false, awaitingCustomTimeForBookingId: '' });
    const card = buildPatientWelcomeCard(firstName, currentLookup.bookings, nowMs);
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: card.text,
        parse_mode: 'HTML',
        reply_markup: persistentMenu,
      },
    });
    if (currentLookup.bookings.some(b => isWithinEditWindow(b.createdAtMs, nowMs, b.status))) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: '<i>Select an appointment action:</i>',
          parse_mode: 'HTML',
          reply_markup: card.reply_markup,
        },
      });
    }
    return { actions, syncEvents };
  }

  if (menuCmd === 'change_timing') {
    store.upsertChatIdentity({ chatId, awaitingConciergeChat: false });
    const editable = currentLookup.bookings.filter(b =>
      isWithinEditWindow(b.createdAtMs, nowMs, b.status)
    );

    if (editable.length === 0) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text:
            currentLookup.bookings.length === 0
              ? `You do not have an upcoming appointment to reschedule yet.\nTap <b>Verify Phone Number</b> below if you booked by phone, or send us a message to arrange a visit.`
              : `The 4-hour self-reschedule window has ended for your active appointments. Please call <b>${escapeTelegramHtml(CLINIC_CONFIG.phoneDisplay)}</b> or send us a message below.`,
          parse_mode: 'HTML',
          reply_markup: persistentMenu,
        },
      });
      return { actions, syncEvents };
    }

    if (editable.length === 1) {
      const target = editable[0];
      const days = getUpcomingClinicDates(new Date(nowMs));
      const rows: TelegramInlineButton[][] = [];
      for (let i = 0; i < days.length; i += 2) {
        rows.push(
          days.slice(i, i + 2).map(d => ({
            text: d.label,
            callback_data: `cb:date:${target.id}:${d.iso}`,
          }))
        );
      }
      rows.push([{ text: 'Enter Custom Date & Time', callback_data: `cb:custom:${target.id}` }]);
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: [
            `<b>Reschedule · ${escapeTelegramHtml(target.treatmentName)}</b>`,
            `Current Time: <b>${escapeTelegramHtml(formatBotDateTime(target.preferredDateTime))}</b>`,
            ``,
            `Choose a new clinic day (Mon–Fri):`,
          ].join('\n'),
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: rows },
        },
      });
      return { actions, syncEvents };
    }

    const pickRows: TelegramInlineButton[][] = editable.slice(0, 5).map(b => [
      {
        text: `${b.treatmentName.slice(0, 22)} · ${formatBotDateTime(b.preferredDateTime)}`,
        callback_data: `cb:resched:${b.id}`,
      },
    ]);
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: '<b>Select which appointment you would like to reschedule:</b>',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: pickRows },
      },
    });
    return { actions, syncEvents };
  }

  if (menuCmd === 'cancel_visit') {
    store.upsertChatIdentity({ chatId, awaitingConciergeChat: false });
    const editable = currentLookup.bookings.filter(b =>
      isWithinEditWindow(b.createdAtMs, nowMs, b.status)
    );

    if (editable.length === 0) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text:
            currentLookup.bookings.length === 0
              ? `You have no active studio visits to cancel right now.`
              : `The 4-hour self-cancellation window has ended. Please call <b>${escapeTelegramHtml(CLINIC_CONFIG.phoneDisplay)}</b> for assistance.`,
          parse_mode: 'HTML',
          reply_markup: persistentMenu,
        },
      });
      return { actions, syncEvents };
    }

    if (editable.length === 1) {
      const target = editable[0];
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: [
            `<b>Confirm Cancellation</b>`,
            `Cancel <b>${escapeTelegramHtml(target.treatmentName)}</b> scheduled for <b>${escapeTelegramHtml(formatBotDateTime(target.preferredDateTime))}</b>?`,
          ].join('\n'),
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'Yes, Cancel Visit', callback_data: `cb:cancel_yes:${target.id}` },
                { text: 'Keep Visit', callback_data: 'cb:list' },
              ],
            ],
          },
        },
      });
      return { actions, syncEvents };
    }

    const rows: TelegramInlineButton[][] = editable.slice(0, 5).map(b => [
      {
        text: `${b.treatmentName.slice(0, 22)} · ${formatBotDateTime(b.preferredDateTime)}`,
        callback_data: `cb:cancel_ask:${b.id}`,
      },
    ]);
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: '<b>Select which appointment you would like to cancel:</b>',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: rows },
      },
    });
    return { actions, syncEvents };
  }

  if (menuCmd === 'treatments') {
    store.upsertChatIdentity({ chatId, awaitingConciergeChat: false });
    const card = buildTreatmentsCategoryCard(0);
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: card.text,
        parse_mode: 'HTML',
        reply_markup: card.reply_markup,
      },
    });
    return { actions, syncEvents };
  }

  if (menuCmd === 'clinic') {
    store.upsertChatIdentity({ chatId, awaitingConciergeChat: false });
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: buildClinicDetailsText(),
        parse_mode: 'HTML',
        reply_markup: persistentMenu,
      },
    });
    return { actions, syncEvents };
  }

  if (menuCmd === 'chat') {
    store.upsertChatIdentity({
      chatId,
      awaitingConciergeChat: true,
      awaitingCustomTimeForBookingId: '',
    });
    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: [
          `<b>Direct Concierge Chat</b>`,
          ``,
          `How can our Beverly Hills team assist you today, <b>${escapeTelegramHtml(firstName)}</b>?`,
          `Simply type your message below — ask about treatments, pricing, pre-visit prep, or leave a note for our coordinators.`,
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: persistentMenu,
      },
    });
    return { actions, syncEvents };
  }

  // Handle custom time input if user previously tapped "Enter Custom Date & Time"
  if (currentLookup.identity.awaitingCustomTimeForBookingId && text) {
    const parsed = parseCustomClinicDateTime(text);
    if (!parsed.ok) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: escapeTelegramHtml(parsed.error),
          parse_mode: 'HTML',
          reply_markup: persistentMenu,
        },
      });
      return { actions, syncEvents };
    }

    const res = store.rescheduleBookingFromBot(
      chatId,
      currentLookup.identity.awaitingCustomTimeForBookingId,
      parsed.iso,
      nowMs
    );
    if (!res.ok) {
      actions.push({
        method: 'sendMessage',
        payload: {
          chat_id: chatId,
          text: escapeTelegramHtml(res.error),
          parse_mode: 'HTML',
          reply_markup: persistentMenu,
        },
      });
      return { actions, syncEvents };
    }

    syncEvents.push({
      type: 'booking_updated',
      booking: res.booking,
      userId: res.booking.userId,
    });

    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: [
          `<b>Timing Updated &amp; Synced to Website</b>`,
          ``,
          `<b>Treatment:</b> ${escapeTelegramHtml(res.booking.treatmentName)}`,
          `<b>New Visit Time:</b> ${escapeTelegramHtml(formatBotDateTime(res.booking.preferredDateTime))}`,
        ].join('\n'),
        parse_mode: 'HTML',
        reply_markup: persistentMenu,
      },
    });
    return { actions, syncEvents };
  }

  // Handle free-form direct chat messages from Telegram composer box
  if (text) {
    const ownerUserId =
      currentLookup.matchedProfile?.userId ||
      currentLookup.bookings[0]?.userId ||
      null;

    const savedIncoming = store.addConciergeMessage({
      chatId,
      userId: ownerUserId,
      sender: 'patient',
      text,
      source: 'telegram',
      createdAtMs: nowMs,
    });
    syncEvents.push({
      type: 'concierge_message',
      message: savedIncoming,
      userId: ownerUserId,
    });

    const reply = buildDirectChatReply(firstName, text, currentLookup.bookings);
    const savedReply = store.addConciergeMessage({
      chatId,
      userId: ownerUserId,
      sender: 'concierge',
      text: reply.plainSummary,
      source: 'telegram',
      createdAtMs: nowMs + 1,
    });
    syncEvents.push({
      type: 'concierge_message',
      message: savedReply,
      userId: ownerUserId,
    });

    actions.push({
      method: 'sendMessage',
      payload: {
        chat_id: chatId,
        text: reply.html,
        parse_mode: 'HTML',
        reply_markup: persistentMenu,
      },
    });
  }

  return { actions, syncEvents };
}

/**
 * Execute generated OutgoingTelegramActions against the live Telegram Bot API.
 * Inputs: botToken string, array of OutgoingTelegramAction.
 */
export async function dispatchTelegramActions(
  botToken: string,
  actions: OutgoingTelegramAction[]
): Promise<void> {
  for (const action of actions) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/${action.method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action.payload),
      });
    } catch {
      // Continue processing remaining bot actions cleanly
    }
  }
}

/**
 * Register bot slash commands in Telegram's command menu so patients see quick commands cleanly.
 * Inputs: botToken string.
 */
export async function registerBotCommands(botToken: string): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Open Elara Atelier concierge menu' },
          { command: 'appointments', description: 'View your studio appointments' },
          { command: 'reschedule', description: 'Change appointment date or time' },
          { command: 'cancel', description: 'Cancel an upcoming appointment' },
          { command: 'treatments', description: 'Browse treatments & starting prices' },
          { command: 'clinic', description: 'Beverly Hills hours & address' },
          { command: 'chat', description: 'Message our concierge directly' },
        ],
      }),
    });
  } catch {
    // Ignore transient command-registration failures
  }
}
