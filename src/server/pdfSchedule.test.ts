/**
 * Unit tests for pure TypeScript PDF 1.4 Next-Day Patient Schedule generation
 * and clinic timezone / weekend rollover calculation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { ConciergeBookingRecord } from './conciergeStore';
import {
  filterBookingsForDate,
  generatePatientSchedulePdf,
  getClinicDateTimeParts,
  getNextClinicDateIso,
} from './pdfSchedule';

function makeBooking(overrides: Partial<ConciergeBookingRecord>): ConciergeBookingRecord {
  const now = Date.UTC(2026, 10, 15, 18, 0, 0);
  return {
    id: 'bk_test_1',
    userId: 'u_1',
    fullName: 'Camille Laurent',
    phoneCountryCode: '+1',
    phoneNumber: '3105550148',
    whatsappCountryCode: '+1',
    whatsappNumber: '3105550199',
    treatmentId: 'cd-veneers',
    treatmentName: 'Porcelain Veneers (Smile Makeover)',
    preferredDateTime: '2026-11-18T11:00',
    telegramMethod: 'username',
    telegramValue: '@camille_laurent',
    status: 'requested',
    createdAtMs: now,
    updatedAtMs: now,
    ...overrides,
  };
}

test('getNextClinicDateIso advances weekday to next day and Friday to Monday', () => {
  // Wednesday Nov 18, 2026 19:20 PT -> Thursday Nov 19, 2026
  const wedEvening = new Date('2026-11-19T03:20:00Z'); // 19:20 PST on Nov 18
  const wedParts = getClinicDateTimeParts(wedEvening, 'America/Los_Angeles');
  assert.equal(wedParts.isoDate, '2026-11-18');
  assert.equal(wedParts.hour, 19);

  const nextAfterWed = getNextClinicDateIso(wedEvening, 'America/Los_Angeles', true);
  assert.equal(nextAfterWed.targetIsoDate, '2026-11-19');
  assert.equal(nextAfterWed.skippedWeekend, false);

  // Friday Nov 20, 2026 19:20 PST -> Monday Nov 23, 2026 (skips Sat/Sun)
  const friEvening = new Date('2026-11-21T03:20:00Z');
  const nextAfterFri = getNextClinicDateIso(friEvening, 'America/Los_Angeles', true);
  assert.equal(nextAfterFri.targetIsoDate, '2026-11-23');
  assert.equal(nextAfterFri.skippedWeekend, true);
});

test('filterBookingsForDate excludes cancelled visits and sorts chronologically', () => {
  const bookings = [
    makeBooking({ id: 'b3', fullName: 'Late Visitor', preferredDateTime: '2026-11-19T16:00' }),
    makeBooking({
      id: 'b_cancel',
      fullName: 'Cancelled Patient',
      preferredDateTime: '2026-11-19T10:00',
      status: 'cancelled',
    }),
    makeBooking({ id: 'b1', fullName: 'Morning Patient', preferredDateTime: '2026-11-19T09:30' }),
    makeBooking({ id: 'b_other', fullName: 'Wrong Day', preferredDateTime: '2026-11-20T11:00' }),
  ];

  const filtered = filterBookingsForDate(bookings, '2026-11-19');
  assert.deepEqual(
    filtered.map(b => b.id),
    ['b1', 'b3']
  );
});

test('generatePatientSchedulePdf outputs valid multi-page editorial PDF 1.4 with pricing and escaped literals', () => {
  const manyBookings: ConciergeBookingRecord[] = [];
  for (let i = 1; i <= 15; i += 1) {
    manyBookings.push(
      makeBooking({
        id: `bk_${i}`,
        fullName: i === 1 ? 'Elena (VIP) O’Connor' : `Patient Number ${i}`,
        phoneNumber: `31055501${String(i).padStart(2, '0')}`,
        whatsappNumber: `31055501${String(i).padStart(2, '0')}`,
        preferredDateTime: `2026-11-19T${String(9 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '30:00' : '00'}`,
        status: i % 2 === 0 ? 'confirmed' : 'requested',
      })
    );
  }

  const pdfBuffer = generatePatientSchedulePdf({
    targetDateIso: '2026-11-19',
    displayDateLabel: 'Thursday, Nov 19, 2026',
    bookings: manyBookings,
    generatedAtLabel: 'Nov 18, 2026 7:15 PM PT',
  });

  const pdfText = pdfBuffer.toString('latin1');
  assert.ok(pdfText.startsWith('%PDF-1.4\n'));
  assert.ok(pdfText.trimEnd().endsWith('%%EOF'));
  assert.match(pdfText, /\/Count 2/);
  assert.match(pdfText, /Page 1 of 2/);
  assert.match(pdfText, /Page 2 of 2/);
  assert.match(pdfText, /Elena \\\(VIP\\\) O'Connor/);
  assert.match(pdfText, /\+1 3105550101/);
  assert.match(pdfText, /TOTAL VISITS/);
  assert.match(pdfText, /EST\. VALUE/);
  assert.match(pdfText, /From \$240/);
  assert.match(pdfText, /10:30 AM/);

  // Verify xref table points cleanly to exact byte offset of xref header
  const startxrefMatch = /startxref\n(\d+)\n%%EOF/.exec(pdfText);
  assert.ok(startxrefMatch);
  const recordedXrefOffset = Number(startxrefMatch[1]);
  assert.equal(pdfBuffer.subarray(recordedXrefOffset, recordedXrefOffset + 4).toString('ascii'), 'xref');
});

test('generatePatientSchedulePdf renders clean empty state when zero bookings exist', () => {
  const emptyPdf = generatePatientSchedulePdf({
    targetDateIso: '2026-11-24',
    displayDateLabel: 'Tuesday, Nov 24, 2026',
    bookings: [],
  });
  const text = emptyPdf.toString('latin1');
  assert.match(text, /No active patient consultations are scheduled/);
  assert.match(text, /Page 1 of 1/);
});
