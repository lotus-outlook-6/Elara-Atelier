/**
 * In-page Patient Portal (Sign In, Create Account, and Google 18+ Profile Completion) for Elara Atelier.
 * Uses StarBorder, Motion transitions, GlideSelect, and AtelierDatePicker so every button,
 * dropdown, and calendar feels identical in smoothness to the studio showcase.
 */

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  Mail,
  MessageSquare,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { CLINIC_CONFIG, COUNTRY_CODES } from '../../config/clinicConfig';
import { useAuth } from '../../context/AuthContext';
import { CONCIERGE_SUITE_MEDIA } from '../../data/clinicMedia';
import {
  calculateAge,
  resolveEffectiveTelegram,
  sanitizeNameInput,
  sanitizePhoneDigits,
  validateAccountForm,
  type AccountFormValues,
  type TelegramContactMethod,
} from '../../utils/booking';
import AtelierDatePicker from '../reactbits/AtelierDatePicker';
import FadeContent from '../reactbits/FadeContent';
import GlideSelect, { type GlideSelectOption } from '../reactbits/GlideSelect';
import LatticeLoader from '../reactbits/LatticeLoader';
import PatientAvatar from '../ui/PatientAvatar';

export interface AuthSectionProps {
  initialTab?: 'signin' | 'register';
  onBackToStudio: () => void;
  onSuccess: () => void;
}

/**
 * Extract a clear user-facing authentication error message from Firebase Auth errors.
 * Inputs: caught unknown error.
 * Output: readable message string.
 */
function formatAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('auth/operation-not-allowed')) {
    return 'Email/Password sign-in is not enabled in this Firebase project yet. Enable Email/Password in Firebase Console -> Authentication -> Sign-in method, or use Continue with Google below.';
  }
  if (raw.includes('auth/invalid-credential') || raw.includes('auth/wrong-password')) {
    return 'Incorrect email or password. Please verify your credentials and try again.';
  }
  if (raw.includes('auth/user-not-found')) {
    return 'No account found with that email. Switch to Create Account to register.';
  }
  if (raw.includes('auth/email-already-in-use')) {
    return 'An account with this email already exists. Please sign in instead.';
  }
  if (raw.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in popup was closed before completing.';
  }
  if (raw.includes('auth/unauthorized-domain')) {
    return 'This domain is not authorized for Google Sign-In in Firebase Console yet.';
  }
  return raw;
}

/**
 * Smooth editorial Patient Portal section for Sign In and 18+ Account Registration.
 */
