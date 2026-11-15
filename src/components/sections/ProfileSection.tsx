/**
 * Patient Profile, Interactive Monthly Calendar, 4-Hour Editable Bookings List,
 * and Telegram Bot Concierge Setup Guide for Elara Atelier.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  Info,
  Lock,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { CLINIC_CONFIG, COUNTRY_CODES } from '../../config/clinicConfig';
import { useAuth, type BookingRecord } from '../../context/AuthContext';
import { TREATMENTS } from '../../data/clinicData';
import {
  buildCalendarMonthGrid,
  buildTelegramBotDeepLink,
  calculateAge,
  canEditBooking,
  extractBookingIsoDate,
  formatPreferredDateTime,
  getRemainingEditWindow,
  resolveEffectiveTelegram,
  resolveEffectiveWhatsApp,
  sanitizeNameInput,
  sanitizePhoneDigits,
  type TelegramContactMethod,
} from '../../utils/booking';
import AtelierDatePicker from '../reactbits/AtelierDatePicker';
import GlideSelect, { type GlideSelectOption } from '../reactbits/GlideSelect';
import LatticeLoader from '../reactbits/LatticeLoader';
import PatientAvatar from '../ui/PatientAvatar';
import TelegramConciergeChat from '../ui/TelegramConciergeChat';

export interface ProfileSectionProps {
  onBackToStudio: () => void;
  onBookNewVisit: () => void;
  onNotify: (title: string, description: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Patient Profile dashboard with monthly calendar, 4-hour editable bookings,
 * 18+ patient identity summary, and Telegram Bot concierge integration.
 */
