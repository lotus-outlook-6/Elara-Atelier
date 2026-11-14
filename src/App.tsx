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
import AuthSection from './components/sections/AuthSection';
import BeforeAfterSection from './components/sections/BeforeAfterSection';
import BookingSection from './components/sections/BookingSection';
import Footer from './components/sections/Footer';
import Header from './components/sections/Header';
import HeroSection from './components/sections/HeroSection';
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

/**
 * Inner application shell consuming AuthContext for header, auth portal, booking, and profile views.
 */
function AtelierShell() {
  const {
    user,
    userPhotoUrl,
    profile,
    bookings,
    botSyncNotice,
    clearBotSyncNotice,
    signOutUser,
  } = useAuth();

  const [hydrating, setHydrating] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !new URLSearchParams(window.location.search).has('autostart');
  });
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string>(TREATMENTS[0].id);
  const [activeView, setActiveView] = useState<'studio' | 'auth' | 'profile'>('studio');
  const [toast, setToast] = useState<ToastState>({
    open: false,
    title: 'Appointment Request Received',
    description: '',
  });

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

  /**
   * Show SwipeToast confirmation notification.
   * Inputs: title and description strings.
   */
  const showToast = (title: string, description: string) => {
    setToast({ open: true, title, description });
  };

  /**
   * Open an in-page view (auth or profile) and smoothly bring it to the top of the viewport.
   * Inputs: target view ('auth' | 'profile').
   */
  const openPortalView = (view: 'auth' | 'profile') => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Smoothly scroll the viewport to the appointment booking section,
   * switching back from Auth or Profile view if active.
   */
  const scrollToBooking = () => {
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
                  onSelectTreatment={setSelectedTreatmentId}
                />
                <BeforeAfterSection />
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

        <Footer />

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
