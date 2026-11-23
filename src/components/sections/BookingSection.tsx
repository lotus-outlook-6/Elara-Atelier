/**
 * Appointment Booking, Messaging Consent, Clinic Storefront Photo & Map section.
 * Orders fields as Full Name -> Phone (For Call Purposes) -> Checkbox-only formal WhatsApp/Telegram consent ->
 * Date of Birth (18+) -> Treatment Selection & Preferred Date/Time -> Slide to Confirm Appointment.
 * Places 4-Hour Edits, WhatsApp Confirmation & Adults 18+ in a separate card below shown only when signed in.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  User,
} from 'lucide-react';
import { CLINIC_CONFIG, COUNTRY_CODES } from '../../config/clinicConfig';
import { useAuth } from '../../context/AuthContext';
import { TREATMENTS } from '../../data/clinicData';
import { CONCIERGE_SUITE_MEDIA } from '../../data/clinicMedia';
import {
  buildTelegramBotDeepLink,
  buildWhatsAppBookingUrl,
  calculateAge,
  formatPreferredDateTime,
  getTreatmentById,
  resolveEffectiveTelegram,
  resolveEffectiveWhatsApp,
  sanitizeNameInput,
  sanitizePhoneDigits,
  validateBookingForm,
  type BookingFormValues,
} from '../../utils/booking';
import AtelierDatePicker from '../reactbits/AtelierDatePicker';
import GlideSelect, { type GlideSelectOption } from '../reactbits/GlideSelect';
import LatticeLoader from '../reactbits/LatticeLoader';
import SlideCommit from '../reactbits/SlideCommit';
import StudioMap from '../ui/StudioMap';

export interface BookingSectionProps {
  selectedTreatmentId: string;
  onSelectTreatment: (treatmentId: string) => void;
  onBookingConfirmed: (summary: { patientName: string; treatmentName: string }) => void;
  onOpenAuth: () => void;
  onOpenProfile: () => void;
}

const DEFAULT_DATETIME = '2026-11-18T11:00';

/**
 * Appointment reservation and clinic location section.
 * Inputs: selectedTreatmentId, onSelectTreatment, onBookingConfirmed, onOpenAuth, onOpenProfile.
 * Output: Rendered booking grid and signed-in policy card.
 * Errors: Displays inline validation or submission error messages cleanly.
 */
