/**
 * Root application component for Elara Atelier — Aesthetic & Dental Studio.
 * Wraps the entire experience in AuthProvider and ClickSpark, manages initial hydration,
 * toggles between Studio Showcase, Patient Auth Portal, and Patient Profile/Calendar views, and handles SwipeToast.
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import ClickSpark from './components/reactbits/ClickSpark';
import LatticeLoader from './components/reactbits/LatticeLoader';
import SwipeToast from './components/reactbits/SwipeToast';
import AboutProjectSection from './components/sections/AboutProjectSection';
import AuthSection from './components/sections/AuthSection';
import BeforeAfterSection from './components/sections/BeforeAfterSection';
import BookingSection from './components/sections/BookingSection';
import Footer from './components/sections/Footer';
import Header from './components/sections/Header';
import HeroSection from './components/sections/HeroSection';
import LegalSection from './components/sections/LegalSection';
import ProfileSection from './components/sections/ProfileSection';
import TestimonialsSection from './components/sections/TestimonialsSection';
import TrustMetricsSection from './components/sections/TrustMetricsSection';
import TreatmentsSection from './components/sections/TreatmentsSection';
import { CLINIC_CONFIG } from './config/clinicConfig';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TREATMENTS } from './data/clinicData';

interface ToastState {
  open: boolean;
  title: string;
  description: string;
}

let pendingScrollRaf = 0;
let pendingScrollCheckTimer = 0;

/**
 * Compute the vertical scroll target for the Before & After preview section (#results)
 * adjusted for the sticky header height.
 * Inputs: none.
 * Output: target scrollY coordinate in pixels, or null if #results is missing.
 * Errors: None.
 */
function getResultsTargetTop(): { targetTop: number; headerOffset: number } | null {
  const resultsEl = document.getElementById('results');
  if (!resultsEl) return null;
  const headerOffset = window.innerWidth >= 768 ? 84 : 68;
  const targetTop = Math.max(
    0,
    Math.round(resultsEl.getBoundingClientRect().top + window.scrollY - headerOffset)
  );
  return { targetTop, headerOffset };
}

/**
 * Smoothly scroll the viewport down to the Before & After preview section (#results)
 * while clearing the sticky header cleanly and recovering if an animation stalls.
 * Inputs: none.
 * Output: void.
 * Errors: None.
 */
function scrollToResultsSection(): void {
  if (pendingScrollRaf) {
    window.cancelAnimationFrame(pendingScrollRaf);
    pendingScrollRaf = 0;
  }
  if (pendingScrollCheckTimer) {
    window.clearTimeout(pendingScrollCheckTimer);
    pendingScrollCheckTimer = 0;
  }

  pendingScrollRaf = window.requestAnimationFrame(() => {
    pendingScrollRaf = 0;
    const coords = getResultsTargetTop();
    if (!coords) return;
    window.scrollTo({ top: coords.targetTop, behavior: 'smooth' });

    pendingScrollCheckTimer = window.setTimeout(() => {
      pendingScrollCheckTimer = 0;
      const resultsEl = document.getElementById('results');
      if (!resultsEl) return;
      const nextCoords = getResultsTargetTop();
      if (!nextCoords) return;
      const currentTop = resultsEl.getBoundingClientRect().top;
      if (Math.abs(currentTop - nextCoords.headerOffset) > 120) {
        window.scrollTo({ top: nextCoords.targetTop, behavior: 'smooth' });
      }
    }, 620);
  });
}

/**
 * Inner application shell consuming AuthContext for header, auth portal, booking, legal, and profile views.
 */
