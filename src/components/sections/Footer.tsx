/**
 * Editorial footer for Elara Atelier in Deep Espresso (#1F1B18)
 * with Alabaster Ivory (#FAF7F2) typography, studio navigation,
 * operating hours, and clinical address.
 */

import React from 'react';
import { CLINIC_CONFIG } from '../../config/clinicConfig';

/**
 * Editorial footer with balanced 3-column directory and legal row.
 * Output: Rendered footer element.
 */
export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#1F1B18] text-[#FAF7F2] selection:bg-[#D8BA94] selection:text-[#1F1B18]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8 sm:py-16 2xl:max-w-[1440px]">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="inline-flex items-center gap-3">
              <img
                src="/elara-logo.png"
                alt="Elara Atelier emblem"
                className="h-10 w-10 shrink-0 object-contain"
              />
              <p className="font-serif text-xl font-semibold tracking-[0.18em] text-[#FAF7F2]">
                {CLINIC_CONFIG.brandName}
              </p>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#E2D9CE]/80">
              {CLINIC_CONFIG.tagline}. Gentle facial, dental, and skin care tailored for comfort
              and natural-looking results.
            </p>
          </div>

          <div className="md:col-span-3">
            <h3 className="font-sans text-[11px] font-semibold tracking-[0.2em] text-[#B68D5E] uppercase">
              Studio Index
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#E2D9CE]/85">
              <li>
                <a href="#treatments" className="no-underline transition-colors hover:text-[#FAF7F2]">
                  Treatments
                </a>
              </li>
              <li>
                <a href="#results" className="no-underline transition-colors hover:text-[#FAF7F2]">
                  Before &amp; After
                </a>
              </li>
              <li>
                <a href="#testimonials" className="no-underline transition-colors hover:text-[#FAF7F2]">
                  Testimonials
                </a>
              </li>
              <li>
                <a href="#booking" className="no-underline transition-colors hover:text-[#FAF7F2]">
                  Book Visit
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <h3 className="font-sans text-[11px] font-semibold tracking-[0.2em] text-[#B68D5E] uppercase">
              Location &amp; Hours
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-[#E2D9CE]/85">
              {CLINIC_CONFIG.addressLine1}
              <br />
              {CLINIC_CONFIG.addressLine2}
            </p>
            <p className="mt-3 text-sm text-[#FAF7F2]">{CLINIC_CONFIG.hoursSummary}</p>
            <p className="mt-2 text-xs text-[#E2D9CE]/75">
              {CLINIC_CONFIG.phoneDisplay} · {CLINIC_CONFIG.email}
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col justify-between gap-4 border-t border-[#E2D9CE]/15 pt-6 text-xs text-[#E2D9CE]/65 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} {CLINIC_CONFIG.fullTitle}. All rights reserved.</p>
          <p>Board-Certified Facial Aesthetics &amp; Cosmetic Dentistry</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
