/**
 * Pure TypeScript PDF 1.4 editorial schedule generator for Elara Atelier.
 * Produces a luxury, multi-page, zero-dependency PDF roster styled to match the Elara Atelier
 * website palette (Alabaster Ivory, Warm Linen, Deep Espresso, Champagne Gold, Sage)
 * with serif/sans typography, EA monogram emblem, KPI summary tiles, treatment pricing,
 * and clean unified phone & status badges for Clinic Team Telegram dispatch.
 */

import { CLINIC_CONFIG } from '../config/clinicConfig';
import { TREATMENTS, type TreatmentItem } from '../data/clinicData';
import type { ConciergeBookingRecord } from './conciergeStore';

export interface ClinicLocalNow {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  isoDate: string;
}

export interface NextClinicDayTarget {
  targetIsoDate: string;
  displayDateLabel: string;
  skippedWeekend: boolean;
}

export interface GeneratePatientPdfInput {
  targetDateIso: string;
  displayDateLabel?: string;
  bookings: ConciergeBookingRecord[];
  clinicName?: string;
  clinicAddress?: string;
  generatedAtLabel?: string;
}

type RgbTuple = readonly [number, number, number];
type PdfFontKey = 'F1' | 'F2' | 'F3' | 'F4' | 'F5';

/** Exact Elara Atelier website color palette converted to PDF 0..1 RGB floats */
const PALETTE = {
  ivory: [0.98, 0.969, 0.949] as RgbTuple, // #FAF7F2
  linen: [0.937, 0.914, 0.878] as RgbTuple, // #EFE9E0
  linenRowAlt: [0.957, 0.937, 0.906] as RgbTuple, // #F4EFE7
  stone: [0.886, 0.851, 0.808] as RgbTuple, // #E2D9CE
  espresso: [0.122, 0.106, 0.094] as RgbTuple, // #1F1B18
  espressoCard: [0.173, 0.149, 0.133] as RgbTuple, // #2C2622
  taupe: [0.431, 0.396, 0.373] as RgbTuple, // #6E655F
  sandMuted: [0.76, 0.72, 0.67] as RgbTuple, // #C2B8AB
  champagne: [0.714, 0.553, 0.369] as RgbTuple, // #B68D5E
  champagneSoft: [0.847, 0.729, 0.58] as RgbTuple, // #D8BA94
  champagneDark: [0.56, 0.415, 0.245] as RgbTuple, // #8F6A3F
  champagneTint: [0.965, 0.933, 0.886] as RgbTuple, // #F6EEE2
  sage: [0.294, 0.42, 0.314] as RgbTuple, // #4B6B50
  sageDark: [0.225, 0.35, 0.25] as RgbTuple, // #395940
  sageTint: [0.914, 0.945, 0.918] as RgbTuple, // #E9F1EA
} as const;

/**
 * Resolve current date and time components in the clinic's IANA timezone.
 * Inputs: referenceDate Date, timeZone IANA string.
 * Output: ClinicLocalNow object with numeric date/time parts and YYYY-MM-DD isoDate.
 * Errors: None.
 */
export function getClinicDateTimeParts(
  referenceDate: Date = new Date(),
  timeZone: string = CLINIC_CONFIG.clinicTimeZone
): ClinicLocalNow {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceDate);
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const val = parts.find(p => p.type === type)?.value || '0';
    return Number(val);
  };

  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const rawHour = pick('hour');
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = pick('minute');
  const localNoonUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = localNoonUtc.getUTCDay();
  const isoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, hour, minute, weekday, isoDate };
}

/**
 * Determine the next scheduled clinic date (YYYY-MM-DD) starting from tomorrow in clinic time.
 * Automatically advances past closed Saturday/Sunday dates to Monday unless skipWeekends is false.
 * Inputs: referenceDate Date, timeZone string, skipWeekends boolean.
 * Output: { targetIsoDate, displayDateLabel, skippedWeekend }.
 * Errors: None.
 */
export function getNextClinicDateIso(
  referenceDate: Date = new Date(),
  timeZone: string = CLINIC_CONFIG.clinicTimeZone,
  skipWeekends = true
): NextClinicDayTarget {
  const localNow = getClinicDateTimeParts(referenceDate, timeZone);
  let cursor = new Date(Date.UTC(localNow.year, localNow.month - 1, localNow.day + 1, 12, 0, 0));
  let skippedWeekend = false;

  if (skipWeekends) {
    while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
      skippedWeekend = true;
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1, 12, 0, 0)
      );
    }
  }

  const yyyy = cursor.getUTCFullYear();
  const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(cursor.getUTCDate()).padStart(2, '0');
  const targetIsoDate = `${yyyy}-${mm}-${dd}`;
  const displayDateLabel = cursor.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    targetIsoDate,
    displayDateLabel,
    skippedWeekend,
  };
}