function AtelierShell() {
  const {
    user,
    userPhotoUrl,
    authReady,
    profile,
    profileLoading,
    bookings,
    botSyncNotice,
    clearBotSyncNotice,
    redirectAuthError,
    signOutUser,
  } = useAuth();

  const [hydrating, setHydrating] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !new URLSearchParams(window.location.search).has('autostart');
  });
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string>(TREATMENTS[0].id);
  const [previewLoading, setPreviewLoading] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<'studio' | 'auth' | 'profile' | 'privacy' | 'terms' | 'about'>('studio');
  const [profileBookModalTrigger, setProfileBookModalTrigger] = useState<number>(0);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    title: 'Appointment Request Received',
    description: '',
  });

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  useEffect(() => {
    if (!hydrating) return undefined;
    const timer = window.setTimeout(() => {
      setHydrating(false);
    }, CLINIC_CONFIG.hydrationDurationMs);
    return () => window.clearTimeout(timer);
  }, [hydrating]);

  useEffect(() => {
    if (!botSyncNotice) return;
    setToast({
      open: true,
      title: botSyncNotice.title,
      description: botSyncNotice.description,
    });
    clearBotSyncNotice();
  }, [botSyncNotice, clearBotSyncNotice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let pending = false;
    try {
      pending = window.sessionStorage.getItem('elara_google_redirect_pending') === '1';
    } catch {
      pending = false;
    }
    if (!pending) return;

    if (redirectAuthError) {
      try {
        window.sessionStorage.removeItem('elara_google_redirect_pending');
      } catch {
        // Ignore storage error
      }
      setActiveView('auth');
      return;
    }

    if (authReady && user && !profileLoading) {
      try {
        window.sessionStorage.removeItem('elara_google_redirect_pending');
      } catch {
        // Ignore storage error
      }
      if (profile) {
        setActiveView('profile');
        setToast({
          open: true,
          title: 'Welcome Back',
          description: 'Your patient profile and calendar are ready.',
        });
      } else {
        setActiveView('auth');
      }
    }
  }, [authReady, user, profile, profileLoading, redirectAuthError]);

  /**
   * Show SwipeToast confirmation notification.
   * Inputs: title and description strings.
   */
  const showToast = (title: string, description: string) => {
    setToast({ open: true, title, description });
  };

  /**
   * Open an in-page portal, about-project, or legal view and smoothly scroll to the top of the viewport.
   * Inputs: target view ('auth' | 'profile' | 'privacy' | 'terms' | 'about').
   */
  const openPortalView = (view: 'auth' | 'profile' | 'privacy' | 'terms' | 'about') => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }, 60);
  };

  /**
   * Smoothly scroll the viewport to the appointment booking section,
   * opening the quick booking popup directly if the patient is currently on their Profile page.
   */
  const scrollToBooking = () => {
    if (activeView === 'profile') {
      setProfileBookModalTrigger(prev => prev + 1);
      return;
    }
    if (activeView !== 'studio') {
      setActiveView('studio');
      window.setTimeout(() => {
        document.getElementById('booking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }
    const el = document.getElementById('booking');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * Handle clicking any treatment card in the Treatments section:
   * updates the active preview treatment when unlocked and always scrolls smoothly down to #results.
   * Inputs: treatmentId string.
   * Output: void.
   * Errors: None.
   */
  const handleCatalogTreatmentSelect = (treatmentId: string) => {
    if (!previewLoading) {
      setSelectedTreatmentId(treatmentId);
    }
    scrollToResultsSection();
  };

  /**
   * Trigger SwipeToast confirmation notification after a booking is submitted.
   */
  const handleBookingConfirmed = (summary: { patientName: string; treatmentName: string }) => {
    showToast('Appointment Request Received', `${summary.patientName} · ${summary.treatmentName}`);
  };

  /**
   * Sign out cleanly and return to studio view.
   */
  const handleSignOut = async () => {
    await signOutUser();
    setActiveView('studio');
    showToast('Signed Out', 'Your session has been securely closed.');
  };

  const userDisplayName = user
    ? profile?.fullName || user.displayName || user.email || 'Patient'
    : null;
  const activeBookingCount = bookings.filter(b => b.status !== 'cancelled').length;

  return (
    <ClickSpark
      sparkColor="#B68D5E"
      sparkSize={10}
      sparkRadius={22}
      sparkCount={6}
      sparkWidth={1.5}
      duration={420}
      shape="line"
      randomness={0.18}
    >
      <div className="min-h-screen bg-[#FAF7F2] text-[#1F1B18] antialiased">
        {mapsQuotaExceeded ? (
          <div
            role="status"
            className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50"
          >
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        ) : null}

        {/* Initial Hydration LatticeLoader Overlay */}
        {hydrating ? (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#FAF7F2]"
            aria-label="Preparing Elara Atelier experience"
          >
            <p className="font-serif text-xl font-semibold tracking-[0.2em] text-[#1F1B18]">
              {CLINIC_CONFIG.brandName}
            </p>
            <LatticeLoader
              status="working"
              pattern="orbit"
              grid={3}
              shape="round"
              color="#B68D5E"
              cellSize={7}
              gap={3}
              fontSize={13}
              label="Preparing Atelier"
              showTimer={false}
              className="text-[#6E655F]"
            />
          </div>
        ) : null}

        <Header
          onBookClick={scrollToBooking}
          onOpenAuth={() => openPortalView('auth')}
          onOpenProfile={() => openPortalView('profile')}
          onSignOut={handleSignOut}
          userDisplayName={userDisplayName}
          userPhotoUrl={userPhotoUrl}
          bookingCount={activeBookingCount}
          activeView={activeView}
          onReturnStudio={() => setActiveView('studio')}
        />

        <main>
          <AnimatePresence mode="wait">
            {activeView === 'profile' ? (
              <motion.div
                key="profile-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                <ProfileSection
                  onBackToStudio={() => setActiveView('studio')}
                  onBookNewVisit={scrollToBooking}
                  bookModalTrigger={profileBookModalTrigger}
                  onNotify={showToast}
                />
              </motion.div>
            ) : activeView === 'auth' ? (
              <motion.div
                key="auth-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                <AuthSection
                  onBackToStudio={() => setActiveView('studio')}
                  onSuccess={() => {
                    openPortalView('profile');
                    showToast('Welcome Back', 'Your patient profile and calendar are ready.');
                  }}
                />
              </motion.div>
            ) : activeView === 'privacy' || activeView === 'terms' ? (
              <motion.div
                key={`legal-${activeView}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                <LegalSection
                  page={activeView}
                  onBackToStudio={() => {
                    setActiveView('studio');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onSwitchPage={nextPage => openPortalView(nextPage)}
                />
              </motion.div>
            ) : activeView === 'about' ? (
              <motion.div
                key="about-project-view"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              >
                <AboutProjectSection
                  onBackToStudio={() => {
                    setActiveView('studio');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onOpenPrivacy={() => openPortalView('privacy')}
                  onOpenTerms={() => openPortalView('terms')}
                />
              </motion.div>
            ) : (
              <motion.div
                key="studio-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                <HeroSection onReserveClick={scrollToBooking} />
                <TrustMetricsSection />
                <TreatmentsSection
                  selectedTreatmentId={selectedTreatmentId}
                  onSelectTreatment={handleCatalogTreatmentSelect}
                  isLocked={previewLoading}
                />
                <BeforeAfterSection
                  selectedTreatmentId={selectedTreatmentId}
                  onSelectTreatment={setSelectedTreatmentId}
                  onProceedToBook={scrollToBooking}
                  onLoadingChange={setPreviewLoading}
                />
                <TestimonialsSection />
                <BookingSection
                  selectedTreatmentId={selectedTreatmentId}
                  onSelectTreatment={setSelectedTreatmentId}
                  onBookingConfirmed={handleBookingConfirmed}
                  onOpenAuth={() => openPortalView('auth')}
                  onOpenProfile={() => openPortalView('profile')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <Footer
          onOpenAbout={() => openPortalView('about')}
          onOpenPrivacy={() => openPortalView('privacy')}
          onOpenTerms={() => openPortalView('terms')}
          onReturnStudio={() => setActiveView('studio')}
        />

        {toast.open ? (
          <SwipeToast
            open={toast.open}
            title={toast.title}
            description={toast.description}
            icon={<Check className="h-4 w-4 text-[#B68D5E]" />}
            background="#1F1B18"
            color="#FAF7F2"
            fuseColor="#B68D5E"
            duration={5000}
            closeButton={true}
            onClose={() => setToast(prev => ({ ...prev, open: false }))}
          />
        ) : null}
      </div>
    </ClickSpark>
  );
}

/**
 * Main exported application root wrapped in Firebase AuthProvider.
 */
export default function App() {
  return (
    <AuthProvider>
      <AtelierShell />
    </AuthProvider>
  );
}
