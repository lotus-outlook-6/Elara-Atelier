/**
 * Domain catalog and editorial content for Elara Atelier — Aesthetic & Dental Studio.
 * Contains treatments, clinical trust metrics, before/after metadata types, and verified testimonials.
 */

export type TreatmentCategory =
  | 'Facial Aesthetics'
  | 'Cosmetic Dentistry'
  | 'Skin Renewal';

export interface TreatmentItem {
  id: string;
  category: TreatmentCategory;
  name: string;
  benefit: string;
  duration: string;
  startingPrice: string;
  colSpan?: number;
  rowSpan?: number;
}

export interface TrustMetric {
  id: string;
  to: number;
  decimals?: number;
  prefix?: string;
  suffix: string;
  separator?: string;
  label: string;
  detail: string;
}

export interface TestimonialItem {
  id: string;
  patientName: string;
  location: string;
  treatment: string;
  rating: number;
  quote: string;
}

export interface ComparisonCase {
  id: string;
  treatmentId: string;
  categoryLabel: string;
  title: string;
  treatment: string;
  timeframe: string;
  startingPrice: string;
  retouchMode: 'teeth' | 'pair' | 'whitening-pair';
  beforeLabel: string;
  afterLabel: string;
  beforeSrc: string;
  afterSrc: string;
  summary: string;
}

export const TRUST_METRICS: TrustMetric[] = [
  {
    id: 'years',
    to: 12,
    suffix: '+',
    label: 'Years of Experience',
    detail: 'Board-certified cosmetic dentists and facial aesthetic doctors practicing under one roof.',
  },
  {
    id: 'procedures',
    to: 4800,
    separator: ',',
    suffix: '+',
    label: 'Treatments Completed',
    detail: 'Natural facial balancing, custom porcelain veneers, and gentle skin care sessions.',
  },
  {
    id: 'rating',
    to: 4.9,
    decimals: 1,
    suffix: '★',
    label: 'Verified Patient Rating',
    detail: 'Based on verified patient reviews and post-visit follow-ups.',
  },
];

export const TREATMENT_CATEGORIES: TreatmentCategory[] = [
  'Facial Aesthetics',
  'Cosmetic Dentistry',
  'Skin Renewal',
];

export const TREATMENTS: TreatmentItem[] = [
  // Facial Aesthetics
  {
    id: 'fa-contouring',
    category: 'Facial Aesthetics',
    name: 'Cheek & Jawline Contouring',
    benefit:
      'Doctor-guided filler appointment to gently lift cheekbones and define your jawline without surgery.',
    duration: '45 min visit',
    startingPrice: '$450',
    colSpan: 2,
  },
  {
    id: 'fa-neuromodulator',
    category: 'Facial Aesthetics',
    name: 'Wrinkle Relaxing Injections',
    benefit:
      'Quick targeted injections that smooth forehead creases and crow’s feet while keeping natural facial expressions.',
    duration: '30 min visit',
    startingPrice: '$140',
  },
  {
    id: 'fa-lip-architecture',
    category: 'Facial Aesthetics',
    name: 'Natural Lip Shaping & Hydration',
    benefit:
      'Soft lip filler appointment that adds gentle fullness, smooths dry lines, and keeps your smile balanced.',
    duration: '40 min visit',
    startingPrice: '$260',
  },
  {
    id: 'fa-biostimulator',
    category: 'Facial Aesthetics',
    name: 'Collagen Skin-Firming Session',
    benefit:
      'Non-surgical treatment that boosts natural collagen to gradually firm cheeks, smile lines, and jawline.',
    duration: '50 min visit',
    startingPrice: '$420',
    colSpan: 2,
  },

  // Cosmetic Dentistry
  {
    id: 'cd-veneers',
    category: 'Cosmetic Dentistry',
    name: 'Porcelain Veneers (Smile Makeover)',
    benefit:
      'Custom ultra-thin porcelain shells bonded to the front of your teeth to fix chips, gaps, and deep discoloration.',
    duration: '2 visits · 14 days',
    startingPrice: '$240',
    colSpan: 2,
  },
  {
    id: 'cd-smile-design',
    category: 'Cosmetic Dentistry',
    name: '3D Digital Smile Preview',
    benefit:
      'Painless 3D mouth scan and preview session letting you see your new tooth shape before starting any dental work.',
    duration: '60 min visit',
    startingPrice: '$60',
  },
  {
    id: 'cd-whitening',
    category: 'Cosmetic Dentistry',
    name: 'In-Chair Laser Teeth Whitening',
    benefit:
      'Dentist-supervised whitening session that safely lifts years of coffee, tea, and wine stains in a single appointment.',
    duration: '75 min visit',
    startingPrice: '$150',
  },
  {
    id: 'cd-aligners',
    category: 'Cosmetic Dentistry',
    name: 'Clear Orthodontic Aligners',
    benefit:
      'Custom clear removable trays fitted by our dental team to gradually straighten crowded or gapped teeth discreetly.',
    duration: '4–8 months',
    startingPrice: '$950',
    colSpan: 2,
  },

  // Skin Renewal
  {
    id: 'sl-polynucleotide',
    category: 'Skin Renewal',
    name: 'Under-Eye Renewal Treatment',
    benefit:
      'Gentle under-eye micro-infusion that brightens dark circles, softens hollows, and smooths fine lines.',
    duration: '45 min visit',
    startingPrice: '$180',
    colSpan: 2,
  },
  {
    id: 'sl-microneedling',
    category: 'Skin Renewal',
    name: 'RF Microneedling Skin Tightening',
    benefit:
      'Tiny needles paired with gentle warmth to tighten pores, smooth acne scars, and firm facial skin.',
    duration: '60 min visit',
    startingPrice: '$220',
  },
  {
    id: 'sl-laser-toning',
    category: 'Skin Renewal',
    name: 'Tone & Sun-Spot Laser Facial',
    benefit:
      'Zero-downtime laser session performed by our skin specialist to fade sun spots, uneven tone, and redness.',
    duration: '45 min visit',
    startingPrice: '$95',
  },
  {
    id: 'sl-barrier-infusion',
    category: 'Skin Renewal',
    name: 'Sculpting Facial & Cooling Therapy',
    benefit:
      'Hands-on sculpting massage and cooling therapy to reduce morning puffiness, calm redness, and hydrate skin.',
    duration: '75 min visit',
    startingPrice: '$75',
    colSpan: 2,
  },
];

export const TESTIMONIALS: TestimonialItem[] = [
  {
    id: 't-camille',
    patientName: 'Camille Laurent',
    location: 'Beverly Hills',
    treatment: 'Porcelain Veneers (Smile Makeover)',
    rating: 5,
    quote:
      'Every detail felt measured rather than rushed. My veneers look completely natural—friends notice I look rested, never overdone.',
  },
  {
    id: 't-julian',
    patientName: 'Julian Mercer',
    location: 'Bel Air',
    treatment: 'Cheek & Jawline Contouring',
    rating: 5,
    quote:
      'The doctors mapped my facial balance alongside my bite. Subtle jawline support restored structure without changing my expression.',
  },
  {
    id: 't-elena',
    patientName: 'Elena Vance',
    location: 'Santa Monica',
    treatment: 'Under-Eye Renewal Treatment',
    rating: 5,
    quote:
      'Walking into Elara feels like entering a quiet stone sanctuary. Three sessions in, my under-eye skin looks firmer and genuinely brighter.',
  },
];
