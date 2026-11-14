/**
 * Unit tests for Elara Atelier Telegram Concierge Bot strict user isolation,
 * persistent bottom Reply Keyboard actions, clean empty-state messaging,
 * direct concierge chat + treatment/hours Q&A, and two-way timing synchronization.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConciergeStore } from './conciergeStore';
import {
  MENU_BUTTON_LABELS,
  parseCustomClinicDateTime,
  processTelegramUpdate,
} from './telegramBot';

function createSeededStore(nowMs: number): ConciergeStore {
  const store = new ConciergeStore(null);
  store.syncFromWebUser(
    'user_camille',
    {
      fullName: 'Camille Laurent',
      phoneCountryCode: '+1',
      phoneNumber: '3105550148',
      telegramMethod: 'username',
      telegramValue: '@camille_laurent',
    },
    [
      {
        id: 'bk_camille_1',
        userId: 'user_camille',
        fullName: 'Camille Laurent',
        phoneCountryCode: '+1',
        phoneNumber: '3105550148',
        treatmentId: 'cd-veneers',
        treatmentName: 'Porcelain Veneers (Smile Makeover)',
        preferredDateTime: '2026-11-18T11:00',
        telegramMethod: 'username',
        telegramValue: '@camille_laurent',
        status: 'requested',
        createdAtMs: nowMs - 30 * 60 * 1000,
        updatedAtMs: nowMs - 30 * 60 * 1000,
      },
    ]
  );

  store.syncFromWebUser(
    'user_julian',
    {
      fullName: 'Julian Mercer',
      phoneCountryCode: '+44',
      phoneNumber: '7700900123',
      telegramMethod: 'phone',
      telegramValue: '+447700900123',
    },
    [
      {
        id: 'bk_julian_1',
        userId: 'user_julian',
        fullName: 'Julian Mercer',
        phoneCountryCode: '+44',
        phoneNumber: '7700900123',
        treatmentId: 'fa-contouring',
        treatmentName: 'Cheek & Jawline Contouring',
        preferredDateTime: '2026-11-20T14:30',
        telegramMethod: 'phone',
        telegramValue: '+447700900123',
        status: 'requested',
        createdAtMs: nowMs - 20 * 60 * 1000,
        updatedAtMs: nowMs - 20 * 60 * 1000,
      },
    ]
  );
  return store;
}

test('bot sends ONLY matched user bookings on /start with persistent bottom Reply Keyboard', () => {
  const nowMs = Date.UTC(2026, 10, 14, 10, 0, 0);
  const store = createSeededStore(nowMs);

  const res = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 1001 },
        from: { id: 1001, username: 'Camille_Laurent', first_name: 'Camille' },
        text: '/start',
      },
    },
    nowMs
  );

  assert.equal(res.actions.length, 2);
  const msgText = String(res.actions[0].payload.text);
  assert.match(msgText, /Camille Laurent/);
  assert.match(msgText, /Porcelain Veneers/);
  assert.doesNotMatch(msgText, /Julian Mercer/);
  assert.doesNotMatch(msgText, /Cheek & Jawline/);

  const menuMarkup = res.actions[0].payload.reply_markup as {
    keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>;
    is_persistent?: boolean;
  };
  assert.equal(menuMarkup.is_persistent, true);
  assert.equal(menuMarkup.keyboard?.[0]?.[0]?.text, MENU_BUTTON_LABELS.appointments);
  assert.equal(menuMarkup.keyboard?.[3]?.[0]?.text, MENU_BUTTON_LABELS.chat);

  const inlineMarkup = res.actions[1].payload.reply_markup as {
    inline_keyboard?: Array<Array<{ text: string }>>;
  };
  assert.equal(inlineMarkup.inline_keyboard?.[0]?.[0]?.text, 'Change Timing');
});

test('bot shows persistent menu with Verify Phone for unmatched user and omits @username jargon when empty', () => {
  const nowMs = Date.UTC(2026, 10, 14, 10, 0, 0);
  const store = createSeededStore(nowMs);

  const firstHit = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 2002 },
        from: { id: 2002, username: 'julian_private', first_name: 'Julian' },
        text: '/start',
      },
    },
    nowMs
  );

  assert.equal(firstHit.actions.length, 1);
  const promptText = String(firstHit.actions[0].payload.text);
  assert.doesNotMatch(promptText, /Camille/);
  assert.doesNotMatch(promptText, /@username/i);
  assert.doesNotMatch(promptText, /phone number yet/i);

  const markup = firstHit.actions[0].payload.reply_markup as {
    keyboard?: Array<Array<{ text: string; request_contact?: boolean }>>;
    is_persistent?: boolean;
  };
  assert.equal(markup.is_persistent, true);
  const contactBtn = markup.keyboard?.flat().find(btn => btn.request_contact === true);
  assert.ok(contactBtn, 'Expected Verify Phone request_contact button on persistent keyboard');

  // Empty user tapping My Appointments sees friendly copy without "@username or phone number yet"
  const emptyList = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 3003 },
        from: { id: 3003, username: 'new_guest', first_name: 'Sphinx' },
        text: MENU_BUTTON_LABELS.appointments,
      },
    },
    nowMs
  );
  const emptyText = String(emptyList.actions[0].payload.text);
  assert.doesNotMatch(emptyText, /@username/i);
  assert.doesNotMatch(emptyText, /phone number yet/i);
  assert.match(emptyText, /any upcoming studio visits scheduled/i);

  // User shares phone contact +447700900123 -> unlocks ONLY Julian's booking
  const contactHit = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 2002 },
        from: { id: 2002, username: 'julian_private', first_name: 'Julian' },
        contact: { phone_number: '+447700900123', user_id: 2002 },
      },
    },
    nowMs
  );

  const verifiedText = String(contactHit.actions[0].payload.text);
  assert.match(verifiedText, /Julian Mercer/);
  assert.match(verifiedText, /Cheek &amp; Jawline Contouring/);
  assert.doesNotMatch(verifiedText, /Camille/);
});

test('persistent menu buttons trigger Treatments, Clinic Hours, Change Timing, and Direct Concierge Chat', () => {
  const nowMs = Date.UTC(2026, 10, 14, 10, 0, 0);
  const store = createSeededStore(nowMs);

  // Tap Treatments & Pricing
  const treatmentsRes = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 1001 },
        from: { id: 1001, username: 'camille_laurent', first_name: 'Camille' },
        text: MENU_BUTTON_LABELS.treatments,
      },
    },
    nowMs
  );
  assert.match(String(treatmentsRes.actions[0].payload.text), /FACIAL AESTHETICS/);
  assert.match(String(treatmentsRes.actions[0].payload.text), /\$1,150/);

  // Tap Message Concierge -> then send a greeting & a custom note directly in chat
  const chatPromptRes = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 1001 },
        from: { id: 1001, username: 'camille_laurent', first_name: 'Camille' },
        text: MENU_BUTTON_LABELS.chat,
      },
    },
    nowMs
  );
  assert.match(String(chatPromptRes.actions[0].payload.text), /Direct Concierge Chat/);

  const greetingRes = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 1001 },
        from: { id: 1001, username: 'camille_laurent', first_name: 'Camille' },
        text: 'hi',
      },
    },
    nowMs + 100
  );
  const greetingText = String(greetingRes.actions[0].payload.text);
  assert.match(greetingText, /Hello, <b>Camille<\/b>/);
  assert.doesNotMatch(greetingText, /@username/i);

  const priceRes = processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 1001 },
        from: { id: 1001, username: 'camille_laurent', first_name: 'Camille' },
        text: 'How much are porcelain veneers?',
      },
    },
    nowMs + 200
  );
  assert.match(String(priceRes.actions[0].payload.text), /\$1,950 \/ tooth/);
  assert.equal(priceRes.syncEvents.some(ev => ev.type === 'concierge_message'), true);

  // Verify messages persisted for Camille and NOT leaked to Julian
  const camilleMessages = store.getMessagesForUser('user_camille');
  const julianMessages = store.getMessagesForUser('user_julian');
  assert.ok(camilleMessages.some(m => m.text === 'How much are porcelain veneers?'));
  assert.equal(julianMessages.length, 0);
});

test('bot reschedule button updates timing and syncs back to website store', () => {
  const nowMs = Date.UTC(2026, 10, 14, 10, 0, 0);
  const store = createSeededStore(nowMs);

  processTelegramUpdate(
    store,
    {
      message: {
        chat: { id: 1001 },
        from: { id: 1001, username: 'camille_laurent', first_name: 'Camille' },
        text: '/start',
      },
    },
    nowMs
  );

  const dateRes = processTelegramUpdate(
    store,
    {
      callback_query: {
        id: 'cq_1',
        from: { id: 1001, username: 'camille_laurent', first_name: 'Camille' },
        message: { message_id: 50, chat: { id: 1001 } },
        data: 'cb:time:bk_camille_1:2026-11-21:1600',
      },
    },
    nowMs
  );

  assert.equal(dateRes.syncEvents.length, 1);
  assert.equal(dateRes.syncEvents[0].type, 'booking_updated');
  if (dateRes.syncEvents[0].type === 'booking_updated') {
    assert.equal(dateRes.syncEvents[0].booking.preferredDateTime, '2026-11-21T16:00');
  }
  assert.equal(store.getBookingById('bk_camille_1')?.preferredDateTime, '2026-11-21T16:00');

  const hijackAttempt = processTelegramUpdate(
    store,
    {
      callback_query: {
        id: 'cq_bad',
        from: { id: 9999, username: 'intruder', first_name: 'Intruder' },
        message: { message_id: 70, chat: { id: 9999 } },
        data: 'cb:time:bk_camille_1:2026-11-22:1000',
      },
    },
    nowMs
  );
  assert.equal(hijackAttempt.syncEvents.length, 0);
  assert.equal(store.getBookingById('bk_camille_1')?.preferredDateTime, '2026-11-21T16:00');
});

test('parseCustomClinicDateTime enforces Mon-Sat 10:00-18:30 hours', () => {
  assert.deepEqual(parseCustomClinicDateTime('2026-11-20 14:30'), {
    ok: true,
    iso: '2026-11-20T14:30',
  });
  assert.equal(parseCustomClinicDateTime('2026-11-22 12:00').ok, false);
  assert.equal(parseCustomClinicDateTime('2026-11-20 20:00').ok, false);
});