/**
 * Filter active (non-cancelled) bookings matching a specific YYYY-MM-DD date and sort by visit time.
 * Inputs: bookings array, targetIsoDate (YYYY-MM-DD).
 * Output: chronologically sorted ConciergeBookingRecord array.
 * Errors: None.
 */
export function filterBookingsForDate(
  bookings: ConciergeBookingRecord[],
  targetIsoDate: string
): ConciergeBookingRecord[] {
  return bookings
    .filter(b => b.status !== 'cancelled' && b.preferredDateTime.startsWith(targetIsoDate))
    .slice()
    .sort((a, b) => a.preferredDateTime.localeCompare(b.preferredDateTime));
}

/**
 * Format an ISO datetime string's time component (HH:MM or HH:MM:SS) into 12-hour AM/PM clock text.
 * Inputs: isoDateTime string (e.g. '2026-11-18T14:30' or '2026-11-18T14:30:00').
 * Output: formatted time string like '2:30 PM'.
 * Errors: None.
 */
function formatTimeShort(isoDateTime: string): string {
  const match = /T(\d{2}):(\d{2})(?::\d{2})?/.exec(isoDateTime.trim());
  if (!match) return isoDateTime || 'TBD';
  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

/**
 * Look up matching TreatmentItem metadata (startingPrice and duration) from the studio catalog.
 * Inputs: treatmentId optional string, treatmentName string.
 * Output: TreatmentItem or undefined if no catalog match exists.
 * Errors: None.
 */
function resolveTreatmentCatalogItem(
  treatmentId?: string,
  treatmentName?: string
): TreatmentItem | undefined {
  if (treatmentId) {
    const byId = TREATMENTS.find(item => item.id === treatmentId);
    if (byId) return byId;
  }
  if (treatmentName) {
    const normalized = treatmentName.trim().toLowerCase();
    const byExact = TREATMENTS.find(item => item.name.toLowerCase() === normalized);
    if (byExact) return byExact;
    const byPartial = TREATMENTS.find(
      item =>
        item.name.toLowerCase().includes(normalized) ||
        normalized.includes(item.name.toLowerCase())
    );
    if (byPartial) return byPartial;
  }
  return undefined;
}

/**
 * Parse a starting price label such as "$1,250" into an integer dollar amount.
 * Inputs: priceLabel string (e.g. '$450' or '$1,250').
 * Output: numeric dollar value, or 0 if unparseable.
 * Errors: None.
 */
function parseStartingPriceDollars(priceLabel?: string): number {
  if (!priceLabel) return 0;
  const digits = priceLabel.replace(/[^0-9.]/g, '');
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

/**
 * Format an integer USD total with commas (e.g. 2850 -> "$2,850").
 * Inputs: amount numeric dollar value.
 * Output: formatted USD currency string.
 * Errors: None.
 */
function formatCurrencyUsd(amount: number): string {
  if (amount <= 0) return '$0';
  return `$${amount.toLocaleString('en-US')}`;
}

/**
 * Sanitize text for WinAnsi / standard Type1 PDF output and escape PDF parentheses/backslashes.
 * Inputs: raw string and optional maximum character length.
 * Output: PDF-safe ASCII literal string (without surrounding parentheses).
 * Errors: None.
 */
function toPdfLiteral(raw: string, maxChars = 120): string {
  const normalized = raw
    .replace(/[–—]/g, '-')
    .replace(/[•·]/g, '|')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const clipped =
    normalized.length > maxChars
      ? `${normalized.slice(0, Math.max(1, maxChars - 3))}...`
      : normalized;
  return clipped.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Wrap long text into up to maxLines lines using greedy word splitting.
 * Inputs: raw text, maxCharsPerLine, maxLines.
 * Output: array of line strings.
 * Errors: None.
 */
function wrapTextLines(raw: string, maxCharsPerLine: number, maxLines = 2): string[] {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (!clean) return ['-'];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length >= maxLines) break;
      current = word.slice(0, maxCharsPerLine);
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && clean.length > lines.join(' ').length + 2) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] =
      last.length > maxCharsPerLine - 3 ? `${last.slice(0, maxCharsPerLine - 3)}...` : `${last}...`;
  }
  return lines;
}

