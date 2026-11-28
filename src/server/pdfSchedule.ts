/**
 * Pure TypeScript PDF 1.4 schedule generator for Elara Atelier.
 * Produces a clean, multi-page, zero-dependency PDF report listing all patients
 * scheduled for the next clinic day (time, patient name, treatment, WhatsApp, phone, status)
 * for automatic end-of-day dispatch to the Doctors / Team Telegram Bot.
 */

import { CLINIC_CONFIG } from '../config/clinicConfig';
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

/**
 * Resolve current date and time components in the clinic's IANA timezone.
 * Inputs: referenceDate Date, timeZone IANA string.
 * Output: ClinicLocalNow object with numeric date/time parts and YYYY-MM-DD isoDate.
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
 * Format an ISO datetime string's time component (HH:MM) into 12-hour AM/PM clock text.
 * Inputs: isoDateTime string (e.g. '2026-11-18T14:30').
 * Output: formatted time string like '2:30 PM'.
 */
function formatTimeShort(isoDateTime: string): string {
  const match = /T(\d{2}):(\d{2})$/.exec(isoDateTime.trim());
  if (!match) return isoDateTime || 'TBD';
  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

/**
 * Sanitize text for WinAnsi / standard Type1 Helvetica PDF output and escape PDF parentheses/backslashes.
 * Inputs: raw string and optional maximum character length.
 * Output: PDF-safe ASCII literal string (without surrounding parentheses).
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
    normalized.length > maxChars ? `${normalized.slice(0, Math.max(1, maxChars - 3))}...` : normalized;
  return clipped.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Wrap long text into up to maxLines lines using greedy word splitting.
 * Inputs: raw text, maxCharsPerLine, maxLines.
 * Output: array of line strings.
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
 * Push a PDF text-drawing instruction at absolute page coordinates (origin bottom-left).
 */
function pdfText(
  ops: string[],
  fontKey: 'F1' | 'F2',
  fontSize: number,
  x: number,
  y: number,
  text: string,
  rgb: [number, number, number] = [0.12, 0.11, 0.09],
  maxChars = 120
): void {
  ops.push(
    `${rgb[0].toFixed(2)} ${rgb[1].toFixed(2)} ${rgb[2].toFixed(2)} rg`,
    `BT /${fontKey} ${fontSize} Tf 1 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)} Tm (${toPdfLiteral(text, maxChars)}) Tj ET`
  );
}

/**
 * Build a complete PDF 1.4 binary Buffer containing the next-day patient consultation roster.
 * Inputs: GeneratePatientPdfInput with targetDateIso, bookings array, and optional clinic metadata.
 * Output: Node Buffer holding valid %PDF-1.4 document bytes.
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

  const rowsPerPage = 13;
  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / rowsPerPage));
  const pageStreams: string[] = [];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx += 1) {
    const ops: string[] = [];
    const pageRows = sortedBookings.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);

    // Subtle ivory header band
    ops.push('0.94 0.91 0.88 rg 36 690 540 68 re f');
    ops.push('0.71 0.55 0.37 RG 0.9 w 36 690 540 68 re S');

    pdfText(ops, 'F2', 15, 50, 735, clinicName.toUpperCase(), [0.12, 0.11, 0.09], 80);
    pdfText(ops, 'F1', 10, 50, 717, `Next-Day Patient Consultation Schedule  |  ${clinicAddress}`, [0.43, 0.4, 0.37], 95);
    pdfText(
      ops,
      'F2',
      10,
      50,
      700,
      `Visit Date: ${dateLabel}   |   Confirmed/Requested Patients: ${sortedBookings.length}`,
      [0.12, 0.11, 0.09],
      95
    );

    // Table column header bar
    const headerY = 660;
    ops.push('0.12 0.11 0.09 rg 36 654 540 22 re f');
    pdfText(ops, 'F2', 8.5, 44, headerY + 1, '#', [0.98, 0.97, 0.95], 6);
    pdfText(ops, 'F2', 8.5, 64, headerY + 1, 'TIME', [0.98, 0.97, 0.95], 12);
    pdfText(ops, 'F2', 8.5, 122, headerY + 1, 'PATIENT', [0.98, 0.97, 0.95], 24);
    pdfText(ops, 'F2', 8.5, 240, headerY + 1, 'TREATMENT', [0.98, 0.97, 0.95], 34);
    pdfText(ops, 'F2', 8.5, 396, headerY + 1, 'PHONE', [0.98, 0.97, 0.95], 22);
    pdfText(ops, 'F2', 8.5, 498, headerY + 1, 'STATUS', [0.98, 0.97, 0.95], 16);

    if (pageRows.length === 0) {
      ops.push('0.98 0.97 0.95 rg 36 594 540 48 re f');
      ops.push('0.89 0.85 0.81 RG 0.6 w 36 594 540 48 re S');
      pdfText(
        ops,
        'F1',
        10.5,
        50,
        614,
        `No active patient consultations are scheduled for ${dateLabel}.`,
        [0.43, 0.4, 0.37],
        90
      );
    } else {
      let rowTop = 650;
      const rowHeight = 44;

      pageRows.forEach((booking, localIdx) => {
        const globalIdx = pageIdx * rowsPerPage + localIdx + 1;
        const rowBottom = rowTop - rowHeight;

        if (localIdx % 2 === 1) {
          ops.push(`0.97 0.95 0.93 rg 36 ${rowBottom.toFixed(1)} 540 ${rowHeight} re f`);
        }
        ops.push(`0.89 0.85 0.81 RG 0.5 w 36 ${rowBottom.toFixed(1)} m 576 ${rowBottom.toFixed(1)} l S`);

        const primaryY = rowTop - 16;
        const secondaryY = rowTop - 30;

        pdfText(ops, 'F2', 9, 44, primaryY, String(globalIdx), [0.43, 0.4, 0.37], 6);
        pdfText(ops, 'F2', 9, 64, primaryY, formatTimeShort(booking.preferredDateTime), [0.12, 0.11, 0.09], 12);

        const nameLines = wrapTextLines(booking.fullName || 'Guest', 20, 2);
        pdfText(ops, 'F2', 9, 122, primaryY, nameLines[0], [0.12, 0.11, 0.09], 24);
        if (nameLines[1]) {
          pdfText(ops, 'F1', 8, 122, secondaryY, nameLines[1], [0.43, 0.4, 0.37], 26);
        }

        const treatmentLines = wrapTextLines(booking.treatmentName || 'Consultation', 27, 2);
        pdfText(ops, 'F1', 8.5, 240, primaryY, treatmentLines[0], [0.12, 0.11, 0.09], 30);
        if (treatmentLines[1]) {
          pdfText(ops, 'F1', 8, 240, secondaryY, treatmentLines[1], [0.43, 0.4, 0.37], 30);
        }

        const phoneCode = booking.phoneCountryCode || booking.whatsappCountryCode || '+1';
        const phoneNum = booking.phoneNumber || booking.whatsappNumber || '';
        const phoneDisplay = phoneNum ? `${phoneCode} ${phoneNum}` : 'Not set';
        pdfText(ops, 'F2', 8.5, 396, primaryY, phoneDisplay, [0.12, 0.11, 0.09], 20);
        pdfText(
          ops,
          'F1',
          7.5,
          396,
          secondaryY,
          booking.messagingConsent === false ? 'Phone Call Only' : 'WhatsApp & Call',
          [0.43, 0.4, 0.37],
          22
        );

        const statusRgb: [number, number, number] =
          booking.status === 'confirmed' ? [0.29, 0.42, 0.31] : [0.71, 0.55, 0.37];
        pdfText(ops, 'F2', 8.5, 498, primaryY, booking.status.toUpperCase(), statusRgb, 14);
        pdfText(ops, 'F1', 7, 498, secondaryY, booking.id.slice(0, 14), [0.43, 0.4, 0.37], 16);

        rowTop = rowBottom;
      });
    }

    // Footer
    ops.push('0.89 0.85 0.81 RG 0.5 w 36 48 m 576 48 l S');
    pdfText(
      ops,
      'F1',
      8,
      36,
      34,
      `Elara Atelier Clinical Team Roster  |  Generated: ${generatedLabel}`,
      [0.43, 0.4, 0.37],
      95
    );
    pdfText(
      ops,
      'F2',
      8,
      516,
      34,
      `Page ${pageIdx + 1} of ${totalPages}`,
      [0.43, 0.4, 0.37],
      20
    );

    pageStreams.push(ops.join('\n'));
  }

  // Assemble PDF objects:
  // 1 = Catalog, 2 = Pages, 3 = Font Helvetica, 4 = Font Helvetica-Bold,
  // 5.. = pairs of (Page obj, Content stream obj)
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  for (let i = 0; i < pageStreams.length; i += 1) {
    const pageObjNum = 5 + i * 2;
    const contentObjNum = 6 + i * 2;
    pageObjNums.push(pageObjNum);
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>\nendobj\n`
  );
  objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  objects.push(`4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`);

  for (let i = 0; i < pageStreams.length; i += 1) {
    const pageObjNum = 5 + i * 2;
    const contentObjNum = 6 + i * 2;
    const streamStr = pageStreams[i];
    const streamLen = Buffer.byteLength(streamStr, 'utf8');

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
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