export const ProfileSection: React.FC<ProfileSectionProps> = ({
  onBackToStudio,
  onBookNewVisit,
  onNotify,
}) => {
  const {
    user,
    userPhotoUrl,
    profile,
    profileLoading,
    bookings,
    bookingsLoading,
    telegramStatus,
    linkedTelegramChatId,
    conciergeMessages,
    conciergeMessagesLoading,
    sendConciergeMessage,
    saveUserProfile,
    editBookingRecord,
    cancelBookingRecord,
  } = useAuth();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [calendarCursor, setCalendarCursor] = useState<{ year: number; month: number }>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedIsoDate, setSelectedIsoDate] = useState<string | null>(null);

  // Profile editor state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phoneCountryCode: '+1',
    phoneNumber: '',
    whatsappSameAsPhone: true,
    whatsappCountryCode: '+1',
    whatsappNumber: '',
    dob: '',
    telegramSameAsPhone: true,
    telegramMethod: 'username' as TelegramContactMethod,
    telegramValue: '',
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Booking inline editor state
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [bookingEditDraft, setBookingEditDraft] = useState({
    treatmentId: TREATMENTS[0].id,
    preferredDateTime: '',
    phoneCountryCode: '+1',
    phoneNumber: '',
    whatsappSameAsPhone: true,
    whatsappCountryCode: '+1',
    whatsappNumber: '',
    telegramSameAsPhone: true,
    telegramMethod: 'username' as TelegramContactMethod,
    telegramValue: '',
  });
  const [bookingEditError, setBookingEditError] = useState<string | null>(null);
  const [savingBookingEdit, setSavingBookingEdit] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [showBotPlan, setShowBotPlan] = useState(false);

  // Refresh 4-hour countdown timer every 30 seconds
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  // Sync profile form when Firestore profile arrives
  useEffect(() => {
    if (profile) {
      const fullPhone = `${profile.phoneCountryCode}${sanitizePhoneDigits(profile.phoneNumber)}`;
      const matchesPhone =
        profile.telegramMethod === 'phone' &&
        profile.telegramValue.replace(/\s+/g, '') === fullPhone;
      const waCode = profile.whatsappCountryCode || profile.phoneCountryCode;
      const waDigits = sanitizePhoneDigits(profile.whatsappNumber || '');
      const waMatchesPhone =
        !waDigits ||
        (waCode === profile.phoneCountryCode &&
          waDigits === sanitizePhoneDigits(profile.phoneNumber));
      setProfileForm({
        fullName: profile.fullName,
        phoneCountryCode: profile.phoneCountryCode,
        phoneNumber: profile.phoneNumber,
        whatsappSameAsPhone: waMatchesPhone,
        whatsappCountryCode: waCode,
        whatsappNumber: waMatchesPhone ? '' : waDigits,
        dob: profile.dob,
        telegramSameAsPhone: matchesPhone,
        telegramMethod: matchesPhone ? 'username' : profile.telegramMethod,
        telegramValue: matchesPhone ? '' : profile.telegramValue,
      });
    } else if (user) {
      setProfileForm(prev => ({
        ...prev,
        fullName: prev.fullName || sanitizeNameInput(user.displayName || ''),
      }));
    }
  }, [profile, user]);

  // Map YYYY-MM-DD -> active bookings on that date for the calendar
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, BookingRecord[]>();
    for (const item of bookings) {
      if (item.status === 'cancelled') continue;
      const iso = extractBookingIsoDate(item.preferredDateTime);
      if (!iso) continue;
      const existingList = map.get(iso) ?? [];
      existingList.push(item);
      map.set(iso, existingList);
    }
    return map;
  }, [bookings]);

  const calendarGrid = useMemo(
    () => buildCalendarMonthGrid(calendarCursor.year, calendarCursor.month),
    [calendarCursor.year, calendarCursor.month]
  );

  const monthTitle = useMemo(() => {
    return new Date(calendarCursor.year, calendarCursor.month, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }, [calendarCursor.year, calendarCursor.month]);

  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter(b => b.status !== 'cancelled')
        .slice()
        .sort((a, b) => a.preferredDateTime.localeCompare(b.preferredDateTime)),
    [bookings]
  );

  const displayedBookings = useMemo(() => {
    if (!selectedIsoDate) return bookings;
    return bookings.filter(b => extractBookingIsoDate(b.preferredDateTime) === selectedIsoDate);
  }, [bookings, selectedIsoDate]);

  const patientAge = profile?.dob ? calculateAge(profile.dob) : null;

  const countryCodeOptions: GlideSelectOption[] = useMemo(
    () => COUNTRY_CODES.map(opt => ({ value: opt.code, label: opt.label })),
    []
  );

  const treatmentOptions: GlideSelectOption[] = useMemo(
    () =>
      TREATMENTS.map(item => ({
        value: item.id,
        label: item.name,
        tag: item.startingPrice,
      })),
    []
  );

  /**
   * Shift the calendar month backward or forward by delta months.
   * Inputs: delta (-1 or +1).
   */
  const shiftMonth = (delta: number) => {
    setCalendarCursor(prev => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  /**
   * Begin inline editing for a specific booking within its 4-hour window.
   * Inputs: BookingRecord item.
   */
  const startEditingBooking = (booking: BookingRecord) => {
    const fullPhone = `${booking.phoneCountryCode}${sanitizePhoneDigits(booking.phoneNumber)}`;
    const matchesPhone =
      booking.telegramMethod === 'phone' &&
      booking.telegramValue.replace(/\s+/g, '') === fullPhone;
    const waCode = booking.whatsappCountryCode || booking.phoneCountryCode;
    const waDigits = sanitizePhoneDigits(booking.whatsappNumber || '');
    const waMatchesPhone =
      !waDigits ||
      (waCode === booking.phoneCountryCode &&
        waDigits === sanitizePhoneDigits(booking.phoneNumber));
    setEditingBookingId(booking.id);
    setBookingEditError(null);
    setConfirmCancelId(null);
    setBookingEditDraft({
      treatmentId: booking.treatmentId,
      preferredDateTime: booking.preferredDateTime,
      phoneCountryCode: booking.phoneCountryCode,
      phoneNumber: booking.phoneNumber,
      whatsappSameAsPhone: waMatchesPhone,
      whatsappCountryCode: waCode,
      whatsappNumber: waMatchesPhone ? '' : waDigits,
      telegramSameAsPhone: matchesPhone,
      telegramMethod: matchesPhone ? 'username' : booking.telegramMethod,
      telegramValue: matchesPhone ? '' : booking.telegramValue,
    });
  };

  /**
   * Submit updated booking details to Firestore.
   * Inputs: bookingId string.
   */
  const handleSaveBookingEdit = async (bookingId: string) => {
    setBookingEditError(null);
    setSavingBookingEdit(true);
    try {
      const resolvedTelegram = resolveEffectiveTelegram(bookingEditDraft);
      const resolvedWhatsApp = resolveEffectiveWhatsApp(bookingEditDraft);
      await editBookingRecord(bookingId, {
        ...bookingEditDraft,
        whatsappSameAsPhone: bookingEditDraft.whatsappSameAsPhone,
        whatsappCountryCode: resolvedWhatsApp.countryCode,
        whatsappNumber: resolvedWhatsApp.number,
        telegramMethod: resolvedTelegram.method,
        telegramValue: resolvedTelegram.value,
      });
      setEditingBookingId(null);
      onNotify('Booking Updated', 'Your studio visit changes have been saved.');
    } catch (err) {
      setBookingEditError(err instanceof Error ? err.message : 'Unable to update booking.');
    } finally {
      setSavingBookingEdit(false);
    }
  };

  /**
   * Cancel a booking within the 4-hour window.
   * Inputs: bookingId string.
   */
  const handleCancelBooking = async (bookingId: string) => {
    setBookingEditError(null);
    setSavingBookingEdit(true);
    try {
      await cancelBookingRecord(bookingId);
      setConfirmCancelId(null);
      setEditingBookingId(null);
      onNotify('Booking Cancelled', 'Your consultation request has been cancelled.');
    } catch (err) {
      setBookingEditError(err instanceof Error ? err.message : 'Unable to cancel booking.');
    } finally {
      setSavingBookingEdit(false);
    }
  };

  /**
   * Save edited patient profile details to Firestore.
   */
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      const resolvedTelegram = resolveEffectiveTelegram(profileForm);
      const resolvedWhatsApp = resolveEffectiveWhatsApp(profileForm);
      await saveUserProfile({
        fullName: profileForm.fullName,
        phoneCountryCode: profileForm.phoneCountryCode,
        phoneNumber: profileForm.phoneNumber,
        whatsappSameAsPhone: profileForm.whatsappSameAsPhone,
        whatsappCountryCode: resolvedWhatsApp.countryCode,
        whatsappNumber: resolvedWhatsApp.number,
        dob: profileForm.dob,
        telegramSameAsPhone: profileForm.telegramSameAsPhone,
        telegramMethod: resolvedTelegram.method,
        telegramValue: resolvedTelegram.value,
      });
      setEditingProfile(false);
      onNotify('Profile Saved', 'Patient details, WhatsApp, and Telegram preferences updated.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  if (!user) {
    return (
      <section className="min-h-[70vh] bg-[#FAF7F2] pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h1 className="font-serif text-3xl font-semibold text-[#1F1B18]">
            Sign In Required for Patient Profile
          </h1>
          <p className="mt-3 text-sm text-[#6E655F]">
            Please sign in to inspect your upcoming calendar, edit bookings within 4 hours, and
            manage your Telegram concierge settings.
          </p>
          <button
            type="button"
            onClick={onBackToStudio}
            className="mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#1F1B18] px-6 text-xs font-semibold tracking-[0.14em] text-[#FAF7F2] uppercase"
          >
            <ArrowLeft className="h-4 w-4" />
            Return to Studio
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Patient Profile and Schedule Calendar"
      className="min-h-screen bg-[#FAF7F2] pt-28 pb-20 sm:pt-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-8 2xl:max-w-[1440px]">
        {/* Top Action & Patient Header */}
        <div className="flex flex-col justify-between gap-6 border-b border-[#E2D9CE] pb-8 lg:flex-row lg:items-end">
          <div>
            <button
              type="button"
              onClick={onBackToStudio}
              className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold tracking-[0.14em] text-[#6E655F] uppercase transition-colors hover:text-[#1F1B18]"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-[#B68D5E]" />
              Back to Studio Showcase
            </button>
            <div className="mt-4 flex items-center gap-4">
              <PatientAvatar
                src={userPhotoUrl}
                name={profile?.fullName || user.displayName}
                size="lg"
              />
              <div>
                <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
                  {profile?.fullName || user.displayName || 'Patient Profile'}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#6E655F]">
                  <span>{profile?.email || user.email}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 text-[#4B6B50]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {patientAge !== null ? `Age ${patientAge} Verified (18+)` : '18+ Profile Setup'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {upcomingBookings.length} Active Visit{upcomingBookings.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-[#E2D9CE] bg-[#EFE9E0] px-4 py-2.5 text-xs font-medium text-[#1F1B18]">
              Clinic Hours · {CLINIC_CONFIG.hoursShort}
            </div>
            <button
              type="button"
              onClick={onBookNewVisit}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-[#1F1B18] px-5 text-xs font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase transition-colors hover:bg-[#352F2B]"
            >
              <CalendarIcon className="h-3.5 w-3.5 text-[#B68D5E]" />
              Book New Visit
            </button>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12 2xl:gap-10">
          {/* Left Column: Patient Details + Telegram Bot Card */}
          <div className="space-y-6 lg:col-span-5">
            {/* Patient Contact & Identity Card */}
            <div className="rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3 border-b border-[#E2D9CE] pb-4">
                <div className="flex items-center gap-2.5">
                  <PatientAvatar
                    src={userPhotoUrl}
                    name={profile?.fullName || user.displayName}
                    size="sm"
                  />
                  <h2 className="font-serif text-xl font-semibold text-[#1F1B18]">
                    Patient Record
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile(prev => !prev);
                    setProfileError(null);
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase underline underline-offset-4 hover:text-[#B68D5E]"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  {editingProfile ? 'Close' : 'Edit Details'}
                </button>
              </div>

              {profileLoading ? (
                <div className="py-8">
                  <LatticeLoader
                    status="working"
                    color="#B68D5E"
                    label="Loading profile"
                    showTimer={false}
                  />
                </div>
              ) : editingProfile || !profile ? (
                <form onSubmit={handleSaveProfile} className="mt-4 space-y-3.5" noValidate>
                  {!profile ? (
                    <p className="rounded-lg border border-[#B68D5E]/40 bg-[#FAF7F2] p-3 text-xs text-[#6E655F]">
                      Complete your 18+ patient record below so consultation requests pre-fill
                      automatically.
                    </p>
                  ) : null}
                  {profileError ? (
                    <p className="text-xs text-[#9E3B33]" role="alert">
                      {profileError}
                    </p>
                  ) : null}

                  <div>
                    <label
                      htmlFor="prof-name"
                      className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                    >
                      Full Name (Letters Only)
                    </label>
                    <input
                      id="prof-name"
                      type="text"
                      value={profileForm.fullName}
                      onChange={e =>
                        setProfileForm(prev => ({
                          ...prev,
                          fullName: sanitizeNameInput(e.target.value),
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-sm text-[#1F1B18]"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="prof-dob"
                        className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                      >
                        Date of Birth (18+)
                      </label>
                      <AtelierDatePicker
                        id="prof-dob"
                        mode="date"
                        value={profileForm.dob}
                        onChange={nextDob => setProfileForm(prev => ({ ...prev, dob: nextDob }))}
                        placeholder="YYYY-MM-DD"
                        ariaLabel="Date of Birth (18+)"
                        defaultOpenYear={1995}
                        surfaceColor="#FAF7F2"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="prof-code"
                        className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                      >
                        Country Code
                      </label>
                      <GlideSelect
                        options={countryCodeOptions}
                        value={profileForm.phoneCountryCode}
                        onChange={code =>
                          setProfileForm(prev => ({ ...prev, phoneCountryCode: code }))
                        }
                        showTags={false}
                        size="lg"
                        radius={8}
                        menuWidth={170}
                        surfaceColor="#FAF7F2"
                        highlightColor="#EFE9E0"
                        accentColor="#B68D5E"
                        textColor="#1F1B18"
                        ariaLabel="Profile phone country code"
                        className="w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="prof-phone"
                      className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                    >
                      Phone Number
                    </label>
                    <input
                      id="prof-phone"
                      type="tel"
                      value={profileForm.phoneNumber}
                      onChange={e =>
                        setProfileForm(prev => ({
                          ...prev,
                          phoneNumber: sanitizePhoneDigits(e.target.value),
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-sm text-[#1F1B18] tabular-nums"
                    />
                    <div className="mt-2.5 flex flex-col gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#6E655F]">
                        <input
                          type="checkbox"
                          checked={profileForm.whatsappSameAsPhone}
                          onChange={e =>
                            setProfileForm(prev => ({
                              ...prev,
                              whatsappSameAsPhone: e.target.checked,
                              whatsappCountryCode: e.target.checked
                                ? prev.phoneCountryCode
                                : prev.whatsappCountryCode || prev.phoneCountryCode,
                              whatsappNumber: e.target.checked ? '' : prev.whatsappNumber,
                            }))
                          }
                          className="h-3.5 w-3.5 rounded border-[#E2D9CE] accent-[#1F1B18]"
                        />
                        <span>This phone number is also my WhatsApp number</span>
                      </label>

                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#6E655F]">
                        <input
                          type="checkbox"
                          checked={profileForm.telegramSameAsPhone}
                          onChange={e =>
                            setProfileForm(prev => ({
                              ...prev,
                              telegramSameAsPhone: e.target.checked,
                              telegramMethod: e.target.checked ? 'username' : prev.telegramMethod,
                              telegramValue:
                                e.target.checked && prev.telegramMethod === 'phone'
                                  ? ''
                                  : prev.telegramValue,
                            }))
                          }
                          className="h-3.5 w-3.5 rounded border-[#E2D9CE] accent-[#1F1B18]"
                        />
                        <span>Also receive live Telegram updates on this phone number</span>
                      </label>
                    </div>
                  </div>

                  {!profileForm.whatsappSameAsPhone ? (
                    <div>
                      <label
                        htmlFor="prof-whatsapp"
                        className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                      >
                        WhatsApp Number (for Confirmation)
                      </label>
                      <div className="flex gap-2">
                        <GlideSelect
                          options={countryCodeOptions}
                          value={profileForm.whatsappCountryCode}
                          onChange={code =>
                            setProfileForm(prev => ({ ...prev, whatsappCountryCode: code }))
                          }
                          showTags={false}
                          size="lg"
                          radius={8}
                          menuWidth={170}
                          surfaceColor="#FAF7F2"
                          highlightColor="#EFE9E0"
                          accentColor="#B68D5E"
                          textColor="#1F1B18"
                          ariaLabel="Profile WhatsApp country code"
                          className="w-28 shrink-0"
                        />
                        <input
                          id="prof-whatsapp"
                          type="tel"
                          inputMode="numeric"
                          value={profileForm.whatsappNumber}
                          onChange={e =>
                            setProfileForm(prev => ({
                              ...prev,
                              whatsappNumber: sanitizePhoneDigits(e.target.value),
                            }))
                          }
                          placeholder="3105550199"
                          className="h-11 flex-1 rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-sm text-[#1F1B18] tabular-nums"
                        />
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="prof-telegram"
                      className="mb-1 block text-[11px] font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                    >
                      {profileForm.telegramSameAsPhone
                        ? 'Telegram Username (Optional)'
                        : 'Telegram Username'}
                    </label>
                    <input
                      id="prof-telegram"
                      type="text"
                      value={profileForm.telegramValue}
                      onChange={e =>
                        setProfileForm(prev => ({
                          ...prev,
                          telegramMethod: 'username',
                          telegramValue: e.target.value,
                        }))
                      }
                      placeholder={
                        profileForm.telegramSameAsPhone
                          ? '@camille_laurent (optional)'
                          : '@camille_laurent'
                      }
                      className="h-10 w-full rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-sm text-[#1F1B18]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="h-10 w-full cursor-pointer rounded-lg bg-[#1F1B18] text-xs font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase transition-colors hover:bg-[#352F2B] disabled:opacity-50"
                  >
                    {savingProfile ? 'Saving Profile…' : 'Save Patient Record'}
                  </button>
                </form>
              ) : (
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6E655F]">Phone</dt>
                    <dd className="font-medium text-[#1F1B18] tabular-nums">
                      {profile.phoneCountryCode} {profile.phoneNumber}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6E655F]">WhatsApp (Confirmation)</dt>
                    <dd className="font-medium text-[#4B6B50] tabular-nums">
                      {resolveEffectiveWhatsApp({
                        phoneCountryCode: profile.phoneCountryCode,
                        phoneNumber: profile.phoneNumber,
                        whatsappSameAsPhone: !profile.whatsappNumber,
                        whatsappCountryCode: profile.whatsappCountryCode,
                        whatsappNumber: profile.whatsappNumber,
                      }).display}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6E655F]">Date of Birth</dt>
                    <dd className="font-medium text-[#1F1B18] tabular-nums">
                      {profile.dob} {patientAge !== null ? `(Age ${patientAge})` : ''}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6E655F]">
                      Telegram ({profile.telegramMethod === 'username' ? '@handle' : 'Phone'})
                    </dt>
                    <dd className="font-medium text-[#1F1B18]">{profile.telegramValue}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-[#E2D9CE] pt-3">
                    <dt className="text-[#6E655F]">Total Bookings</dt>
                    <dd className="font-semibold text-[#1F1B18] tabular-nums">{bookings.length}</dd>
                  </div>
                </dl>
              )}
            </div>

            {/* Telegram Bot Connection & Setup Plan */}
            <div className="rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-4 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#B68D5E] uppercase">
                    Telegram Bot Concierge
                  </p>
                  <h2 className="mt-1 font-serif text-xl font-semibold text-[#1F1B18]">
                    @{telegramStatus.botUsername}
                  </h2>
                </div>
                <span className="text-xs font-medium text-[#6E655F]">
                  {telegramStatus.botConfigured ? 'Bot API Active' : 'Deep-Link Ready'}
                </span>
              </div>

              <p className="mt-2.5 text-xs leading-relaxed text-[#6E655F]">
                Open our Telegram concierge to view your private appointments, change timings within
                the 4-hour window using the bottom menu buttons, or chat directly with our studio desk.
              </p>

              <div className="mt-4 flex flex-wrap gap-2.5">
                <a
                  href={buildTelegramBotDeepLink(
                    telegramStatus.botUsername,
                    user.uid.slice(0, 16)
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1F1B18] px-4 text-xs font-semibold tracking-[0.1em] text-[#FAF7F2] uppercase no-underline transition-colors hover:bg-[#352F2B]"
                >
                  <Send className="h-3.5 w-3.5 text-[#B68D5E]" />
                  Connect Telegram Bot
                  <ExternalLink className="h-3 w-3 opacity-75" />
                </a>

                <button
                  type="button"
                  onClick={() => setShowBotPlan(prev => !prev)}
                  className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3.5 text-xs font-semibold tracking-[0.1em] text-[#1F1B18] uppercase transition-colors hover:border-[#B68D5E]"
                >
                  <Info className="h-3.5 w-3.5 text-[#B68D5E]" />
                  {showBotPlan ? 'Hide Setup Details' : 'Concierge Details'}
                </button>
              </div>

              {showBotPlan ? (
                <ol className="mt-4 space-y-2 border-t border-[#E2D9CE] pt-4 text-xs leading-relaxed text-[#6E655F]">
                  <li>
                    <strong className="text-[#1F1B18]">1. Studio Menu &amp; Instant Actions:</strong>{' '}
                    Opening @{telegramStatus.botUsername} displays quick bottom menu buttons for
                    appointments, timing updates, treatments, clinic hours, and direct messaging.
                  </li>
                  <li>
                    <strong className="text-[#1F1B18]">2. Real-Time Calendar Sync:</strong>{' '}
                    Any timing or cancellation change made in Telegram updates your Profile schedule
                    and calendar automatically within the 4-hour window.
                  </li>
                  <li>
                    <strong className="text-[#1F1B18]">3. Direct Concierge Chat:</strong>{' '}
                    Messages sent here or inside Telegram appear in the thread below in real time.
                  </li>
                </ol>
              ) : null}

              <TelegramConciergeChat
                botUsername={telegramStatus.botUsername}
                linkedChatId={linkedTelegramChatId}
                messages={conciergeMessages}
                loading={conciergeMessagesLoading}
                onSendMessage={sendConciergeMessage}
              />
            </div>
          </div>

          {/* Right Column: Interactive Monthly Calendar + 4-Hour Editable Bookings List */}
          <div className="space-y-6 lg:col-span-7">
            {/* Interactive Monthly Calendar */}
            <div className="rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2D9CE] pb-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-[#B68D5E] uppercase">
                    Visit Schedule
                  </p>
                  <h2 className="mt-0.5 font-serif text-2xl font-semibold text-[#1F1B18]">
                    {monthTitle}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {selectedIsoDate ? (
                    <button
                      type="button"
                      onClick={() => setSelectedIsoDate(null)}
                      className="cursor-pointer rounded-lg border border-[#B68D5E] bg-[#FAF7F2] px-3 py-1.5 text-xs font-semibold text-[#1F1B18]"
                    >
                      Show All ({bookings.length})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] text-[#1F1B18] hover:border-[#B68D5E]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    aria-label="Next month"
                    className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] text-[#1F1B18] hover:border-[#B68D5E]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold tracking-[0.12em] text-[#6E655F] uppercase">
                {WEEKDAYS.map((day, idx) => {
                  const isWeekendCol = idx === 0 || idx === 6;
                  return (
                    <div
                      key={day}
                      title={isWeekendCol ? 'Closed Sat & Sun' : undefined}
                      className={`py-1.5 ${isWeekendCol ? 'text-[#6E655F]/40 line-through' : ''}`}
                    >
                      {day}
                    </div>
                  );
                })}
              </div>

              <div className="mt-1 grid grid-cols-7 gap-1.5">
                {calendarGrid.map(cell => {
                  const dayBookings = bookingsByDate.get(cell.isoDate) ?? [];
                  const hasBookings = dayBookings.length > 0;
                  const isSelected = selectedIsoDate === cell.isoDate;
                  const isClosedWeekend =
                    (cell.dayOfWeek === 0 || cell.dayOfWeek === 6) && !hasBookings;

                  return (
                    <button
                      key={cell.isoDate}
                      type="button"
                      disabled={isClosedWeekend}
                      onClick={() =>
                        setSelectedIsoDate(prev => (prev === cell.isoDate ? null : cell.isoDate))
                      }
                      aria-label={`${cell.isoDate}${isClosedWeekend ? ' (Closed)' : hasBookings ? `, ${dayBookings.length} scheduled visit` : ''}`}
                      className={`relative flex h-12 flex-col items-center justify-center rounded-xl border text-xs tabular-nums transition-colors sm:h-14 ${
                        isClosedWeekend
                          ? 'cursor-not-allowed border-transparent bg-[#FAF7F2]/30 text-[#6E655F]/30 line-through'
                          : isSelected
                            ? 'cursor-pointer border-[#1F1B18] bg-[#1F1B18] text-[#FAF7F2]'
                            : hasBookings
                              ? 'cursor-pointer border-[#B68D5E] bg-[#FAF7F2] font-semibold text-[#1F1B18] hover:bg-[#E5DACB]'
                              : cell.inCurrentMonth
                                ? 'cursor-pointer border-[#E2D9CE] bg-[#FAF7F2]/70 text-[#1F1B18] hover:border-[#B68D5E]'
                                : 'cursor-pointer border-transparent bg-transparent text-[#6E655F]/45 hover:bg-[#FAF7F2]/40'
                      }`}
                    >
                      <span>{cell.dayNumber}</span>
                      {hasBookings ? (
                        <span
                          className={`mt-0.5 text-[10px] font-semibold ${
                            isSelected ? 'text-[#B68D5E]' : 'text-[#B68D5E]'
                          }`}
                        >
                          {dayBookings.length} visit{dayBookings.length > 1 ? 's' : ''}
                        </span>
                      ) : cell.isToday && !isClosedWeekend ? (
                        <span className="mt-0.5 text-[9px] tracking-wider uppercase opacity-75">
                          Today
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bookings List with 4-Hour Edit Window */}
            <div className="rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2D9CE] pb-4">
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-[#1F1B18]">
                    {selectedIsoDate
                      ? `Visits on ${selectedIsoDate}`
                      : 'Your Consultation Bookings'}
                  </h2>
                  <p className="mt-1 text-xs text-[#6E655F]">
                    Modifications and cancellations are permitted for 4 hours from the time of
                    booking.
                  </p>
                </div>
                <span className="text-xs font-semibold text-[#1F1B18] tabular-nums">
                  {displayedBookings.length} record{displayedBookings.length === 1 ? '' : 's'}
                </span>
              </div>

              {bookingEditError ? (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-[#9E3B33]/40 bg-[#9E3B33]/10 p-3 text-xs text-[#9E3B33]"
                >
                  {bookingEditError}
                </div>
              ) : null}

              {bookingsLoading ? (
                <div className="py-12">
                  <LatticeLoader
                    status="working"
                    color="#B68D5E"
                    label="Loading consultations"
                    showTimer={false}
                  />
                </div>
              ) : displayedBookings.length === 0 ? (
                <div className="py-12 text-center">
                  <CalendarIcon className="mx-auto h-8 w-8 text-[#B68D5E]" aria-hidden="true" />
                  <h3 className="mt-3 font-serif text-xl font-semibold text-[#1F1B18]">
                    {selectedIsoDate
                      ? 'No consultations on this date'
                      : 'No consultations scheduled yet'}
                  </h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-sm text-[#6E655F]">
                    {selectedIsoDate
                      ? 'Select another highlighted calendar day or view all upcoming consultations.'
                      : 'Reserve your consultation in the booking studio and it will appear here for 4-hour management.'}
                  </p>
                  <button
                    type="button"
                    onClick={selectedIsoDate ? () => setSelectedIsoDate(null) : onBookNewVisit}
                    className="mt-5 inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#1F1B18] px-5 text-xs font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase"
                  >
                    {selectedIsoDate ? 'Show All Bookings' : 'Schedule a Consultation'}
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {displayedBookings.map(booking => {
                    const windowStatus = getRemainingEditWindow(
                      booking.createdAtMs,
                      nowMs,
                      booking.status
                    );
                    const editable = canEditBooking(booking.createdAtMs, nowMs, booking.status);
                    const isEditing = editingBookingId === booking.id;

                    return (
                      <article
                        key={booking.id}
                        className="rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={`inline-flex items-center gap-1 font-semibold tracking-[0.12em] uppercase ${
                                  booking.status === 'cancelled'
                                    ? 'text-[#9E3B33]'
                                    : booking.status === 'confirmed'
                                      ? 'text-[#4B6B50]'
                                      : 'text-[#B68D5E]'
                                }`}
                              >
                                {booking.status === 'cancelled' ? (
                                  <XCircle className="h-3.5 w-3.5" />
                                ) : booking.status === 'confirmed' ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <MessageCircle className="h-3.5 w-3.5" />
                                )}
                                {booking.status === 'cancelled'
                                  ? 'Cancelled'
                                  : booking.status === 'confirmed'
                                    ? 'Confirmed by Team'
                                    : 'Pending WhatsApp Confirmation'}
                              </span>
                              <span aria-hidden="true" className="text-[#6E655F]">
                                ·
                              </span>
                              <span className="inline-flex items-center gap-1 text-[#6E655F] tabular-nums">
                                {editable ? (
                                  <Clock className="h-3.5 w-3.5 text-[#B68D5E]" />
                                ) : (
                                  <Lock className="h-3.5 w-3.5 text-[#6E655F]" />
                                )}
                                {windowStatus.label}
                              </span>
                            </div>

                            <h3 className="mt-1.5 font-serif text-xl font-semibold text-[#1F1B18]">
                              {booking.treatmentName}
                            </h3>
                            <p className="mt-1 text-sm font-medium text-[#1F1B18] tabular-nums">
                              {formatPreferredDateTime(booking.preferredDateTime)}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {editable ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    isEditing
                                      ? setEditingBookingId(null)
                                      : startEditingBooking(booking)
                                  }
                                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[#E2D9CE] bg-[#EFE9E0] px-3 text-xs font-semibold tracking-[0.1em] text-[#1F1B18] uppercase hover:border-[#B68D5E]"
                                >
                                  <Edit3 className="h-3.5 w-3.5 text-[#B68D5E]" />
                                  {isEditing ? 'Close Editor' : 'Edit Visit'}
                                </button>
                                {confirmCancelId === booking.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={savingBookingEdit}
                                      onClick={() => handleCancelBooking(booking.id)}
                                      className="h-9 cursor-pointer rounded-lg bg-[#9E3B33] px-3 text-xs font-semibold text-[#FAF7F2] uppercase"
                                    >
                                      Confirm Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelId(null)}
                                      className="h-9 cursor-pointer rounded-lg border border-[#E2D9CE] px-2.5 text-xs text-[#6E655F]"
                                    >
                                      Keep
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelId(booking.id)}
                                    className="h-9 cursor-pointer rounded-lg border border-[#E2D9CE] px-3 text-xs font-semibold tracking-[0.1em] text-[#9E3B33] uppercase hover:bg-[#9E3B33]/10"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#E2D9CE] pt-3 text-xs text-[#6E655F]">
                          <span className="tabular-nums">
                            WhatsApp:{' '}
                            {
                              resolveEffectiveWhatsApp({
                                phoneCountryCode: booking.phoneCountryCode,
                                phoneNumber: booking.phoneNumber,
                                whatsappSameAsPhone: !booking.whatsappNumber,
                                whatsappCountryCode: booking.whatsappCountryCode,
                                whatsappNumber: booking.whatsappNumber,
                              }).display
                            }
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            Phone: {booking.phoneCountryCode} {booking.phoneNumber}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Telegram ({booking.telegramMethod}): {booking.telegramValue}
                          </span>
                          <span aria-hidden="true">·</span>
                          <a
                            href={buildTelegramBotDeepLink(
                              telegramStatus.botUsername,
                              booking.id
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-[#1F1B18] underline underline-offset-4 hover:text-[#B68D5E]"
                          >
                            <Send className="h-3 w-3 text-[#B68D5E]" />
                            Open in Telegram Bot
                          </a>
                        </div>

                        {!editable && booking.status !== 'cancelled' ? (
                          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-[#6E655F]">
                            <Phone className="h-3.5 w-3.5 text-[#B68D5E]" />
                            4-hour self-edit window ended. Call {CLINIC_CONFIG.phoneDisplay} for
                            concierge rescheduling.
                          </p>
                        ) : null}

                        {/* Inline 4-Hour Booking Editor */}
                        {isEditing && editable ? (
                          <div className="mt-4 space-y-3 rounded-xl border border-[#B68D5E]/50 bg-[#EFE9E0]/60 p-4">
                            <p className="text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
                              Edit Consultation Details
                            </p>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <span className="mb-1 block text-[11px] font-semibold text-[#6E655F] uppercase">
                                  Treatment
                                </span>
                                <GlideSelect
                                  options={treatmentOptions}
                                  value={bookingEditDraft.treatmentId}
                                  onChange={nextId =>
                                    setBookingEditDraft(prev => ({ ...prev, treatmentId: nextId }))
                                  }
                                  showTags={true}
                                  size="lg"
                                  radius={8}
                                  menuWidth={320}
                                  surfaceColor="#FAF7F2"
                                  highlightColor="#EFE9E0"
                                  accentColor="#B68D5E"
                                  textColor="#1F1B18"
                                  ariaLabel="Edit consultation treatment"
                                  className="w-full"
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`edit-time-${booking.id}`}
                                  className="mb-1 block text-[11px] font-semibold text-[#6E655F] uppercase"
                                >
                                  Preferred Date &amp; Time
                                </label>
                                <AtelierDatePicker
                                  id={`edit-time-${booking.id}`}
                                  mode="datetime"
                                  value={bookingEditDraft.preferredDateTime}
                                  onChange={nextDateTime =>
                                    setBookingEditDraft(prev => ({
                                      ...prev,
                                      preferredDateTime: nextDateTime,
                                    }))
                                  }
                                  ariaLabel="Edit preferred date and time"
                                  surfaceColor="#FAF7F2"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div>
                                <span className="mb-1 block text-[11px] font-semibold text-[#6E655F] uppercase">
                                  Phone
                                </span>
                                <div className="flex gap-2">
                                  <GlideSelect
                                    options={countryCodeOptions}
                                    value={bookingEditDraft.phoneCountryCode}
                                    onChange={code =>
                                      setBookingEditDraft(prev => ({
                                        ...prev,
                                        phoneCountryCode: code,
                                      }))
                                    }
                                    showTags={false}
                                    size="lg"
                                    radius={8}
                                    menuWidth={160}
                                    surfaceColor="#FAF7F2"
                                    highlightColor="#EFE9E0"
                                    accentColor="#B68D5E"
                                    textColor="#1F1B18"
                                    ariaLabel="Edit country code"
                                    className="w-28 shrink-0 sm:w-32"
                                  />
                                  <input
                                    type="tel"
                                    value={bookingEditDraft.phoneNumber}
                                    onChange={e =>
                                      setBookingEditDraft(prev => ({
                                        ...prev,
                                        phoneNumber: sanitizePhoneDigits(e.target.value),
                                      }))
                                    }
                                    className="h-11 flex-1 rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-sm text-[#1F1B18] tabular-nums"
                                  />
                                </div>
                                <div className="mt-2 flex flex-col gap-1.5">
                                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#6E655F]">
                                    <input
                                      type="checkbox"
                                      checked={bookingEditDraft.whatsappSameAsPhone}
                                      onChange={e =>
                                        setBookingEditDraft(prev => ({
                                          ...prev,
                                          whatsappSameAsPhone: e.target.checked,
                                          whatsappCountryCode: e.target.checked
                                            ? prev.phoneCountryCode
                                            : prev.whatsappCountryCode || prev.phoneCountryCode,
                                          whatsappNumber: e.target.checked
                                            ? ''
                                            : prev.whatsappNumber,
                                        }))
                                      }
                                      className="h-3.5 w-3.5 rounded border-[#E2D9CE] accent-[#1F1B18]"
                                    />
                                    <span>Phone is also WhatsApp number</span>
                                  </label>

                                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#6E655F]">
                                    <input
                                      type="checkbox"
                                      checked={bookingEditDraft.telegramSameAsPhone}
                                      onChange={e =>
                                        setBookingEditDraft(prev => ({
                                          ...prev,
                                          telegramSameAsPhone: e.target.checked,
                                          telegramMethod: e.target.checked
                                            ? 'username'
                                            : prev.telegramMethod,
                                          telegramValue:
                                            e.target.checked && prev.telegramMethod === 'phone'
                                              ? ''
                                              : prev.telegramValue,
                                        }))
                                      }
                                      className="h-3.5 w-3.5 rounded border-[#E2D9CE] accent-[#1F1B18]"
                                    />
                                    <span>Same as Telegram number</span>
                                  </label>
                                </div>
                              </div>

                              <div>
                                <label
                                  htmlFor={`edit-telegram-${booking.id}`}
                                  className="mb-1 block text-[11px] font-semibold text-[#6E655F] uppercase"
                                >
                                  {bookingEditDraft.telegramSameAsPhone
                                    ? 'Telegram Username (Optional)'
                                    : 'Telegram Username'}
                                </label>
                                <input
                                  id={`edit-telegram-${booking.id}`}
                                  type="text"
                                  value={bookingEditDraft.telegramValue}
                                  onChange={e =>
                                    setBookingEditDraft(prev => ({
                                      ...prev,
                                      telegramMethod: 'username',
                                      telegramValue: e.target.value,
                                    }))
                                  }
                                  placeholder={
                                    bookingEditDraft.telegramSameAsPhone
                                      ? '@username (optional)'
                                      : '@username'
                                  }
                                  className="h-11 w-full rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-sm text-[#1F1B18]"
                                />
                              </div>
                            </div>

                            {!bookingEditDraft.whatsappSameAsPhone ? (
                              <div>
                                <label
                                  htmlFor={`edit-whatsapp-${booking.id}`}
                                  className="mb-1 block text-[11px] font-semibold text-[#6E655F] uppercase"
                                >
                                  WhatsApp Number (for Team Confirmation)
                                </label>
                                <div className="flex gap-2">
                                  <GlideSelect
                                    options={countryCodeOptions}
                                    value={bookingEditDraft.whatsappCountryCode}
                                    onChange={code =>
                                      setBookingEditDraft(prev => ({
                                        ...prev,
                                        whatsappCountryCode: code,
                                      }))
                                    }
                                    showTags={false}
                                    size="lg"
                                    radius={8}
                                    menuWidth={160}
                                    surfaceColor="#FAF7F2"
                                    highlightColor="#EFE9E0"
                                    accentColor="#B68D5E"
                                    textColor="#1F1B18"
                                    ariaLabel="Edit WhatsApp country code"
                                    className="w-28 shrink-0 sm:w-32"
                                  />
                                  <input
                                    id={`edit-whatsapp-${booking.id}`}
                                    type="tel"
                                    inputMode="numeric"
                                    value={bookingEditDraft.whatsappNumber}
                                    onChange={e =>
                                      setBookingEditDraft(prev => ({
                                        ...prev,
                                        whatsappNumber: sanitizePhoneDigits(e.target.value),
                                      }))
                                    }
                                    placeholder="3105550199"
                                    className="h-11 flex-1 rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-sm text-[#1F1B18] tabular-nums"
                                  />
                                </div>
                              </div>
                            ) : null}

                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingBookingId(null)}
                                className="h-9 cursor-pointer rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-4 text-xs font-semibold text-[#6E655F] uppercase"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={savingBookingEdit}
                                onClick={() => handleSaveBookingEdit(booking.id)}
                                className="h-9 cursor-pointer rounded-lg bg-[#1F1B18] px-4 text-xs font-semibold text-[#FAF7F2] uppercase disabled:opacity-50"
                              >
                                {savingBookingEdit ? 'Saving…' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProfileSection;
