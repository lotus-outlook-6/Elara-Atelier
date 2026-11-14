/**
 * Authentication, Patient Profile, Booking Persistence, and Telegram Concierge context.
 * Wraps Firebase Auth (Email/Password + Google), owner-scoped Firestore listeners,
 * and 4-hour post-booking edit/cancellation mutations.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { CLINIC_CONFIG } from '../config/clinicConfig';
import { OperationType, auth, db, googleProvider, handleFirestoreError } from '../lib/firebase';
import {
  buildTelegramBotDeepLink,
  canEditBooking,
  getTreatmentById,
  resolveEffectiveTelegram,
  validateAccountForm,
  validateBookingForm,
  type AccountFormValues,
  type BookingFormValues,
  type TelegramContactMethod,
} from '../utils/booking';

export interface UserProfileRecord {
  uid: string;
  fullName: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
  dob: string;
  telegramMethod: TelegramContactMethod;
  telegramValue: string;
  telegramChatId?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface BookingRecord {
  id: string;
  userId: string;
  fullName: string;
  phoneCountryCode: string;
  phoneNumber: string;
  dob: string;
  treatmentId: string;
  treatmentName: string;
  preferredDateTime: string;
  telegramMethod: TelegramContactMethod;
  telegramValue: string;
  telegramNotifyStatus: 'pending_bot_start' | 'queued' | 'sent' | 'deep_link_ready';
  status: 'requested' | 'confirmed' | 'cancelled';
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ProfileUpsertPayload {
  fullName: string;
  phoneCountryCode: string;
  phoneNumber: string;
  dob: string;
  telegramSameAsPhone?: boolean;
  telegramMethod: TelegramContactMethod;
  telegramValue: string;
}

interface TelegramStatusState {
  botConfigured: boolean;
  botUsername: string;
}

export interface BotSyncNotice {
  id: string;
  title: string;
  description: string;
}

export interface ConciergeChatMessage {
  id: string;
  chatId?: string;
  userId?: string | null;
  sender: 'patient' | 'concierge';
  text: string;
  createdAtMs: number;
  source: 'telegram' | 'website';
}

interface AuthContextValue {
  user: User | null;
  userPhotoUrl: string | null;
  authReady: boolean;
  profile: UserProfileRecord | null;
  profileLoading: boolean;
  bookings: BookingRecord[];
  bookingsLoading: boolean;
  telegramStatus: TelegramStatusState;
  linkedTelegramChatId: string | null;
  conciergeMessages: ConciergeChatMessage[];
  conciergeMessagesLoading: boolean;
  sendConciergeMessage: (text: string) => Promise<{ sentToTelegram: boolean }>;
  botSyncNotice: BotSyncNotice | null;
  clearBotSyncNotice: () => void;
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  registerWithEmail: (values: AccountFormValues) => Promise<User>;
  saveUserProfile: (payload: ProfileUpsertPayload) => Promise<void>;
  createBookingRecord: (
    values: BookingFormValues
  ) => Promise<{ bookingId: string; telegramDeepLink: string; serverDispatched: boolean }>;
  editBookingRecord: (
    bookingId: string,
    patch: {
      treatmentId: string;
      preferredDateTime: string;
      phoneCountryCode: string;
      phoneNumber: string;
      telegramSameAsPhone?: boolean;
      telegramMethod: TelegramContactMethod;
      telegramValue: string;
    }
  ) => Promise<void>;
  cancelBookingRecord: (bookingId: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Convert a Firestore Timestamp or sentinel to epoch milliseconds.
 * Inputs: raw Firestore field value.
 * Output: epoch milliseconds.
 */
function timestampToMs(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return Date.now();
}

/**
 * Generate a Firestore-rule-safe alphanumeric booking document ID.
 * Output: clean ID matching ^[a-zA-Z0-9_-]+$.
 */
function generateBookingId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `bk_${Date.now()}_${rand}`;
}

/**
 * Extract the authenticated user's Google/provider profile photo URL if available.
 * Inputs: nullable Firebase User object.
 * Output: photo URL string or null.
 */
