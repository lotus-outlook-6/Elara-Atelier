/**
 * Plain-English Privacy Policy and Terms & Conditions page view for Elara Atelier.
 * Explains exact patient fields saved in Firebase Authentication and Cloud Firestore,
 * Vercel frontend and serverless API hosting, messaging permissions, and clinic booking rules.
 */

import React from 'react';
import { ArrowLeft, Database, FileText, Lock, Server, ShieldCheck } from 'lucide-react';
import { CLINIC_CONFIG } from '../../config/clinicConfig';

export interface LegalSectionProps {
  page: 'privacy' | 'terms';
  onBackToStudio: () => void;
  onSwitchPage: (page: 'privacy' | 'terms') => void;
}

/**
 * Full-page Privacy Policy and Terms & Conditions view linked from the footer.
 * Inputs: active legal page ('privacy' | 'terms'), back handler, and page switcher handler.
 * Output: Rendered legal documentation view.
 * Errors: None.
 */
export const LegalSection: React.FC<LegalSectionProps> = ({
  page,
  onBackToStudio,
  onSwitchPage,
}) => {
  const isPrivacy = page === 'privacy';

  return (
    <section
      aria-label={isPrivacy ? 'Privacy Policy' : 'Terms and Conditions'}
      className="min-h-screen bg-[#FAF7F2] pt-28 pb-20 sm:pt-32"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2D9CE] pb-6">
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold tracking-[0.14em] text-[#6E655F] uppercase transition-colors hover:text-[#1F1B18]"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
            Back to Home
          </button>

          <div
            role="tablist"
            aria-label="Legal documents"
            className="inline-flex gap-1 rounded-xl border border-[#E2D9CE] bg-[#EFE9E0] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isPrivacy}
              onClick={() => onSwitchPage('privacy')}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-[0.1em] uppercase transition-colors ${
                isPrivacy
                  ? 'bg-[#1F1B18] text-[#FAF7F2]'
                  : 'text-[#6E655F] hover:text-[#1F1B18]'
              }`}
            >
              Privacy Policy
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isPrivacy}
              onClick={() => onSwitchPage('terms')}
              className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-[0.1em] uppercase transition-colors ${
                !isPrivacy
                  ? 'bg-[#1F1B18] text-[#FAF7F2]'
                  : 'text-[#6E655F] hover:text-[#1F1B18]'
              }`}
            >
              Terms &amp; Conditions
            </button>
          </div>
        </div>

        <header className="mt-8 border-b border-[#E2D9CE] pb-8">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#B68D5E] uppercase">
            {CLINIC_CONFIG.brandName} · Effective November 2026
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
            {isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[#6E655F]">
            {isPrivacy
              ? 'This notice explains exactly what personal details we collect when you use the Elara Atelier website, how that data is stored in Firebase, and how our website runs on Vercel.'
              : 'These terms explain how appointment requests, clinic hours, age checks, and self-service changes work at Elara Atelier.'}
          </p>
        </header>

        {isPrivacy ? (
          <div className="mt-8 space-y-8 text-sm leading-relaxed text-[#1F1B18] sm:text-base">
            <section className="rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-6">
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                  1. Data Stored in Firebase Authentication &amp; Cloud Firestore
                </h2>
              </div>
              <p className="mt-3 text-sm text-[#6E655F]">
                When you create an account, sign in, or request an appointment while signed in, we
                store your records using Google Firebase:
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-[#1F1B18]">
                <li>
                  <strong>Firebase Authentication:</strong> Stores your account email address, unique
                  user ID (<code className="text-xs">uid</code>), and, if you choose Google Sign-In,
                  your Google display name and profile picture link.
                </li>
                <li>
                  <strong>Patient Profile Record (Firestore <code className="text-xs">users/&#123;userId&#125;</code>):</strong>{' '}
                  Stores your full name, email address, phone number with country code (used for
                  clinic calls and WhatsApp confirmation), date of birth (used strictly to confirm
                  you are 18 or older), and record creation/update timestamps.
                </li>
                <li>
                  <strong>Appointment Bookings (Firestore <code className="text-xs">bookings/&#123;bookingId&#125;</code>):</strong>{' '}
                  Stores your booking ID, user ID, full name, phone number with country code,
                  WhatsApp contact permission, date of birth, selected treatment name and ID,
                  preferred appointment date and time, current status (requested, confirmed, or
                  cancelled), and timestamps.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Server className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                  2. Website Hosting &amp; API Processing via Vercel
                </h2>
              </div>
              <p className="text-sm text-[#6E655F]">
                This website and its backend API routes (<code className="text-xs">/api/*</code>) are
                hosted on <strong>Vercel</strong>. When you submit an appointment request, your form
                submission travels over HTTPS through Vercel serverless functions so our clinic desk
                can receive your visit request on our internal team notification bot, check your
                booking status, and create the next-day patient appointment sheet without exposing
                private API keys in your browser.
              </p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                  3. Phone, WhatsApp &amp; Map Services
                </h2>
              </div>
              <ul className="space-y-2 text-sm text-[#6E655F]">
                <li>
                  <strong>WhatsApp &amp; Call Permission:</strong> Your phone number is collected
                  for clinic calls and WhatsApp appointment confirmation. If you uncheck the
                  WhatsApp permission box during booking, our staff will only call you.
                </li>
                <li>
                  <strong>Internal Staff Notifications:</strong> When you submit a booking, our
                  server alerts our clinical team privately so they can confirm your visit and
                  prepare the daily appointment list.
                </li>
                <li>
                  <strong>Google Maps:</strong> Our clinic location card loads Google Maps so you
                  can view directions, zoom, and satellite imagery for our Beverly Hills address.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                  4. Access Control &amp; Deleting Your Information
                </h2>
              </div>
              <p className="text-sm text-[#6E655F]">
                Firestore security rules prevent anyone else from viewing, browsing, or editing your
                profile or bookings. Only your signed-in account can view your bookings, and edits or
                cancellations made by you are locked after 4 hours. We never sell or rent patient
                details. To update older bookings or ask for your account and Firestore records to
                be permanently deleted, email us at{' '}
                <a
                  href={`mailto:${CLINIC_CONFIG.email}`}
                  className="font-medium text-[#1F1B18] underline underline-offset-4"
                >
                  {CLINIC_CONFIG.email}
                </a>{' '}
                or call {CLINIC_CONFIG.phoneDisplay}.
              </p>
            </section>
          </div>
        ) : (
          <div className="mt-8 space-y-8 text-sm leading-relaxed text-[#1F1B18] sm:text-base">
            <section className="rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-6">
              <div className="flex items-center gap-2.5">
                <FileText className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                  1. Age Requirement (18+) &amp; Accurate Information
                </h2>
              </div>
              <p className="mt-3 text-sm text-[#6E655F]">
                Consultations and treatments at {CLINIC_CONFIG.fullTitle} are available only to
                adults aged 18 and older. You agree to provide your real name, a valid date of birth,
                and an active phone number so our clinic desk can verify your visit and reach you if
                timing needs to change.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                2. Booking Requests &amp; Clinic Hours
              </h2>
              <p className="text-sm text-[#6E655F]">
                Appointments are offered Monday through Friday from 10:00 AM to 7:00 PM Pacific
                Time for today or upcoming weekdays. Submitting the booking slider sends a visit
                request—it is not final until a member of our clinic team confirms your slot by
                WhatsApp or phone call (depending on the permission you choose).
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                3. 4-Hour Change &amp; Cancellation Rule
              </h2>
              <p className="text-sm text-[#6E655F]">
                If you are signed in to your patient account, you may change your treatment, date,
                time, or contact details—or cancel your request—directly inside your Profile
                calendar for up to 4 hours after you submit the booking. After 4 hours have passed,
                please call {CLINIC_CONFIG.phoneDisplay} during clinic hours for schedule changes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                4. Treatment Information &amp; Pricing Estimates
              </h2>
              <p className="text-sm text-[#6E655F]">
                Photos, before-and-after previews, shade sliders, and starting prices shown on this
                website are examples for general reference only. Individual results vary. A licensed
                doctor or dentist at our clinic will review your health history in person and
                provide an exact treatment plan and price quote before any procedure takes place.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                5. Platform Hosting &amp; Contact Details
              </h2>
              <p className="text-sm text-[#6E655F]">
                This website is hosted via Vercel and uses Google Firebase for sign-in and booking
                storage. If you experience any issue with your booking or account, contact us at{' '}
                {CLINIC_CONFIG.addressLine1}, {CLINIC_CONFIG.addressLine2}, call{' '}
                {CLINIC_CONFIG.phoneDisplay}, or email{' '}
                <a
                  href={`mailto:${CLINIC_CONFIG.email}`}
                  className="font-medium text-[#1F1B18] underline underline-offset-4"
                >
                  {CLINIC_CONFIG.email}
                </a>
                .
              </p>
            </section>
          </div>
        )}
      </div>
    </section>
  );
};

export default LegalSection;
