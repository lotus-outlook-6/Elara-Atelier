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
  buildMorningBookingsListMessage,
  buildPatientStatusUpdateMessage,
  buildTeamPatientAlertCard,
  dispatchMorningBookingsDigest,
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

test('buildTeamPatientAlertCard generates 1-click WhatsApp confirmation URL without patient Telegram fields', () => {
  const booking = makeBooking();
  const card = buildTeamPatientAlertCard(booking);

  assert.match(card.text, /Camille Laurent/);
  assert.match(card.text, /Porcelain Veneers/);
  assert.match(card.text, /<b>Cost:<\/b> From \$240/);
  assert.match(card.text, /<b>Phone:<\/b> <code>\+44 7700900123<\/code>/);
  assert.doesNotMatch(card.text, /<b>WhatsApp:<\/b>/);
  assert.doesNotMatch(card.text, /<b>Phone \(Call\):<\/b>/);
  assert.doesNotMatch(card.text, /@camille_laurent/);
  assert.doesNotMatch(card.text, /<b>Telegram:<\/b>/);

  const flatButtons = card.reply_markup.inline_keyboard.flat();
  const waBtn = flatButtons.find(b => b.text.includes('Confirm on WhatsApp'));
  assert.ok(waBtn?.url, 'Expected 1-click WhatsApp button URL');
  assert.ok(waBtn.url.startsWith('https://wa.me/447700900123?text='));

  const decodedWa = decodeURIComponent(waBtn.url.split('?text=')[1]);
  assert.match(decodedWa, /Camille Laurent/);
  assert.match(decodedWa, /Porcelain Veneers \(Smile Makeover\)/);
  assert.match(decodedWa, /Beverly Hills/i);

  const tgBtn = flatButtons.find(b => b.text.includes('Message @camille_laurent'));
  assert.equal(tgBtn, undefined, 'Patient Telegram button should not be included');

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

test('dispatchMorningBookingsDigest skips silently when 0 active bookings exist and sends once when bookings exist', async () => {
  const store = new ConciergeStore(null);
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const fakeSend = async (_token: string, chatId: string, text: string): Promise<boolean> => {
    sentMessages.push({ chatId, text });
    return true;
  };

  // 1. 0 bookings on target day -> MUST NOT send any message
  const zeroResult = await dispatchMorningBookingsDigest({
    store,
    teamBotToken: 'test-token',
    targetChatIds: ['-5001'],
    targetIsoDate: '2026-11-27',
    sendMessageFn: fakeSend,
  });
  assert.equal(zeroResult.ok, true);
  assert.equal(zeroResult.skipped, true);
  assert.equal(zeroResult.reason, 'no_bookings');
  assert.equal(zeroResult.sentCount, 0);
  assert.equal(zeroResult.patientCount, 0);
  assert.equal(sentMessages.length, 0);

  // 2. Only a cancelled booking on target day -> STILL 0 active bookings -> MUST NOT send any message
  store.upsertBooking(
    makeBooking({
      id: 'bk_cancelled_only',
      preferredDateTime: '2026-11-27T10:00',
      status: 'cancelled',
    })
  );
  const cancelledOnlyResult = await dispatchMorningBookingsDigest({
    store,
    teamBotToken: 'test-token',
    targetChatIds: ['-5001'],
    targetIsoDate: '2026-11-27',
    sendMessageFn: fakeSend,
  });
  assert.equal(cancelledOnlyResult.skipped, true);
  assert.equal(cancelledOnlyResult.reason, 'no_bookings');
  assert.equal(sentMessages.length, 0);

  // 3. Add 2 active bookings -> sends 1 chronological morning list message per team chat
  store.upsertBooking(
    makeBooking({
      id: 'bk_morning_2',
      fullName: 'Daniel Park',
      treatmentName: 'In-Chair Laser Teeth Whitening',
      phoneCountryCode: '+1',
      phoneNumber: '3105550222',
      whatsappCountryCode: '+1',
      whatsappNumber: '3105550222',
      messagingConsent: false,
      preferredDateTime: '2026-11-27T14:00',
      status: 'requested',
    })
  );
  store.upsertBooking(
    makeBooking({
      id: 'bk_morning_1',
      fullName: 'Hannah Abbott',
      treatmentName: 'Porcelain Veneers (Smile Makeover)',
      phoneCountryCode: '+1',
      phoneNumber: '3105550111',
      whatsappCountryCode: '+1',
      whatsappNumber: '3105550111',
      messagingConsent: true,
      preferredDateTime: '2026-11-27T10:00',
      status: 'confirmed',
    })
  );

  const activeResult = await dispatchMorningBookingsDigest({
    store,
    teamBotToken: 'test-token',
    targetChatIds: ['-5001'],
    targetIsoDate: '2026-11-27',
    sendMessageFn: fakeSend,
  });
  assert.equal(activeResult.ok, true);
  assert.equal(activeResult.skipped, false);
  assert.equal(activeResult.sentCount, 1);
  assert.equal(activeResult.patientCount, 2);
  assert.equal(sentMessages.length, 1);

  const msg = sentMessages[0].text;
  assert.match(msg, /MORNING BOOKING LIST/);
  assert.match(msg, /Total Bookings:<\/b> 2/);
  assert.ok(msg.indexOf('Hannah Abbott') < msg.indexOf('Daniel Park'), 'Bookings must be sorted chronologically');
  assert.match(msg, /Porcelain Veneers \(Smile Makeover\) \(From \$240\)/);
  assert.match(msg, /In-Chair Laser Teeth Whitening \(From \$150\)/);
  assert.match(msg, /Phone: <code>\+1 3105550111<\/code>/);
  assert.match(msg, /Phone: <code>\+1 3105550222<\/code> \(Call Only\)/);

  // Verify buildMorningBookingsListMessage directly as well
  const directHtml = buildMorningBookingsListMessage({
    targetIsoDate: '2026-11-27',
    displayDateLabel: 'Friday, Nov 27, 2026',
    bookings: store.getBookingsForDate('2026-11-27'),
  });
  assert.match(directHtml, /Friday, Nov 27, 2026/);
});

test('team cancel flow requires a cancel note, syncs cancelNote to patient, and supports cold-start recovery', () => {
  const store = new ConciergeStore(null);
  const nowMs = Date.UTC(2026, 10, 28, 16, 0, 0);

  store.upsertBooking(
    makeBooking({
      id: 'bk_cancel_note_1',
      chatId: '9001',
      fullName: 'Sphinx Cipher',
      phoneCountryCode: '+44',
      phoneNumber: '447831392873',
      whatsappCountryCode: '+44',
      whatsappNumber: '447831392873',
      treatmentId: 'fa-wrinkle',
      treatmentName: 'Wrinkle Relaxing Injections',
      preferredDateTime: '2026-12-04T14:00',
    })
  );

  // Step 1: Team taps Cancel Visit -> does NOT cancel immediately; asks for a cancel note with ForceReply
  const promptStep = processTeamBotUpdate(
    store,
    {
      callback_query: {
        id: 'cq_cancel_1',
        message: { message_id: 88, chat: { id: -5001 } },
        data: 'team:cancel:bk_cancel_note_1',
      },
    },
    { nowMs }
  );
  assert.equal(store.getBookingById('bk_cancel_note_1')?.status, 'requested');
  assert.equal(promptStep.syncEvents.length, 0);
  const promptMsg = promptStep.actions.find(a => a.method === 'sendMessage');
  assert.ok(promptMsg);
  assert.match(String(promptMsg.payload.text), /Cancellation Note Required/);
  assert.equal((promptMsg.payload.reply_markup as { force_reply?: boolean })?.force_reply, true);

  // Step 2: Team replies with a cancellation note -> booking becomes cancelled with cancelNote & syncs
  const noteStep = processTeamBotUpdate(
    store,
    {
      message: {
        chat: { id: -5001 },
        text: 'Dr. Elara has an emergency procedure; please re-book for Monday or Tuesday.',
      },
    },
    { nowMs: nowMs + 10_000 }
  );
  const updated = store.getBookingById('bk_cancel_note_1');
  assert.equal(updated?.status, 'cancelled');
  assert.equal(
    updated?.cancelNote,
    'Dr. Elara has an emergency procedure; please re-book for Monday or Tuesday.'
  );
  assert.equal(noteStep.syncEvents.length, 1);
  assert.equal(noteStep.syncEvents[0].type, 'booking_updated');
  assert.equal(noteStep.patientNotifyEvents.length, 1);
  assert.match(
    buildPatientStatusUpdateMessage(noteStep.patientNotifyEvents[0].booking),
    /Note from Clinic Team:/
  );
  // Cancelled booking must be excluded from 2026-12-04 schedule & PDF
  assert.equal(store.getBookingsForDate('2026-12-04').length, 0);

  // Step 3: Cold-start recovery on a completely empty serverless store using callback_query.message.text
  const coldStore = new ConciergeStore(null);
  const coldConfirm = processTeamBotUpdate(
    coldStore,
    {
      callback_query: {
        id: 'cq_cold_confirm',
        message: {
          message_id: 101,
          chat: { id: -5001 },
          text: [
            'ELARA ATELIER · NEW PATIENT BOOKING',
            '',
            'Patient: Sphinx Cipher',
            'Treatment: 3D Digital Smile Preview',
            'Cost: From $120',
            'Date & Time: Mon, Nov 30 · 11:00 AM',
            'Phone: +44 447831392873',
            'Status: ⏳ PENDING CONFIRMATION',
            'Ref: bk_cold_999',
          ].join('\n'),
        },
        data: 'team:confirm:bk_cold_999',
      },
    },
    { nowMs }
  );
  const recovered = coldStore.getBookingById('bk_cold_999');
  assert.ok(recovered, 'Cold-start store should rehydrate booking from message text');
  assert.equal(recovered?.status, 'confirmed');
  assert.equal(recovered?.fullName, 'Sphinx Cipher');
  assert.equal(recovered?.preferredDateTime, '2026-11-30T11:00');
  assert.equal(coldConfirm.syncEvents.length, 1);

  // Step 4: Date-specific PDF callback generates PDF request for that exact date
  const datePdf = processTeamBotUpdate(
    store,
    {
      callback_query: {
        id: 'cq_pdf_date',
        message: { message_id: 105, chat: { id: -5001 } },
        data: 'team:pdf:date:2026-12-04',
      },
    },
    { nowMs }
  );
  assert.equal(datePdf.sendPdfRequests.length, 1);
  assert.equal(datePdf.sendPdfRequests[0].targetIsoDate, '2026-12-04');
});