/**
 * Format an RGB color tuple as space-separated PDF channel floats.
 * Inputs: rgb RgbTuple.
 * Output: formatted string like "0.122 0.106 0.094".
 * Errors: None.
 */
function fmtRgb(rgb: RgbTuple): string {
  return `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)}`;
}

/**
 * Build a PDF vector path for a rectangle with rounded corners (origin bottom-left).
 * Inputs: x, y, width, height, corner radius r.
 * Output: PDF path operator string (without fill/stroke terminator).
 * Errors: None.
 */
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rad = Math.min(r, w / 2, h / 2);
  const k = rad * 0.5523;
  const x0 = x;
  const x1 = x + w;
  const y0 = y;
  const y1 = y + h;
  const f = (n: number) => n.toFixed(2);

  return [
    `${f(x0 + rad)} ${f(y0)} m`,
    `${f(x1 - rad)} ${f(y0)} l`,
    `${f(x1 - rad + k)} ${f(y0)} ${f(x1)} ${f(y0 + rad - k)} ${f(x1)} ${f(y0 + rad)} c`,
    `${f(x1)} ${f(y1 - rad)} l`,
    `${f(x1)} ${f(y1 - rad + k)} ${f(x1 - rad + k)} ${f(y1)} ${f(x1 - rad)} ${f(y1)} c`,
    `${f(x0 + rad)} ${f(y1)} l`,
    `${f(x0 + rad - k)} ${f(y1)} ${f(x0)} ${f(y1 - rad + k)} ${f(x0)} ${f(y1 - rad)} c`,
    `${f(x0)} ${f(y0 + rad)} l`,
    `${f(x0)} ${f(y0 + rad - k)} ${f(x0 + rad - k)} ${f(y0)} ${f(x0 + rad)} ${f(y0)} c`,
    'h',
  ].join(' ');
}

/**
 * Build a PDF vector path for a rectangle with only the top corners rounded (for table headers).
 * Inputs: x, y, width, height, corner radius r.
 * Output: PDF path operator string.
 * Errors: None.
 */
function topRoundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rad = Math.min(r, w / 2, h / 2);
  const k = rad * 0.5523;
  const x0 = x;
  const x1 = x + w;
  const y0 = y;
  const y1 = y + h;
  const f = (n: number) => n.toFixed(2);

  return [
    `${f(x0)} ${f(y0)} m`,
    `${f(x1)} ${f(y0)} l`,
    `${f(x1)} ${f(y1 - rad)} l`,
    `${f(x1)} ${f(y1 - rad + k)} ${f(x1 - rad + k)} ${f(y1)} ${f(x1 - rad)} ${f(y1)} c`,
    `${f(x0 + rad)} ${f(y1)} l`,
    `${f(x0 + rad - k)} ${f(y1)} ${f(x0)} ${f(y1 - rad + k)} ${f(x0)} ${f(y1 - rad)} c`,
    `${f(x0)} ${f(y0)} l`,
    'h',
  ].join(' ');
}

/**
 * Draw a filled and/or stroked rounded rectangle into the PDF content stream.
 * Inputs: ops array, x, y, w, h, radius, optional fillRgb, optional strokeRgb, lineWidth.
 * Output: void.
 * Errors: None.
 */
function pdfRoundedBox(
  ops: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillRgb?: RgbTuple,
  strokeRgb?: RgbTuple,
  lineWidth = 0.75
): void {
  const path = roundedRectPath(x, y, w, h, r);
  if (fillRgb && strokeRgb) {
    ops.push(`${fmtRgb(fillRgb)} rg ${fmtRgb(strokeRgb)} RG ${lineWidth.toFixed(2)} w ${path} B`);
  } else if (fillRgb) {
    ops.push(`${fmtRgb(fillRgb)} rg ${path} f`);
  } else if (strokeRgb) {
    ops.push(`${fmtRgb(strokeRgb)} RG ${lineWidth.toFixed(2)} w ${path} S`);
  }
}

/**
 * Push a PDF text-drawing instruction at absolute page coordinates (origin bottom-left).
 * Supports optional character spacing (Tc) for luxury tracked uppercase eyebrows.
 * Inputs: ops array, fontKey, fontSize, x, y, text, rgb, maxChars, charSpacing.
 * Output: void.
 * Errors: None.
 */
