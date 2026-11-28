/**
 * Popup Consultation Request modal for booking a new studio visit or re-booking a cancelled/past visit
 * directly from the Patient Profile page without leaving the calendar view.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Info, MessageCircle, X } from 'lucide-react';
import { CLINIC_CONFIG, COUNTRY_CODES } from '../../config/clinicConfig';
import { useAuth, type BookingRecord } from '../../context/AuthContext';
import { TREATMENTS } from '../../data/clinicData';
import {
  buildWhatsAppBookingUrl,
  calculateAge,
  formatPreferredDateTime,
  getDefaultUpcomingBookingDateTime,
  getTreatmentById,
  isPastCalendarDate,
  isStudioWeekday,
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

export interface BookingModalProps {
  open: boolean;
  mode: 'new' | 'rebook';
  prefillBooking?: BookingRecord | null;
  initialIsoDate?: string | null;
  onClose: () => void;
  onBooked: (summary: { patientName: string; treatmentName: string; isRebook: boolean }) => void;
}

/**
 * Build initial form values from either a cancelled/past booking being re-booked,
 * an explicitly selected calendar weekday, or the signed-in patient's saved Firestore profile.
 * Inputs: mode ('new' | 'rebook'), optional prefillBooking, optional profile defaults, optional initialIsoDate.
 * Output: BookingFormValues ready for the modal form.
 * Errors: None.
 */
