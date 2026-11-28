/**
 * Unit tests for Elara Atelier pure booking, strict patient validation,
 * 4-hour edit window enforcement, calendar grid generation, and concierge link helpers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCalendarMonthGrid,
  buildTeamWhatsAppConfirmationUrl,
  buildTelegramBotDeepLink,
  buildWhatsAppBookingUrl,
  calculateAge,
  calculateLaserWhiteningPass,
  calculateSmileProgressByDays,
  canEditBooking,
  clampComparisonPercentage,
  filterTreatmentsByCategory,
  getComparisonCaseForTreatment,
  getDefaultUpcomingBookingDateTime,
  getRemainingEditWindow,
  getTodayIsoDate,
  getTreatmentById,
  isPastBookingDateTime,
  isPastCalendarDate,
  isStudioWeekday,
  resolveEffectiveTelegram,
  resolveEffectiveWhatsApp,
  resolveNextOpenStudioIsoDate,
  sanitizeNameInput,
  validateAccountForm,
  validateAdultDob,
  validateBookingForm,
  validateFullName,
  validateTelegramContact,
} from './booking';
import { TREATMENTS, type ComparisonCase } from '../data/clinicData';
import {
  applyAfterToothWhitening,
  applyBeforeToothStain,
  computeToothMaskWeight,
} from './smileRetouch';

test('filterTreatmentsByCategory returns only matching category items', () => {
  const dental = filterTreatmentsByCategory('Cosmetic Dentistry');
  assert.ok(dental.length >= 4);
  assert.ok(dental.every(item => item.category === 'Cosmetic Dentistry'));

  const skin = filterTreatmentsByCategory('Skin Renewal');
  assert.equal(skin.length, 4);
  assert.ok(skin.every(item => item.category === 'Skin Renewal'));
});

test('getComparisonCaseForTreatment matches every treatmentId and falls back cleanly', () => {
  const fixtureCases: ComparisonCase[] = TREATMENTS.map(item => ({
    id: `case-${item.id}`,
    treatmentId: item.id,
    categoryLabel: item.category,
    title: item.name,
    treatment: item.name,
    timeframe: item.duration,
    startingPrice: item.startingPrice,
    retouchMode:
      item.id === 'cd-veneers'
        ? 'teeth'
        : item.id === 'cd-whitening'
          ? 'whitening-pair'
          : 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After',
    beforeSrc: `/mock/${item.id}-before.jpg`,
    afterSrc: `/mock/${item.id}-after.jpg`,
    summary: item.benefit,
  }));

  for (const item of TREATMENTS) {
    const resolved = getComparisonCaseForTreatment(item.id, fixtureCases);
    assert.equal(resolved.treatmentId, item.id);
    assert.equal(resolved.treatment, item.name);
  }

  const fallback = getComparisonCaseForTreatment('unknown-service', fixtureCases);
  assert.equal(fallback.treatmentId, fixtureCases[0].treatmentId);

  assert.throws(() => getComparisonCaseForTreatment('cd-veneers', []), /cannot be empty/i);
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

test('validateBookingForm rejects invalid fields, underage DOB, weekend, and past dates', () => {
  const refDate = new Date(2026, 10, 14); // Sat Nov 14, 2026
  const invalid = validateBookingForm(
    {
      fullName: 'Julian 99',
      phoneCountryCode: '1',
      phoneNumber: '123',
      dob: '2012-05-01',
      treatmentId: '',
      preferredDateTime: '',
    },
    refDate
  );
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.fullName);
  assert.ok(invalid.errors.phoneNumber);
  assert.ok(invalid.errors.dob);
  assert.ok(invalid.errors.treatmentId);
  assert.ok(invalid.errors.preferredDateTime);
  assert.equal(invalid.errors.telegramValue, undefined);

  const weekendBooking = validateBookingForm(
    {
      fullName: 'Camille Laurent',
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      dob: '1994-03-19',
      treatmentId: 'cd-veneers',
      preferredDateTime: '2026-11-21T11:00', // Saturday
    },
    refDate
  );
  assert.equal(weekendBooking.valid, false);
  assert.match(weekendBooking.errors.preferredDateTime || '', /Monday\s*[–-]\s*Friday/i);

  const pastWeekdayBooking = validateBookingForm(
    {
      fullName: 'Camille Laurent',
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      dob: '1994-03-19',
      treatmentId: 'cd-veneers',
      preferredDateTime: '2026-11-13T11:00', // Yesterday (Friday)
    },
    refDate
  );
  assert.equal(pastWeekdayBooking.valid, false);
  assert.match(pastWeekdayBooking.errors.preferredDateTime || '', /Past dates cannot be booked/i);
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

test('phone-only booking and account forms never trigger Telegram errors and derive phone contact cleanly', () => {
  const refDate = new Date(2026, 10, 25); // Wed Nov 25, 2026

  // Signed-in patient payload (including legacy telegram fields) passes cleanly without Telegram username error
  const signedInBooking = validateBookingForm(
    {
      fullName: 'Sphinx Cipher',
      phoneCountryCode: '+1',
      phoneNumber: '123456789',
      messagingConsent: true,
      dob: '2002-11-14',
      treatmentId: 'fa-contour',
      preferredDateTime: '2026-11-25T11:00',
      telegramSameAsPhone: true,
      telegramMethod: 'username',
      telegramValue: '+1123456789',
    },
    refDate
  );
  assert.equal(signedInBooking.valid, true);
  assert.deepEqual(signedInBooking.errors, {});

  assert.deepEqual(
    resolveEffectiveTelegram({
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
    }),
    { method: 'phone', value: '+13105550142' }
  );

  // Account creation without any Telegram fields succeeds cleanly
  const phoneOnlyAccount = validateAccountForm(
    {
      fullName: 'Camille Laurent',
      email: 'camille@example.com',
      password: 'Password123',
      phoneCountryCode: '+1',
      phoneNumber: '3105550142',
      dob: '1994-03-19',
    },
    true,
    refDate
  );
  assert.equal(phoneOnlyAccount.valid, true);
  assert.deepEqual(phoneOnlyAccount.errors, {});
});

test('past-date helpers and default upcoming booking datetime never return a past day', () => {
  const friday = new Date(2026, 10, 27); // Fri Nov 27, 2026
  const saturday = new Date(2026, 10, 28); // Sat Nov 28, 2026
  const sunday = new Date(2026, 10, 29); // Sun Nov 29, 2026

  assert.equal(getTodayIsoDate(friday), '2026-11-27');
  assert.equal(isPastCalendarDate('2026-11-26T11:00', friday), true);
  assert.equal(isPastCalendarDate('2026-11-27T11:00', friday), false);
  assert.equal(isPastCalendarDate('2026-11-30T11:00', friday), false);

  assert.equal(getDefaultUpcomingBookingDateTime(friday), '2026-11-27T11:00');
  assert.equal(getDefaultUpcomingBookingDateTime(saturday), '2026-11-30T11:00');
  assert.equal(getDefaultUpcomingBookingDateTime(sunday), '2026-11-30T11:00');

  // resolveNextOpenStudioIsoDate must never fall back to a past day in the same month
  assert.equal(
    resolveNextOpenStudioIsoDate('2026-11-18', 2026, 10, friday),
    '2026-11-27'
  );
  assert.equal(
    resolveNextOpenStudioIsoDate('2026-11-28', 2026, 10, saturday),
    '2026-11-30'
  );
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

test('buildCalendarMonthGrid produces 42 cells with dayOfWeek and weekend helpers work', () => {
  const grid = buildCalendarMonthGrid(2026, 10, new Date(2026, 10, 14)); // Nov 2026
  assert.equal(grid.length, 42);
  const todayCell = grid.find(cell => cell.isoDate === '2026-11-14');
  assert.equal(todayCell?.isToday, true);
  assert.equal(todayCell?.inCurrentMonth, true);
  assert.equal(todayCell?.dayOfWeek, 6); // Saturday

  const sunCell = grid.find(cell => cell.isoDate === '2026-11-15');
  const friCell = grid.find(cell => cell.isoDate === '2026-11-20');
  assert.equal(sunCell?.dayOfWeek, 0);
  assert.equal(friCell?.dayOfWeek, 5);

  assert.equal(isStudioWeekday('2026-11-20T14:30'), true);
  assert.equal(isStudioWeekday('2026-11-21T14:30'), false);
  assert.equal(isStudioWeekday('2026-11-22T14:30'), false);

  assert.equal(
    resolveNextOpenStudioIsoDate('2026-11-21', 2026, 10, new Date(2026, 10, 15)),
    '2026-11-16'
  );
  assert.equal(
    resolveNextOpenStudioIsoDate('2026-11-20', 2026, 10, new Date(2026, 10, 15)),
    '2026-11-20'
  );
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
  assert.doesNotMatch(decoded, /Telegram:/i);
  assert.match(decoded, /\+1 3105550188/);

  const tgUrl = buildTelegramBotDeepLink('@ElaraAtelierBot', 'visit_123');
  assert.equal(tgUrl, 'https://t.me/ElaraAtelierBot?start=visit_123');

  const teamWaUrl = buildTeamWhatsAppConfirmationUrl({
    patientName: 'Camille Laurent',
    whatsappDigits: '13105550199',
    treatmentName: 'Porcelain Veneers (Smile Makeover)',
    preferredDateTime: '2026-11-20T14:30',
  });
  assert.ok(teamWaUrl.startsWith('https://wa.me/13105550199?text='));
  const teamWaText = decodeURIComponent(teamWaUrl.split('?text=')[1]);
  assert.match(teamWaText, /Camille Laurent/);
  assert.match(teamWaText, /Porcelain Veneers/);
  assert.match(teamWaText, /Beverly Hills/i);
  assert.match(teamWaText, /Nov 20/i);
});

test('resolveEffectiveWhatsApp and separate WhatsApp validation behave accurately', () => {
  const refDate = new Date(2026, 10, 14);
  const sameAsPhone = resolveEffectiveWhatsApp({
    phoneCountryCode: '+1',
    phoneNumber: '3105550148',
    whatsappSameAsPhone: true,
    whatsappCountryCode: '+44',
    whatsappNumber: '7700900123',
  });
  assert.deepEqual(sameAsPhone, {
    countryCode: '+1',
    number: '3105550148',
    fullDigits: '13105550148',
    display: '+1 3105550148',
  });

  const separate = resolveEffectiveWhatsApp({
    phoneCountryCode: '+1',
    phoneNumber: '3105550148',
    whatsappSameAsPhone: false,
    whatsappCountryCode: '+44',
    whatsappNumber: '7700900123',
  });
  assert.deepEqual(separate, {
    countryCode: '+44',
    number: '7700900123',
    fullDigits: '447700900123',
    display: '+44 7700900123',
  });

  // Phone number is now the single WhatsApp & call number, so separate whatsappNumber is ignored
  const phoneOnlyValid = validateBookingForm(
    {
      fullName: 'Camille Laurent',
      phoneCountryCode: '+1',
      phoneNumber: '3105550148',
      messagingConsent: true,
      dob: '1994-03-19',
      treatmentId: 'cd-veneers',
      preferredDateTime: '2026-11-20T14:30',
    },
    refDate
  );
  assert.equal(phoneOnlyValid.valid, true);
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
  assert.equal(day1.formattedCharge, '$480');
  assert.equal(day14.formattedCharge, '$1,920');
});

test('calculateLaserWhiteningPass scales pass timing and blend opacity across 3 passes', () => {
  const pass1 = calculateLaserWhiteningPass(1);
  const pass2 = calculateLaserWhiteningPass(2);
  const pass3 = calculateLaserWhiteningPass(3);

  assert.equal(pass1.durationMinutes, 25);
  assert.equal(pass2.durationMinutes, 50);
  assert.equal(pass3.durationMinutes, 75);
  assert.ok(pass1.blendOpacity < pass2.blendOpacity && pass2.blendOpacity < pass3.blendOpacity);
  assert.equal(pass3.blendOpacity, 1);
  assert.equal(calculateLaserWhiteningPass(99).pass, 3);
});

test('smileRetouch targets only tooth pixels and leaves skin and pink gums untouched', () => {
  const toothWeight = computeToothMaskWeight(218, 206, 182, 0.5, 0.48);
  assert.ok(toothWeight > 0.8);

  const lowerToothWeight = computeToothMaskWeight(200, 186, 162, 0.5, 0.61);
  assert.ok(lowerToothWeight > 0.5);

  // Shaded upper half of lower central incisors & warm upper cervical edge must whiten
  const lowerCentralShadedWeight = computeToothMaskWeight(154, 110, 83, 0.47, 0.58);
  assert.ok(lowerCentralShadedWeight > 0.5);

  const upperCervicalEdgeWeight = computeToothMaskWeight(211, 145, 117, 0.58, 0.39);
  assert.ok(upperCervicalEdgeWeight > 0.25);

  // Pink upper gum, lower gumline, and lower lip must remain completely untouched
  const gumWeight = computeToothMaskWeight(192, 118, 122, 0.5, 0.39);
  assert.equal(gumWeight, 0);
  assert.equal(computeToothMaskWeight(158, 70, 63, 0.5, 0.35), 0);
  assert.equal(computeToothMaskWeight(204, 110, 108, 0.5, 0.7), 0);
  assert.equal(computeToothMaskWeight(131, 72, 58, 0.5, 0.66), 0);

  const cheekWeight = computeToothMaskWeight(206, 165, 142, 0.12, 0.2);
  assert.equal(cheekWeight, 0);

  const [bR, bG, bB] = applyBeforeToothStain(218, 206, 182, toothWeight);
  assert.ok(bB < 182 && bR > bB);

  const [day1R, day1G, day1B] = applyAfterToothWhitening(218, 206, 182, toothWeight, 0);
  const [day7R, day7G, day7B] = applyAfterToothWhitening(218, 206, 182, toothWeight, 0.5);
  const [day14R, day14G, day14B] = applyAfterToothWhitening(218, 206, 182, toothWeight, 1);

  // Day 14 (w = 1) keeps the uploaded clean teeth photo untouched
  assert.deepEqual([day14R, day14G, day14B], [218, 206, 182]);
  // Decreasing slider gradually yellows teeth while staying cleaner than Before
  assert.ok(day1B > bB && day1B < day7B && day7B < day14B);
  assert.ok(day1R >= bR && day1G >= bG);

  // Zero-weight skin/gum pixels remain bit-identical across Before and Day 14
  assert.deepEqual(applyBeforeToothStain(206, 165, 142, 0), [206, 165, 142]);
  assert.deepEqual(applyAfterToothWhitening(206, 165, 142, 0, 0), [206, 165, 142]);
  assert.deepEqual(applyAfterToothWhitening(206, 165, 142, 0, 1), [206, 165, 142]);
});

test('validateBookingForm and buildWhatsAppBookingUrl support Phone Call Only opt-out', () => {
  const refDate = new Date(2026, 10, 14);
  const callOnlyValues = {
    fullName: 'Hannah Abbott',
    phoneCountryCode: '+1',
    phoneNumber: '3105550148',
    messagingConsent: false,
    whatsappSameAsPhone: false,
    whatsappCountryCode: '+1',
    whatsappNumber: '',
    dob: '1994-03-19',
    treatmentId: 'cd-veneers',
    preferredDateTime: '2026-11-20T14:30',
    telegramSameAsPhone: true,
    telegramMethod: 'phone' as const,
    telegramValue: '',
  };

  const validation = validateBookingForm(callOnlyValues, refDate);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, {});

  const url = buildWhatsAppBookingUrl('13105550194', callOnlyValues);
  const decoded = decodeURIComponent(url.split('?text=')[1]);
  assert.match(decoded, /Phone Call Only/i);
});

test('isPastBookingDateTime accurately archives elapsed appointments and keeps upcoming ones active', () => {
  const nowMs = new Date(2026, 10, 28, 15, 0, 0).getTime(); // Nov 28, 2026 3:00 PM local
  assert.equal(isPastBookingDateTime('2026-11-27T11:00', nowMs), true);
  assert.equal(isPastBookingDateTime('2026-11-28T14:30', nowMs), true);
  assert.equal(isPastBookingDateTime('2026-11-28T16:00', nowMs), false);
  assert.equal(isPastBookingDateTime('2026-12-04T14:00', nowMs), false);
  assert.equal(isPastBookingDateTime('', nowMs), false);
});