function pdfText(
  ops: string[],
  fontKey: PdfFontKey,
  fontSize: number,
  x: number,
  y: number,
  text: string,
  rgb: RgbTuple = PALETTE.espresso,
  maxChars = 120,
  charSpacing = 0
): void {
  const tcOp = charSpacing !== 0 ? `${charSpacing.toFixed(2)} Tc ` : '0 Tc ';
  ops.push(
    `${fmtRgb(rgb)} rg`,
    `BT /${fontKey} ${fontSize.toFixed(1)} Tf ${tcOp}1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${toPdfLiteral(text, maxChars)}) Tj ET`
  );
}

/**
 * Draw the Elara Atelier EA Monogram emblem inside a rounded ivory card with champagne border.
 * Inputs: ops array, bottom-left x, y, size in points.
 * Output: void.
 * Errors: None.
 */
function drawBrandMonogram(ops: string[], x: number, y: number, size: number): void {
  pdfRoundedBox(ops, x, y, size, size, 6, PALETTE.ivory, PALETTE.champagne, 1.0);
  // Inner hairline frame
  pdfRoundedBox(ops, x + 3, y + 3, size - 6, size - 6, 4, undefined, PALETTE.stone, 0.5);
  const fontSize = size >= 40 ? 18 : 13.5;
  const textX = size >= 40 ? x + 9.5 : x + 7.5;
  const textY = size >= 40 ? y + 16.5 : y + 11;
  pdfText(ops, 'F4', fontSize, textX, textY, 'EA', PALETTE.espresso, 4, 0.5);
  // Delicate champagne baseline accent under EA
  const barY = size >= 40 ? y + 10.5 : y + 7;
  ops.push(
    `${fmtRgb(PALETTE.champagne)} RG 0.9 w ${(x + 11).toFixed(1)} ${barY.toFixed(1)} m ${(x + size - 11).toFixed(1)} ${barY.toFixed(1)} l S`
  );
}

/**
 * Draw the full Page 1 editorial Deep Espresso masthead banner mirroring the Elara Atelier website.
 * Inputs: ops array, clinicName, clinicAddress, dateLabel.
 * Output: void.
 * Errors: None.
 */
function drawPrimaryMasthead(
  ops: string[],
  clinicName: string,
  clinicAddress: string,
  dateLabel: string
): void {
  // Deep Espresso rounded card (x=36..576, y=664..762, h=98)
  pdfRoundedBox(ops, 36, 664, 540, 98, 10, PALETTE.espresso, PALETTE.champagne, 0.85);

  // Subtle champagne inner top-left accent line
  ops.push(`${fmtRgb(PALETTE.champagne)} RG 0.6 w 52 678 m 378 678 l S`);

  // EA Monogram badge on left
  drawBrandMonogram(ops, 52, 692, 46);

  // Editorial brand wordmark & address
  pdfText(
    ops,
    'F2',
    7.2,
    112,
    741,
    'BEVERLY HILLS  |  AESTHETIC & DENTAL STUDIO',
    PALETTE.champagneSoft,
    60,
    1.2
  );
  const primaryTitle = clinicName.includes('—')
    ? clinicName.split('—')[0].trim().toUpperCase()
    : clinicName.split('-')[0].trim().toUpperCase();
  pdfText(ops, 'F4', 20, 112, 718, primaryTitle || 'ELARA ATELIER', PALETTE.ivory, 36, 1.4);
  pdfText(ops, 'F5', 10.5, 112, 701, 'Daily Patient Consultation Schedule', PALETTE.stone, 55);
  pdfText(
    ops,
    'F1',
    7.6,
    112,
    684,
    `${clinicAddress}  |  ${CLINIC_CONFIG.phoneDisplay}`,
    PALETTE.sandMuted,
    75
  );

  // Right-side Schedule Date & Hours panel
  pdfRoundedBox(ops, 392, 680, 168, 66, 7, PALETTE.espressoCard, PALETTE.champagne, 0.6);
  pdfText(ops, 'F2', 6.8, 404, 732, 'SCHEDULED CLINIC DAY', PALETTE.champagneSoft, 30, 1.0);
  pdfText(ops, 'F4', 11.5, 404, 712, dateLabel, PALETTE.ivory, 26);
  pdfText(
    ops,
    'F1',
    7.4,
    404,
    695,
    'Mon-Fri  |  10:00 AM - 7:00 PM PT',
    PALETTE.sandMuted,
    34
  );
}

/**
 * Draw a compact continuation masthead for Page 2+ so the schedule stays cohesive across pages.
 * Inputs: ops array, dateLabel, pageNumber, totalPages.
 * Output: void.
 * Errors: None.
 */
