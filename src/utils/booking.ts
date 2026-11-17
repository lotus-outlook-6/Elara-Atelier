/**
 * Pure domain utilities for treatment filtering, strict patient form validation
 * (non-numeric names, country-coded phone, 18+ DOB gate, Telegram handle/phone),
 * 4-hour post-booking edit window checks, monthly calendar grid generation,
 * WhatsApp/Telegram concierge deep links, and comparison slider bounds.
 */

import { CLINIC_CONFIG } from '../config/clinicConfig';
import {
  TREATMENTS,
  type ComparisonCase,
  type TreatmentCategory,
  type TreatmentItem,
} from '../data/clinicData';

export type TelegramContactMethod = 'username' | 'phone';

export interface BookingFormValues {
  fullName: string;
  phoneCountryCode: string;
  phoneNumber: string;
  messagingConsent?: boolean;
  whatsappSameAsPhone?: boolean;
  whatsappCountryCode?: string;
  whatsappNumber?: string;
  dob: string;
  treatmentId: string;
  preferredDateTime: string;
  telegramSameAsPhone?: boolean;
  telegramMethod: TelegramContactMethod;
  telegramValue: string;
}

export interface BookingValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof BookingFormValues, string>>;
}

export interface AccountFormValues {
  fullName: string;
  email: string;
  password: string;
  phoneCountryCode: string;
  phoneNumber: string;
  whatsappSameAsPhone?: boolean;
  whatsappCountryCode?: string;
  whatsappNumber?: string;
  dob: string;
  telegramSameAsPhone?: boolean;
  telegramMethod: TelegramContactMethod;
  telegramValue: string;
}

export interface AccountValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof AccountFormValues, string>>;
}

export interface CalendarCell {
  isoDate: string;
  dayNumber: number;
  dayOfWeek: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

const NAME_PATTERN = /^[A-Za-zÀ-ÖØ-öø-ÿ .'-]+$/;
const COUNTRY_CODE_PATTERN = /^\+[0-9]{1,4}$/;
const PHONE_DIGITS_PATTERN = /^[0-9]{6,15}$/;
const TELEGRAM_USERNAME_PATTERN = /^@[a-zA-Z0-9_]{5,32}$/;
const TELEGRAM_PHONE_PATTERN = /^\+[0-9]{7,19}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Strip numeric digits (0-9) from a name input string so numbers cannot be entered.
 * Inputs: raw string value from text field.
 * Output: string with all ASCII digits removed.
 */
export function sanitizeNameInput(raw: string): string {
  return raw.replace(/[0-9]/g, '');
}

/**
 * Strip non-digit characters from a phone number field, capping at 15 digits.
 * Inputs: raw phone input string.
 * Output: digits-only string.
 */
export function sanitizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 15);
}

/**
 * Validate a patient full name ensuring length >= 2 and zero numeric digits.
 * Inputs: full name string.
 * Output: error message string or null if valid.
 */
export function validateFullName(fullName: string): string | null {
  const trimmed = fullName.trim();
  if (!trimmed || trimmed.length < 2) {
    return 'Please enter your full name (at least 2 letters).';
  }
  if (/[0-9]/.test(trimmed)) {
    return 'Numbers are not permitted in the Full Name field.';
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return 'Please enter letters, spaces, hyphens, or apostrophes only.';
  }
  if (trimmed.length > 80) {
    return 'Full name must be 80 characters or fewer.';
  }
  return null;
}

/**
 * Validate international calling code and national phone digits.
 * Inputs: phoneCountryCode (e.g. "+1") and phoneNumber digits string.
 * Output: error message string or null if valid.
 */
export function validatePhoneWithCountryCode(
  phoneCountryCode: string,
  phoneNumber: string
): string | null {
  if (!COUNTRY_CODE_PATTERN.test(phoneCountryCode.trim())) {
    return 'Please select a valid country code (e.g. +1).';
  }
  const digits = phoneNumber.replace(/\D/g, '');
  if (!PHONE_DIGITS_PATTERN.test(digits)) {
    return 'Please enter 6–15 phone digits without spaces or letters.';
  }
  return null;
}

