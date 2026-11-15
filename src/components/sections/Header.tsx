/**
 * Minimal sticky navigation header for Elara Atelier.
 * Features single-line anchor links, Sign In / Profile controls,
 * and a hold-only Book Visit button paired in the same highlight with clinic day & hours.
 */

import React, { useEffect, useState } from 'react';
import { LogOut, Menu, User, X } from 'lucide-react';
import { CLINIC_CONFIG } from '../../config/clinicConfig';
import HoldButton from '../reactbits/HoldButton';
import PatientAvatar from '../ui/PatientAvatar';

export interface HeaderProps {
  onBookClick: () => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  userDisplayName: string | null;
  userPhotoUrl?: string | null;
  bookingCount: number;
  activeView: 'studio' | 'auth' | 'profile';
  onReturnStudio: () => void;
}

const NAV_LINKS = [
  { label: 'Treatments', href: '#treatments' },
  { label: 'Results', href: '#results' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'Book Visit', href: '#booking' },
] as const;

/**
 * Sticky editorial top bar with brand wordmark, anchor links, Sign In/Profile actions,
 * and hold-only Book Visit button highlighted together with clinic days and hours.
 */
export const Header: React.FC<HeaderProps> = ({
  onBookClick,
  onOpenAuth,
  onOpenProfile,
  onSignOut,
  userDisplayName,
  userPhotoUrl,
  bookingCount,
  activeView,
  onReturnStudio,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 18);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  /**
   * Close mobile menu drawer and return to studio view if currently in auth or profile view.
   */
  const handleNavClick = () => {
    setMobileMenuOpen(false);
    if (activeView !== 'studio') {
      onReturnStudio();
    }
  };

  const firstName = userDisplayName ? userDisplayName.trim().split(/\s+/)[0] : null;

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-40 transition-colors duration-300 ${
        scrolled || mobileMenuOpen || activeView !== 'studio'
          ? 'border-b border-[#E2D9CE] bg-[#FAF7F2]/95 backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3.5 sm:gap-4 sm:px-8 md:h-20 2xl:max-w-[1440px]">
        {/* Zone 1: Brand Emblem + Wordmark */}
        <a
          href="#top"
          onClick={() => {
            if (activeView !== 'studio') onReturnStudio();
          }}
          className="inline-flex shrink-0 items-center gap-1.5 font-serif text-[13px] font-semibold tracking-[0.09em] whitespace-nowrap text-[#1F1B18] no-underline sm:gap-2.5 sm:text-xl sm:tracking-[0.18em]"
        >
          <img
            src="/elara-logo.png"
            alt="Elara Atelier emblem"
            className="h-7 w-7 shrink-0 object-contain sm:h-9 sm:w-9"
          />
          <span>{CLINIC_CONFIG.brandName}</span>
        </a>

        {/* Zone 2: Desktop Anchor Navigation */}
        <nav className="hidden items-center gap-7 lg:flex 2xl:gap-9" aria-label="Primary navigation">
          {NAV_LINKS.map(link => (
            <a
              key={link.href}
              href={link.href}
              onClick={handleNavClick}
              className="text-xs font-medium tracking-[0.16em] whitespace-nowrap shrink-0 text-[#6E655F] uppercase no-underline transition-colors duration-200 hover:text-[#1F1B18]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: Account Controls + Hold-Only Book Visit with Day & Time Highlight */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {userDisplayName ? (
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={activeView === 'profile' ? onReturnStudio : onOpenProfile}
                className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border pr-3 pl-1.5 text-xs font-semibold tracking-[0.1em] whitespace-nowrap uppercase transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99] ${
                  activeView === 'profile'
                    ? 'border-[#B68D5E] bg-[#EFE9E0] text-[#1F1B18]'
                    : 'border-[#E2D9CE] bg-[#FAF7F2] text-[#1F1B18] hover:bg-[#EFE9E0]'
                }`}
              >
                <PatientAvatar src={userPhotoUrl} name={userDisplayName} size="xs" />
                <span>{firstName || 'Profile'}</span>
                <span className="text-[#6E655F] tabular-nums">({bookingCount})</span>
              </button>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] text-[#6E655F] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#EFE9E0] hover:text-[#1F1B18] active:scale-[0.99]"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={activeView === 'auth' ? onReturnStudio : onOpenAuth}
              className={`hidden h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 text-xs font-semibold tracking-[0.12em] whitespace-nowrap uppercase transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.99] sm:inline-flex ${
                activeView === 'auth'
                  ? 'border-[#B68D5E] bg-[#EFE9E0] text-[#1F1B18]'
                  : 'border-[#E2D9CE] bg-[#FAF7F2] text-[#1F1B18] hover:border-[#B68D5E] hover:bg-[#EFE9E0]'
              }`}
            >
              <User className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
              Sign In
            </button>
          )}

          {/* Highlighted Book Visit + Operating Day & Time */}
          <div className="flex items-center gap-2 rounded-xl border border-[#E2D9CE] bg-[#EFE9E0] p-0.5 sm:gap-2.5 sm:p-1 sm:pl-3">
            <span className="hidden text-[11px] font-medium tracking-[0.12em] whitespace-nowrap text-[#1F1B18] uppercase xl:inline">
              {CLINIC_CONFIG.hoursShort}
            </span>
            <HoldButton
              size="sm"
              radius={8}
              holdTime={600}
              backgroundColor="#1F1B18"
              fillColor="#B68D5E"
              textColor="#FAF7F2"
              fillTextColor="#FAF7F2"
              glow={false}
              doneLabel="Scrolling down..."
              onHold={onBookClick}
              onTap={onBookClick}
              className="!h-8 !px-3 text-[10px] tracking-[0.06em] uppercase sm:!h-9 sm:!px-4 sm:text-xs sm:tracking-[0.1em]"
            >
              Book Visit
            </HoldButton>
          </div>

          <button
            type="button"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] text-[#1F1B18] transition-colors hover:bg-[#EFE9E0] lg:hidden"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(prev => !prev)}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen ? (
        <nav
          className="border-t border-[#E2D9CE] bg-[#FAF7F2] px-5 py-4 lg:hidden"
          aria-label="Mobile navigation"
        >
          <div className="flex flex-col gap-3">
            <p className="border-b border-[#E2D9CE] pb-2.5 text-[11px] font-medium tracking-[0.14em] text-[#6E655F] uppercase">
              Studio Hours · {CLINIC_CONFIG.hoursSummary}
            </p>
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={handleNavClick}
                className="py-1.5 text-xs font-medium tracking-[0.16em] text-[#1F1B18] uppercase no-underline"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-1 border-t border-[#E2D9CE] pt-3">
              {userDisplayName ? (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onOpenProfile();
                    }}
                    className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#E2D9CE] bg-[#EFE9E0] px-3 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                  >
                    <PatientAvatar src={userPhotoUrl} name={userDisplayName} size="xs" />
                    My Profile ({bookingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSignOut();
                    }}
                    className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] px-3 text-xs font-semibold tracking-[0.12em] text-[#6E655F] uppercase"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenAuth();
                  }}
                  className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#1F1B18] text-xs font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase"
                >
                  <User className="h-3.5 w-3.5 text-[#B68D5E]" />
                  Sign In / Create Account
                </button>
              )}
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
};

export default Header;