function drawContinuationMasthead(
  ops: string[],
  dateLabel: string,
  pageNumber: number,
  totalPages: number
): void {
  pdfRoundedBox(ops, 36, 708, 540, 54, 8, PALETTE.espresso, PALETTE.champagne, 0.75);
  drawBrandMonogram(ops, 48, 719, 32);

  pdfText(ops, 'F4', 14, 92, 737, 'ELARA ATELIER', PALETTE.ivory, 30, 1.1);
  pdfText(
    ops,
    'F5',
    9.2,
    92,
    721,
    `Daily Patient Consultation Schedule (Continued)  |  ${dateLabel}`,
    PALETTE.stone,
    72
  );
  pdfText(
    ops,
    'F2',
    8,
    500,
    732,
    `PAGE ${pageNumber} OF ${totalPages}`,
    PALETTE.champagneSoft,
    18,
    0.7
  );
}

/**
 * Draw the 4 editorial KPI summary cards beneath the Page 1 masthead.
 * Inputs: ops array, totalCount, confirmedCount, pendingCount, estimatedRevenueLabel.
 * Output: void.
 * Errors: None.
 */
function drawKpiSummaryRow(
  ops: string[],
  totalCount: number,
  confirmedCount: number,
  pendingCount: number,
  estimatedRevenueLabel: string
): void {
  const cards: Array<{
    label: string;
    value: string;
    caption: string;
    valueRgb: RgbTuple;
    accentRgb: RgbTuple;
  }> = [
    {
      label: 'TOTAL VISITS',
      value: String(totalCount),
      caption: totalCount === 1 ? 'Active consultation' : 'Active consultations',
      valueRgb: PALETTE.espresso,
      accentRgb: PALETTE.champagne,
    },
    {
      label: 'CONFIRMED',
      value: String(confirmedCount),
      caption: 'Verified by clinic team',
      valueRgb: PALETTE.sageDark,
      accentRgb: PALETTE.sage,
    },
    {
      label: 'PENDING',
      value: String(pendingCount),
      caption: 'Awaiting confirmation',
      valueRgb: PALETTE.champagneDark,
      accentRgb: PALETTE.champagne,
    },
    {
      label: 'EST. VALUE',
      value: estimatedRevenueLabel,
      caption: 'Starting treatment fees',
      valueRgb: PALETTE.espresso,
      accentRgb: PALETTE.champagne,
    },
  ];

  const cardWidth = 127.5;
  const gap = 10;
  const cardY = 592;
  const cardH = 58;

  cards.forEach((card, index) => {
    const x = 36 + index * (cardWidth + gap);
    pdfRoundedBox(ops, x, cardY, cardWidth, cardH, 7, PALETTE.linen, PALETTE.stone, 0.75);
    // Crisp 2pt top accent bar
    ops.push(
      `${fmtRgb(card.accentRgb)} rg ${(x + 12).toFixed(1)} ${(cardY + cardH - 2.5).toFixed(1)} 28 2.5 re f`
    );
    pdfText(ops, 'F2', 6.8, x + 12, cardY + 42, card.label, PALETTE.taupe, 22, 0.9);
    pdfText(ops, 'F4', 18, x + 12, cardY + 21, card.value, card.valueRgb, 16);
    pdfText(ops, 'F1', 7.3, x + 12, cardY + 8, card.caption, PALETTE.taupe, 26);
  });
}

/**
 * Draw the table header bar in Deep Espresso with tracked Ivory column titles.
 * Inputs: ops array, headerBottomY coordinate.
 * Output: void.
 * Errors: None.
 */
function drawTableHeader(ops: string[], headerBottomY: number): void {
  const headerH = 26;
  const path = topRoundedRectPath(36, headerBottomY, 540, headerH, 7);
  ops.push(`${fmtRgb(PALETTE.espresso)} rg ${path} f`);

  const textY = headerBottomY + 9.5;
  pdfText(ops, 'F2', 7.5, 45, textY, '#', PALETTE.champagneSoft, 4, 0.5);
  pdfText(ops, 'F2', 7.5, 67, textY, 'TIME', PALETTE.ivory, 10, 0.9);
  pdfText(ops, 'F2', 7.5, 134, textY, 'PATIENT', PALETTE.ivory, 18, 0.9);
  pdfText(ops, 'F2', 7.5, 254, textY, 'TREATMENT & COST', PALETTE.ivory, 24, 0.9);
  pdfText(ops, 'F2', 7.5, 404, textY, 'PHONE', PALETTE.ivory, 18, 0.9);
  pdfText(ops, 'F2', 7.5, 504, textY, 'STATUS', PALETTE.ivory, 14, 0.9);
}

