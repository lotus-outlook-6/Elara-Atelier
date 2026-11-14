/**
 * Domain catalog and editorial content for Elara Atelier — Aesthetic & Dental Studio.
 * Contains treatments, clinical trust metrics, before/after metadata types, and verified testimonials.
 */

export type TreatmentCategory =
  | 'Facial Aesthetics'
  | 'Cosmetic Dentistry'
  | 'Skin Longevity';

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
  title: string;
  treatment: string;
  timeframe: string;
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
    label: 'Years Clinical Excellence',
    detail: 'Board-certified cosmetic dentists and facial aesthetic physicians practicing under one roof.',
  },
  {
    id: 'procedures',
    to: 4800,
    separator: ',',
    suffix: '+',
    label: 'Procedures Performed',
    detail: 'Bespoke non-surgical facial harmonizations, porcelain veneers, and cellular skin protocols.',
  },
  {
    id: 'rating',
    to: 4.9,
    decimals: 1,
    suffix: '★',
    label: 'Verified Patient Rating',
    detail: 'Measured across post-care clinical follow-ups and independent patient reviews.',
  },
];

export const TREATMENT_CATEGORIES: TreatmentCategory[] = [
  'Facial Aesthetics',
  'Cosmetic Dentistry',
  'Skin Longevity',
];

export const TREATMENTS: TreatmentItem[] = [
  // Facial Aesthetics
  {
    id: 'fa-contouring',
    category: 'Facial Aesthetics',
    name: 'Cheek & Jawline Contouring',
    benefit:
      'In-clinic filler appointment performed by our doctor to gently lift cheekbones and define your jawline without surgery.',
    duration: '45 min visit',
    startingPrice: '$1,150',
    colSpan: 2,
  },
  {
    id: 'fa-neuromodulator',
    category: 'Facial Aesthetics',
    name: 'Wrinkle Relaxing Injections',
    benefit:
      'Quick targeted micro-injections that smooth forehead lines and crow’s feet while keeping natural facial expressions.',
    duration: '30 min visit',
    startingPrice: '$480',
  },
  {
    id: 'fa-lip-architecture',
    category: 'Facial Aesthetics',
    name: 'Natural Lip Shaping & Hydration',
    benefit:
      'Soft hyaluronic lip filler appointment that adds subtle fullness, smooths dry lines, and keeps your smile balanced.',
    duration: '40 min visit',
    startingPrice: '$790',
  },
  {
    id: 'fa-biostimulator',
    category: 'Facial Aesthetics',
    name: 'Collagen Skin-Firming Session',
    benefit:
      'Non-surgical clinic procedure that stimulates your skin’s own collagen to tighten sagging cheeks, temples, and jawline.',
    duration: '50 min visit',
    startingPrice: '$1,450',
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
    startingPrice: '$1,950 / tooth',
    colSpan: 2,
  },
  {
    id: 'cd-smile-design',
    category: 'Cosmetic Dentistry',
    name: '3D Digital Smile Preview',
    benefit:
      'Painless 3D mouth scan and preview session letting you see your new tooth shape before starting any dental work.',
    duration: '60 min visit',
    startingPrice: '$420',
  },
  {
    id: 'cd-whitening',
    category: 'Cosmetic Dentistry',
    name: 'In-Chair Laser Teeth Whitening',
    benefit:
      'Dentist-supervised whitening session that safely lifts years of coffee, tea, and wine stains in a single appointment.',
    duration: '75 min visit',
    startingPrice: '$690',
  },
  {
    id: 'cd-aligners',
    category: 'Cosmetic Dentistry',
    name: 'Clear Orthodontic Aligners',
    benefit:
      'Custom clear removable trays fitted by our dental team to gradually straighten crowded or gapped teeth discreetly.',
    duration: '4–8 months',
    startingPrice: '$4,200',
    colSpan: 2,
  },

  // Skin Longevity
  {
    id: 'sl-polynucleotide',
    category: 'Skin Longevity',
    name: 'Under-Eye Renewal Treatment',
    benefit:
      'Clinic micro-infusion procedure for dark circles and fine under-eye lines to restore firmer, well-rested skin.',
    duration: '45 min visit',
    startingPrice: '$880',
    colSpan: 2,
  },
  {
    id: 'sl-microneedling',
    category: 'Skin Longevity',
    name: 'RF Microneedling Skin Tightening',
    benefit:
      'Tiny precision needles paired with gentle warmth to shrink pores, smooth acne scars, and tighten facial skin.',
    duration: '60 min visit',
    startingPrice: '$1,050',
  },
  {
    id: 'sl-laser-toning',
    category: 'Skin Longevity',
    name: 'Tone & Sun-Spot Laser Facial',
    benefit:
      'No-downtime laser session performed by our skin specialist to fade sun spots, uneven pigment, and redness.',
    duration: '45 min visit',
    startingPrice: '$650',
  },
  {
    id: 'sl-barrier-infusion',
    category: 'Skin Longevity',
    name: 'Sculpting Facial & Cooling Therapy',
    benefit:
      'Hands-on facial massage and cooling therapy in our studio to reduce puffiness, calm redness, and hydrate skin.',
    duration: '75 min visit',
    startingPrice: '$490',
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
