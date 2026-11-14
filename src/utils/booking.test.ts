/**
 * Unit tests for Elara Atelier pure booking, strict patient validation,
 * 4-hour edit window enforcement, calendar grid generation, and concierge link helpers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarMonthGrid,
  buildTelegramBotDeepLink,
  buildWhatsAppBookingUrl,
  calculateAge,
  calculateSmileProgressByDays,
  canEditBooking,
  clampComparisonPercentage,
  filterTreatmentsByCategory,
  getRemainingEditWindow,
  getTreatmentById,
  resolveEffectiveTelegram,
  sanitizeNameInput,
  validateAccountForm,
  validateAdultDob,
  validateBookingForm,
  validateFullName,
  validateTelegramContact,
} from './booking';
import {
  applyAfterToothWhitening,
  applyBeforeToothStain,
  computeToothMaskWeight,
} from './smileRetouch';

test('filterTreatmentsByCategory returns only matching category items', () => {
  const dental = filterTreatmentsByCategory('Cosmetic Dentistry');
  assert.ok(dental.length >= 4);
  assert.ok(dental.every(item => item.category === 'Cosmetic Dentistry'));
});

test('getTreatmentById finds treatment or returns undefined', () => {
  const found = getTreatmentById('cd-veneers');
  assert.equal(found?.name, 'Porcelain Veneers (Smile Makeover)');
  assert.equal(getTreatmentById('non-existent'), undefined);
});

test('sanitizeNameInput and validateFullName block numbers in names', () => {
  assert.equal(sanitizeNameInput('Camille 123 Laurent'), 'Camille  Laurent');
  assert.ok(validateFullName('Camille 2'));
  assert.equal(validateFullName("Camille O'Connor-Laurent"), null);
});

test('calculateAge and validateAdultDob block underage patients under 18', () => {
  const refDate = new Date(2026, 10, 14); // Nov 14, 2026
  assert.equal(calculateAge('2008-11-14', refDate), 18);
  assert.equal(calculateAge('2008-11-15', refDate), 17);
  assert.equal(validateAdultDob('2008-11-14', refDate), null);
  assert.ok(validateAdultDob('2008-11-15', refDate));
  assert.ok(validateAdultDob('', refDate));
});

test('validateTelegramContact validates both @username and +country phone formats', () => {
  assert.equal(validateTelegramContact('username', '@elara_patient'), null);
  assert.ok(validateTelegramContact('username', '@abc'));
  assert.equal(validateTelegramContact('phone', '+13105550194'), null);
  assert.ok(validateTelegramContact('phone', '123'));
});

test('validateBookingForm rejects invalid fields and underage DOB', () => {
  const refDate = new Date(2026, 10, 14);
  const invalid = validateBookingForm(
    {
      fullName: 'Julian 99',
      phoneCountryCode: '1',
      phoneNumber: '123',
      dob: '2012-05-01',
      treatmentId: '',
      preferredDateTime: '',
      telegramMethod: 'username',
      telegramValue: 'ab',
    },
    refDate
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.fullName);
  assert.ok(invalid.errors.phoneNumber);
  assert.ok(invalid.errors.dob);
  assert.ok(invalid.errors.treatmentId);
  assert.ok(invalid.errors.preferredDateTime);
  assert.ok(invalid.errors.telegramValue);
});

test('validateBookingForm and validateAccountForm accept valid adult payloads', () => {
  const refDate = new Date(2026, 10, 14);
  const validBooking = validateBookingForm(
    {
      fullName: 'Camille Laurent',
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      dob: '1994-03-19',
      treatmentId: 'cd-veneers',
      preferredDateTime: '2026-11-20T14:30',
      telegramMethod: 'username',
      telegramValue: '@camille_laurent',
    },
    refDate
  );
  assert.equal(validBooking.valid, true);
  assert.deepEqual(validBooking.errors, {});

  const validAccount = validateAccountForm(
    {
      fullName: 'Camille Laurent',
      email: 'camille@example.com',
      password: 'Password123',
      phoneCountryCode: '+44',
      phoneNumber: '7700900123',
      dob: '1994-03-19',
      telegramMethod: 'phone',
      telegramValue: '+447700900123',
    },
    true,
    refDate
  );
  assert.equal(validAccount.valid, true);
});

test('telegramSameAsPhone makes Telegram username optional and resolves cleanly', () => {
  const refDate = new Date(2026, 10, 14);

  // 1. Blank optional username succeeds when marked same as phone
  const noHandleBooking = validateBookingForm(
    {
      fullName: 'Camille Laurent',
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      dob: '1994-03-19',
      treatmentId: 'cd-veneers',
      preferredDateTime: '2026-11-20T14:30',
      telegramSameAsPhone: true,
      telegramMethod: 'phone',
      telegramValue: '',
    },
    refDate
  );
  assert.equal(noHandleBooking.valid, true);
  assert.deepEqual(
    resolveEffectiveTelegram({
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      telegramSameAsPhone: true,
      telegramMethod: 'phone',
      telegramValue: '',
    }),
    { method: 'phone', value: '+13105550142' }
  );

  // 2. Provided optional @username succeeds and takes priority as handle
  const withHandleAccount = validateAccountForm(
    {
      fullName: 'Camille Laurent',
      email: 'camille@example.com',
      password: 'Password123',
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      dob: '1994-03-19',
      telegramSameAsPhone: true,
      telegramMethod: 'username',
      telegramValue: 'camille_laurent',
    },
    true,
    refDate
  );
  assert.equal(withHandleAccount.valid, true);
  assert.deepEqual(
    resolveEffectiveTelegram({
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      telegramSameAsPhone: true,
      telegramMethod: 'username',
      telegramValue: 'camille_laurent',
    }),
    { method: 'username', value: '@camille_laurent' }
  );

  // 3. Invalid optional username still reports formatting feedback
  const badHandleBooking = validateBookingForm(
    {
      fullName: 'Camille Laurent',
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      dob: '1994-03-19',
      treatmentId: 'cd-veneers',
      preferredDateTime: '2026-11-20T14:30',
      telegramSameAsPhone: true,
      telegramMethod: 'username',
      telegramValue: '@ab',
    },
    refDate
  );
  assert.equal(badHandleBooking.valid, false);
  assert.ok(badHandleBooking.errors.telegramValue);
});

test('canEditBooking and getRemainingEditWindow enforce 4-hour post-booking limit', () => {
  const createdMs = Date.UTC(2026, 10, 14, 10, 0, 0);
  const twoHoursLater = createdMs + 2 * 60 * 60 * 1000;
  const exactlyFourHours = createdMs + 4 * 60 * 60 * 1000;
  const pastFourHours = createdMs + 4 * 60 * 60 * 1000 + 1000;

  assert.equal(canEditBooking(createdMs, twoHoursLater, 'requested'), true);
  assert.equal(canEditBooking(createdMs, exactlyFourHours, 'requested'), true);
  assert.equal(canEditBooking(createdMs, pastFourHours, 'requested'), false);
  assert.equal(canEditBooking(createdMs, twoHoursLater, 'cancelled'), false);

  const windowInfo = getRemainingEditWindow(createdMs, twoHoursLater, 'requested');
  assert.equal(windowInfo.editable, true);
  assert.match(windowInfo.label, /2h 00m/);
});

test('buildCalendarMonthGrid produces 42 cells with correct month boundaries', () => {
  const grid = buildCalendarMonthGrid(2026, 10, new Date(2026, 10, 14)); // Nov 2026
  assert.equal(grid.length, 42);
  const todayCell = grid.find(cell => cell.isoDate === '2026-11-14');
  assert.equal(todayCell?.isToday, true);
  assert.equal(todayCell?.inCurrentMonth, true);
});

test('buildWhatsAppBookingUrl and buildTelegramBotDeepLink format concierge links cleanly', () => {
  const url = buildWhatsAppBookingUrl('13105550194', {
    fullName: 'Elena Vance',
    phoneCountryCode: '+1',
    phoneNumber: '3105550188',
    dob: '1990-06-12',
    treatmentId: 'sl-polynucleotide',
    preferredDateTime: '2026-11-22T11:00',
    telegramMethod: 'username',
    telegramValue: '@elena_vance',
  });
  assert.ok(url.startsWith('https://wa.me/13105550194?text='));
  const decoded = decodeURIComponent(url.split('?text=')[1]);
  assert.match(decoded, /Elena Vance/);
  assert.match(decoded, /@elena_vance/);
  assert.match(decoded, /\+1 3105550188/);

  const tgUrl = buildTelegramBotDeepLink('@ElaraAtelierBot', 'visit_123');
  assert.equal(tgUrl, 'https://t.me/ElaraAtelierBot?start=visit_123');
});

test('clampComparisonPercentage clamps safely between 5 and 95', () => {
  assert.equal(clampComparisonPercentage(-20), 5);
  assert.equal(clampComparisonPercentage(120), 95);
  assert.equal(clampComparisonPercentage(50.25), 50.3);
  assert.equal(clampComparisonPercentage(Number.NaN), 50);
});

test('calculateSmileProgressByDays scales whiteness, visits, and charge cleanly', () => {
  const day1 = calculateSmileProgressByDays(1);
  const day7 = calculateSmileProgressByDays(7);
  const day14 = calculateSmileProgressByDays(14);

  assert.equal(day1.visits, 1);
  assert.equal(day1.visitTimeLabel, '1 Visit · 1 Day');
  assert.equal(day14.visits, 2);
  assert.equal(day14.visitTimeLabel, '2 Visits · 14 Days');

  assert.ok(day1.afterBrightness < day7.afterBrightness && day7.afterBrightness < day14.afterBrightness);
  assert.ok(day1.afterSepia > day7.afterSepia && day7.afterSepia > day14.afterSepia);
  assert.ok(day1.estimatedCharge < day7.estimatedCharge && day7.estimatedCharge < day14.estimatedCharge);
  assert.equal(day14.afterSepia, 0);
  assert.equal(day14.formattedCharge, '$15,600');
});

test('smileRetouch targets only tooth pixels and leaves skin and pink gums untouched', () => {
  const toothWeight = computeToothMaskWeight(218, 206, 182, 0.5, 0.48);
  assert.ok(toothWeight > 0.8);

  const gumWeight = computeToothMaskWeight(192, 118, 122, 0.5, 0.39);
  assert.equal(gumWeight, 0);

  const cheekWeight = computeToothMaskWeight(206, 165, 142, 0.12, 0.2);
  assert.equal(cheekWeight, 0);

  const [bR, bG, bB] = applyBeforeToothStain(218, 206, 182, toothWeight);
  assert.ok(bB < 182 && bR > bB);

  const [day1R, day1G, day1B] = applyAfterToothWhitening(218, 206, 182, toothWeight, 0);
  const [day14R, day14G, day14B] = applyAfterToothWhitening(218, 206, 182, toothWeight, 1);
  assert.ok(day1B > bB);
  assert.ok(day14R > day1R && day14G > day1G && day14B > day1B);

  // Zero-weight skin/gum pixels remain bit-identical across Before and Day 14
  assert.deepEqual(applyBeforeToothStain(206, 165, 142, 0), [206, 165, 142]);
  assert.deepEqual(applyAfterToothWhitening(206, 165, 142, 0, 1), [206, 165, 142]);
});
