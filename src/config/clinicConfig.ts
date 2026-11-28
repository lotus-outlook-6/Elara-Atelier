/**
 * Central configuration for Elara Atelier — Aesthetic & Dental Studio.
 * Holds brand tokens, clinic contact details, operating hours, validation bounds,
 * international calling prefixes, and Telegram concierge configuration.
 */

export interface CountryCodeOption {
  code: string;
  country: string;
  label: string;
}

export const COUNTRY_CODES: readonly CountryCodeOption[] = [
  { code: '+1', country: 'US / CA', label: '+1 (US/CA)' },
  { code: '+44', country: 'UK', label: '+44 (UK)' },
  { code: '+91', country: 'IN', label: '+91 (IN)' },
  { code: '+33', country: 'FR', label: '+33 (FR)' },
  { code: '+49', country: 'DE', label: '+49 (DE)' },
  { code: '+39', country: 'IT', label: '+39 (IT)' },
  { code: '+34', country: 'ES', label: '+34 (ES)' },
  { code: '+41', country: 'CH', label: '+41 (CH)' },
  { code: '+61', country: 'AU', label: '+61 (AU)' },
  { code: '+65', country: 'SG', label: '+65 (SG)' },
  { code: '+81', country: 'JP', label: '+81 (JP)' },
  { code: '+971', country: 'UAE', label: '+971 (UAE)' },
] as const;

export const CLINIC_COLORS = {
  background: '#FAF7F2',
  surface: '#EFE9E0',
  surfaceMuted: '#E5DACB',
  espresso: '#1F1B18',
  taupe: '#6E655F',
  champagne: '#B68D5E',
  champagneSoft: '#C9A77C',
  stone: '#E2D9CE',
  ivory: '#FAF7F2',
  danger: '#9E3B33',
  success: '#4B6B50',
} as const;

export const CLINIC_CONFIG = {
  brandName: 'ELARA ATELIER',
  fullTitle: 'Elara Atelier — Aesthetic & Dental Studio',
  tagline: 'Facial Aesthetics · Cosmetic Dentistry · Skin Renewal',
  addressLine1: '742 Mercer Row, Suite 300',
  addressLine2: 'Beverly Hills, CA 90210',
  phoneDisplay: '+1 (310) 555-0194',
  phoneHref: 'tel:+13105550194',
  whatsappNumber: '13105550194',
  whatsappDefaultMessage: 'hi',
  email: 'concierge@elara-atelier.com',
  hoursSummary: 'Mon–Fri, 10:00 AM – 7:00 PM',
  hoursShort: 'Mon–Fri · 10 AM – 7 PM',
  hoursDetail: [
    { days: 'Monday – Friday', time: '10:00 AM – 7:00 PM' },
    { days: 'Saturday & Sunday', time: 'Closed' },
  ],
  mapsEmbedUrl:
    'https://www.google.com/maps?q=Beverly+Hills,+CA+90210&output=embed',
  mapsExternalUrl: 'https://maps.google.com/?q=Beverly+Hills,+CA+90210',
  studioCoordinates: { lat: 34.0736, lng: -118.4004 },
  hydrationDurationMs: 650,
  submissionDelayMs: 900,
  minPatientAge: 18,
  bookingEditWindowMs: 4 * 60 * 60 * 1000,
  defaultTelegramBotUsername: 'ElaraAtelierBot',
  defaultTeamBotUsername: 'ElaraAtelierTeamBot',
  clinicTimeZone: 'America/Los_Angeles',
  morningDigestHour: 8,
  morningDigestMinute: 30,
  eodPdfHour: 8,
  eodPdfMinute: 30,
  projectShowcaseUrl:
    'https://aistudio.google.com/apps/4a09f8e6-265b-4cf0-bd8d-dfa42d7b8f03?showPreview=true&showAssistant=true',
  githubRepoUrl:
    'https://github.com/lotus-outlook-6/Elara-Atelier#interactive-before--after-preview',
  telegramBotUrl: 'https://web.telegram.org/k/#@ElaraAtelierBot',
} as const;
