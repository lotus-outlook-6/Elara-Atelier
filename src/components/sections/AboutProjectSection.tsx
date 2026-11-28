/**
 * About Project page view for Elara Atelier — Aesthetic & Dental Studio.
 * Explains that this application is a full-stack (frontend + backend) portfolio demo site,
 * summarizes the architecture and interactive features, and provides a direct project redirect button.
 */

import React from 'react';
import {
  ArrowLeft,
  Bell,
  Briefcase,
  Database,
  ExternalLink,
  Layers,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { CLINIC_CONFIG } from '../../config/clinicConfig';

export interface AboutProjectSectionProps {
  onBackToStudio: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
}

interface HighlightCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
}

const ARCHITECTURE_HIGHLIGHTS: readonly HighlightCard[] = [
  {
    id: 'frontend',
    title: 'Editorial Frontend Experience',
    subtitle: 'React 19 · TypeScript · Tailwind CSS',
    description:
      'Responsive studio showcase featuring filterable treatment catalogs, an interactive before-and-after comparison slider, a live Porcelain Veneers timeline and pricing estimator, weekday-only scheduling, and slide-to-confirm booking controls.',
    icon: <Layers className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />,
  },
  {
    id: 'backend',
    title: 'Express Backend & Serverless API',
    subtitle: 'Node.js · Express · Vercel Functions',
    description:
      'Full backend API layer handling real-time booking alerts, patient and team cancellation syncing, Server-Sent Events (SSE) status updates, and on-demand PDF daily schedule generation without exposing secrets in the browser.',
    icon: <Server className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />,
  },
  {
    id: 'firebase',
    title: 'Cloud Database & Authentication',
    subtitle: 'Firebase Auth · Cloud Firestore',
    description:
      'Persistent patient accounts supporting Google and Email/Password sign-in, synced monthly visit calendars, past-booking archives, and Firestore security rules enforcing per-user isolation and a 4-hour self-service edit window.',
    icon: <Database className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />,
  },
  {
    id: 'operations',
    title: 'Clinic Operations & Notifications',
    subtitle: 'Telegram Alerts · WhatsApp Handoff · PDF Sheets',
    description:
      'Automated team notifications pushed to Telegram on every new booking or cancellation, 2-step team cancellation notes synced back to the patient profile with 1-click re-booking, and automated morning appointment lists.',
    icon: <Bell className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />,
  },
];

/**
 * Full-page About Project overview explaining the full-stack portfolio demo
 * with direct external redirect buttons to the project workspace.
 * Inputs: callbacks to return to the studio home or jump to Privacy/Terms pages.
 * Output: Rendered About Project section.
 * Errors: None.
 */
export const AboutProjectSection: React.FC<AboutProjectSectionProps> = ({
  onBackToStudio,
  onOpenPrivacy,
  onOpenTerms,
}) => {
  const projectUrl = CLINIC_CONFIG.projectShowcaseUrl;

  return (
    <section
      aria-label="About This Project"
      className="min-h-screen bg-[#FAF7F2] pt-28 pb-20 sm:pt-32"
    >
      <div className="mx-auto max-w-4xl px-4 sm:px-8">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2D9CE] pb-6">
          <button
            type="button"
            onClick={onBackToStudio}
            className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold tracking-[0.14em] text-[#6E655F] uppercase transition-colors hover:text-[#1F1B18]"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
            Back to Home
          </button>

          {projectUrl ? (
            <a
              href={projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#1F1B18] px-4 py-2 text-xs font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase no-underline transition-colors hover:bg-[#332C27]"
            >
              <span>Open Project</span>
              <ExternalLink className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
            </a>
          ) : null}
        </div>

        {/* Hero Summary */}
        <header className="mt-8 border-b border-[#E2D9CE] pb-8">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-[#B68D5E] uppercase">
            <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Portfolio Showcase · Full-Stack Demo</span>
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
            About This Project
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#1F1B18]">
            <strong>{CLINIC_CONFIG.fullTitle}</strong> is a{' '}
            <strong>frontend-cum-backend demo web application built for portfolio purposes</strong>.
            It demonstrates an end-to-end luxury clinic booking and patient portal—combining a refined
            editorial interface with real cloud authentication, persistent database records,
            serverless backend APIs, and live clinic staff notifications.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-[#6E655F]">
            All treatments, clinical staff profiles, reviews, pricing estimates, and studio contact
            details presented on this website are clearly labelled sample portfolio content designed
            to demonstrate real full-stack product workflows rather than an operating medical clinic.
          </p>
        </header>

        {/* Architecture & Feature Cards */}
        <div className="mt-8">
          <h2 className="font-serif text-2xl font-semibold text-[#1F1B18]">
            What This Demo Showcases
          </h2>
          <p className="mt-1.5 text-sm text-[#6E655F]">
            Every screen and interactive flow connects a live frontend UI to real backend and
            database services.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ARCHITECTURE_HIGHLIGHTS.map(item => (
              <article
                key={item.id}
                className="flex flex-col rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#FAF7F2]">
                    {item.icon}
                  </span>
                  <div>
                    <h3 className="font-serif text-lg font-semibold leading-snug text-[#1F1B18]">
                      {item.title}
                    </h3>
                    <p className="text-[11px] font-medium tracking-[0.12em] text-[#6E655F] uppercase">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#6E655F]">{item.description}</p>
              </article>
            ))}
          </div>
        </div>

        {/* Portfolio Notice & Direct Project Redirect Card */}
        <div className="mt-8 rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.18em] text-[#B68D5E] uppercase">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Direct Project Link</span>
              </p>
              <h2 className="mt-1.5 font-serif text-2xl font-semibold text-[#1F1B18]">
                Inspect &amp; Preview the Full Project
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#6E655F]">
                Launch the live project workspace directly to explore the interactive preview,
                architecture, and full-stack implementation behind this portfolio demo.
              </p>
            </div>

            {projectUrl ? (
              <a
                href={projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1F1B18] px-5 py-3 text-xs font-semibold tracking-[0.14em] text-[#FAF7F2] uppercase no-underline transition-colors hover:bg-[#332C27]"
              >
                <span>Go to Project</span>
                <ExternalLink className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
              </a>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[#E2D9CE] pt-4 text-xs text-[#6E655F]">
            <button
              type="button"
              onClick={onBackToStudio}
              className="cursor-pointer bg-transparent p-0 font-semibold text-[#1F1B18] underline underline-offset-4 transition-colors hover:text-[#B68D5E]"
            >
              Return to Demo Studio
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="cursor-pointer bg-transparent p-0 font-medium text-[#6E655F] underline underline-offset-4 transition-colors hover:text-[#1F1B18]"
            >
              Privacy Policy
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenTerms}
              className="cursor-pointer bg-transparent p-0 font-medium text-[#6E655F] underline underline-offset-4 transition-colors hover:text-[#1F1B18]"
            >
              Terms &amp; Conditions
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutProjectSection;