export const AuthSection: React.FC<AuthSectionProps> = ({
  initialTab = 'signin',
  onBackToStudio,
  onSuccess,
}) => {
  const {
    user,
    userPhotoUrl,
    profile,
    signInWithEmail,
    signInWithGoogle,
    registerWithEmail,
    saveUserProfile,
  } = useAuth();

  const [tab, setTab] = useState<'signin' | 'register'>(initialTab);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerValues, setRegisterValues] = useState<AccountFormValues>({
    fullName: '',
    email: '',
    password: '',
    phoneCountryCode: '+1',
    phoneNumber: '',
    dob: '',
    telegramSameAsPhone: false,
    telegramMethod: 'username',
    telegramValue: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormValues, string>>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsGoogleProfile, setNeedsGoogleProfile] = useState(false);
  const [googleAvatarPreview, setGoogleAvatarPreview] = useState<string | null>(null);

  const countryCodeOptions: GlideSelectOption[] = useMemo(
    () => COUNTRY_CODES.map(opt => ({ value: opt.code, label: opt.label })),
    []
  );

  const computedAge = registerValues.dob ? calculateAge(registerValues.dob) : null;
  const isUnderage = computedAge !== null && computedAge < CLINIC_CONFIG.minPatientAge;

  /**
   * Update a single registration/profile field and clear its inline error.
   * Inputs: field key and updated value.
   */
  const updateRegField = <K extends keyof AccountFormValues>(
    field: K,
    value: AccountFormValues[K]
  ) => {
    setRegisterValues(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setGeneralError(null);
  };

  /**
   * Handle Email/Password sign-in submission.
   */
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    if (!loginEmail.trim() || !loginPassword) {
      setGeneralError('Please enter both your email address and password.');
      return;
    }
    setSubmitting(true);
    try {
      await signInWithEmail(loginEmail, loginPassword);
      onSuccess();
    } catch (err) {
      setGeneralError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handle Google OAuth popup sign-in, prompting for 18+ profile completion if needed.
   */
  const handleGoogleSignIn = async () => {
    setGeneralError(null);
    setSubmitting(true);
    try {
      const signedUser = await signInWithGoogle();
      const capturedPhoto =
        signedUser.photoURL?.trim() ||
        signedUser.providerData?.find(p => p?.photoURL)?.photoURL?.trim() ||
        null;
      setGoogleAvatarPreview(capturedPhoto);
      if (!profile) {
        const cleanDisplayName = sanitizeNameInput(signedUser.displayName || '');
        setRegisterValues(prev => ({
          ...prev,
          fullName: cleanDisplayName,
          email: signedUser.email || '',
        }));
        setNeedsGoogleProfile(true);
      } else {
        onSuccess();
      }
    } catch (err) {
      setGeneralError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Handle new account creation with strict non-numeric name, country phone, 18+ DOB, and Telegram validation.
   */
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const validation = validateAccountForm(registerValues, !needsGoogleProfile);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      const effectiveTelegram = resolveEffectiveTelegram(registerValues);
      if (needsGoogleProfile && user) {
        await saveUserProfile({
          fullName: registerValues.fullName,
          phoneCountryCode: registerValues.phoneCountryCode,
          phoneNumber: registerValues.phoneNumber,
          dob: registerValues.dob,
          telegramSameAsPhone: registerValues.telegramSameAsPhone,
          telegramMethod: effectiveTelegram.method,
          telegramValue: effectiveTelegram.value,
        });
      } else {
        await registerWithEmail(registerValues);
      }
      onSuccess();
    } catch (err) {
      setGeneralError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Toggle whether the registration phone number is also the user's Telegram number.
   * Inputs: checked boolean.
   */
  const toggleTelegramSameAsPhone = (checked: boolean) => {
    setRegisterValues(prev => ({
      ...prev,
      telegramSameAsPhone: checked,
      telegramMethod: checked ? 'username' : prev.telegramMethod,
      telegramValue:
        checked && prev.telegramMethod === 'phone' ? '' : prev.telegramValue,
    }));
    setErrors(prev => ({ ...prev, telegramValue: undefined }));
  };

  /**
   * Switch Telegram identifier mode cleanly between @username and phone number.
   * Inputs: TelegramContactMethod ('username' | 'phone').
   */
  const switchTelegramMethod = (method: TelegramContactMethod) => {
    setRegisterValues(prev => ({
      ...prev,
      telegramMethod: method,
      telegramValue:
        method === 'phone' && prev.phoneNumber
          ? `${prev.phoneCountryCode}${prev.phoneNumber}`
          : '',
    }));
    setErrors(prev => ({ ...prev, telegramValue: undefined }));
  };

  return (
    <section
      aria-label="Patient Sign In and Account Creation"
      className="min-h-screen bg-[#FAF7F2] pt-28 pb-20 sm:pt-32"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <FadeContent trigger="mount" effect="fade" duration={0.55}>
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2D9CE] pb-6">
            <div>
              <button
                type="button"
                onClick={onBackToStudio}
                className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold tracking-[0.14em] text-[#6E655F] uppercase transition-colors hover:text-[#1F1B18]"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-[#B68D5E]" />
                Back to Studio Showcase
              </button>
              <p className="mt-4 text-[11px] font-semibold tracking-[0.22em] text-[#B68D5E] uppercase">
                Patient Portal
              </p>
              <h1 className="mt-1.5 font-serif text-3xl font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
                {needsGoogleProfile
                  ? 'Complete Your 18+ Patient Profile'
                  : tab === 'signin'
                    ? 'Sign In to Elara Atelier'
                    : 'Create Your Patient Account'}
              </h1>
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl border border-[#E2D9CE] bg-[#EFE9E0] px-4 py-2.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
              <Clock className="h-3.5 w-3.5 text-[#B68D5E]" />
              <span>{CLINIC_CONFIG.hoursShort}</span>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            {/* Left Column: Clean Editorial Portal Card */}
            <div className="lg:col-span-7">
              <div className="w-full rounded-[20px] border border-[#E2D9CE] bg-[#EFE9E0] p-6 text-[#1F1B18] sm:p-8">
                <div className="text-left">
                  {!needsGoogleProfile ? (
                    <div
                      role="tablist"
                      aria-label="Authentication mode"
                      className="grid grid-cols-2 gap-1 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-1"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'signin'}
                        onClick={() => {
                          setTab('signin');
                          setGeneralError(null);
                        }}
                        className={`cursor-pointer rounded-lg py-2 text-xs font-semibold tracking-[0.12em] uppercase transition-all duration-200 active:scale-[0.98] ${
                          tab === 'signin'
                            ? 'bg-[#1F1B18] text-[#FAF7F2]'
                            : 'text-[#6E655F] hover:text-[#1F1B18]'
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={tab === 'register'}
                        onClick={() => {
                          setTab('register');
                          setGeneralError(null);
                        }}
                        className={`cursor-pointer rounded-lg py-2 text-xs font-semibold tracking-[0.12em] uppercase transition-all duration-200 active:scale-[0.98] ${
                          tab === 'register'
                            ? 'bg-[#1F1B18] text-[#FAF7F2]'
                            : 'text-[#6E655F] hover:text-[#1F1B18]'
                        }`}
                      >
                        Create Account
                      </button>
                    </div>
                  ) : null}

                  {generalError ? (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      role="alert"
                      className="mt-4 rounded-xl border border-[#9E3B33]/40 bg-[#9E3B33]/10 p-3.5 text-xs leading-relaxed text-[#9E3B33]"
                    >
                      {generalError}
                    </motion.div>
                  ) : null}

                  {submitting ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16">
                      <LatticeLoader
                        status="working"
                        pattern="orbit"
                        grid={3}
                        shape="round"
                        color="#B68D5E"
                        cellSize={8}
                        gap={4}
                        fontSize={14}
                        label="Authenticating"
                        showTimer={false}
                        className="text-[#1F1B18]"
                      />
                    </div>
                  ) : (
                    <AnimatePresence mode="wait">
                      {tab === 'signin' && !needsGoogleProfile ? (
                        <motion.div
                          key="signin-panel"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                          className="mt-6 space-y-5"
                        >
                          <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-5 text-sm font-medium text-[#1F1B18] transition-all duration-200 hover:border-[#B68D5E] hover:bg-[#FAF7F2]/80 active:scale-[0.985]"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                fill="#4285F4"
                                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                              />
                              <path
                                fill="#34A853"
                                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                              />
                              <path
                                fill="#FBBC05"
                                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                              />
                              <path
                                fill="#EA4335"
                                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                              />
                            </svg>
                            Continue with Google
                          </button>

                          <div className="flex items-center gap-3 py-1.5 text-xs text-[#6E655F]">
                            <span className="h-px flex-1 bg-[#E2D9CE]" />
                            <span className="tracking-[0.14em] uppercase">or email</span>
                            <span className="h-px flex-1 bg-[#E2D9CE]" />
                          </div>

                          <form onSubmit={handleEmailSignIn} className="space-y-4" noValidate>
                            <div>
                              <label
                                htmlFor="login-email"
                                className="mb-1.5 block text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                              >
                                Email Address
                              </label>
                              <div className="relative">
                                <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#6E655F]" />
                                <input
                                  id="login-email"
                                  type="email"
                                  autoComplete="email"
                                  value={loginEmail}
                                  onChange={e => setLoginEmail(e.target.value)}
                                  placeholder="camille@example.com"
                                  className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] pr-3.5 pl-10 text-sm text-[#1F1B18] outline-none transition-colors focus:border-[#B68D5E]"
                                />
                              </div>
                            </div>

                            <div>
                              <label
                                htmlFor="login-password"
                                className="mb-1.5 block text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                              >
                                Password
                              </label>
                              <div className="relative">
                                <Lock className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#6E655F]" />
                                <input
                                  id="login-password"
                                  type="password"
                                  autoComplete="current-password"
                                  value={loginPassword}
                                  onChange={e => setLoginPassword(e.target.value)}
                                  placeholder="Minimum 8 characters"
                                  className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] pr-3.5 pl-10 text-sm text-[#1F1B18] outline-none transition-colors focus:border-[#B68D5E]"
                                />
                              </div>
                            </div>

                            <button
                              type="submit"
                              className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border border-[#1F1B18] bg-[#1F1B18] px-6 text-xs font-semibold tracking-[0.14em] text-[#FAF7F2] uppercase transition-all duration-200 hover:bg-[#352F2B] active:scale-[0.985]"
                            >
                              Sign In with Email
                            </button>
                          </form>
                        </motion.div>
                      ) : (
                        <motion.form
                          key="register-panel"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                          onSubmit={handleRegisterSubmit}
                          className="mt-6 space-y-4"
                          noValidate
                        >
                          {!needsGoogleProfile ? (
                            <>
                              <button
                                type="button"
                                onClick={handleGoogleSignIn}
                                className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-5 text-sm font-medium text-[#1F1B18] transition-all duration-200 hover:border-[#B68D5E] hover:bg-[#FAF7F2]/80 active:scale-[0.985]"
                              >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                                  <path
                                    fill="#4285F4"
                                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                                  />
                                  <path
                                    fill="#34A853"
                                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                                  />
                                  <path
                                    fill="#FBBC05"
                                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                                  />
                                  <path
                                    fill="#EA4335"
                                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                                  />
                                </svg>
                                Sign Up with Google
                              </button>
                              <div className="flex items-center gap-3 py-1.5 text-xs text-[#6E655F]">
                                <span className="h-px flex-1 bg-[#E2D9CE]" />
                                <span className="tracking-[0.14em] uppercase">
                                  or register with email
                                </span>
                                <span className="h-px flex-1 bg-[#E2D9CE]" />
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-3.5 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-3.5">
                              <PatientAvatar
                                src={googleAvatarPreview || userPhotoUrl}
                                name={registerValues.fullName || user?.displayName}
                                size="md"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold tracking-[0.12em] text-[#B68D5E] uppercase">
                                  Google Account Connected
                                </p>
                                <p className="truncate text-sm font-medium text-[#1F1B18]">
                                  {registerValues.email || user?.email}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Full Name */}
                          <div>
                            <label
                              htmlFor="reg-fullname"
                              className="mb-1.5 block text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                            >
                              Full Name (Letters Only)
                            </label>
                            <div className="relative">
                              <User className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#6E655F]" />
                              <input
                                id="reg-fullname"
                                type="text"
                                autoComplete="name"
                                value={registerValues.fullName}
                                onChange={e => {
                                  const hadDigits = /[0-9]/.test(e.target.value);
                                  updateRegField('fullName', sanitizeNameInput(e.target.value));
                                  if (hadDigits) {
                                    setErrors(prev => ({
                                      ...prev,
                                      fullName: 'Numbers are not permitted in the Full Name field.',
                                    }));
                                  }
                                }}
                                placeholder="Camille Laurent"
                                className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] pr-3.5 pl-10 text-sm text-[#1F1B18] outline-none transition-colors focus:border-[#B68D5E]"
                              />
                            </div>
                            {errors.fullName ? (
                              <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                                {errors.fullName}
                              </p>
                            ) : null}
                          </div>

                          {!needsGoogleProfile ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <label
                                  htmlFor="reg-email"
                                  className="mb-1.5 block text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                                >
                                  Email
                                </label>
                                <input
                                  id="reg-email"
                                  type="email"
                                  autoComplete="email"
                                  value={registerValues.email}
                                  onChange={e => updateRegField('email', e.target.value)}
                                  placeholder="camille@example.com"
                                  className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-3.5 text-sm text-[#1F1B18] outline-none transition-colors focus:border-[#B68D5E]"
                                />
                                {errors.email ? (
                                  <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                                    {errors.email}
                                  </p>
                                ) : null}
                              </div>

                              <div>
                                <label
                                  htmlFor="reg-password"
                                  className="mb-1.5 block text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                                >
                                  Password
                                </label>
                                <input
                                  id="reg-password"
                                  type="password"
                                  autoComplete="new-password"
                                  value={registerValues.password}
                                  onChange={e => updateRegField('password', e.target.value)}
                                  placeholder="Min 8 chars"
                                  className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] px-3.5 text-sm text-[#1F1B18] outline-none transition-colors focus:border-[#B68D5E]"
                                />
                                {errors.password ? (
                                  <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                                    {errors.password}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {/* Phone with unified GlideSelect Country Code + Same-as-Telegram Option */}
                          <div>
                            <label
                              htmlFor="reg-phone"
                              className="mb-1.5 block text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                            >
                              Phone Number (with Country Code)
                            </label>
                            <div className="flex gap-2.5">
                              <GlideSelect
                                options={countryCodeOptions}
                                value={registerValues.phoneCountryCode}
                                onChange={code => updateRegField('phoneCountryCode', code)}
                                showTags={false}
                                size="lg"
                                radius={10}
                                menuWidth={170}
                                surfaceColor="#FAF7F2"
                                highlightColor="#EFE9E0"
                                accentColor="#B68D5E"
                                textColor="#1F1B18"
                                ariaLabel="Phone country code"
                                className="w-36 shrink-0 rounded-[10px] border border-[#E2D9CE]"
                              />
                              <div className="relative flex-1">
                                <Phone className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#6E655F]" />
                                <input
                                  id="reg-phone"
                                  type="tel"
                                  inputMode="numeric"
                                  value={registerValues.phoneNumber}
                                  onChange={e =>
                                    updateRegField('phoneNumber', sanitizePhoneDigits(e.target.value))
                                  }
                                  placeholder="3105550148"
                                  className="h-11 w-full rounded-[10px] border border-[#E2D9CE] bg-[#FAF7F2] pr-3.5 pl-10 text-sm text-[#1F1B18] tabular-nums outline-none transition-colors focus:border-[#B68D5E]"
                                />
                              </div>
                            </div>

                            <label className="mt-2.5 inline-flex cursor-pointer items-center gap-2 text-xs text-[#6E655F] select-none hover:text-[#1F1B18]">
                              <input
                                type="checkbox"
                                checked={Boolean(registerValues.telegramSameAsPhone)}
                                onChange={e => toggleTelegramSameAsPhone(e.target.checked)}
                                className="h-4 w-4 cursor-pointer rounded border-[#E2D9CE] accent-[#1F1B18]"
                              />
                              <span>This phone number is the same as my Telegram number</span>
                            </label>

                            {errors.phoneNumber ? (
                              <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                                {errors.phoneNumber}
                              </p>
                            ) : null}
                          </div>

                          {/* Date of Birth (In-Website AtelierDatePicker) */}
                          <div>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <label
                                htmlFor="reg-dob"
                                className="text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                              >
                                Date of Birth (18+ Required)
                              </label>
                              {computedAge !== null ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
                                    isUnderage ? 'text-[#9E3B33]' : 'text-[#4B6B50]'
                                  }`}
                                >
                                  {!isUnderage ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                                  Age {computedAge}
                                </span>
                              ) : null}
                            </div>
                            <AtelierDatePicker
                              id="reg-dob"
                              mode="date"
                              value={registerValues.dob}
                              onChange={nextDob => updateRegField('dob', nextDob)}
                              placeholder="YYYY-MM-DD"
                              ariaLabel="Date of Birth (18+ Required)"
                              ariaInvalid={Boolean(errors.dob) || isUnderage}
                              defaultOpenYear={1995}
                              surfaceColor="#FAF7F2"
                            />
                            {isUnderage ? (
                              <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                                Account creation is restricted to patients aged 18 or older.
                              </p>
                            ) : errors.dob ? (
                              <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                                {errors.dob}
                              </p>
                            ) : null}
                          </div>

                          {/* Telegram Contact Preference */}
                          <div className="rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
                                <MessageSquare className="h-3.5 w-3.5 text-[#B68D5E]" />
                                Telegram Bot Updates
                              </span>

                              {registerValues.telegramSameAsPhone ? (
                                <span className="rounded-md border border-[#E2D9CE] bg-[#EFE9E0] px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] text-[#6E655F] uppercase">
                                  Using Phone · Username Optional
                                </span>
                              ) : (
                                <div className="flex rounded-lg border border-[#E2D9CE] bg-[#EFE9E0] p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => switchTelegramMethod('username')}
                                    className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase transition-colors ${
                                      registerValues.telegramMethod === 'username'
                                        ? 'bg-[#1F1B18] text-[#FAF7F2]'
                                        : 'text-[#6E655F] hover:text-[#1F1B18]'
                                    }`}
                                  >
                                    Username
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => switchTelegramMethod('phone')}
                                    className={`cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold tracking-wider uppercase transition-colors ${
                                      registerValues.telegramMethod === 'phone'
                                        ? 'bg-[#1F1B18] text-[#FAF7F2]'
                                        : 'text-[#6E655F] hover:text-[#1F1B18]'
                                    }`}
                                  >
                                    Phone
                                  </button>
                                </div>
                              )}
                            </div>

                            <input
                              aria-label={
                                registerValues.telegramSameAsPhone
                                  ? 'Telegram username (optional)'
                                  : 'Telegram username or phone number'
                              }
                              type={
                                !registerValues.telegramSameAsPhone &&
                                registerValues.telegramMethod === 'phone'
                                  ? 'tel'
                                  : 'text'
                              }
                              value={registerValues.telegramValue}
                              onChange={e => updateRegField('telegramValue', e.target.value)}
                              placeholder={
                                registerValues.telegramSameAsPhone
                                  ? '@camille_laurent (optional)'
                                  : registerValues.telegramMethod === 'username'
                                    ? '@camille_laurent'
                                    : `${registerValues.phoneCountryCode}3105550148`
                              }
                              className="mt-2.5 h-10.5 w-full rounded-[9px] border border-[#E2D9CE] bg-[#EFE9E0]/50 px-3 text-sm text-[#1F1B18] outline-none transition-colors focus:border-[#B68D5E]"
                            />
                            {errors.telegramValue ? (
                              <p className="mt-1.5 text-xs text-[#9E3B33]" role="alert">
                                {errors.telegramValue}
                              </p>
                            ) : registerValues.telegramSameAsPhone ? (
                              <p className="mt-1.5 text-[11px] text-[#6E655F]">
                                Your phone number ({registerValues.phoneCountryCode}{' '}
                                {registerValues.phoneNumber || 'entered above'}) will be used for
                                Telegram bot notifications. Adding a username is optional.
                              </p>
                            ) : null}
                          </div>

                          <button
                            type="submit"
                            disabled={isUnderage}
                            className="flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] border border-[#1F1B18] bg-[#1F1B18] px-6 text-xs font-semibold tracking-[0.14em] text-[#FAF7F2] uppercase transition-all duration-200 hover:bg-[#352F2B] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            {needsGoogleProfile ? 'Save Verified Profile' : 'Create Verified Account'}
                          </button>
                        </motion.form>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Editorial Portal Benefits & Sanctuary Preview */}
            <aside className="lg:col-span-5">
              <div className="rounded-[20px] border border-[#E2D9CE] bg-[#EFE9E0] p-6 sm:p-8">
                <div className="overflow-hidden rounded-xl border border-[#E2D9CE] bg-[#E5DACB]">
                  <img
                    src={CONCIERGE_SUITE_MEDIA.src}
                    alt={CONCIERGE_SUITE_MEDIA.alt}
                    className="block h-52 w-full object-cover"
                  />
                </div>

                <h2 className="mt-6 font-serif text-2xl font-semibold text-[#1F1B18]">
                  Private Patient Benefits
                </h2>
                <ul className="mt-4 space-y-4 text-sm text-[#6E655F]">
                  <li className="flex items-start gap-3">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#B68D5E]" />
                    <span>
                      <strong className="font-semibold text-[#1F1B18]">Monthly Visit Calendar:</strong>{' '}
                      View all upcoming consultations cleanly in your Profile schedule.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#B68D5E]" />
                    <span>
                      <strong className="font-semibold text-[#1F1B18]">4-Hour Self-Editing:</strong>{' '}
                      Adjust your treatment, preferred time, or Telegram details for 4 hours after booking.
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#B68D5E]" />
                    <span>
                      <strong className="font-semibold text-[#1F1B18]">Verified 18+ Care:</strong>{' '}
                      Your age, country-coded phone, and Telegram contact pre-fill every booking.
                    </span>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </FadeContent>
      </div>
    </section>
  );
};

export default AuthSection;