/**
 * Draw the consistent editorial page footer on every page.
 * Inputs: ops array, generatedLabel, pageNumber, totalPages.
 * Output: void.
 * Errors: None.
 */
function drawPageFooter(
  ops: string[],
  generatedLabel: string,
  pageNumber: number,
  totalPages: number
): void {
  ops.push(`${fmtRgb(PALETTE.stone)} RG 0.6 w 36 48 m 576 48 l S`);
  ops.push(`${fmtRgb(PALETTE.champagne)} rg 36 47.4 36 1.2 re f`);
  pdfText(
    ops,
    'F1',
    7.6,
    36,
    33,
    `Elara Atelier Clinical Team Roster (Confidential)  |  Generated: ${generatedLabel}`,
    PALETTE.taupe,
    92
  );
  pdfText(
    ops,
    'F2',
    7.8,
    532,
    33,
    `Page ${pageNumber} of ${totalPages}`,
    PALETTE.espresso,
    18
  );
}

/**
 * Build a complete PDF 1.4 binary Buffer containing the editorial Elara Atelier patient consultation roster.
 * Inputs: GeneratePatientPdfInput with targetDateIso, bookings array, and optional clinic metadata.
 * Output: Node Buffer holding valid %PDF-1.4 document bytes.
 * Errors: None.
 */