export function extractUserPhotoUrl(firebaseUser: User | null): string | null {
  if (!firebaseUser) return null;
  const direct = firebaseUser.photoURL?.trim();
  if (direct) return direct;
  const fromProvider = firebaseUser.providerData?.find(p => p?.photoURL)?.photoURL?.trim();
  return fromProvider || null;
}

/**
 * Provider managing Firebase Authentication, owner-isolated Firestore listeners,
 * and Telegram Bot notification handoffs.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusState>({
    botConfigured: false,
    botUsername: CLINIC_CONFIG.defaultTelegramBotUsername,
  });
  const [botSyncNotice, setBotSyncNotice] = useState<BotSyncNotice | null>(null);
  const [linkedTelegramChatId, setLinkedTelegramChatId] = useState<string | null>(null);
  const [conciergeMessages, setConciergeMessages] = useState<ConciergeChatMessage[]>([]);
  const [conciergeMessagesLoading, setConciergeMessagesLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/telegram/status')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active || !data) return;
        setTelegramStatus({
          botConfigured: Boolean(data.botConfigured),
          botUsername:
            typeof data.botUsername === 'string' && data.botUsername.trim()
              ? data.botUsername.trim()
              : CLINIC_CONFIG.defaultTelegramBotUsername,
        });
      })
      .catch(() => {
        // Fallback silently to default bot username config when static preview is used
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, nextUser => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setBookings([]);
        setLinkedTelegramChatId(null);
        setConciergeMessages([]);
        setProfileLoading(false);
        setBookingsLoading(false);
        setConciergeMessagesLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return undefined;

    setProfileLoading(true);
    const profilePath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      snapshot => {
        if (snapshot.exists()) {
          const d = snapshot.data();
          setProfile({
            uid: String(d.uid),
            fullName: String(d.fullName || ''),
            email: String(d.email || user.email || ''),
            phoneCountryCode: String(d.phoneCountryCode || '+1'),
            phoneNumber: String(d.phoneNumber || ''),
            dob: String(d.dob || ''),
            telegramMethod: d.telegramMethod === 'phone' ? 'phone' : 'username',
            telegramValue: String(d.telegramValue || ''),
            telegramChatId: typeof d.telegramChatId === 'string' ? d.telegramChatId : undefined,
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          });
        } else {
          setProfile(null);
        }
        setProfileLoading(false);
      },
      error => {
        setProfileLoading(false);
        handleFirestoreError(error, OperationType.GET, profilePath);
      }
    );

    setBookingsLoading(true);
    const bookingsQuery = query(collection(db, 'bookings'), where('userId', '==', user.uid));
    const unsubBookings = onSnapshot(
      bookingsQuery,
      snapshot => {
        const rows: BookingRecord[] = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          return {
            id: String(d.id || docSnap.id),
            userId: String(d.userId || user.uid),
            fullName: String(d.fullName || ''),
            phoneCountryCode: String(d.phoneCountryCode || '+1'),
            phoneNumber: String(d.phoneNumber || ''),
            dob: String(d.dob || ''),
            treatmentId: String(d.treatmentId || ''),
            treatmentName: String(d.treatmentName || ''),
            preferredDateTime: String(d.preferredDateTime || ''),
            telegramMethod: d.telegramMethod === 'phone' ? 'phone' : 'username',
            telegramValue: String(d.telegramValue || ''),
            telegramNotifyStatus:
              d.telegramNotifyStatus === 'sent' ||
              d.telegramNotifyStatus === 'queued' ||
              d.telegramNotifyStatus === 'deep_link_ready'
                ? d.telegramNotifyStatus
                : 'pending_bot_start',
            status:
              d.status === 'confirmed' || d.status === 'cancelled' ? d.status : 'requested',
            createdAtMs: timestampToMs(d.createdAt),
            updatedAtMs: timestampToMs(d.updatedAt),
          };
        });
        rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setBookings(rows);
        setBookingsLoading(false);
      },
      error => {
        setBookingsLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'bookings');
      }
    );

    return () => {
      unsubProfile();
      unsubBookings();
    };
  }, [authReady, user]);

  // Two-way real-time sync between Firestore patient records and Telegram Bot Concierge
  useEffect(() => {
    if (!authReady || !user || profileLoading || bookingsLoading) return undefined;

    let active = true;

    const applyBotUpdateToFirestore = async (botBooking: {
      id: string;
      preferredDateTime: string;
      status: BookingRecord['status'];
      treatmentName?: string;
    }) => {
      const local = bookings.find(item => item.id === botBooking.id);
      if (!local) return;
      if (
        local.preferredDateTime === botBooking.preferredDateTime &&
        local.status === botBooking.status
      ) {
        return;
      }
      if (!canEditBooking(local.createdAtMs, Date.now(), local.status)) return;

      const bookingPath = `bookings/${local.id}`;
      try {
        if (botBooking.status === 'cancelled') {
          await updateDoc(doc(db, 'bookings', local.id), {
            status: 'cancelled',
            updatedAt: serverTimestamp(),
          });
          if (active) {
            setBotSyncNotice({
              id: `${local.id}_${Date.now()}`,
              title: 'Booking Cancelled via Telegram',
              description: `${local.treatmentName} was cancelled from your Telegram chat.`,
            });
          }
        } else {
          await updateDoc(doc(db, 'bookings', local.id), {
            preferredDateTime: botBooking.preferredDateTime,
            updatedAt: serverTimestamp(),
          });
          if (active) {
            setBotSyncNotice({
              id: `${local.id}_${Date.now()}`,
              title: 'Timing Updated via Telegram',
              description: `${local.treatmentName} rescheduled to ${botBooking.preferredDateTime.replace('T', ' ')}.`,
            });
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, bookingPath);
      }
    };

    const syncWithConcierge = async () => {
      try {
        const idToken = await user.getIdToken();
        const resp = await fetch('/api/telegram/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            profile: profile
              ? {
                  fullName: profile.fullName,
                  phoneCountryCode: profile.phoneCountryCode,
                  phoneNumber: profile.phoneNumber,
                  telegramMethod: profile.telegramMethod,
                  telegramValue: profile.telegramValue,
                  telegramChatId: profile.telegramChatId,
                }
              : null,
            bookings: bookings.map(b => ({
              id: b.id,
              userId: b.userId,
              fullName: b.fullName,
              phoneCountryCode: b.phoneCountryCode,
              phoneNumber: b.phoneNumber,
              treatmentId: b.treatmentId,
              treatmentName: b.treatmentName,
              preferredDateTime: b.preferredDateTime,
              telegramMethod: b.telegramMethod,
              telegramValue: b.telegramValue,
              status: b.status,
              createdAtMs: b.createdAtMs,
              updatedAtMs: b.updatedAtMs,
            })),
          }),
        });
        if (!resp.ok || !active) return;
        const data = (await resp.json()) as {
          linkedChatId?: string | null;
          botUpdatedBookings?: Array<{
            id: string;
            preferredDateTime: string;
            status: BookingRecord['status'];
            treatmentName?: string;
          }>;
        };

        if (data.linkedChatId) {
          setLinkedTelegramChatId(data.linkedChatId);
        }

        if (
          data.linkedChatId &&
          profile &&
          profile.telegramChatId !== data.linkedChatId
        ) {
          updateDoc(doc(db, 'users', user.uid), {
            telegramChatId: data.linkedChatId,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        for (const botBooking of data.botUpdatedBookings || []) {
          await applyBotUpdateToFirestore(botBooking);
        }
      } catch {
        // Ignore offline/network sync failures silently
      }
    };

    const loadConciergeMessages = async () => {
      setConciergeMessagesLoading(true);
      try {
        const idToken = await user.getIdToken();
        const resp = await fetch('/api/telegram/chat', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!resp.ok || !active) return;
        const data = (await resp.json()) as {
          linkedChatId?: string | null;
          messages?: ConciergeChatMessage[];
        };
        if (data.linkedChatId) {
          setLinkedTelegramChatId(data.linkedChatId);
        }
        if (Array.isArray(data.messages)) {
          setConciergeMessages(data.messages);
        }
      } catch {
        // Ignore transient chat load errors
      } finally {
        if (active) setConciergeMessagesLoading(false);
      }
    };

    void syncWithConcierge().then(() => loadConciergeMessages());

    let source: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      source = new EventSource('/api/telegram/events');
      source.onmessage = event => {
        try {
          const parsed = JSON.parse(event.data) as {
            type?: string;
            userId?: string | null;
            booking?: {
              id: string;
              preferredDateTime: string;
              status: BookingRecord['status'];
              treatmentName?: string;
            };
            message?: ConciergeChatMessage;
          };
          if (parsed.type === 'booking_updated' && parsed.booking) {
            const belongsToUser =
              parsed.userId === user.uid ||
              bookings.some(b => b.id === parsed.booking?.id);
            if (belongsToUser) {
              void applyBotUpdateToFirestore(parsed.booking);
            }
          } else if (parsed.type === 'concierge_message' && parsed.message) {
            const incomingMsg = parsed.message;
            const belongsToUser =
              parsed.userId === user.uid ||
              (Boolean(linkedTelegramChatId) && incomingMsg.chatId === linkedTelegramChatId);
            if (belongsToUser) {
              setConciergeMessages(prev => {
                if (prev.some(m => m.id === incomingMsg.id)) return prev;
                return [...prev, incomingMsg].sort((a, b) => a.createdAtMs - b.createdAtMs);
              });
            }
          }
        } catch {
          // Ignore malformed SSE heartbeats
        }
      };
    }

    return () => {
      active = false;
      source?.close();
    };
  }, [authReady, user, profile, profileLoading, bookings, bookingsLoading, linkedTelegramChatId]);

  /**
   * Authenticate with Google popup.
   * Output: authenticated Firebase User.
   */
  const signInWithGoogle = async (): Promise<User> => {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  };

  /**
   * Authenticate with email and password.
   * Inputs: email string, password string.
   * Output: authenticated Firebase User.
   */
  const signInWithEmail = async (email: string, password: string): Promise<User> => {
    const result = await signInWithEmailAndPassword(auth, email.trim(), password);
    return result.user;
  };

  /**
   * Register a new patient account with Email/Password and save validated 18+ profile to Firestore.
   * Inputs: AccountFormValues object.
   * Output: created Firebase User.
   */
  const registerWithEmail = async (values: AccountFormValues): Promise<User> => {
    const validation = validateAccountForm(values, true);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] || 'Invalid account registration details.';
      throw new Error(firstError);
    }

    const cred = await createUserWithEmailAndPassword(auth, values.email.trim(), values.password);
    await updateProfile(cred.user, { displayName: values.fullName.trim() });

    const effectiveTelegram = resolveEffectiveTelegram(values);

    const profilePath = `users/${cred.user.uid}`;
    try {
      await setDoc(doc(db, 'users', cred.user.uid), {
        uid: cred.user.uid,
        fullName: values.fullName.trim(),
        email: cred.user.email || values.email.trim(),
        phoneCountryCode: values.phoneCountryCode.trim(),
        phoneNumber: values.phoneNumber.replace(/\D/g, ''),
        dob: values.dob.trim(),
        telegramMethod: effectiveTelegram.method,
        telegramValue: effectiveTelegram.value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, profilePath);
    }

    // Trigger soft email verification without blocking active session
    sendEmailVerification(cred.user).catch(() => {});
    return cred.user;
  };

  /**
   * Create or update the signed-in user's Firestore profile.
   * Inputs: ProfileUpsertPayload containing validated name, phone+code, 18+ DOB, and Telegram info.
   */
  const saveUserProfile = async (payload: ProfileUpsertPayload): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Please sign in before saving your patient profile.');
    }

    const validation = validateAccountForm(
      {
        fullName: payload.fullName,
        email: currentUser.email || 'patient@elara-atelier.com',
        password: 'placeholder-password',
        phoneCountryCode: payload.phoneCountryCode,
        phoneNumber: payload.phoneNumber,
        dob: payload.dob,
        telegramSameAsPhone: payload.telegramSameAsPhone,
        telegramMethod: payload.telegramMethod,
        telegramValue: payload.telegramValue,
      },
      false
    );
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] || 'Please review your profile fields.';
      throw new Error(firstError);
    }

    const effectiveTelegram = resolveEffectiveTelegram(payload);
    const profilePath = `users/${currentUser.uid}`;
    const docRef = doc(db, 'users', currentUser.uid);

    try {
      if (profile) {
        await updateDoc(docRef, {
          fullName: payload.fullName.trim(),
          phoneCountryCode: payload.phoneCountryCode.trim(),
          phoneNumber: payload.phoneNumber.replace(/\D/g, ''),
          dob: payload.dob.trim(),
          telegramMethod: effectiveTelegram.method,
          telegramValue: effectiveTelegram.value,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(docRef, {
          uid: currentUser.uid,
          fullName: payload.fullName.trim(),
          email: currentUser.email || 'patient@elara-atelier.com',
          phoneCountryCode: payload.phoneCountryCode.trim(),
          phoneNumber: payload.phoneNumber.replace(/\D/g, ''),
          dob: payload.dob.trim(),
          telegramMethod: effectiveTelegram.method,
          telegramValue: effectiveTelegram.value,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, profile ? OperationType.UPDATE : OperationType.CREATE, profilePath);
    }
  };

  /**
   * Persist a validated booking to Firestore for the signed-in user and trigger Telegram concierge dispatch.
   * Inputs: BookingFormValues object.
   * Output: { bookingId, telegramDeepLink, serverDispatched }.
   */
  const createBookingRecord = async (
    values: BookingFormValues
  ): Promise<{ bookingId: string; telegramDeepLink: string; serverDispatched: boolean }> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in to save this booking to your Profile calendar.');
    }

    const validation = validateBookingForm(values);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] || 'Please check the booking details.';
      throw new Error(firstError);
    }

    const bookingId = generateBookingId();
    const chosenTreatment = getTreatmentById(values.treatmentId);
    const treatmentName = chosenTreatment?.name || 'Private Consultation';
    const effectiveTelegram = resolveEffectiveTelegram(values);
    const telegramDeepLink = buildTelegramBotDeepLink(telegramStatus.botUsername, bookingId);

    let serverDispatched = false;
    let notifyStatus: BookingRecord['telegramNotifyStatus'] = 'deep_link_ready';

    try {
      const resp = await fetch('/api/telegram/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          userId: currentUser.uid,
          fullName: values.fullName.trim(),
          phoneCountryCode: values.phoneCountryCode.trim(),
          phoneNumber: values.phoneNumber.replace(/\D/g, ''),
          phone: `${values.phoneCountryCode.trim()} ${values.phoneNumber.replace(/\D/g, '')}`,
          treatmentId: values.treatmentId,
          treatmentName,
          preferredDateTime: values.preferredDateTime,
          telegramMethod: effectiveTelegram.method,
          telegramValue: effectiveTelegram.value,
          chatId: profile?.telegramChatId || undefined,
          createdAtMs: Date.now(),
        }),
      });
      if (resp.ok) {
        const result = await resp.json();
        serverDispatched = Boolean(result.sent);
        notifyStatus = serverDispatched ? 'sent' : 'deep_link_ready';
      }
    } catch {
      notifyStatus = 'deep_link_ready';
    }

    const bookingPath = `bookings/${bookingId}`;
    try {
      await setDoc(doc(db, 'bookings', bookingId), {
        id: bookingId,
        userId: currentUser.uid,
        fullName: values.fullName.trim(),
        phoneCountryCode: values.phoneCountryCode.trim(),
        phoneNumber: values.phoneNumber.replace(/\D/g, ''),
        dob: values.dob.trim(),
        treatmentId: values.treatmentId,
        treatmentName,
        preferredDateTime: values.preferredDateTime,
        telegramMethod: effectiveTelegram.method,
        telegramValue: effectiveTelegram.value,
        telegramNotifyStatus: notifyStatus,
        status: 'requested',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, bookingPath);
    }

    return { bookingId, telegramDeepLink, serverDispatched };
  };

  /**
   * Edit an existing booking within the 4-hour post-creation window.
   * Inputs: bookingId and updated treatment, preferred time, phone, and Telegram fields.
   */
  const editBookingRecord = async (
    bookingId: string,
    patch: {
      treatmentId: string;
      preferredDateTime: string;
      phoneCountryCode: string;
      phoneNumber: string;
      telegramSameAsPhone?: boolean;
      telegramMethod: TelegramContactMethod;
      telegramValue: string;
    }
  ): Promise<void> => {
    const target = bookings.find(item => item.id === bookingId);
    if (!target) {
      throw new Error('Booking record could not be found.');
    }
    if (!canEditBooking(target.createdAtMs, Date.now(), target.status)) {
      throw new Error('The 4-hour modification window for this booking has expired.');
    }

    const validation = validateBookingForm({
      fullName: target.fullName,
      dob: target.dob,
      phoneCountryCode: patch.phoneCountryCode,
      phoneNumber: patch.phoneNumber,
      treatmentId: patch.treatmentId,
      preferredDateTime: patch.preferredDateTime,
      telegramSameAsPhone: patch.telegramSameAsPhone,
      telegramMethod: patch.telegramMethod,
      telegramValue: patch.telegramValue,
    });
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0] || 'Please check updated fields.';
      throw new Error(firstError);
    }

    const chosenTreatment = getTreatmentById(patch.treatmentId);
    const effectiveTelegram = resolveEffectiveTelegram(patch);
    const bookingPath = `bookings/${bookingId}`;

    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        treatmentId: patch.treatmentId,
        treatmentName: chosenTreatment?.name || target.treatmentName,
        preferredDateTime: patch.preferredDateTime,
        phoneCountryCode: patch.phoneCountryCode.trim(),
        phoneNumber: patch.phoneNumber.replace(/\D/g, ''),
        telegramMethod: effectiveTelegram.method,
        telegramValue: effectiveTelegram.value,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, bookingPath);
    }
  };

  /**
   * Cancel an active booking within the 4-hour post-creation window.
   * Inputs: bookingId string.
   */
  const cancelBookingRecord = async (bookingId: string): Promise<void> => {
    const target = bookings.find(item => item.id === bookingId);
    if (!target) {
      throw new Error('Booking record could not be found.');
    }
    if (!canEditBooking(target.createdAtMs, Date.now(), target.status)) {
      throw new Error('The 4-hour modification window for this booking has expired.');
    }

    const bookingPath = `bookings/${bookingId}`;
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, bookingPath);
    }
  };

  /**
   * Send a direct concierge message from the website Profile to the server store & linked Telegram chat.
   * Inputs: raw message string.
   * Output: { sentToTelegram: boolean }.
   */
  const sendConciergeMessage = async (text: string): Promise<{ sentToTelegram: boolean }> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sign in to send a direct concierge message.');
    }
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('Please enter a message before sending.');
    }

    const idToken = await currentUser.getIdToken();
    const resp = await fetch('/api/telegram/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ text: trimmed }),
    });

    const data = (await resp.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      linkedChatId?: string | null;
      sentToTelegram?: boolean;
      message?: ConciergeChatMessage;
    };

    if (!resp.ok || !data.ok || !data.message) {
      throw new Error(data.error || 'Unable to send message right now.');
    }

    if (data.linkedChatId) {
      setLinkedTelegramChatId(data.linkedChatId);
    }
    setConciergeMessages(prev => {
      if (prev.some(m => m.id === data.message!.id)) return prev;
      return [...prev, data.message!].sort((a, b) => a.createdAtMs - b.createdAtMs);
    });
    return { sentToTelegram: Boolean(data.sentToTelegram) };
  };

  /**
   * Sign out of Firebase Auth.
   */
  const signOutUser = async (): Promise<void> => {
    await signOut(auth);
  };

  const userPhotoUrl = extractUserPhotoUrl(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        userPhotoUrl,
        authReady,
        profile,
        profileLoading,
        bookings,
        bookingsLoading,
        telegramStatus,
        linkedTelegramChatId,
        conciergeMessages,
        conciergeMessagesLoading,
        sendConciergeMessage,
        botSyncNotice,
        clearBotSyncNotice: () => setBotSyncNotice(null),
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        saveUserProfile,
        createBookingRecord,
        editBookingRecord,
        cancelBookingRecord,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Access the Elara Atelier authentication and patient profile context.
 * Output: AuthContextValue.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return ctx;
}
