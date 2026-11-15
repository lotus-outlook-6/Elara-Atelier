/**
 * Unit tests for Elara Atelier Doctors & Clinical Team Telegram Bot and End-of-Day PDF schedule generator.
 * Covers individual booking alerts with 1-click pre-filled WhatsApp confirmation links,
 * Telegram @handle & confirm/cancel inline actions syncing back to patients/website,
 * weekend-aware next clinic day targeting, and multi-page %PDF-1.4 generation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConciergeStore, type ConciergeBookingRecord } from './conciergeStore';
import {
  filterBookingsForDate,
  generatePatientSchedulePdf,
  getNextClinicDateIso,
} from './pdfSchedule';
import {
  buildPatientStatusUpdateMessage,
  buildTeamPatientAlertCard,
  processTeamBotUpdate,
  TEAM_MENU_LABELS,
} from './teamTelegramBot';

/**
 * Create a clean test booking record for Team Bot & PDF test cases.
 */
function makeBooking(overrides: Partial<ConciergeBookingRecord> = {}): ConciergeBookingRecord {
  const nowMs = Date.UTC(2026, 10, 18, 18, 0, 0);
  return {
    id: 'bk_test_1',
    userId: 'user_camille',
    fullName: 'Camille Laurent',
    phoneCountryCode: '+1',
    phoneNumber: '3105550148',
    whatsappCountryCode: '+44',
    whatsappNumber: '7700900123',
    treatmentId: 'cd-veneers',
    treatmentName: 'Porcelain Veneers (Smile Makeover)',
    preferredDateTime: '2026-11-19T14:30',
    telegramMethod: 'username',
    telegramValue: '@camille_laurent',
    status: 'requested',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    ...overrides,
  };
}

test('buildTeamPatientAlertCard generates 1-click WhatsApp confirmation URL and team controls', () => {
  const booking = makeBooking();
  const card = buildTeamPatientAlertCard(booking);

  assert.match(card.text, /Camille Laurent/);
  assert.match(card.text, /Porcelain Veneers/);
  assert.match(card.text, /\+44 7700900123/);
  assert.match(card.text, /@camille_laurent/);

  const flatButtons = card.reply_markup.inline_keyboard.flat();
  const waBtn = flatButtons.find(b => b.text.includes('Confirm on WhatsApp'));
  assert.ok(waBtn?.url, 'Expected 1-click WhatsApp button URL');
  assert.ok(waBtn.url.startsWith('https://wa.me/447700900123?text='));

  const decodedWa = decodeURIComponent(waBtn.url.split('?text=')[1]);
  assert.match(decodedWa, /Camille Laurent/);
  assert.match(decodedWa, /Porcelain Veneers \(Smile Makeover\)/);
  assert.match(decodedWa, /Beverly Hills/i);

  const tgBtn = flatButtons.find(b => b.text.includes('Message @camille_laurent'));
  assert.equal(tgBtn?.url, 'https://t.me/camille_laurent');

  const confirmBtn = flatButtons.find(b => b.callback_data === 'team:confirm:bk_test_1');
  const cancelBtn = flatButtons.find(b => b.callback_data === 'team:cancel:bk_test_1');
  assert.ok(confirmBtn);
  assert.ok(cancelBtn);
});

test('getNextClinicDateIso skips closed Sat & Sun cleanly and filterBookingsForDate sorts chronologically', () => {
  // Friday Nov 20, 2026 at 19:15 PT (UTC-8 -> Nov 21 03:15 UTC) -> skips Sat Nov 21 & Sun Nov 22 -> Mon Nov 23
  const fridayEveningUtc = Date.UTC(2026, 10, 21, 3, 20, 0);
  const fridayNext = getNextClinicDateIso(new Date(fridayEveningUtc), 'America/Los_Angeles', true);
  assert.equal(fridayNext.targetIsoDate, '2026-11-23');
  assert.equal(fridayNext.skippedWeekend, true);

  // Wednesday Nov 18, 2026 -> Thursday Nov 19
  const wedEveningUtc = Date.UTC(2026, 10, 19, 3, 20, 0);
  const wedNext = getNextClinicDateIso(new Date(wedEveningUtc), 'America/Los_Angeles', true);
  assert.equal(wedNext.targetIsoDate, '2026-11-19');
  assert.equal(wedNext.skippedWeekend, false);

  const sorted = filterBookingsForDate(
    [
      makeBooking({ id: 'b3', preferredDateTime: '2026-11-19T16:00' }),
      makeBooking({ id: 'b2', preferredDateTime: '2026-11-19T11:00', status: 'cancelled' }),
      makeBooking({ id: 'b1', preferredDateTime: '2026-11-19T10:00', fullName: 'Elena Vance' }),
    ],
    '2026-11-19'
  );
  assert.deepEqual(
    sorted.map(b => b.id),
    ['b1', 'b3']
  );
});

