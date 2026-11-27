# Elara Atelier — Aesthetic & Dental Studio

> A modern studio web application for non-surgical facial treatments, cosmetic dentistry, and skin renewal in Beverly Hills—built with React, TypeScript, Tailwind CSS, Express, Firebase, and automated Telegram booking notifications.

---

## Preview

### Studio Hero & Welcome
Warm, minimal editorial layout with serif display typography (`Cormorant Garamond`), interactive studio cards, and quick navigation to treatments and appointment booking.

![Elara Atelier Hero Showcase](docs/screenshots/hero-showcase.png)

### Treatment Catalog
Filterable service categories across **Facial Aesthetics**, **Cosmetic Dentistry**, and **Skin Renewal**. Clicking any treatment smoothly scrolls down to the interactive before-and-after preview and pre-selects that service for booking.

![Elara Atelier Treatments Showcase](docs/screenshots/treatments-showcase.png)

### Interactive Before & After Preview
Drag-to-compare preview across treatments with smooth loading transitions, visit duration, and transparent starting pricing—plus a direct **Book This Treatment** handoff.

![Elara Atelier Before and After Preview](docs/screenshots/smile-comparison.png)

### Consultation Request & Studio Map
Simple phone-first booking with adult (18+) date-of-birth verification, weekday-only scheduling that blocks past dates, optional WhatsApp contact permission, slide-to-confirm booking submission, and an interactive clinic map.

![Elara Atelier Booking Form](docs/screenshots/booking-concierge.png)

### Mobile Responsive Experience
Adapts cleanly from compact mobile screens to desktop displays, with an unclipped mobile navigation bar, stacked form layout, and touch-friendly controls.

<p align="center">
  <img src="docs/screenshots/mobile-responsive.png" alt="Elara Atelier Mobile Responsive View" width="340" />
</p>

---

## Key Features

- **Treatment Discovery & Previews**: Browse services across Facial Aesthetics, Cosmetic Dentistry, and Skin Renewal, compare before-and-after results interactively, and jump straight into booking with your chosen service pre-selected.
- **Smart Consultation Booking**:
  - Clean single-phone booking flow with country-code selection and explicit WhatsApp contact consent (defaults to WhatsApp permission; switches to phone-call-only if unchecked).
  - Built-in calendar picker enforcing studio hours (Monday–Friday, 10:00 AM – 7:00 PM), blocking past calendar dates, and verifying 18+ patient eligibility.
  - Slide-to-confirm submission to prevent accidental requests, with instant WhatsApp confirmation handoff.
- **Patient Portal & Calendar**:
  - Sign in with Google or Email/Password powered by **Firebase Authentication**.
  - Patient profiles and appointments are stored securely in **Firebase Cloud Firestore**.
  - Signed-in patients can view their monthly visit calendar and edit or cancel bookings within a 4-hour post-booking window.
- **Clinic Notifications**:
  - Whenever a new booking is made, updates are automatically pushed to **Telegram** so the clinic team is notified immediately.
  - On mornings with scheduled appointments, a single daily booking list is pushed to Telegram (skipped automatically on days with zero bookings).
- **Legal & Trust Pages**: Includes dedicated Privacy Policy and Terms & Conditions pages detailing Firebase data storage and Vercel hosting.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Motion (`motion/react`), Lucide Icons |
| **Backend API** | Express (`src/server/createApp.ts`) running on Node locally (`server.ts`) and Vercel Serverless (`api/index.js`) |
| **Database & Auth** | Firebase Authentication (Google + Email/Password) & Cloud Firestore |
| **Notifications** | Telegram booking alerts & WhatsApp confirmation links |
| **Hosting** | Vercel (`vercel.json`) |

---

## Project Structure

```text
├── api/
│   └── index.js                 # Bundled Vercel Serverless entry for /api/* routes
├── docs/screenshots/            # Up-to-date screenshots used in this README
├── public/                      # Static clinic photography, logo & favicon
├── src/
│   ├── components/
│   │   ├── reactbits/           # Custom calendar picker, select, hold button & slide-to-confirm
│   │   ├── sections/            # Header, Hero, Treatments, Before/After, Reviews, Booking, Auth, Profile, Legal, Footer
│   │   └── ui/                  # Shared UI helpers (avatars, controls)
│   ├── config/clinicConfig.ts   # Clinic hours, location, pricing constants & defaults
│   ├── context/AuthContext.tsx  # Firebase Auth & Firestore profile/booking state
│   ├── data/                    # Treatments, before/after cases, reviews & studio media
│   ├── server/                  # Express API routes & Telegram booking notification dispatcher
│   └── utils/                   # Booking validation, date helpers & smile preview utilities
├── firestore.rules              # Cloud Firestore security & 4-hour edit window rules
├── server.ts                    # Local Express + Vite dev server (port 3000)
└── vercel.json                  # Vercel static build, /api/* rewrites & scheduled morning job
```

---

## Local Development

### Prerequisites
- Node.js `>= 20`
- npm `>= 10`

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and add your local settings:

```bash
cp .env.example .env
```

Firebase configuration is loaded from `firebase-applet-config.json`. To enable Telegram booking notifications, provide your Telegram credentials in `.env` (the website and Firebase booking flow continue to work cleanly even when Telegram credentials are omitted).

### 3. Start the Dev Server
Runs both the Vite frontend and Express API on port `3000`:

```bash
npm run dev
```

Visit `http://localhost:3000`.

### 4. Build, Lint & Test
```bash
npm run lint
npm run build
npx --yes tsx --test src/utils/booking.test.ts src/server/teamTelegramBot.test.ts firestore.rules.test.ts
```

---

## Deployment (Vercel)

This project is pre-configured for **Vercel** via `vercel.json`:
1. Push your repository to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Add your environment variables in **Vercel Project Settings → Environment Variables** (`APP_URL` and optional Telegram notification variables).
3. Add your production Vercel domain under **Firebase Console → Authentication → Settings → Authorized domains** so Google Sign-In works seamlessly in production.
4. Deploy—Vercel builds the static frontend into `dist/` and routes `/api/*` requests through `api/index.js`.