/**
 * Calculate exact completed age in years from an ISO YYYY-MM-DD date of birth.
 * Inputs: dobString (YYYY-MM-DD), optional reference Date.
 * Output: integer age in years, or null if DOB string is invalid or in the future.
 */
export function calculateAge(dobString: string, referenceDate: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobString.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    Number.isNaN(birth.getTime()) ||
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day
  ) {
    return null;
  }

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const refDay = referenceDate.getDate();

  let age = refYear - year;
  if (refMonth < month || (refMonth === month && refDay < day)) {
    age -= 1;
  }
  if (age < 0 || year < 1900) return null;
  return age;
}

/**
 * Enforce the 18+ age verification gate on a date of birth string.
 * Inputs: dobString (YYYY-MM-DD), optional reference Date.
 * Output: error message string or null if verified 18+.
 */
export function validateAdultDob(dobString: string, referenceDate: Date = new Date()): string | null {
  if (!dobString.trim()) {
    return 'Date of birth is required to verify eligibility (18+).';
  }
  const age = calculateAge(dobString, referenceDate);
  if (age === null) {
    return 'Please enter a valid date of birth.';
  }
  if (age < CLINIC_CONFIG.minPatientAge) {
    return 'You must be at least 18 years old to register or schedule a studio visit.';
  }
  return null;
}

/**
 * Normalize and validate a Telegram contact value (username or phone).
 * Inputs: method ('username' | 'phone'), raw value, and optional fallback countryCode.
 * Output: normalized string (e.g. '@camille_laurent' or '+13105550194').
 */
