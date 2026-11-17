/**
 * Persistent server-side concierge store for Elara Atelier.
 * Tracks patient bookings and linked Telegram identities (@username, E.164 phone, chatId)
 * with strict per-user matching and two-way synchronization back to the web client.
 */

import fs from 'node:fs';
import path from 'node:path';
import { CLINIC_CONFIG } from '../config/clinicConfig';

export type ConciergeTelegramMethod = 'username' | 'phone';
export type ConciergeBookingStatus = 'requested' | 'confirmed' | 'cancelled';

export interface ConciergeProfileRecord {
  userId: string;
  fullName: string;
  phoneCountryCode: string;
  phoneNumber: string;
  whatsappCountryCode?: string;
  whatsappNumber?: string;
  telegramMethod: ConciergeTelegramMethod;
  telegramValue: string;
  telegramChatId?: string;
  updatedAtMs: number;
}

export interface ConciergeBookingRecord {
  id: string;
  userId: string | null;
  fullName: string;
  phoneCountryCode: string;
  phoneNumber: string;
  messagingConsent?: boolean;
  whatsappCountryCode?: string;
  whatsappNumber?: string;
  treatmentId: string;
  treatmentName: string;
  preferredDateTime: string;
  telegramMethod: ConciergeTelegramMethod;
  telegramValue: string;
  status: ConciergeBookingStatus;
  createdAtMs: number;
  updatedAtMs: number;
  botUpdatedAtMs?: number;
  updatedVia?: 'web' | 'telegram_bot';
  chatId?: string;
}

export interface ConciergeMessageRecord {
  id: string;
  chatId?: string;
  userId?: string | null;
  sender: 'patient' | 'concierge';
  text: string;
  createdAtMs: number;
  source: 'telegram' | 'website';
}

export interface TelegramChatIdentity {
  chatId: string;
  telegramUsername?: string;
  verifiedPhoneDigits?: string;
  awaitingCustomTimeForBookingId?: string;
  awaitingConciergeChat?: boolean;
  updatedAtMs: number;
}

export interface PersistedConciergeData {
  profiles: Record<string, ConciergeProfileRecord>;
  bookings: Record<string, ConciergeBookingRecord>;
  chats: Record<string, TelegramChatIdentity>;
  messages: ConciergeMessageRecord[];
  teamChatIds: string[];
  lastDailyPdfSentForDate?: string;
}

/**
 * Normalize a Telegram @username into lowercase without leading @.
 * Inputs: raw username string.
 * Output: normalized handle or empty string if invalid.
 */
export function normalizeTelegramHandle(raw: string | undefined | null): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9_]{5,32}$/.test(cleaned)) return '';
  return cleaned;
}

/**
 * Normalize a phone number string to digits only (stripping +, spaces, dashes).
 * Inputs: raw phone string or countryCode + nationalNumber.
 * Output: digit-only string (e.g. '13105550148').
 */
export function normalizePhoneDigits(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw.replace(/\D/g, '');
}

/**
 * Compare two normalized phone digit strings safely for equality (or exact national suffix when country code differs only by leading 0).
 * Inputs: digit string A, digit string B.
 * Output: boolean true if both represent the same phone number.
 */
export function phonesMatch(digitsA: string, digitsB: string): boolean {
  const a = normalizePhoneDigits(digitsA);
  const b = normalizePhoneDigits(digitsB);
  if (a.length < 7 || b.length < 7) return false;
  return a === b;
}

/**
 * Check whether a booking is still within the 4-hour post-booking self-edit window.
 * Inputs: createdAtMs, nowMs, status.
 * Output: boolean true if editable.
 */
export function isWithinEditWindow(
  createdAtMs: number,
  nowMs: number,
  status: ConciergeBookingStatus
): boolean {
  if (status === 'cancelled') return false;
  return nowMs - createdAtMs <= CLINIC_CONFIG.bookingEditWindowMs;
}

/**
 * File-backed concierge store enabling real-time Telegram Bot lookups and
 * two-way website synchronization across restarts.
 */
export class ConciergeStore {
  private readonly storePath: string | null;
  private data: PersistedConciergeData = {
    profiles: {},
    bookings: {},
    chats: {},
    messages: [],
    teamChatIds: [],
  };