test('generatePatientSchedulePdf produces multi-page valid %PDF-1.4 document for next-day patients', () => {
  const manyBookings: ConciergeBookingRecord[] = Array.from({ length: 18 }, (_, i) => {
    const hour = 10 + (i % 8);
    return makeBooking({
      id: `bk_many_${i + 1}`,
      fullName: `Patient ${(i + 1).toString().padStart(2, '0')} (VIP)`,
      preferredDateTime: `2026-11-19T${String(hour).padStart(2, '0')}:30`,
      status: i % 2 === 0 ? 'confirmed' : 'requested',
    });
  });

  const pdfBuf = generatePatientSchedulePdf({
    targetDateIso: '2026-11-19',
    displayDateLabel: 'Thursday, Nov 19, 2026',
    bookings: manyBookings,
    generatedAtLabel: 'Nov 18, 2026, 7:15 PM PT',
  });

  const pdfText = pdfBuf.toString('latin1');
  assert.ok(pdfText.startsWith('%PDF-1.4\n'), 'PDF must begin with %PDF-1.4 header');
  assert.ok(pdfText.trimEnd().endsWith('%%EOF'), 'PDF must terminate with %%EOF');
  assert.match(pdfText, /\/Count 2/);
  assert.match(pdfText, /Page 1 of 2/);
  assert.match(pdfText, /Page 2 of 2/);
  assert.match(pdfText, /xref/);
  assert.match(pdfText, /startxref/);

  const emptyPdfText = generatePatientSchedulePdf({
    targetDateIso: '2026-11-25',
    bookings: [],
  }).toString('latin1');
  assert.match(emptyPdfText, /No active patient consultations/);
  assert.match(emptyPdfText, /%%EOF/);
});

test('processTeamBotUpdate handles subscription, pending list, /tomorrowpdf, and team confirm/cancel syncing', () => {
  const store = new ConciergeStore(null);
  const nowMs = Date.UTC(2026, 10, 19, 3, 20, 0); // Nov 18, 19:20 PT -> next clinic day 2026-11-19

  store.upsertChatIdentity({
    chatId: '9001',
    telegramUsername: 'camille_laurent',
  });
  store.upsertBooking(
    makeBooking({
      id: 'bk_team_flow',
      chatId: '9001',
      preferredDateTime: '2026-11-19T11:00',
    })
  );

  // 1. /start subscribes team chat (rejecting wrong passcode first when configured)
  const denied = processTeamBotUpdate(
    store,
    { message: { chat: { id: -5001 }, text: '/start wrong' } },
    { teamPasscode: 'ELARA2026', nowMs }
  );
  assert.equal(store.getTeamChatIds().length, 0);
  assert.match(String(denied.actions[0].payload.text), /YOUR_TEAM_PASSCODE/);

  const granted = processTeamBotUpdate(
    store,
    { message: { chat: { id: -5001 }, text: '/start ELARA2026' } },
    { teamPasscode: 'ELARA2026', nowMs }
  );
  assert.deepEqual(store.getTeamChatIds(), ['-5001']);
  assert.match(String(granted.actions[0].payload.text), /Pending Confirmations:<\/b> 1/);

  // 2. Request Tomorrow PDF via Reply Keyboard button
  const pdfReq = processTeamBotUpdate(
    store,
    { message: { chat: { id: -5001 }, text: TEAM_MENU_LABELS.tomorrowPdf } },
    { nowMs }
  );
  assert.equal(pdfReq.sendPdfRequests.length, 1);
  assert.equal(pdfReq.sendPdfRequests[0].targetIsoDate, '2026-11-19');

  // 3. Team taps "Mark Confirmed" inline callback -> updates booking status, syncs website & notifies patient
  const confirmOutcome = processTeamBotUpdate(
    store,
    {
      callback_query: {
        id: 'cq_confirm',
        from: { id: 777, first_name: 'Dr Elara' },
        message: { message_id: 42, chat: { id: -5001 } },
        data: 'team:confirm:bk_team_flow',
      },
    },
    { nowMs }
  );

  assert.equal(store.getBookingById('bk_team_flow')?.status, 'confirmed');
  assert.equal(confirmOutcome.syncEvents.length, 1);
  assert.equal(confirmOutcome.syncEvents[0].type, 'booking_updated');
  assert.equal(confirmOutcome.patientNotifyEvents.length, 1);
  assert.equal(confirmOutcome.patientNotifyEvents[0].chatId, '9001');
  assert.match(
    buildPatientStatusUpdateMessage(confirmOutcome.patientNotifyEvents[0].booking),
    /Appointment Confirmed/
  );
});