export function normalizeTelegramValue(
  method: TelegramContactMethod,
  rawValue: string,
  countryCode = '+1'
): string {
  const trimmed = rawValue.trim();
  if (!trimmed) return '';
  if (method === 'username') {
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  const cleanCode = countryCode.startsWith('+') ? countryCode : `+${countryCode.replace(/\D/g, '')}`;
  return `${cleanCode}${digits}`;
}

/**
 * Validate Telegram username (@handle, 5-32 chars) or international phone (+digits).
 * Inputs: method ('username' | 'phone'), value string.
 * Output: error message string or null if valid.
 */
export function validateTelegramContact(
  method: TelegramContactMethod,
  value: string
): string | null {
  const normalized = normalizeTelegramValue(method, value);
  if (!normalized) {
    return method === 'username'
      ? 'Please enter your Telegram @username (e.g. @camille_laurent).'
      : 'Please enter your Telegram phone number with country code.';
  }
  if (method === 'username') {
    if (!TELEGRAM_USERNAME_PATTERN.test(normalized)) {
      return 'Telegram username must be 5–32 letters, numbers, or underscores (e.g. @elara_guest).';
    }
    return null;
  }
  if (!TELEGRAM_PHONE_PATTERN.test(normalized)) {
    return 'Telegram phone must include a country code and 7–19 total digits (e.g. +13105550194).';
  }
  return null;
}

/**
 * Resolve the effective Telegram method and value when "same as phone number" is enabled.
 * Inputs: contact object with phoneCountryCode, phoneNumber, telegramMethod, telegramValue, telegramSameAsPhone.
 * Output: { method, value } ready for Firestore persistence and concierge links.
 */
export function resolveEffectiveTelegram(values: {
  phoneCountryCode: string;
  phoneNumber: string;
  telegramMethod: TelegramContactMethod;
  telegramValue: string;
  telegramSameAsPhone?: boolean;
}): { method: TelegramContactMethod; value: string } {
  if (values.telegramSameAsPhone) {
    const optionalHandle = values.telegramValue.trim();
    if (optionalHandle) {
      return {
        method: 'username',
        value: normalizeTelegramValue('username', optionalHandle, values.phoneCountryCode),
      };
    }
    return {
      method: 'phone',
      value: normalizeTelegramValue('phone', values.phoneNumber, values.phoneCountryCode),
    };
  }
  return {
    method: values.telegramMethod,
    value: normalizeTelegramValue(
      values.telegramMethod,
      values.telegramValue,
      values.phoneCountryCode
    ),
  };
}

/**
 * Resolve the effective WhatsApp country code, national digits, full digits, and display string.
 * Inputs: contact fields containing phoneCountryCode, phoneNumber, and optional separate WhatsApp fields.
 * Output: { countryCode, number, fullDigits, display }.
 */
export function resolveEffectiveWhatsApp(values: {
  phoneCountryCode: string;
  phoneNumber: string;
  whatsappSameAsPhone?: boolean;
  whatsappCountryCode?: string;
  whatsappNumber?: string;
}): { countryCode: string; number: string; fullDigits: string; display: string } {
  const useSeparate = values.whatsappSameAsPhone === false;
  const rawCode = useSeparate
    ? values.whatsappCountryCode?.trim() || values.phoneCountryCode.trim() || '+1'
    : values.phoneCountryCode.trim() || '+1';
  const cleanCode = rawCode.startsWith('+') ? rawCode : `+${rawCode.replace(/\D/g, '') || '1'}`;
  const rawDigits = useSeparate
    ? (values.whatsappNumber || '').replace(/\D/g, '')
    : values.phoneNumber.replace(/\D/g, '');
  const fullDigits = `${cleanCode.replace(/\D/g, '')}${rawDigits}`;
  return {
    countryCode: cleanCode,
    number: rawDigits,
    fullDigits,
    display: rawDigits ? `${cleanCode} ${rawDigits}` : cleanCode,
  };
}

/**
 * Filter treatments by the selected clinical category.
 * Inputs: category name, optional list of treatments.
 * Output: matching TreatmentItem array.
 */
export function filterTreatmentsByCategory(
  category: TreatmentCategory,
  items: TreatmentItem[] = TREATMENTS
): TreatmentItem[] {
  return items.filter(item => item.category === category);
}

/**
 * Look up a single treatment by its unique ID.
 * Inputs: treatmentId string, optional list of treatments.
 * Output: matching TreatmentItem or undefined.
 */
export function getTreatmentById(
  treatmentId: string,
  items: TreatmentItem[] = TREATMENTS
): TreatmentItem | undefined {
  return items.find(item => item.id === treatmentId);
}

/**
 * Validate appointment booking fields prior to submission or edit.
 * Inputs: BookingFormValues object and optional reference Date.
 * Output: BookingValidationResult with valid boolean and field-level error messages.
 */
export function validateBookingForm(
  values: BookingFormValues,
  referenceDate: Date = new Date()
): BookingValidationResult {
  const errors: Partial<Record<keyof BookingFormValues, string>> = {};

  const nameError = validateFullName(values.fullName);
  if (nameError) errors.fullName = nameError;

  const phoneError = validatePhoneWithCountryCode(values.phoneCountryCode, values.phoneNumber);
  if (phoneError) errors.phoneNumber = phoneError;

  if (values.messagingConsent !== false && values.whatsappSameAsPhone === false) {
    const waError = validatePhoneWithCountryCode(
      values.whatsappCountryCode || '+1',
      values.whatsappNumber || ''
    );
    if (waError) {
      errors.whatsappNumber = waError.replace('phone digits', 'WhatsApp digits');
    }
  }

  const dobError = validateAdultDob(values.dob, referenceDate);
  if (dobError) errors.dob = dobError;

  if (!values.treatmentId.trim()) {
    errors.treatmentId = 'Please select a treatment or consultation.';
  }

  if (!values.preferredDateTime.trim()) {
    errors.preferredDateTime = 'Please choose a preferred date and time.';
  } else if (!isStudioWeekday(values.preferredDateTime)) {
    errors.preferredDateTime =
      'Studio appointments are available Monday – Friday only (closed Sat & Sun).';
  }

  if (values.telegramSameAsPhone) {
    if (values.telegramValue.trim()) {
      const optionalHandleError = validateTelegramContact(
        'username',
        normalizeTelegramValue('username', values.telegramValue, values.phoneCountryCode)
      );
      if (optionalHandleError) errors.telegramValue = optionalHandleError;
    }
  } else {
    const telegramError = validateTelegramContact(
      values.telegramMethod,
      normalizeTelegramValue(values.telegramMethod, values.telegramValue, values.phoneCountryCode)
    );
    if (telegramError) errors.telegramValue = telegramError;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate account registration fields (email, password, non-numeric name, phone+code, WhatsApp, 18+ DOB, Telegram).
 * Inputs: AccountFormValues, requirePassword boolean, optional reference Date.
 * Output: AccountValidationResult with field-level errors.
 */
export function validateAccountForm(
  values: AccountFormValues,
  requirePassword = true,
  referenceDate: Date = new Date()
): AccountValidationResult {
  const errors: Partial<Record<keyof AccountFormValues, string>> = {};

  const nameError = validateFullName(values.fullName);
  if (nameError) errors.fullName = nameError;

  if (requirePassword) {
    if (!EMAIL_PATTERN.test(values.email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
    if (values.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long.';
    }
  }

  const phoneError = validatePhoneWithCountryCode(values.phoneCountryCode, values.phoneNumber);
  if (phoneError) errors.phoneNumber = phoneError;

  if (values.whatsappSameAsPhone === false) {
    const waError = validatePhoneWithCountryCode(
      values.whatsappCountryCode || '+1',
      values.whatsappNumber || ''
    );
    if (waError) {
      errors.whatsappNumber = waError.replace('phone digits', 'WhatsApp digits');
    }
  }

  const dobError = validateAdultDob(values.dob, referenceDate);
  if (dobError) errors.dob = dobError;

  if (values.telegramSameAsPhone) {
    if (values.telegramValue.trim()) {
      const optionalHandleError = validateTelegramContact(
        'username',
        normalizeTelegramValue('username', values.telegramValue, values.phoneCountryCode)
      );
      if (optionalHandleError) errors.telegramValue = optionalHandleError;
    }
  } else {
    const telegramError = validateTelegramContact(
      values.telegramMethod,
      normalizeTelegramValue(values.telegramMethod, values.telegramValue, values.phoneCountryCode)
    );
    if (telegramError) errors.telegramValue = telegramError;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Determine whether a booking is still within the 4-hour post-creation edit window.
 * Inputs: createdAtMs epoch milliseconds, optional nowMs epoch milliseconds, optional status.
 * Output: boolean indicating whether edits/cancellations are still allowed.
 */
export function canEditBooking(
  createdAtMs: number,
  nowMs: number = Date.now(),
  status: string = 'requested'
): boolean {
  if (status === 'cancelled') return false;
  if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) return false;
  return nowMs <= createdAtMs + CLINIC_CONFIG.bookingEditWindowMs;
}

/**
 * Compute human-readable remaining edit window countdown for a booking.
 * Inputs: createdAtMs epoch milliseconds, optional nowMs epoch milliseconds, optional status.
 * Output: { editable: boolean, remainingMs: number, label: string }.
 */
export function getRemainingEditWindow(
  createdAtMs: number,
  nowMs: number = Date.now(),
  status: string = 'requested'
): { editable: boolean; remainingMs: number; label: string } {
  if (status === 'cancelled') {
    return { editable: false, remainingMs: 0, label: 'Cancelled' };
  }
  const deadline = createdAtMs + CLINIC_CONFIG.bookingEditWindowMs;
  const remainingMs = Math.max(0, deadline - nowMs);
  if (remainingMs === 0 || !Number.isFinite(createdAtMs)) {
    return { editable: false, remainingMs: 0, label: 'Edit window closed (4h elapsed)' };
  }
  const totalMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const label =
    hours > 0
      ? `Editable for ${hours}h ${minutes.toString().padStart(2, '0')}m`
      : `Editable for ${minutes}m`;
  return { editable: true, remainingMs, label };
}

/**
 * Format an ISO datetime-local value into a readable concierge string.
 * Inputs: raw datetime string.
 * Output: human-readable date/time string, or original string if unparseable.
 */
export function formatPreferredDateTime(raw: string): string {
  if (!raw.trim()) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.trim();
  return parsed.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Extract YYYY-MM-DD local calendar key from an ISO datetime string (e.g. '2026-11-18T11:00').
 * Inputs: datetime string.
 * Output: 'YYYY-MM-DD' string or empty string.
 */
export function extractBookingIsoDate(preferredDateTime: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(preferredDateTime.trim());
  return match ? match[1] : '';
}

/**
 * Determine whether an ISO date (YYYY-MM-DD) or YYYY-MM-DDTHH:MM falls on a studio open weekday (Mon–Fri).
 * Inputs: isoDateOrDateTime string.
 * Output: boolean (true for Mon–Fri, false for Sat/Sun or invalid).
 */
export function isStudioWeekday(isoDateOrDateTime: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDateOrDateTime.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return false;
  }
  const weekday = dt.getDay();
  return weekday >= 1 && weekday <= 5;
}

/**
 * Resolve a guaranteed Monday–Friday YYYY-MM-DD date from a candidate ISO date or visible calendar month.
 * Inputs: candidateIsoDate string, fallbackYear number, fallbackMonthIndex number (0-11), optional referenceDate.
 * Output: YYYY-MM-DD string landing on Monday–Friday.
 */
export function resolveNextOpenStudioIsoDate(
  candidateIsoDate: string,
  fallbackYear: number,
  fallbackMonthIndex: number,
  referenceDate: Date = new Date()
): string {
  if (candidateIsoDate && isStudioWeekday(candidateIsoDate)) {
    return candidateIsoDate;
  }
  const isCurrentCursorMonth =
    fallbackYear === referenceDate.getFullYear() && fallbackMonthIndex === referenceDate.getMonth();
  let startDay = isCurrentCursorMonth ? referenceDate.getDate() : 1;
  const maxDaysInMonth = new Date(fallbackYear, fallbackMonthIndex + 1, 0).getDate();
  if (startDay > maxDaysInMonth) startDay = 1;

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(fallbackYear, fallbackMonthIndex, startDay + offset);
    const weekday = candidate.getDay();
    if (weekday >= 1 && weekday <= 5) {
      return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
    }
  }
  return `${fallbackYear}-${String(fallbackMonthIndex + 1).padStart(2, '0')}-02`;
}

/**
 * Build a 42-cell (6-week) calendar grid for a given year and 0-indexed month.
 * Inputs: year (e.g. 2026), monthIndex (0-11), optional todayDate.
 * Output: Array of 42 CalendarCell objects starting on Sunday with 0-6 dayOfWeek.
 */
export function buildCalendarMonthGrid(
  year: number,
  monthIndex: number,
  todayDate: Date = new Date()
): CalendarCell[] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(year, monthIndex, 1 - startWeekday);

  const todayIso = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );
    const isoDate = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
    cells.push({
      isoDate,
      dayNumber: cellDate.getDate(),
      dayOfWeek: cellDate.getDay(),
      inCurrentMonth: cellDate.getMonth() === monthIndex && cellDate.getFullYear() === year,
      isToday: isoDate === todayIso,
    });
  }
  return cells;
}

/**
 * Build a pre-filled WhatsApp concierge URL containing appointment details.
 * Inputs: whatsappNumber, BookingFormValues, and optional treatment label.
 * Output: fully encoded https://wa.me/... URL.
 */
export function buildWhatsAppBookingUrl(
  whatsappNumber: string,
  values: BookingFormValues,
  treatmentLabel?: string
): string {
  const cleanNumber = whatsappNumber.replace(/\D/g, '');
  const treatmentName =
    treatmentLabel || getTreatmentById(values.treatmentId)?.name || values.treatmentId;
  const formattedTime = formatPreferredDateTime(values.preferredDateTime);
  const fullPhone = `${values.phoneCountryCode} ${values.phoneNumber}`.trim();
  const effectiveWhatsApp = resolveEffectiveWhatsApp(values);
  const effectiveTelegram = resolveEffectiveTelegram(values);
  const telegramDisplay = effectiveTelegram.value;

  const lines = [
    'Hello Elara Atelier Team,',
    'I would like to confirm my clinic visit request:',
    `• Name: ${values.fullName.trim()}`,
    `• Phone (Call): ${fullPhone}`,
    ...(values.messagingConsent === false
      ? ['• Contact Preference: Phone Call Only']
      : [
          `• WhatsApp: ${effectiveWhatsApp.display}`,
          `• Telegram: ${telegramDisplay}`,
        ]),
    `• Treatment: ${treatmentName}`,
    `• Preferred Date & Time: ${formattedTime}`,
  ];

  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${cleanNumber}?text=${text}`;
}

/**
 * Build a one-click custom WhatsApp confirmation link for the doctor/clinical team
 * pre-filled with the patient's full confirmation message (name, treatment, date, time, studio address).
 * Inputs: patientName, whatsappDigits (with country code), treatmentName, preferredDateTime, optional clinic details.
 * Output: https://wa.me/<digits>?text=<encoded confirmation text>.
 */
export function buildTeamWhatsAppConfirmationUrl(input: {
  patientName: string;
  whatsappDigits: string;
  treatmentName: string;
  preferredDateTime: string;
  clinicName?: string;
  clinicAddress?: string;
}): string {
  const cleanDigits = input.whatsappDigits.replace(/\D/g, '');
  const formattedTime = formatPreferredDateTime(input.preferredDateTime) || input.preferredDateTime;
  const clinicName = input.clinicName || CLINIC_CONFIG.brandName;
  const clinicAddress =
    input.clinicAddress || `${CLINIC_CONFIG.addressLine1}, ${CLINIC_CONFIG.addressLine2}`;
  const patientFirstOrFull = input.patientName.trim() || 'Guest';

  const message = [
    `Hello ${patientFirstOrFull},`,
    ``,
    `Your consultation at *${clinicName}* has been *CONFIRMED*.`,
    ``,
    `• *Treatment:* ${input.treatmentName}`,
    `• *Date & Time:* ${formattedTime}`,
    `• *Studio Location:* ${clinicAddress}`,
    ``,
    `Please reply YES to confirm you received this message or let us know if you need any assistance before your visit.`,
  ].join('\n');

  return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`;
}

/**
 * Build a Telegram Bot deep link (`https://t.me/<bot>?start=<payload>`) so the user
 * can initiate `/start` with the studio bot to receive live Telegram notifications.
 * Inputs: botUsername (without @), startPayload string (alphanumeric/underscore/hyphen).
 * Output: https://t.me/... deep link URL.
 */
export function buildTelegramBotDeepLink(
  botUsername: string = CLINIC_CONFIG.defaultTelegramBotUsername,
  startPayload = 'concierge'
): string {
  const cleanBot = botUsername.replace(/^@/, '').trim() || CLINIC_CONFIG.defaultTelegramBotUsername;
  const safePayload = startPayload.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'concierge';
  return `https://t.me/${cleanBot}?start=${safePayload}`;
}

/**
 * Clamp the Before/After comparison slider percentage between 5% and 95%.
 * Inputs: raw percentage number.
 * Output: clamped percentage number.
 */
export function clampComparisonPercentage(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(95, Math.max(5, Math.round(value * 10) / 10));
}

export interface SmileProgressStage {
  days: number;
  visits: number;
  visitTimeLabel: string;
  stageLabel: string;
  whiteningLevel: number;
  afterOpacity: number;
  afterBrightness: number;
  afterSaturate: number;
  afterSepia: number;
  estimatedCharge: number;
  formattedCharge: string;
}

/**
 * Compute smile whitening intensity, visit count, and estimated charge from treatment days (1–14).
 * Day 1 (1 visit) cleans stains cleanly; Days 2–14 progressively whiten tooth enamel up to brightest porcelain white.
 * Inputs: days integer (clamped 1–14).
 * Output: SmileProgressStage object.
 */
export function calculateSmileProgressByDays(days: number): SmileProgressStage {
  const clampedDays = Number.isFinite(days)
    ? Math.min(14, Math.max(1, Math.round(days)))
    : 14;
  const ratio = (clampedDays - 1) / 13;
  const visits = clampedDays <= 5 ? 1 : 2;
  const visitTimeLabel = `${visits} ${visits === 1 ? 'Visit' : 'Visits'} · ${clampedDays} ${clampedDays === 1 ? 'Day' : 'Days'}`;

  let stageLabel = 'Brightest White Smile';
  if (clampedDays <= 3) {
    stageLabel = 'Clean Natural Shade';
  } else if (clampedDays <= 7) {
    stageLabel = 'Light Enamel Brightening';
  } else if (clampedDays <= 11) {
    stageLabel = 'Porcelain White Shade';
  }

  const whiteningLevel = Math.round(ratio * 1000) / 1000;
  const afterOpacity = 1;
  const afterBrightness = Math.round((0.91 + ratio * 0.15) * 100) / 100;
  const afterSaturate = Math.round((1.16 - ratio * 0.22) * 100) / 100;
  const afterSepia = Math.round(((1 - ratio) * 0.24) * 100) / 100;

  const rawCharge =
    clampedDays <= 5
      ? 480 + ((clampedDays - 1) / 4) * 480
      : 960 + ((clampedDays - 6) / 8) * 960;
  const estimatedCharge = Math.round(rawCharge / 20) * 20;

  return {
    days: clampedDays,
    visits,
    visitTimeLabel,
    stageLabel,
    whiteningLevel,
    afterOpacity,
    afterBrightness,
    afterSaturate,
    afterSepia,
    estimatedCharge,
    formattedCharge: `$${estimatedCharge.toLocaleString('en-US')}`,
  };
}

export interface LaserWhiteningPassInfo {
  pass: number;
  durationMinutes: number;
  passLabel: string;
  shadeGainLabel: string;
  blendOpacity: number;
}

/**
 * Compute session timing, shade gain description, and After-image blend opacity
 * for the 3-pass In-Chair Laser Teeth Whitening slider.
 * Inputs: pass number (clamped 1 to 3).
 * Output: LaserWhiteningPassInfo object.
 */
export function calculateLaserWhiteningPass(pass: number): LaserWhiteningPassInfo {
  const clampedPass = Number.isFinite(pass)
    ? Math.min(3, Math.max(1, Math.round(pass)))
    : 3;

  if (clampedPass === 1) {
    return {
      pass: 1,
      durationMinutes: 25,
      passLabel: 'Pass 1 · 25 min',
      shadeGainLabel: '+2 Shades Lift',
      blendOpacity: 0.42,
    };
  }
  if (clampedPass === 2) {
    return {
      pass: 2,
      durationMinutes: 50,
      passLabel: 'Pass 2 · 50 min',
      shadeGainLabel: '+4 Shades Lift',
      blendOpacity: 0.72,
    };
  }
  return {
    pass: 3,
    durationMinutes: 75,
    passLabel: 'Pass 3 · 75 min',
    shadeGainLabel: '+6 Shades Lift',
    blendOpacity: 1,
  };
}

/**
 * Resolve the dynamic Before & After comparison case matching the selected treatment ID.
 * Falls back cleanly to the first available case when an unknown ID is supplied.
 * Inputs: treatmentId string, cases non-empty array of ComparisonCase objects.
 * Output: matching ComparisonCase object (throws Error if cases is empty).
 */
export function getComparisonCaseForTreatment(
  treatmentId: string,
  cases: ComparisonCase[]
): ComparisonCase {
  if (!cases.length) {
    throw new Error('Comparison cases catalog cannot be empty.');
  }
  const normalizedId = treatmentId.trim();
  const match = cases.find(item => item.treatmentId === normalizedId);
  return match ?? cases[0];
}