export function generatePatientSchedulePdf(input: GeneratePatientPdfInput): Buffer {
  const clinicName = input.clinicName || CLINIC_CONFIG.fullTitle;
  const clinicAddress =
    input.clinicAddress || `${CLINIC_CONFIG.addressLine1}, ${CLINIC_CONFIG.addressLine2}`;
  const dateLabel = input.displayDateLabel || input.targetDateIso;
  const sortedBookings = filterBookingsForDate(input.bookings, input.targetDateIso);
  const generatedLabel =
    input.generatedAtLabel ||
    `${new Date().toLocaleString('en-US', { timeZone: CLINIC_CONFIG.clinicTimeZone })} PT`;

  // Compute summary metrics across all active visits for this clinic day
  const confirmedCount = sortedBookings.filter(b => b.status === 'confirmed').length;
  const pendingCount = sortedBookings.length - confirmedCount;
  const totalEstimatedDollars = sortedBookings.reduce((sum, booking) => {
    const meta = resolveTreatmentCatalogItem(booking.treatmentId, booking.treatmentName);
    return sum + parseStartingPriceDollars(meta?.startingPrice);
  }, 0);

  // Page 1 fits 10 spacious rows beneath masthead + KPI strip; Pages 2+ fit 13 rows beneath compact header
  const firstPageCap = 10;
  const nextPageCap = 13;
  const pageChunks: ConciergeBookingRecord[][] = [];

  if (sortedBookings.length === 0) {
    pageChunks.push([]);
  } else {
    pageChunks.push(sortedBookings.slice(0, firstPageCap));
    for (let cursor = firstPageCap; cursor < sortedBookings.length; cursor += nextPageCap) {
      pageChunks.push(sortedBookings.slice(cursor, cursor + nextPageCap));
    }
  }

  const totalPages = pageChunks.length;
  const pageStreams: string[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx += 1) {
    const ops: string[] = [];
    const pageRows = pageChunks[pageIdx];
    const isFirstPage = pageIdx === 0;
    const globalStartIndex = isFirstPage ? 0 : firstPageCap + (pageIdx - 1) * nextPageCap;

    // 1. Full-bleed Alabaster Ivory canvas + top Champagne architectural bar
    ops.push(`${fmtRgb(PALETTE.ivory)} rg 0 0 612 792 re f`);
    ops.push(`${fmtRgb(PALETTE.champagne)} rg 0 788.5 612 3.5 re f`);

    // 2. Masthead + KPI summary strip (Page 1) or Continuation Masthead (Pages 2+)
    if (isFirstPage) {
      drawPrimaryMasthead(ops, clinicName, clinicAddress, dateLabel);
      drawKpiSummaryRow(
        ops,
        sortedBookings.length,
        confirmedCount,
        pendingCount,
        formatCurrencyUsd(totalEstimatedDollars)
      );

      // Section label above table
      pdfText(ops, 'F2', 7.8, 36, 571, 'APPOINTMENT ROSTER', PALETTE.champagneDark, 30, 1.1);
      pdfText(
        ops,
        'F1',
        7.5,
        408,
        571,
        'Chronological order  |  Cancelled visits excluded',
        PALETTE.taupe,
        54
      );
    } else {
      drawContinuationMasthead(ops, dateLabel, pageIdx + 1, totalPages);
    }

    // 3. Roster Table Header + Rows
    const tableHeaderBottomY = isFirstPage ? 536 : 668;
    drawTableHeader(ops, tableHeaderBottomY);

    if (pageRows.length === 0) {
      const emptyBoxH = 88;
      const emptyBoxBottom = tableHeaderBottomY - emptyBoxH;
      ops.push(
        `${fmtRgb(PALETTE.linen)} rg 36 ${emptyBoxBottom.toFixed(1)} 540 ${emptyBoxH} re f`
      );
      ops.push(
        `${fmtRgb(PALETTE.stone)} RG 0.75 w 36 ${emptyBoxBottom.toFixed(1)} 540 ${emptyBoxH} re S`
      );
      pdfText(
        ops,
        'F4',
        12.5,
        54,
        emptyBoxBottom + 52,
        'Quiet Studio Day',
        PALETTE.espresso,
        40
      );
      pdfText(
        ops,
        'F1',
        9.5,
        54,
        emptyBoxBottom + 32,
        `No active patient consultations are scheduled for ${dateLabel}.`,
        PALETTE.taupe,
        90
      );
      pdfText(
        ops,
        'F1',
        8,
        54,
        emptyBoxBottom + 16,
        'New bookings or re-bookings confirmed online will appear automatically in updated PDF sheets.',
        PALETTE.taupe,
        96
      );
    } else {
      const rowHeight = 46;
      let rowTop = tableHeaderBottomY;

      pageRows.forEach((booking, localIdx) => {
        const globalIdx = globalStartIndex + localIdx + 1;
        const rowBottom = rowTop - rowHeight;

        // Subtle alternating row fill
        const rowFill = localIdx % 2 === 1 ? PALETTE.linenRowAlt : PALETTE.ivory;
        ops.push(`${fmtRgb(rowFill)} rg 36 ${rowBottom.toFixed(1)} 540 ${rowHeight} re f`);

        // Row bottom hairline divider
        ops.push(
          `${fmtRgb(PALETTE.stone)} RG 0.5 w 36 ${rowBottom.toFixed(1)} m 576 ${rowBottom.toFixed(1)} l S`
        );

        const primaryY = rowTop - 18.5;
        const secondaryY = rowTop - 32.5;

        // Col 1: Index (01, 02...)
        pdfText(
          ops,
          'F2',
          8.5,
          44,
          primaryY,
          String(globalIdx).padStart(2, '0'),
          PALETTE.taupe,
          4
        );

        // Col 2: Time chip
        const timeStr = formatTimeShort(booking.preferredDateTime);
        pdfRoundedBox(ops, 65, rowTop - 25.5, 58, 18.5, 4, PALETTE.linen, PALETTE.stone, 0.5);
        pdfText(ops, 'F2', 8.2, 72.5, primaryY - 0.5, timeStr, PALETTE.espresso, 10);

        // Col 3: Patient Name + Reference ID
        const nameLines = wrapTextLines(booking.fullName || 'Guest Patient', 20, 2);
        pdfText(ops, 'F4', 9.8, 134, primaryY, nameLines[0], PALETTE.espresso, 22);
        if (nameLines[1]) {
          pdfText(ops, 'F4', 8.8, 134, secondaryY + 1, nameLines[1], PALETTE.espresso, 24);
        } else {
          pdfText(
            ops,
            'F1',
            7.1,
            134,
            secondaryY,
            `Ref: ${booking.id.slice(0, 16)}`,
            PALETTE.taupe,
            24
          );
        }

        // Col 4: Treatment Name + Starting Price & Duration
        const catalogMeta = resolveTreatmentCatalogItem(
          booking.treatmentId,
          booking.treatmentName
        );
        const treatmentLabel = booking.treatmentName || catalogMeta?.name || 'Consultation';
        const treatmentPrimary =
          treatmentLabel.length > 31
            ? `${treatmentLabel.slice(0, 28).trimEnd()}...`
            : treatmentLabel;
        pdfText(ops, 'F2', 8.2, 254, primaryY, treatmentPrimary, PALETTE.espresso, 32);

        const pricePart = catalogMeta?.startingPrice
          ? `From ${catalogMeta.startingPrice}`
          : 'Consult Quote';
        const durationPart = catalogMeta?.duration ? `  |  ${catalogMeta.duration}` : '';
        pdfText(
          ops,
          'F1',
          7.6,
          254,
          secondaryY,
          `${pricePart}${durationPart}`,
          PALETTE.champagneDark,
          30
        );

        // Col 5: Unified Phone Number + Contact Channel
        const phoneCode = booking.phoneCountryCode || booking.whatsappCountryCode || '+1';
        const phoneNum = booking.phoneNumber || booking.whatsappNumber || '';
        const phoneDisplay = phoneNum ? `${phoneCode} ${phoneNum}` : 'Not provided';
        pdfText(ops, 'F2', 8.4, 404, primaryY, phoneDisplay, PALETTE.espresso, 19);
        pdfText(
          ops,
          'F1',
          7.4,
          404,
          secondaryY,
          booking.messagingConsent === false ? 'Phone Call Only' : 'WhatsApp & Call',
          PALETTE.taupe,
          20
        );

        // Col 6: Crisp flat status badge
        const isConfirmed = booking.status === 'confirmed';
        const badgeFill = isConfirmed ? PALETTE.sageTint : PALETTE.champagneTint;
        const badgeBorder = isConfirmed ? PALETTE.sage : PALETTE.champagne;
        const badgeTextRgb = isConfirmed ? PALETTE.sageDark : PALETTE.champagneDark;
        const badgeLabel = isConfirmed ? 'CONFIRMED' : 'PENDING';
        const badgeTextX = isConfirmed ? 510 : 515.5;

        pdfRoundedBox(ops, 502, rowTop - 25.5, 64, 18.5, 4, badgeFill, badgeBorder, 0.65);
        pdfText(ops, 'F2', 7.1, badgeTextX, primaryY - 0.5, badgeLabel, badgeTextRgb, 12, 0.5);

        if (nameLines[1]) {
          pdfText(
            ops,
            'F1',
            6.8,
            502,
            secondaryY - 1,
            booking.id.slice(0, 14),
            PALETTE.taupe,
            15
          );
        }

        rowTop = rowBottom;
      });

      // Outer vertical side borders & crisp bottom border framing the table body
      const tableBodyHeight = pageRows.length * rowHeight;
      const tableBottomY = tableHeaderBottomY - tableBodyHeight;
      ops.push(
        `${fmtRgb(PALETTE.stone)} RG 0.75 w 36 ${tableHeaderBottomY.toFixed(1)} m 36 ${tableBottomY.toFixed(1)} l 576 ${tableBottomY.toFixed(1)} l 576 ${tableHeaderBottomY.toFixed(1)} l S`
      );
    }

    // 4. Consistent editorial footer on every page
    drawPageFooter(ops, generatedLabel, pageIdx + 1, totalPages);

    pageStreams.push(ops.join('\n'));
  }

  // Assemble PDF 1.4 objects:
  // 1 = Catalog, 2 = Pages,
  // 3 = Helvetica, 4 = Helvetica-Bold, 5 = Times-Roman, 6 = Times-Bold, 7 = Times-Italic,
  // 8.. = pairs of (Page obj, Content stream obj)
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  for (let i = 0; i < pageStreams.length; i += 1) {
    pageObjNums.push(8 + i * 2);
  }

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>\nendobj\n`
  );
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n');
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>\nendobj\n');
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>\nendobj\n');
  objects.push('7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>\nendobj\n');

  const fontResources = '/Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R /F5 7 0 R >>';

  for (let i = 0; i < pageStreams.length; i += 1) {
    const pageObjNum = 8 + i * 2;
    const contentObjNum = 9 + i * 2;
    const streamStr = pageStreams[i];
    const streamLen = Buffer.byteLength(streamStr, 'utf8');

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${fontResources} >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamStr}\nendstream\nendobj\n`
    );
  }

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const chunks: Buffer[] = [Buffer.from(header, 'binary')];
  let byteOffset = chunks[0].length;
  const offsets: number[] = [0];

  for (const objStr of objects) {
    offsets.push(byteOffset);
    const objBuf = Buffer.from(objStr, 'utf8');
    chunks.push(objBuf);
    byteOffset += objBuf.length;
  }

  const xrefOffset = byteOffset;
  const xrefLines: string[] = [`xref\n0 ${offsets.length}\n0000000000 65535 f \n`];
  for (let i = 1; i < offsets.length; i += 1) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(Buffer.from(xrefLines.join('') + trailer, 'utf8'));

  return Buffer.concat(chunks);
}