  /**
   * Create a ConciergeStore optionally backed by a JSON file path (pass null for pure in-memory testing).
   */
  constructor(storePath: string | null = path.resolve(process.cwd(), '.elara-concierge-store.json')) {
    this.storePath = storePath;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.storePath) return;
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PersistedConciergeData>;
        this.data = {
          profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
          bookings: parsed.bookings && typeof parsed.bookings === 'object' ? parsed.bookings : {},
          chats: parsed.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
          messages: Array.isArray(parsed.messages) ? parsed.messages : [],
          teamChatIds: Array.isArray(parsed.teamChatIds)
            ? parsed.teamChatIds.map(id => String(id).trim()).filter(Boolean)
            : [],
          lastDailyPdfSentForDate:
            typeof parsed.lastDailyPdfSentForDate === 'string'
              ? parsed.lastDailyPdfSentForDate
              : undefined,
        };
      }
    } catch {
      this.data = {
        profiles: {},
        bookings: {},
        chats: {},
        messages: [],
        teamChatIds: [],
      };
    }
  }

  private saveToDisk(): void {
    if (!this.storePath) return;
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // Ignore write failures on read-only containers; in-memory state stays authoritative
    }
  }

  /**
   * Upsert a signed-in user's profile and bookings synced from the web app,
   * preserving any newer timing/cancellation changes applied by the Telegram Bot.
   * Inputs: verified userId, profile (optional), incoming bookings array.
   * Output: list of bookings whose latest authoritative state came from Telegram Bot (`botUpdatedAtMs > web.updatedAtMs`).
   */
  syncFromWebUser(
    userId: string,
    profile: Omit<ConciergeProfileRecord, 'userId' | 'updatedAtMs'> | null,
    webBookings: ConciergeBookingRecord[]
  ): {
    botUpdatedBookings: ConciergeBookingRecord[];
    linkedChatId: string | null;
  } {
    const now = Date.now();
    let linkedChatId: string | null = this.data.profiles[userId]?.telegramChatId || null;

    if (profile) {
      const existingProfile = this.data.profiles[userId];
      // Check if any already-verified Telegram chat matches this profile's handle or phone
      if (!linkedChatId) {
        const matchedChat = this.findChatMatchingContact(
          profile.phoneCountryCode,
          profile.phoneNumber,
          profile.telegramMethod,
          profile.telegramValue
        );
        if (matchedChat) {
          linkedChatId = matchedChat.chatId;
        }
      }

      this.data.profiles[userId] = {
        ...profile,
        userId,
        telegramChatId: linkedChatId || profile.telegramChatId || existingProfile?.telegramChatId,
        updatedAtMs: now,
      };
    }

    const botUpdatedBookings: ConciergeBookingRecord[] = [];
    for (const incoming of webBookings) {
      if (incoming.userId && incoming.userId !== userId) continue;
      const existing = this.data.bookings[incoming.id];

      if (
        existing &&
        existing.updatedVia === 'telegram_bot' &&
        (existing.botUpdatedAtMs || 0) > (incoming.updatedAtMs || 0)
      ) {
        // Keep the fresher bot edit and ask the web client to reconcile it to Firestore
        botUpdatedBookings.push(existing);
        continue;
      }

      const matchedChat =
        linkedChatId ||
        existing?.chatId ||
        this.findChatMatchingContact(
          incoming.phoneCountryCode,
          incoming.phoneNumber,
          incoming.telegramMethod,
          incoming.telegramValue
        )?.chatId;

      if (matchedChat && !linkedChatId) {
        linkedChatId = matchedChat;
      }

      this.data.bookings[incoming.id] = {
        ...incoming,
        userId,
        chatId: matchedChat || undefined,
      };
    }

    this.saveToDisk();
    return { botUpdatedBookings, linkedChatId };
  }

  /**
   * Register or refresh a single guest or authenticated booking from /api/telegram/notify.
   * Inputs: ConciergeBookingRecord.
   */
  upsertBooking(record: ConciergeBookingRecord): ConciergeBookingRecord {
    const existing = this.data.bookings[record.id];
    const matchedChat =
      record.chatId ||
      existing?.chatId ||
      this.findChatMatchingContact(
        record.phoneCountryCode,
        record.phoneNumber,
        record.telegramMethod,
        record.telegramValue
      )?.chatId;

    const merged: ConciergeBookingRecord = {
      ...existing,
      ...record,
      chatId: matchedChat || undefined,
    };
    this.data.bookings[record.id] = merged;
    this.saveToDisk();
    return merged;
  }

  /**
   * Retrieve a single booking by ID (used for guest confirmation live status checks).
   */
  getBookingById(bookingId: string): ConciergeBookingRecord | null {
    return this.data.bookings[bookingId] || null;
  }

  /**
   * Record or update a Telegram chat's verified username, phone contact, or custom reschedule prompt state.
   */
  upsertChatIdentity(patch: Partial<TelegramChatIdentity> & { chatId: string }): TelegramChatIdentity {
    const prev = this.data.chats[patch.chatId];
    const normalizedHandle = patch.telegramUsername
      ? normalizeTelegramHandle(patch.telegramUsername)
      : prev?.telegramUsername;
    const normalizedPhone = patch.verifiedPhoneDigits
      ? normalizePhoneDigits(patch.verifiedPhoneDigits)
      : prev?.verifiedPhoneDigits;

    const next: TelegramChatIdentity = {
      chatId: patch.chatId,
      telegramUsername: normalizedHandle || undefined,
      verifiedPhoneDigits: normalizedPhone || undefined,
      awaitingCustomTimeForBookingId:
        patch.awaitingCustomTimeForBookingId !== undefined
          ? patch.awaitingCustomTimeForBookingId || undefined
          : prev?.awaitingCustomTimeForBookingId,
      awaitingConciergeChat:
        patch.awaitingConciergeChat !== undefined
          ? Boolean(patch.awaitingConciergeChat)
          : prev?.awaitingConciergeChat,
      updatedAtMs: Date.now(),
    };

    this.data.chats[patch.chatId] = next;
    this.linkMatchingRecordsToChat(next);
    this.saveToDisk();
    return next;
  }

  /**
   * Link any profiles/bookings matching this verified chat's @username or phone number to its chatId.
   */
  private linkMatchingRecordsToChat(chat: TelegramChatIdentity): void {
    for (const profile of Object.values(this.data.profiles)) {
      if (this.doesRecordMatchIdentity(profile, chat)) {
        profile.telegramChatId = chat.chatId;
      }
    }
    for (const booking of Object.values(this.data.bookings)) {
      if (this.doesRecordMatchIdentity(booking, chat)) {
        booking.chatId = chat.chatId;
      }
    }
  }

  private findChatMatchingContact(
    phoneCountryCode: string,
    phoneNumber: string,
    telegramMethod: ConciergeTelegramMethod,
    telegramValue: string
  ): TelegramChatIdentity | null {
    const fullPhone = normalizePhoneDigits(`${phoneCountryCode}${phoneNumber}`);
    const tgPhone = telegramMethod === 'phone' ? normalizePhoneDigits(telegramValue) : '';
    const tgHandle = telegramMethod === 'username' ? normalizeTelegramHandle(telegramValue) : '';

    for (const chat of Object.values(this.data.chats)) {
      if (tgHandle && chat.telegramUsername && chat.telegramUsername === tgHandle) {
        return chat;
      }
      if (chat.verifiedPhoneDigits) {
        if (phonesMatch(chat.verifiedPhoneDigits, fullPhone) || (tgPhone && phonesMatch(chat.verifiedPhoneDigits, tgPhone))) {
          return chat;
        }
      }
    }
    return null;
  }

  /**
   * Determine strictly whether a booking/profile record belongs to the given Telegram chat identity.
   * Only matches when username matches (case-insensitive) OR verified phone matches E.164 digits OR
   * the record was explicitly linked to this exact chatId.
   */
  doesRecordMatchIdentity(
    record: {
      phoneCountryCode: string;
      phoneNumber: string;
      telegramMethod: ConciergeTelegramMethod;
      telegramValue: string;
      telegramChatId?: string;
      chatId?: string;
    },
    chat: TelegramChatIdentity
  ): boolean {
    if (record.chatId && record.chatId === chat.chatId) return true;
    if (record.telegramChatId && record.telegramChatId === chat.chatId) return true;

    if (
      chat.telegramUsername &&
      record.telegramMethod === 'username' &&
      normalizeTelegramHandle(record.telegramValue) === chat.telegramUsername
    ) {
      return true;
    }

    if (chat.verifiedPhoneDigits) {
      const primaryPhone = normalizePhoneDigits(`${record.phoneCountryCode}${record.phoneNumber}`);
      if (phonesMatch(primaryPhone, chat.verifiedPhoneDigits)) {
        return true;
      }
      if (
        record.telegramMethod === 'phone' &&
        phonesMatch(record.telegramValue, chat.verifiedPhoneDigits)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Return strictly ONLY the bookings belonging to the verified Telegram chat user,
   * optionally linking a /start <bookingId> payload only if it passes ownership/verification checks.
   */
  findBookingsForChat(
    chatId: string,
    telegramUsername?: string,
    verifiedPhoneDigits?: string,
    startBookingId?: string
  ): {
    identity: TelegramChatIdentity;
    bookings: ConciergeBookingRecord[];
    matchedProfile: ConciergeProfileRecord | null;
    needsPhoneVerification: boolean;
  } {
    const identity = this.upsertChatIdentity({
      chatId,
      telegramUsername: telegramUsername || undefined,
      verifiedPhoneDigits: verifiedPhoneDigits || undefined,
    });

    // If launched via a specific booking deep link (/start bk_...), verify ownership safely:
    // Link only if record isn't already bound to a different chatId AND either:
    // - the record matches the chat's @username or phone, OR
    // - the record used a phone-only contact (Telegram doesn't share user phone until contact tap,
    //   unless they explicitly launched that exact booking's deep link from their confirmation page).
    if (startBookingId) {
      const direct = this.data.bookings[startBookingId];
      if (direct && (!direct.chatId || direct.chatId === chatId)) {
        const directHandle =
          direct.telegramMethod === 'username'
            ? normalizeTelegramHandle(direct.telegramValue)
            : '';
        const usernameConflict =
          Boolean(directHandle) &&
          Boolean(identity.telegramUsername) &&
          directHandle !== identity.telegramUsername;

        if (!usernameConflict && (directHandle === identity.telegramUsername || direct.telegramMethod === 'phone' || !directHandle)) {
          direct.chatId = chatId;
          if (direct.userId && this.data.profiles[direct.userId] && !this.data.profiles[direct.userId].telegramChatId) {
            this.data.profiles[direct.userId].telegramChatId = chatId;
          }
          this.saveToDisk();
        }
      }
    }

    const matchedBookings = Object.values(this.data.bookings)
      .filter(b => this.doesRecordMatchIdentity(b, identity))
      .sort((a, b) => a.preferredDateTime.localeCompare(b.preferredDateTime));

    const matchedProfile =
      Object.values(this.data.profiles).find(p => this.doesRecordMatchIdentity(p, identity)) ||
      null;

    const needsPhoneVerification =
      matchedBookings.length === 0 && !matchedProfile && !identity.verifiedPhoneDigits;

    return {
      identity,
      bookings: matchedBookings,
      matchedProfile,
      needsPhoneVerification,
    };
  }

  /**
   * Find the stored chatId for a new/updated booking by matching its @username or phone number.
   */
  findChatIdForBooking(booking: {
    phoneCountryCode: string;
    phoneNumber: string;
    telegramMethod: ConciergeTelegramMethod;
    telegramValue: string;
    chatId?: string;
  }): string | null {
    if (booking.chatId) return booking.chatId;
    const chat = this.findChatMatchingContact(
      booking.phoneCountryCode,
      booking.phoneNumber,
      booking.telegramMethod,
      booking.telegramValue
    );
    return chat ? chat.chatId : null;
  }

  /**
   * Verify ownership & 4-hour edit window and reschedule a booking's preferredDateTime from Telegram Bot.
   */
  rescheduleBookingFromBot(
    chatId: string,
    bookingId: string,
    nextPreferredDateTime: string,
    nowMs = Date.now()
  ): { ok: true; booking: ConciergeBookingRecord } | { ok: false; error: string } {
    const chat = this.data.chats[chatId];
    const booking = this.data.bookings[bookingId];
    if (!chat || !booking || !this.doesRecordMatchIdentity(booking, chat)) {
      return { ok: false, error: 'Booking not found for your verified Telegram account.' };
    }
    if (booking.status === 'cancelled') {
      return { ok: false, error: 'Cancelled appointments cannot be rescheduled.' };
    }
    if (!isWithinEditWindow(booking.createdAtMs, nowMs, booking.status)) {
      return {
        ok: false,
        error: `The 4-hour self-service modification window has ended. Please call ${CLINIC_CONFIG.phoneDisplay}.`,
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nextPreferredDateTime)) {
      return { ok: false, error: 'Invalid date/time format. Use YYYY-MM-DD HH:MM.' };
    }

    booking.preferredDateTime = nextPreferredDateTime;
    booking.updatedAtMs = nowMs;
    booking.botUpdatedAtMs = nowMs;
    booking.updatedVia = 'telegram_bot';
    chat.awaitingCustomTimeForBookingId = undefined;
    this.saveToDisk();

    return { ok: true, booking };
  }

  /**
   * Verify ownership & 4-hour edit window and cancel a booking from Telegram Bot.
   */
  cancelBookingFromBot(
    chatId: string,
    bookingId: string,
    nowMs = Date.now()
  ): { ok: true; booking: ConciergeBookingRecord } | { ok: false; error: string } {
    const chat = this.data.chats[chatId];
    const booking = this.data.bookings[bookingId];
    if (!chat || !booking || !this.doesRecordMatchIdentity(booking, chat)) {
      return { ok: false, error: 'Booking not found for your verified Telegram account.' };
    }
    if (booking.status === 'cancelled') {
      return { ok: false, error: 'This appointment is already cancelled.' };
    }
    if (!isWithinEditWindow(booking.createdAtMs, nowMs, booking.status)) {
      return {
        ok: false,
        error: `The 4-hour cancellation window has ended. Please call ${CLINIC_CONFIG.phoneDisplay}.`,
      };
    }

    booking.status = 'cancelled';
    booking.updatedAtMs = nowMs;
    booking.botUpdatedAtMs = nowMs;
    booking.updatedVia = 'telegram_bot';
    chat.awaitingCustomTimeForBookingId = undefined;
    this.saveToDisk();

    return { ok: true, booking };
  }

  /**
   * Append a direct concierge message (from Telegram or Website) to the persistent store.
   * Inputs: chatId, userId, sender ('patient' | 'concierge'), text, source, createdAtMs.
   * Output: created ConciergeMessageRecord.
   */
  addConciergeMessage(input: {
    chatId?: string;
    userId?: string | null;
    sender: 'patient' | 'concierge';
    text: string;
    source: 'telegram' | 'website';
    createdAtMs?: number;
  }): ConciergeMessageRecord {
    const cleanedText = input.text.trim().slice(0, 1200);
    const createdAtMs = typeof input.createdAtMs === 'number' ? input.createdAtMs : Date.now();
    const record: ConciergeMessageRecord = {
      id: `msg_${createdAtMs}_${Math.random().toString(36).slice(2, 7)}`,
      chatId: input.chatId || undefined,
      userId: input.userId ?? null,
      sender: input.sender,
      text: cleanedText,
      createdAtMs,
      source: input.source,
    };

    this.data.messages.push(record);
    if (this.data.messages.length > 400) {
      this.data.messages = this.data.messages.slice(-400);
    }
    this.saveToDisk();
    return record;
  }

  /**
   * Resolve the linked Telegram chatId for a signed-in user via profile or matching bookings.
   * Inputs: verified Firebase userId.
   * Output: Telegram chatId string or null.
   */
  getLinkedChatIdForUser(userId: string): string | null {
    const profile = this.data.profiles[userId];
    if (profile?.telegramChatId) return profile.telegramChatId;

    if (profile) {
      const matched = this.findChatMatchingContact(
        profile.phoneCountryCode,
        profile.phoneNumber,
        profile.telegramMethod,
        profile.telegramValue
      );
      if (matched) return matched.chatId;
    }

    for (const booking of Object.values(this.data.bookings)) {
      if (booking.userId === userId && booking.chatId) {
        return booking.chatId;
      }
    }
    return null;
  }

  /**
   * Retrieve chronological direct concierge chat messages strictly scoped to the given userId/linked chatId.
   * Inputs: verified Firebase userId.
   * Output: sorted ConciergeMessageRecord array.
   */
  getMessagesForUser(userId: string): ConciergeMessageRecord[] {
    const linkedChatId = this.getLinkedChatIdForUser(userId);
    return this.data.messages
      .filter(msg => msg.userId === userId || (Boolean(linkedChatId) && msg.chatId === linkedChatId))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  /**
   * Register a doctor or clinical team Telegram chatId so the Team Bot delivers individual booking alerts and EOD PDFs.
   * Inputs: numeric/string Telegram chatId.
   * Output: deduplicated list of registered team chatIds.
   */
  registerTeamChat(chatId: string): string[] {
    const clean = String(chatId || '').trim();
    if (!clean) return [...this.data.teamChatIds];
    if (!this.data.teamChatIds.includes(clean)) {
      this.data.teamChatIds.push(clean);
      this.saveToDisk();
    }
    return [...this.data.teamChatIds];
  }

  /**
   * Resolve all team Telegram chatIds by combining env config (comma-separated allowed) and registered chats.
   * Inputs: optional envChatIds string (e.g. process.env.TELEGRAM_TEAM_CHAT_ID).
   * Output: deduplicated non-empty chatId array.
   */
  getTeamChatIds(envChatIds?: string): string[] {
    const combined = new Set<string>();
    if (envChatIds) {
      for (const part of envChatIds.split(',')) {
        const trimmed = part.trim();
        if (trimmed) combined.add(trimmed);
      }
    }
    for (const stored of this.data.teamChatIds) {
      if (stored.trim()) combined.add(stored.trim());
    }
    return Array.from(combined);
  }

  /**
   * Return the YYYY-MM-DD schedule date for which the end-of-day PDF digest was last sent.
   * Output: ISO date string or undefined.
   */
  getLastDailyPdfSentForDate(): string | undefined {
    return this.data.lastDailyPdfSentForDate;
  }

  /**
   * Mark a target schedule date (YYYY-MM-DD) as having had its PDF digest delivered to the Team Bot.
   * Inputs: targetIsoDate string.
   */
  markDailyPdfSent(targetIsoDate: string): void {
    this.data.lastDailyPdfSentForDate = targetIsoDate;
    this.saveToDisk();
  }

  /**
   * Return all bookings scheduled on a specific YYYY-MM-DD date sorted chronologically.
   * Inputs: isoDate ('YYYY-MM-DD'), optional includeCancelled boolean (default false).
   * Output: sorted ConciergeBookingRecord array.
   */
  getBookingsForDate(isoDate: string, includeCancelled = false): ConciergeBookingRecord[] {
    return Object.values(this.data.bookings)
      .filter(b => b.preferredDateTime.startsWith(isoDate) && (includeCancelled || b.status !== 'cancelled'))
      .sort((a, b) => {
        const cmp = a.preferredDateTime.localeCompare(b.preferredDateTime);
        return cmp !== 0 ? cmp : a.createdAtMs - b.createdAtMs;
      });
  }

  /**
   * Return all active bookings currently awaiting team confirmation ('requested'), sorted chronologically.
   * Output: sorted ConciergeBookingRecord array.
   */
  getPendingBookings(): ConciergeBookingRecord[] {
    return Object.values(this.data.bookings)
      .filter(b => b.status === 'requested')
      .sort((a, b) => a.preferredDateTime.localeCompare(b.preferredDateTime));
  }

  /**
   * Update a booking's confirmation or cancellation status initiated by the clinical team from the Team Bot.
   * Inputs: bookingId string, next status ('confirmed' | 'cancelled'), optional nowMs.
   * Output: { ok: true, booking } or { ok: false, error }.
   */
  updateBookingStatusFromTeam(
    bookingId: string,
    status: 'confirmed' | 'cancelled',
    nowMs = Date.now()
  ): { ok: true; booking: ConciergeBookingRecord } | { ok: false; error: string } {
    const booking = this.data.bookings[bookingId];
    if (!booking) {
      return { ok: false, error: 'Booking record could not be found.' };
    }
    if (booking.status === 'cancelled' && status === 'confirmed') {
      return { ok: false, error: 'This appointment was already cancelled.' };
    }

    booking.status = status;
    booking.updatedAtMs = nowMs;
    booking.botUpdatedAtMs = nowMs;
    booking.updatedVia = 'telegram_bot';
    this.saveToDisk();

    return { ok: true, booking };
  }
}
