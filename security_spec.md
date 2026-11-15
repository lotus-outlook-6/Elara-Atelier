# Security Specification — Elara Atelier Firestore Rules

## 1. Data Invariants
1. **Strict Ownership & PII Isolation**: `/users/{userId}` contains sensitive PII (`email`, `phoneNumber`, `dob`, `telegramValue`). Only the authenticated owner (`request.auth.uid == userId`) may read, create, or update their own profile document. Blanket reads and collection `list` queries on `/users` are strictly denied.
2. **Booking Ownership & Query Enforcement**: Every `/bookings/{bookingId}` document must have `userId == request.auth.uid` and `id == bookingId`. `get` and `list` operations are restricted strictly to `resource.data.userId == request.auth.uid`.
3. **Immutable Identity & Timestamps**: `uid`, `userId`, `id`, and `createdAt` cannot be modified after creation. `createdAt` must equal `request.time` on creation, and `updatedAt` must equal `request.time` on both creation and update.
4. **4-Hour Edit & Cancellation Window**: Once a booking is created, updates (editing treatment, preferred time, phone/WhatsApp, or Telegram contact) and cancellations (`status: 'cancelled'`) are allowed ONLY while `request.time <= resource.data.createdAt + duration.value(4, 'h')`. Additionally, the Team Bot sync path may transition `status` from `'requested'` to `'confirmed'` without altering identity or timestamp fields.
5. **Terminal State Locking**: A booking with `status == 'cancelled'` cannot be modified again.
6. **Strict Schema & No Numeric Names**: `fullName` must match `^[A-Za-zÀ-ÖØ-öø-ÿ .'-]+$`, `phoneCountryCode` and optional `whatsappCountryCode` must match `^\+[0-9]{1,4}$`, `phoneNumber` and optional `whatsappNumber` must match `^[0-9]{6,15}$`, `dob` must match `^(19[0-9]{2}|20[0-9]{2})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$`, and unknown/shadow keys are rejected via `keys().hasOnly(...)` and `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Profile Read/Write**: `uid: "u1"` read or written with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Cross-User PII Read**: Authenticated as `u2`, attempting `get /users/u1` -> `PERMISSION_DENIED`.
3. **Users Collection Scrape**: Authenticated as `u1`, attempting `list /users` -> `PERMISSION_DENIED`.
4. **Cross-User Booking Creation (Identity Spoofing)**: Authenticated as `u1`, creating `/bookings/b1` with `userId: "u2"` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: Authenticated as `u1`, creating `/users/u1` or `/bookings/b1` with extra key `isAdmin: true` or `role: "admin"` -> `PERMISSION_DENIED`.
6. **Numeric Character in Full Name**: Creating `/users/u1` or `/bookings/b1` with `fullName: "Camille 2"` -> `PERMISSION_DENIED`.
7. **Invalid Country Code / Phone Format**: Creating `/bookings/b1` with `phoneCountryCode: "1"` (missing `+`) or `phoneNumber: "abc"` -> `PERMISSION_DENIED`.
8. **Client-Spoofed `createdAt` Timestamp**: Creating `/bookings/b1` with backdated `createdAt` to bypass or extend edit window -> `PERMISSION_DENIED`.
9. **Post-4-Hour Booking Edit**: Authenticated as `u1`, updating `/bookings/b1` when `request.time > existing().createdAt + 4h` -> `PERMISSION_DENIED`.
10. **Cancelled Booking Resurrection**: Authenticated as `u1`, updating `/bookings/b1` from `status: "cancelled"` back to `"requested"` -> `PERMISSION_DENIED`.
11. **Oversized Path ID Poisoning**: Creating `/bookings/<200-char-invalid-id!>` -> `PERMISSION_DENIED`.
12. **Unrestricted Bookings List Query**: Authenticated as `u1`, attempting to `list /bookings` without scoping to `userId == "u1"` -> `PERMISSION_DENIED`.
