/**
 * Local Vite image asset imports for Elara Atelier editorial photography,
 * treatment showcase cards, testimonial previews, concierge lounge,
 * heading stone texture, and clinical Before/After comparison frames.
 */

import interiorImg from '../assets/images/atelier_card_interior_1794636246346.jpg';
import skincareImg from '../assets/images/atelier_card_skincare_1794636245762.jpg';
import dentalImg from '../assets/images/atelier_card_dental_1794636245324.jpg';
import portraitImg from '../assets/images/atelier_card_portrait_1794636245977.jpg';
import afterSmileImg from '../assets/images/result_after_smile_1794636246977.jpg';
import espressoTextureImg from '../assets/images/heading_espresso_texture_1794636246846.jpg';
import facialBalancingImg from '../assets/images/treatment_facial_balancing_1794640182845.jpg';
import dentalVeneersImg from '../assets/images/treatment_dental_veneers_1794640184067.jpg';
import smileScanImg from '../assets/images/treatment_smile_scan_1794640184709.jpg';
import skinLongevityImg from '../assets/images/treatment_skin_longevity_1794640184889.jpg';
import conciergeSuiteImg from '../assets/images/atelier_concierge_suite_1794640185192.jpg';
import cheekContouringServiceImg from '../assets/images/clinic_cheek_contouring_1794644487062.jpg';
import wrinkleTreatmentServiceImg from '../assets/images/clinic_wrinkle_treatment_1794644487772.jpg';
import teethWhiteningServiceImg from '../assets/images/dental_laser_whitening_1794644488609.jpg';
import clearAlignersServiceImg from '../assets/images/dental_clear_aligners_1794644488989.jpg';
import skinLaserFacialServiceImg from '../assets/images/skin_laser_facial_1794644489788.jpg';
import type { ComparisonCase } from './clinicData';

export interface MediaAsset {
  src: string;
  alt: string;
  objectPosition?: string;
}

export const HERO_HEADING_TEXTURE = espressoTextureImg;

export const CONCIERGE_SUITE_MEDIA: MediaAsset = {
  src: conciergeSuiteImg,
  alt: 'Elara Atelier sculpted travertine arches and sunlit sanctuary lounge in Beverly Hills',
};

export const HERO_BOUNCE_CARDS: MediaAsset[] = [
  {
    src: interiorImg,
    alt: 'Elara Atelier travertine reception lounge bathed in morning light',
  },
  {
    src: skincareImg,
    alt: 'Clinical botanical longevity serum formulation on travertine stone',
  },
  {
    src: dentalImg,
    alt: 'Private sunlit cosmetic dental suite with walnut and brass finishes',
  },
  {
    src: portraitImg,
    alt: 'Patient portrait displaying natural facial harmony and luminous skin',
  },
];

export const TREATMENT_MEDIA: Record<string, MediaAsset> = {
  'fa-contouring': {
    src: cheekContouringServiceImg,
    alt: 'Aesthetic doctor gently marking natural cheekbone and jawline proportion on a patient in clinic',
    objectPosition: 'object-[50%_20%]',
  },
  'fa-neuromodulator': {
    src: wrinkleTreatmentServiceImg,
    alt: 'Aesthetic specialist performing a gentle forehead and brow wrinkle smoothing treatment',
    objectPosition: 'object-[50%_20%]',
  },
  'fa-lip-architecture': {
    src: portraitImg,
    alt: 'Patient displaying soft, naturally balanced lip shaping and hydration',
    objectPosition: 'object-[50%_20%]',
  },
  'fa-biostimulator': {
    src: skinLaserFacialServiceImg,
    alt: 'Skin specialist performing a non-surgical collagen firming procedure in a sunlit suite',
    objectPosition: 'object-[50%_20%]',
  },
  'cd-veneers': {
    src: dentalVeneersImg,
    alt: 'Custom ultra-thin porcelain veneers arranged on a walnut shade tray for smile restoration',
  },
  'cd-smile-design': {
    src: smileScanImg,
    alt: 'Cosmetic 3D digital mouth scanner used to preview tooth proportions before treatment',
  },
  'cd-whitening': {
    src: teethWhiteningServiceImg,
    alt: 'Cosmetic dentist performing an in-chair LED laser teeth whitening session',
    objectPosition: 'object-[50%_25%]',
  },
  'cd-aligners': {
    src: clearAlignersServiceImg,
    alt: 'Cosmetic dentist fitting crystal-clear orthodontic aligner trays alongside a 3D teeth arch model',
  },
  'sl-polynucleotide': {
    src: wrinkleTreatmentServiceImg,
    alt: 'Clinician performing an under-eye skin repair micro-infusion in a private treatment room',
    objectPosition: 'object-[50%_25%]',
  },
  'sl-microneedling': {
    src: skinLaserFacialServiceImg,
    alt: 'Skin specialist gliding an RF microneedling device across a patient cheek for pore and texture renewal',
    objectPosition: 'object-[50%_25%]',
  },
  'sl-laser-toning': {
    src: cheekContouringServiceImg,
    alt: 'Specialist preparing a patient face for an even-tone sun-spot laser facial session',
    objectPosition: 'object-[50%_20%]',
  },
  'sl-barrier-infusion': {
    src: skinLongevityImg,
    alt: 'Sculpted cooling cryo wands and clinical soothing setup for lymphatic facial therapy',
  },
};

export const TESTIMONIAL_MEDIA: Record<string, MediaAsset> = {
  't-camille': {
    src: dentalVeneersImg,
    alt: 'Porcelain veneer shade selection tray prepared for bespoke smile restoration',
  },
  't-julian': {
    src: facialBalancingImg,
    alt: 'Facial proportion architecture instruments inside private consultation suite',
  },
  't-elena': {
    src: skinLaserFacialServiceImg,
    alt: 'Gentle skin renewal treatment performed in a sunlit private suite',
    objectPosition: 'object-[50%_25%]',
  },
};

const CLEAN_SMILE_PHOTO = '/assets/aistudio/Radiant_Professional_Smile_Close-Up_2485c4d0.png';

export const COMPARISON_CASES: ComparisonCase[] = [
  {
    id: 'porcelain-veneers',
    title: 'Brighter, Even Smile Results',
    treatment: 'Porcelain Veneers (8 Front Teeth)',
    timeframe: '1–2 Visits · Up to 14 Days',
    beforeLabel: 'Before',
    afterLabel: 'After',
    beforeSrc: CLEAN_SMILE_PHOTO,
    afterSrc: CLEAN_SMILE_PHOTO,
    summary:
      'Ultra-thin custom porcelain layers cover chips, gaps, and deep stains—giving you a naturally brighter, even smile without shaving down your real teeth.',
  },
];