export const BookingSection: React.FC<BookingSectionProps> = ({
  selectedTreatmentId,
  onSelectTreatment,
  onBookingConfirmed,
  onOpenAuth,
  onOpenProfile,
}) => {
  const { user, profile, telegramStatus, createBookingRecord } = useAuth();

  const [values, setValues] = useState<BookingFormValues>({
    fullName: '',
    phoneCountryCode: '+1',
    phoneNumber: '',
    messagingConsent: true,
    whatsappSameAsPhone: true,
    whatsappCountryCode: '+1',
    whatsappNumber: '',
    dob: '',
    treatmentId: selectedTreatmentId || TREATMENTS[0].id,
    preferredDateTime: DEFAULT_DATETIME,
    telegramSameAsPhone: true,
    telegramMethod: 'phone',
    telegramValue: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof BookingFormValues, string>>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'confirmed'>('idle');
  const [confirmedDetails, setConfirmedDetails] = useState<BookingFormValues | null>(null);
  const [confirmedMeta, setConfirmedMeta] = useState<{
    bookingId?: string;
    savedToProfile: boolean;
    telegramDeepLink: string;
    serverDispatched: boolean;
    status?: 'requested' | 'confirmed' | 'cancelled';
  } | null>(null);
  const [savingGuestDraft, setSavingGuestDraft] = useState(false);
  const [saveGuestError, setSaveGuestError] = useState<string | null>(null);

  // Listen for live Telegram bot reschedules on guest-confirmed bookings
  useEffect(() => {
    const activeBookingId = confirmedMeta?.bookingId;
    if (status !== 'confirmed' || !activeBookingId || user || typeof EventSource === 'undefined') {
      return undefined;
    }
    const source = new EventSource('/api/telegram/events');
    source.onmessage = event => {
      try {
        const parsed = JSON.parse(event.data) as {
          type?: string;
          booking?: {
            id?: string;
            preferredDateTime?: string;
            status?: 'requested' | 'confirmed' | 'cancelled';
          };
        };
        if (parsed.type === 'booking_updated' && parsed.booking?.id === activeBookingId) {
          if (parsed.booking.preferredDateTime) {
            setConfirmedDetails(prev =>
              prev ? { ...prev, preferredDateTime: parsed.booking!.preferredDateTime! } : prev
            );
          }
          if (parsed.booking.status) {
            setConfirmedMeta(prev =>
              prev ? { ...prev, status: parsed.booking!.status } : prev
            );
          }
        }
      } catch {
        // Ignore malformed SSE heartbeats
      }
    };
    return () => {
      source.close();
    };
  }, [status, confirmedMeta?.bookingId, user]);

  const [sliderWidth, setSliderWidth] = useState<number>(320);
  const sliderContainerRef = useRef<HTMLDivElement>(null);

  // Pre-fill empty booking fields from signed-in patient profile
  useEffect(() => {
    if (!profile) return;
    setValues(prev => ({
      ...prev,
      fullName: prev.fullName || profile.fullName,
      phoneCountryCode: prev.phoneNumber ? prev.phoneCountryCode : profile.phoneCountryCode,
      phoneNumber: prev.phoneNumber || profile.phoneNumber,
      dob: prev.dob || profile.dob,
    }));
  }, [profile]);

  useEffect(() => {
    if (selectedTreatmentId && selectedTreatmentId !== values.treatmentId) {
      setValues(prev => ({ ...prev, treatmentId: selectedTreatmentId }));
      setErrors(prev => ({ ...prev, treatmentId: undefined }));
      if (status === 'confirmed') {
        setStatus('idle');
      }
    }
  }, [selectedTreatmentId, values.treatmentId, status]);

  useEffect(() => {
    const el = sliderContainerRef.current;
    if (!el) return undefined;

    const updateWidth = () => {
      const next = Math.max(220, Math.min(720, Math.floor(el.clientWidth)));
      setSliderWidth(next);
    };
    updateWidth();

    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [status]);

  const treatmentOptions: GlideSelectOption[] = useMemo(
    () =>
      TREATMENTS.map(item => ({
        value: item.id,
        label: item.name,
        tag: item.startingPrice,
      })),
    []
  );

  const countryCodeOptions: GlideSelectOption[] = useMemo(
    () => COUNTRY_CODES.map(opt => ({ value: opt.code, label: opt.label })),
    []
  );

  const computedAge = values.dob ? calculateAge(values.dob) : null;
  const isUnderage = computedAge !== null && computedAge < CLINIC_CONFIG.minPatientAge;

  /**
   * Update a single booking field and clear its inline validation error.
   * Inputs: field key and updated value.
   */
  const updateField = <K extends keyof BookingFormValues>(field: K, value: BookingFormValues[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  /**
   * Toggle whether the patient grants permission to be contacted via WhatsApp or Telegram
   * on their phone number; when unchecked, only phone calls are permitted.
   * Inputs: checked boolean from the checkbox input element.
   */
  const handleMessagingConsentChange = (checked: boolean) => {
    setValues(prev => ({
      ...prev,
      messagingConsent: checked,
      whatsappSameAsPhone: checked,
      whatsappCountryCode: prev.phoneCountryCode,
      whatsappNumber: '',
      telegramSameAsPhone: true,
      telegramMethod: 'phone',
      telegramValue: '',
    }));
    setErrors(prev => ({ ...prev, whatsappNumber: undefined, telegramValue: undefined }));
  };

  /**
   * Validate all fields (letters-only name, country code + phone, 18+ DOB, treatment, weekday slot)
   * and persist to Firestore when signed in or submit to team notification API for guests.
   */
  const handleSlideConfirm = async (): Promise<void> => {
    const validation = validateBookingForm(values);
    if (!validation.valid) {
      setErrors(validation.errors);
      throw new Error('Please check the highlighted booking fields.');
    }

    setErrors({});
    setStatus('submitting');
    setSaveGuestError(null);

    const hasMessagingConsent = values.messagingConsent !== false;
    const chosenTreatment = getTreatmentById(values.treatmentId);
    const effectiveTelegram = resolveEffectiveTelegram({
      phoneCountryCode: values.phoneCountryCode,
      phoneNumber: values.phoneNumber,
      telegramSameAsPhone: true,
      telegramMethod: 'phone',
      telegramValue: '',
    });
    const effectiveWhatsApp = hasMessagingConsent
      ? resolveEffectiveWhatsApp({
          phoneCountryCode: values.phoneCountryCode,
          phoneNumber: values.phoneNumber,
          whatsappSameAsPhone: true,
        })
      : { countryCode: values.phoneCountryCode, number: '', fullDigits: '', display: 'Phone Call Only' };

    const snapshot: BookingFormValues = {
      ...values,
      messagingConsent: hasMessagingConsent,
      whatsappSameAsPhone: hasMessagingConsent,
      whatsappCountryCode: effectiveWhatsApp.countryCode,
      whatsappNumber: effectiveWhatsApp.number,
      telegramSameAsPhone: true,
      telegramMethod: effectiveTelegram.method,
      telegramValue: effectiveTelegram.value,
    };

    let savedToProfile = false;
    let telegramDeepLink = buildTelegramBotDeepLink(
      telegramStatus.botUsername,
      snapshot.treatmentId
    );
    let serverDispatched = false;
    let confirmedBookingId = '';

    if (user) {
      try {
        const result = await createBookingRecord(snapshot);
        savedToProfile = true;
        confirmedBookingId = result.bookingId;
        telegramDeepLink = result.telegramDeepLink;
        serverDispatched = result.serverDispatched;
      } catch (err) {
        setStatus('idle');
        setSaveGuestError(err instanceof Error ? err.message : 'Could not save booking.');
        throw err;
      }
    } else {
      confirmedBookingId = `guest_${Date.now()}`;
      await new Promise<void>(resolve => {
        window.setTimeout(() => {
          resolve();
        }, CLINIC_CONFIG.submissionDelayMs);
      });
      try {
        const resp = await fetch('/api/telegram/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: confirmedBookingId,
            fullName: snapshot.fullName.trim(),
            phoneCountryCode: snapshot.phoneCountryCode.trim(),
            phoneNumber: snapshot.phoneNumber.replace(/\D/g, ''),
            messagingConsent: hasMessagingConsent,
            whatsappCountryCode: hasMessagingConsent ? effectiveWhatsApp.countryCode : '',
            whatsappNumber: hasMessagingConsent ? effectiveWhatsApp.number : '',
            phone: `${snapshot.phoneCountryCode} ${snapshot.phoneNumber}`,
            treatmentId: snapshot.treatmentId,
            treatmentName: chosenTreatment?.name || 'Private Consultation',
            preferredDateTime: snapshot.preferredDateTime,
            telegramMethod: snapshot.telegramMethod,
            telegramValue: snapshot.telegramValue,
            createdAtMs: Date.now(),
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.deepLink) telegramDeepLink = data.deepLink;
          serverDispatched = Boolean(data.sent);
        }
      } catch {
        // Deep-link fallback stays ready
      }
    }

    setConfirmedDetails(snapshot);
    setConfirmedMeta({
      bookingId: confirmedBookingId,
      savedToProfile,
      telegramDeepLink,
      serverDispatched,
    });
    setStatus('confirmed');
    onBookingConfirmed({
      patientName: snapshot.fullName.trim(),
      treatmentName: chosenTreatment?.name || 'Private Consultation',
    });
  };

  /**
   * Save a guest-confirmed booking into the user's Firestore Profile right after signing in.
   */
  const handleSaveConfirmedToProfile = async () => {
    if (!confirmedDetails || !user) return;
    setSavingGuestDraft(true);
    setSaveGuestError(null);
    try {
      const result = await createBookingRecord(confirmedDetails);
      setConfirmedMeta(prev => ({
        bookingId: result.bookingId,
        savedToProfile: true,
        telegramDeepLink: result.telegramDeepLink,
        serverDispatched: result.serverDispatched,
        status: prev?.status,
      }));
    } catch (err) {
      setSaveGuestError(err instanceof Error ? err.message : 'Unable to save to profile.');
    } finally {
      setSavingGuestDraft(false);
    }
  };

  const activeTreatment = getTreatmentById((confirmedDetails ?? values).treatmentId);
  const whatsappUrl = confirmedDetails
    ? buildWhatsAppBookingUrl(
        CLINIC_CONFIG.whatsappNumber,
        confirmedDetails,
        activeTreatment?.name
      )
    : '';
  const confirmedAllowsMessaging = confirmedDetails?.messagingConsent !== false;

  return (
    <section id="booking" className="bg-[#FAF7F2] py-16 sm:py-20 md:py-24 2xl:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-8 2xl:max-w-[1440px]">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold tracking-[0.22em] text-[#B68D5E] uppercase">
              Appointments
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-[1.12] font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
              Book Your Visit
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#6E655F]">
              Choose your treatment and preferred time below. Our team will reach out to confirm
              your visit.
            </p>
          </div>

          <div className="inline-flex items-center gap-2.5 self-start rounded-xl border border-[#E2D9CE] bg-[#EFE9E0] px-4 py-2.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase lg:self-auto">
            <Clock className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
            <span>{CLINIC_CONFIG.hoursSummary}</span>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12 2xl:gap-10">
          {/* Left Column: Consultation Request Card */}
          <div className="flex lg:col-span-7">
            <div className="flex h-full w-full flex-col rounded-[20px] border border-[#E2D9CE] bg-[#EFE9E0] p-4 text-[#1F1B18] sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2D9CE] pb-4 sm:flex-nowrap">
                <div>
                  <h3 className="font-serif text-2xl font-semibold text-[#1F1B18]">
                    Consultation Request
                  </h3>
                </div>
                {!user ? (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 text-xs font-semibold tracking-[0.1em] whitespace-nowrap text-[#1F1B18] uppercase transition-colors hover:border-[#B68D5E]"
                  >
                    <User className="h-3.5 w-3.5 text-[#B68D5E]" />
                    Sign In to Sync Profile
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenProfile}
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[#B68D5E]/60 bg-[#FAF7F2] px-3 text-xs font-semibold tracking-[0.1em] text-[#1F1B18] uppercase transition-colors hover:bg-[#E5DACB]"
                  >
                    <Calendar className="h-3.5 w-3.5 text-[#B68D5E]" />
                    View My Calendar
                  </button>
                )}
              </div>

              {status === 'submitting' ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
                  <LatticeLoader
                    status="working"
                    pattern="orbit"
                    grid={3}
                    shape="round"
                    color="#B68D5E"
                    cellSize={8}
                    gap={4}
                    fontSize={15}
                    label="Saving your request"
                    doneLabel="Confirmed"
                    showTimer={true}
                    className="text-[#1F1B18]"
                  />
                  <p className="max-w-sm text-sm text-[#6E655F]">
                    Sending your appointment details for {activeTreatment?.name}.
                  </p>
                </div>
              ) : status === 'confirmed' && confirmedDetails ? (
                <div className="mt-6 flex flex-1 flex-col justify-between gap-6">
                  <div className="rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-6">
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 shrink-0 text-[#4B6B50]"
                        aria-hidden="true"
                      />
                      <div>
                        <h4 className="font-serif text-2xl font-semibold text-[#1F1B18]">
                          {confirmedMeta?.status === 'cancelled'
                            ? 'Appointment Cancelled'
                            : confirmedMeta?.status === 'confirmed'
                              ? 'Appointment Confirmed'
                              : 'Appointment Request Received'}
                        </h4>
                        <p className="mt-1 text-sm leading-relaxed text-[#6E655F]">
                          {confirmedMeta?.status === 'cancelled'
                            ? 'This visit has been cancelled.'
                            : confirmedMeta?.status === 'confirmed'
                              ? 'Our clinic team has confirmed your consultation.'
                              : confirmedAllowsMessaging
                                ? `Someone from our clinic team will confirm your visit via WhatsApp or Telegram (${confirmedDetails.phoneCountryCode} ${confirmedDetails.phoneNumber}) shortly.${
                                    confirmedMeta?.savedToProfile
                                      ? ' Saved to your Profile & Calendar for 4-hour self-editing.'
                                      : ''
                                  }`
                                : `Our clinic team will confirm your visit by phone call at ${confirmedDetails.phoneCountryCode} ${confirmedDetails.phoneNumber}.${
                                    confirmedMeta?.savedToProfile
                                      ? ' Saved to your Profile & Calendar for 4-hour self-editing.'
                                      : ''
                                  }`}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-5 space-y-2.5 border-t border-[#E2D9CE] pt-4 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#6E655F]">Patient</dt>
                        <dd className="font-medium text-[#1F1B18]">{confirmedDetails.fullName}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#6E655F]">Phone (Call Purposes)</dt>
                        <dd className="font-medium text-[#1F1B18] tabular-nums">
                          {confirmedDetails.phoneCountryCode} {confirmedDetails.phoneNumber}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#6E655F]">Contact Preference</dt>
                        <dd className="font-semibold text-[#4B6B50]">
                          {confirmedAllowsMessaging
                            ? 'WhatsApp / Telegram & Call Permitted'
                            : 'Phone Call Only'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#6E655F]">Treatment</dt>
                        <dd className="text-right font-medium text-[#1F1B18]">
                          {activeTreatment?.name}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-[#6E655F]">Requested Time</dt>
                        <dd className="text-right font-medium text-[#1F1B18] tabular-nums">
                          {formatPreferredDateTime(confirmedDetails.preferredDateTime)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  {saveGuestError ? (
                    <p className="text-xs text-[#9E3B33]" role="alert">
                      {saveGuestError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3.5">
                    {confirmedAllowsMessaging ? (
                      <>
                        <a
                          href={confirmedMeta?.telegramDeepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#1F1B18] bg-[#1F1B18] px-5 text-sm font-medium text-[#FAF7F2] no-underline transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#352F2B] active:scale-[0.99] sm:w-auto"
                        >
                          <Send className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                          Open Telegram Bot (@{telegramStatus.botUsername})
                        </a>

                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-5 text-sm font-medium text-[#1F1B18] no-underline transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#B68D5E] hover:bg-[#E5DACB]/40 active:scale-[0.99] sm:w-auto"
                        >
                          <MessageCircle className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                          Send via WhatsApp
                        </a>
                      </>
                    ) : null}

                    {confirmedMeta?.savedToProfile ? (
                      <button
                        type="button"
                        onClick={onOpenProfile}
                        className="cursor-pointer rounded-[10px] border border-[#B68D5E] bg-[#FAF7F2] px-4 py-2.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase transition-colors hover:bg-[#E5DACB]"
                      >
                        View in Profile Calendar
                      </button>
                    ) : user ? (
                      <button
                        type="button"
                        disabled={savingGuestDraft}
                        onClick={handleSaveConfirmedToProfile}
                        className="cursor-pointer rounded-[10px] border border-[#B68D5E] bg-[#FAF7F2] px-4 py-2.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase transition-colors hover:bg-[#E5DACB]"
                      >
                        {savingGuestDraft ? 'Saving…' : 'Save Visit to Profile'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenAuth}
                        className="cursor-pointer rounded-[10px] border border-[#B68D5E] bg-[#FAF7F2] px-4 py-2.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase transition-colors hover:bg-[#E5DACB]"
                      >
                        Sign In to Save to Profile
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setStatus('idle')}
                      className="cursor-pointer bg-transparent px-2 py-2 text-xs font-semibold tracking-[0.14em] text-[#6E655F] uppercase underline underline-offset-4 transition-colors hover:text-[#1F1B18]"
                    >
                      New Request
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  className="mt-6 flex flex-1 flex-col justify-between gap-5"
                  onSubmit={e => e.preventDefault()}
                  noValidate
                >
                  <div className="space-y-5 text-left">
                    {saveGuestError ? (
                      <p
                        className="rounded-xl border border-[#9E3B33]/40 bg-[#9E3B33]/10 p-3 text-xs text-[#9E3B33]"
                        role="alert"
                      >
                        {saveGuestError}
                      </p>
                    ) : null}

                    {/* 1. Full Name */}
                    <div>
                      <label
                        htmlFor="booking-full-name"
                        className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase"
                      >
                        Full Name
                      </label>
                      <input
                        id="booking-full-name"
                        type="text"
                        autoComplete="name"
                        value={values.fullName}
                        onChange={e => {
                          const hadDigits = /[0-9]/.test(e.target.value);
                          updateField('fullName', sanitizeNameInput(e.target.value));
                          if (hadDigits) {
                            setErrors(prev => ({
                              ...prev,
                              fullName: 'Numbers are not permitted in the Full Name field.',
                            }));
                          }
                        }}
                        aria-invalid={Boolean(errors.fullName)}
                        className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-3.5 text-sm text-[#1F1B18] placeholder-[#6E655F]/60 outline-none transition-colors focus:border-[#B68D5E]"
                      />
                      {errors.fullName ? (
                        <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                          {errors.fullName}
                        </p>
                      ) : null}
                    </div>

                    {/* 2. Phone Number (For Call Purposes) + Checkbox-Only Formal Messaging Consent */}
                    <div>
                      <label
                        htmlFor="booking-phone"
                        className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase"
                      >
                        Phone Number (For Call Purposes)
                      </label>
                      <div className="flex gap-2 sm:gap-2.5">
                        <GlideSelect
                          options={countryCodeOptions}
                          value={values.phoneCountryCode}
                          onChange={code => updateField('phoneCountryCode', code)}
                          showTags={false}
                          size="lg"
                          radius={10}
                          menuWidth={170}
                          surfaceColor="#FAF7F2"
                          highlightColor="#EFE9E0"
                          accentColor="#B68D5E"
                          textColor="#1F1B18"
                          ariaLabel="Booking phone country code"
                          className="w-28 shrink-0 sm:w-36"
                        />
                        <input
                          id="booking-phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          value={values.phoneNumber}
                          onChange={e =>
                            updateField('phoneNumber', sanitizePhoneDigits(e.target.value))
                          }
                          aria-invalid={Boolean(errors.phoneNumber)}
                          className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-3.5 text-sm text-[#1F1B18] placeholder-[#6E655F]/60 tabular-nums outline-none transition-colors focus:border-[#B68D5E]"
                        />
                      </div>

                      {errors.phoneNumber ? (
                        <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                          {errors.phoneNumber}
                        </p>
                      ) : null}

                      {/* Single formal consent box: checked by default; ONLY clicking the checkbox input toggles it */}
                      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] px-3 py-2.5">
                        <input
                          id="booking-messaging-consent"
                          type="checkbox"
                          checked={values.messagingConsent !== false}
                          onChange={e => handleMessagingConsentChange(e.target.checked)}
                          aria-label="Allow Elara Atelier to contact me via WhatsApp or Telegram at this number"
                          className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#E2D9CE] accent-[#1F1B18]"
                        />
                        <span
                          data-testid="messaging-consent-text"
                          className="text-[11px] leading-normal text-[#6E655F] sm:whitespace-nowrap"
                        >
                          I formally grant permission for Elara Atelier WhatsApp or Telegram contact
                          (else call only).
                        </span>
                      </div>
                    </div>

                    {/* 3. Date of Birth (18+) placed below Phone Number */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label
                          htmlFor="booking-dob"
                          className="text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase"
                        >
                          Date of Birth (18+)
                        </label>
                        {computedAge !== null ? (
                          <span
                            className={`text-xs font-medium tabular-nums ${
                              isUnderage ? 'text-[#9E3B33]' : 'text-[#4B6B50]'
                            }`}
                          >
                            Age {computedAge}
                          </span>
                        ) : null}
                      </div>
                      <AtelierDatePicker
                        id="booking-dob"
                        mode="date"
                        value={values.dob}
                        onChange={nextDob => updateField('dob', nextDob)}
                        placeholder="YYYY-MM-DD"
                        ariaLabel="Date of Birth (18+)"
                        ariaInvalid={Boolean(errors.dob) || isUnderage}
                        defaultOpenYear={1995}
                        surfaceColor="#FAF7F2"
                      />
                      {isUnderage ? (
                        <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                          Patients must be at least 18 years old to schedule a studio visit.
                        </p>
                      ) : errors.dob ? (
                        <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                          {errors.dob}
                        </p>
                      ) : null}
                    </div>

                    {/* 4. Treatment & Preferred Date/Time */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase">
                          Treatment Selection
                        </span>
                        <GlideSelect
                          options={treatmentOptions}
                          value={values.treatmentId}
                          onChange={nextId => {
                            updateField('treatmentId', nextId);
                            onSelectTreatment(nextId);
                          }}
                          placeholder="Select treatment…"
                          showTags={true}
                          size="lg"
                          radius={10}
                          menuWidth={340}
                          surfaceColor="#FAF7F2"
                          highlightColor="#EFE9E0"
                          accentColor="#B68D5E"
                          textColor="#1F1B18"
                          ariaLabel="Treatment Selection"
                          className="w-full"
                        />
                        {errors.treatmentId ? (
                          <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                            {errors.treatmentId}
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label
                          htmlFor="booking-datetime"
                          className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase"
                        >
                          Preferred Date &amp; Time
                        </label>
                        <AtelierDatePicker
                          id="booking-datetime"
                          mode="datetime"
                          value={values.preferredDateTime}
                          onChange={nextDateTime => updateField('preferredDateTime', nextDateTime)}
                          ariaLabel="Preferred Date & Time"
                          ariaInvalid={Boolean(errors.preferredDateTime)}
                          surfaceColor="#FAF7F2"
                        />
                        {errors.preferredDateTime ? (
                          <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                            {errors.preferredDateTime}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* 5. Confirm Appointment Action */}
                  <div className="rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold tracking-[0.14em] text-[#1F1B18] uppercase">
                        Confirm Your Booking
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#6E655F]">
                        <Clock className="h-3.5 w-3.5 text-[#B68D5E]" />
                        {CLINIC_CONFIG.hoursSummary}
                      </span>
                    </div>
                    <div ref={sliderContainerRef}>
                      <SlideCommit
                        label="Slide to Confirm"
                        doneLabel="Request Logged"
                        errorLabel="Check Fields Above"
                        onConfirm={handleSlideConfirm}
                        trackColor="#1F1B18"
                        handleColor="#FAF7F2"
                        successColor="#4B6B50"
                        dangerColor="#9E3B33"
                        width={sliderWidth}
                        height={56}
                        radius={12}
                        holdMs={900}
                      />
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Right Column: Clinic Exterior Storefront Photo, Map & Hours Card */}
          <aside className="flex lg:col-span-5">
            <div className="flex w-full flex-col justify-between gap-4 rounded-[20px] border border-[#E2D9CE] bg-[#EFE9E0] p-4 sm:p-7">
              <div className="space-y-3.5">
                <div className="overflow-hidden rounded-xl border border-[#E2D9CE] bg-[#E5DACB]">
                  <img
                    src={CONCIERGE_SUITE_MEDIA.src}
                    alt={CONCIERGE_SUITE_MEDIA.alt}
                    referrerPolicy="no-referrer"
                    className={`block h-36 w-full object-cover sm:h-40 ${CONCIERGE_SUITE_MEDIA.objectPosition ?? 'object-center'}`}
                  />
                </div>

                <StudioMap />

                <div className="space-y-3.5">
                  <div className="flex items-start gap-3.5">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#B68D5E]" aria-hidden="true" />
                    <div>
                      <h3 className="text-xs font-semibold tracking-[0.16em] text-[#1F1B18] uppercase">
                        Clinic Address
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#6E655F]">
                        {CLINIC_CONFIG.addressLine1}
                        <br />
                        {CLINIC_CONFIG.addressLine2}
                      </p>
                      <a
                        href={CLINIC_CONFIG.mapsExternalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[#B68D5E] underline underline-offset-4 transition-colors hover:text-[#1F1B18]"
                      >
                        Open in Google Maps
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 border-t border-[#E2D9CE] pt-3.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#B68D5E]" aria-hidden="true" />
                    <div className="w-full">
                      <h3 className="text-xs font-semibold tracking-[0.16em] text-[#1F1B18] uppercase">
                        Opening Hours
                      </h3>
                      <p className="mt-1 text-sm font-medium text-[#1F1B18]">
                        {CLINIC_CONFIG.hoursSummary}
                      </p>
                      <ul className="mt-1.5 space-y-1 text-xs text-[#6E655F]">
                        {CLINIC_CONFIG.hoursDetail.map(row => (
                          <li key={row.days} className="flex justify-between gap-3">
                            <span>{row.days}</span>
                            <span className="tabular-nums">{row.time}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#E2D9CE] pt-4">
                <a
                  href={CLINIC_CONFIG.phoneHref}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-5 text-sm font-medium text-[#1F1B18] no-underline transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#B68D5E] hover:bg-[#E5DACB]/35 active:scale-[0.99]"
                >
                  <Phone className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                  Call Clinic · {CLINIC_CONFIG.phoneDisplay}
                </a>
              </div>
            </div>
          </aside>
        </div>

        {/* Separate Policy Card Below Booking Card (Visible Only When Signed In) */}
        {user ? (
          <div
            data-testid="signed-in-booking-policies"
            className="mt-6 grid grid-cols-1 gap-4 rounded-[20px] border border-[#E2D9CE] bg-[#EFE9E0] p-5 text-xs text-[#6E655F] sm:grid-cols-3 sm:p-6"
          >
            <div>
              <p className="font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
                4-Hour Edits
              </p>
              <p className="mt-1">Update or cancel your booking up to 4 hours after submitting.</p>
            </div>
            <div>
              <p className="font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
                WhatsApp Confirmation
              </p>
              <p className="mt-1">Confirmed by our clinic team via message or direct call.</p>
            </div>
            <div>
              <p className="font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
                Adults 18+
              </p>
              <p className="mt-1">For adults aged 18 and older.</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default BookingSection;