function buildInitialModalValues(
  mode: 'new' | 'rebook',
  prefillBooking: BookingRecord | null | undefined,
  profile: {
    fullName: string;
    phoneCountryCode: string;
    phoneNumber: string;
    dob: string;
  } | null,
  initialIsoDate?: string | null
): BookingFormValues {
  const hasValidInitialDate =
    Boolean(initialIsoDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(initialIsoDate as string) &&
    isStudioWeekday(initialIsoDate as string) &&
    !isPastCalendarDate(initialIsoDate as string);

  const defaultDateTime =
    mode === 'new' && hasValidInitialDate
      ? `${initialIsoDate}T11:00`
      : getDefaultUpcomingBookingDateTime();

  if (mode === 'rebook' && prefillBooking) {
    const allowsMessaging =
      prefillBooking.whatsappNumber !== undefined
        ? Boolean(prefillBooking.whatsappNumber)
        : true;
    return {
      fullName: prefillBooking.fullName || profile?.fullName || '',
      phoneCountryCode: prefillBooking.phoneCountryCode || profile?.phoneCountryCode || '+1',
      phoneNumber: prefillBooking.phoneNumber || profile?.phoneNumber || '',
      messagingConsent: allowsMessaging,
      whatsappSameAsPhone: allowsMessaging,
      whatsappCountryCode: prefillBooking.phoneCountryCode || profile?.phoneCountryCode || '+1',
      whatsappNumber: '',
      dob: prefillBooking.dob || profile?.dob || '',
      treatmentId: prefillBooking.treatmentId || TREATMENTS[0].id,
      preferredDateTime: defaultDateTime,
    };
  }

  return {
    fullName: profile?.fullName || '',
    phoneCountryCode: profile?.phoneCountryCode || '+1',
    phoneNumber: profile?.phoneNumber || '',
    messagingConsent: true,
    whatsappSameAsPhone: true,
    whatsappCountryCode: profile?.phoneCountryCode || '+1',
    whatsappNumber: '',
    dob: profile?.dob || '',
    treatmentId: TREATMENTS[0].id,
    preferredDateTime: defaultDateTime,
  };
}

/**
 * Accessible Consultation Request popup dialog rendered over the Patient Profile page.
 * Inputs: open, mode, prefillBooking, initialIsoDate, onClose, onBooked.
 * Output: Rendered modal dialog or null when closed.
 * Errors: Displays inline validation and submission error messages inside the dialog.
 */
export const BookingModal: React.FC<BookingModalProps> = ({
  open,
  mode,
  prefillBooking,
  initialIsoDate,
  onClose,
  onBooked,
}) => {
  const { profile, createBookingRecord } = useAuth();
  const [values, setValues] = useState<BookingFormValues>(() =>
    buildInitialModalValues(mode, prefillBooking, profile, initialIsoDate)
  );
  const [errors, setErrors] = useState<Partial<Record<keyof BookingFormValues, string>>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'confirmed'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedDetails, setConfirmedDetails] = useState<BookingFormValues | null>(null);

  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const [sliderWidth, setSliderWidth] = useState<number>(320);

  // Reset form fields cleanly whenever the modal opens or target prefill/calendar date changes
  useEffect(() => {
    if (!open) return;
    setValues(buildInitialModalValues(mode, prefillBooking, profile, initialIsoDate));
    setErrors({});
    setSubmitError(null);
    setConfirmedDetails(null);
    setStatus('idle');
  }, [open, mode, prefillBooking, profile, initialIsoDate]);

  // Close cleanly on Escape key and prevent background scroll while modal is open
  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'submitting') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, status, onClose]);

  // Keep SlideCommit responsive to modal container width
  useEffect(() => {
    if (!open) return undefined;
    const el = sliderContainerRef.current;
    if (!el) return undefined;

    const updateWidth = () => {
      const next = Math.max(220, Math.min(680, Math.floor(el.clientWidth)));
      setSliderWidth(next);
    };
    updateWidth();

    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, status]);

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

  if (!open) return null;

  const computedAge = values.dob ? calculateAge(values.dob) : null;
  const isUnderage = computedAge !== null && computedAge < CLINIC_CONFIG.minPatientAge;

  /**
   * Update a single modal booking form field and clear its inline validation error.
   * Inputs: field key, updated value.
   * Output: void.
   * Errors: None.
   */
  const updateField = <K extends keyof BookingFormValues>(field: K, value: BookingFormValues[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  /**
   * Toggle formal WhatsApp permission for this visit.
   * Inputs: checked boolean.
   * Output: void.
   * Errors: None.
   */
  const handleMessagingConsentChange = (checked: boolean) => {
    setValues(prev => ({
      ...prev,
      messagingConsent: checked,
      whatsappSameAsPhone: checked,
      whatsappCountryCode: prev.phoneCountryCode,
      whatsappNumber: '',
    }));
  };

  /**
   * Validate modal booking fields, persist to Firestore, notify the clinical team, and show confirmation.
   * Inputs: none.
   * Output: Promise<void>.
   * Errors: Throws validation or Firestore error to reset the slider and display inline feedback.
   */
  const handleSlideConfirm = async (): Promise<void> => {
    const validation = validateBookingForm(values);
    if (!validation.valid) {
      setErrors(validation.errors);
      throw new Error('Please check the highlighted booking fields.');
    }

    setErrors({});
    setSubmitError(null);
    setStatus('submitting');

    const hasMessagingConsent = values.messagingConsent !== false;
    const chosenTreatment = getTreatmentById(values.treatmentId);
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
    };

    try {
      await createBookingRecord(snapshot);
      setConfirmedDetails(snapshot);
      setStatus('confirmed');
      onBooked({
        patientName: snapshot.fullName.trim(),
        treatmentName: chosenTreatment?.name || 'Private Consultation',
        isRebook: mode === 'rebook',
      });
    } catch (err) {
      setStatus('idle');
      const message = err instanceof Error ? err.message : 'Unable to save consultation request.';
      setSubmitError(message);
      throw err;
    }
  };

  const activeTreatment = getTreatmentById((confirmedDetails ?? values).treatmentId);
  const confirmedAllowsMessaging = confirmedDetails?.messagingConsent !== false;
  const whatsappUrl = confirmedDetails
    ? buildWhatsAppBookingUrl(
        CLINIC_CONFIG.whatsappNumber,
        confirmedDetails,
        activeTreatment?.name
      )
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-modal-title"
      data-testid="profile-booking-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1B18]/45 p-3 sm:p-6"
      onClick={e => {
        if (e.target === e.currentTarget && status !== 'submitting') {
          onClose();
        }
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[20px] border border-[#E2D9CE] bg-[#EFE9E0] text-[#1F1B18]">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-[#E2D9CE] px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <h2
              id="booking-modal-title"
              className="font-serif text-2xl font-semibold text-[#1F1B18]"
            >
              {mode === 'rebook' ? 'Re-Book Consultation' : 'Consultation Request'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'submitting'}
              aria-label="Close booking popup"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] text-[#1F1B18] transition-colors hover:border-[#B68D5E] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body (strictly overflow-x-hidden with hidden scrollbars so SlideCommit never shows a scrollbar) */}
        <div className="overflow-x-hidden overflow-y-auto px-5 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:px-7 sm:py-6">
          {mode === 'rebook' && status === 'idle' ? (
            <div className="mb-5 rounded-xl border border-[#B68D5E]/60 bg-[#FAF7F2] p-3.5 text-xs leading-relaxed text-[#1F1B18]">
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#B68D5E]" aria-hidden="true" />
                <div>
                  <p className="font-semibold">
                    All your previous details are pre-filled. Simply pick a new Preferred Date &amp;
                    Time below and slide to confirm.
                  </p>
                  {prefillBooking?.cancelNote ? (
                    <p className="mt-1.5 text-[#6E655F]">
                      <span className="font-semibold text-[#9E3B33]">Team Note:</span>{' '}
                      {prefillBooking.cancelNote}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {status === 'submitting' ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
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
            <div className="space-y-5">
              <div className="rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#4B6B50]"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-serif text-2xl font-semibold text-[#1F1B18]">
                      {mode === 'rebook'
                        ? 'New Visit Request Received'
                        : 'Appointment Request Received'}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[#6E655F]">
                      {confirmedAllowsMessaging
                        ? `Our clinic team will confirm your visit via WhatsApp (${confirmedDetails.phoneCountryCode} ${confirmedDetails.phoneNumber}) shortly. Saved to your Profile & Calendar.`
                        : `Our clinic team will confirm your visit by phone call at ${confirmedDetails.phoneCountryCode} ${confirmedDetails.phoneNumber}. Saved to your Profile & Calendar.`}
                    </p>
                  </div>
                </div>

                <dl className="mt-4 space-y-2 border-t border-[#E2D9CE] pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6E655F]">Patient</dt>
                    <dd className="font-medium text-[#1F1B18]">{confirmedDetails.fullName}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#6E655F]">Phone</dt>
                    <dd className="font-medium text-[#1F1B18] tabular-nums">
                      {confirmedDetails.phoneCountryCode} {confirmedDetails.phoneNumber}
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

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[10px] bg-[#1F1B18] px-5 text-xs font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase transition-colors hover:bg-[#352F2B]"
                >
                  <Calendar className="h-4 w-4 text-[#B68D5E]" />
                  Back to My Calendar
                </button>
                {confirmedAllowsMessaging ? (
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-4 text-xs font-semibold tracking-[0.1em] text-[#1F1B18] uppercase no-underline transition-colors hover:border-[#B68D5E]"
                  >
                    <MessageCircle className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                    Send via WhatsApp
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <form className="space-y-5 text-left" onSubmit={e => e.preventDefault()} noValidate>
              {submitError ? (
                <p
                  className="rounded-xl border border-[#9E3B33]/40 bg-[#9E3B33]/10 p-3 text-xs text-[#9E3B33]"
                  role="alert"
                >
                  {submitError}
                </p>
              ) : null}

              {/* 1. Full Name */}
              <div>
                <label
                  htmlFor="modal-booking-full-name"
                  className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase"
                >
                  Full Name
                </label>
                <input
                  id="modal-booking-full-name"
                  type="text"
                  autoComplete="name"
                  placeholder="Enter your full name"
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
                  className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-3.5 text-sm text-[#1F1B18] placeholder:text-[#9A9086] outline-none transition-colors focus:border-[#B68D5E]"
                />
                {errors.fullName ? (
                  <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                    {errors.fullName}
                  </p>
                ) : null}
              </div>

              {/* 2. Phone Number (For Call Purposes) + Checkbox Consent */}
              <div>
                <label
                  htmlFor="modal-booking-phone"
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
                    ariaLabel="Modal phone country code"
                    className="w-28 shrink-0 sm:w-36"
                  />
                  <input
                    id="modal-booking-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="Enter phone number"
                    value={values.phoneNumber}
                    onChange={e => updateField('phoneNumber', sanitizePhoneDigits(e.target.value))}
                    aria-invalid={Boolean(errors.phoneNumber)}
                    className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-3.5 text-sm text-[#1F1B18] placeholder:text-[#9A9086] tabular-nums outline-none transition-colors focus:border-[#B68D5E]"
                  />
                </div>
                {errors.phoneNumber ? (
                  <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                    {errors.phoneNumber}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] px-3 py-2.5">
                  <input
                    id="modal-booking-messaging-consent"
                    type="checkbox"
                    checked={values.messagingConsent !== false}
                    onChange={e => handleMessagingConsentChange(e.target.checked)}
                    aria-label="Allow Elara Atelier to contact me via WhatsApp at this number"
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#E2D9CE] accent-[#1F1B18]"
                  />
                  <span className="text-[11px] leading-normal text-[#6E655F] sm:whitespace-nowrap">
                    I formally grant permission for Elara Atelier to contact me via WhatsApp (else
                    call only).
                  </span>
                </div>
              </div>

              {/* 3. Date of Birth (18+) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor="modal-booking-dob"
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
                  id="modal-booking-dob"
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase">
                    Treatment Selection
                  </span>
                  <GlideSelect
                    options={treatmentOptions}
                    value={values.treatmentId}
                    onChange={nextId => updateField('treatmentId', nextId)}
                    placeholder="Select treatment…"
                    showTags={true}
                    size="lg"
                    radius={10}
                    menuWidth={320}
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

                <div
                  className={
                    mode === 'rebook'
                      ? 'rounded-xl border border-[#B68D5E] bg-[#FAF7F2]/60 p-2 -m-2'
                      : ''
                  }
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label
                      htmlFor="modal-booking-datetime"
                      className="text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase"
                    >
                      Preferred Date &amp; Time
                    </label>
                    {mode === 'rebook' ? (
                      <span className="text-[10px] font-semibold tracking-[0.08em] text-[#B68D5E] uppercase">
                        Pick New Slot
                      </span>
                    ) : null}
                  </div>
                  <AtelierDatePicker
                    id="modal-booking-datetime"
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

              {/* 5. Confirm Your Booking Slider */}
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
                <div ref={sliderContainerRef} className="w-full overflow-hidden">
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
    </div>
  );
};

export default BookingModal;
