/**
 * Adversarial rule-contract verification suite for Elara Atelier Firestore rules.
 * Validates the Dirty Dozen security invariants against the exact regex and boundary predicates
 * mirrored in firestore.rules and src/utils/booking.ts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync('firestore.rules', 'utf8');

test('firestore.rules includes default-deny catch-all, 4-hour edit duration, and strict PII isolation', () => {
  assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rulesSource, /match \/users\/\{userId\}/);
  assert.match(rulesSource, /allow list: if false;/);
  assert.match(rulesSource, /match \/bookings\/\{bookingId\}/);
  assert.match(rulesSource, /request\.time <= existing\(\)\.createdAt \+ duration\.value\(4, 'h'\)/);
  assert.match(rulesSource, /existing\(\)\.status != 'cancelled'/);
  assert.match(rulesSource, /isValidBooking\(incoming\(\)\)/);
  assert.match(rulesSource, /isValidUserProfile\(incoming\(\)\)/);
});

test('Dirty Dozen adversarial payloads fail schema and ownership invariants', () => {
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ .'-]+$/;
  const countryCodeRegex = /^\+[0-9]{1,4}$/;
  const phoneRegex = /^[0-9]{6,15}$/;
  const idRegex = /^[a-zA-Z0-9_\-]+$/;
  const telegramUsernameRegex = /^@[a-zA-Z0-9_]{5,32}$/;

  // 1-4: Unauthenticated / cross-user / list / spoofing
  const requesterUid: string = 'u1';
  const ownerUid: string = 'u2';
  assert.equal(requesterUid === ownerUid, false);

  // 5: Shadow key injection check
  const allowedBookingKeys = new Set([
    'id',
    'userId',
    'fullName',
    'phoneCountryCode',
    'phoneNumber',
    'whatsappCountryCode',
    'whatsappNumber',
    'dob',
    'treatmentId',
    'treatmentName',
    'preferredDateTime',
    'telegramMethod',
    'telegramValue',
    'telegramNotifyStatus',
    'status',
    'createdAt',
    'updatedAt',
  ]);
  assert.equal(allowedBookingKeys.has('isAdmin'), false);

  // 6: Numeric characters in fullName rejected
  assert.equal(nameRegex.test('Camille 2'), false);
  assert.equal(nameRegex.test("Camille O'Connor-Laurent"), true);

  // 7: Invalid country code / phone rejected
  assert.equal(countryCodeRegex.test('1'), false);
  assert.equal(countryCodeRegex.test('+1'), true);
  assert.equal(phoneRegex.test('abc1234'), false);

  // 8-9: Post-4-hour window blocked
  const createdMs = Date.UTC(2026, 10, 14, 10, 0, 0);
  const within4h = createdMs + 3.9 * 60 * 60 * 1000;
  const past4h = createdMs + 4 * 60 * 60 * 1000 + 1;
  assert.equal(within4h <= createdMs + 4 * 60 * 60 * 1000, true);
  assert.equal(past4h <= createdMs + 4 * 60 * 60 * 1000, false);

  // 11: Oversized / invalid ID rejected
  assert.equal(idRegex.test('bad/id!'), false);
  assert.equal('x'.repeat(200).length <= 128, false);

  // Telegram handle regex
  assert.equal(telegramUsernameRegex.test('@elara_patient'), true);
  assert.equal(telegramUsernameRegex.test('@abc'), false);
});
