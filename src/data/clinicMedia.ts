/**
 * Local Vite image asset imports for Elara Atelier editorial photography,
 * 12 unique treatment catalog cards, testimonial previews, concierge lounge,
 * heading stone texture, and per-treatment Before/After comparison frames.
 */

import interiorImg from '../assets/images/atelier_card_interior_1794636246346.jpg';
import skincareImg from '../assets/images/atelier_card_skincare_1794636245762.jpg';
import dentalImg from '../assets/images/atelier_card_dental_1794636245324.jpg';
import espressoTextureImg from '../assets/images/heading_espresso_texture_1794636246846.jpg';
import facialBalancingImg from '../assets/images/treatment_facial_balancing_1794640182845.jpg';
import dentalVeneersImg from '../assets/images/treatment_dental_veneers_1794640184067.jpg';
import smileScanImg from '../assets/images/treatment_smile_scan_1794640184709.jpg';
import skinLongevityImg from '../assets/images/treatment_skin_longevity_1794640184889.jpg';
import clinicExteriorImg from '../assets/images/elara_clinic_exterior_1794908741926.jpg';
import testimonialSmileImg from '../assets/images/testimonial_smile_selfie_1794908523568.jpg';
import testimonialJawlineImg from '../assets/images/testimonial_jawline_selfie_1794908524978.jpg';
import testimonialSkinImg from '../assets/images/testimonial_skin_selfie_1794908526405.jpg';
import cheekContouringServiceImg from '../assets/images/clinic_cheek_contouring_1794644487062.jpg';
import wrinkleTreatmentServiceImg from '../assets/images/clinic_wrinkle_treatment_1794644487772.jpg';
import teethWhiteningServiceImg from '../assets/images/dental_laser_whitening_1794644488609.jpg';
import clearAlignersServiceImg from '../assets/images/dental_clear_aligners_1794644488989.jpg';
import skinLaserFacialServiceImg from '../assets/images/skin_laser_facial_1794644489788.jpg';

// Newly generated treatment-accurate catalog photography
import lipShapingServiceImg from '../assets/images/catalog_lip_shaping_1794754130443.jpg';
import collagenFirmingServiceImg from '../assets/images/catalog_collagen_firming_1794754131691.jpg';
import underEyeRenewalServiceImg from '../assets/images/catalog_undereye_renewal_1794754132479.jpg';
import rfMicroneedlingServiceImg from '../assets/images/catalog_rf_microneedling_1794754132497.jpg';
import laserToningServiceImg from '../assets/images/catalog_laser_toning_1794754133022.jpg';

// Pixel-aligned clinical Before & After pairs for every service
import beforeCheekJawlineImg from '../assets/images/before_cheek_jawline_1794754169616.jpg';
import afterCheekJawlineImg from '../assets/images/after_cheek_jawline_1794754133975.jpg';
import beforeForeheadSmoothImg from '../assets/images/before_forehead_smooth_1794754317668.jpg';
import afterForeheadSmoothImg from '../assets/images/after_forehead_smooth_1794754135402.jpg';
import beforeLipShapingImg from '../assets/images/before_lip_shaping_1794754319018.jpg';
import afterLipShapingImg from '../assets/images/after_lip_shaping_1794754135431.jpg';
import beforeCollagenFirmingImg from '../assets/images/before_collagen_firming_1794754319854.jpg';
import afterCollagenFirmingImg from '../assets/images/after_collagen_firming_1794754135128.jpg';
import beforeSmilePreviewImg from '../assets/images/before_smile_preview_1794754321672.jpg';
import afterSmilePreviewImg from '../assets/images/after_smile_preview_1794754136236.jpg';
import beforeLaserWhiteningImg from '../assets/images/before_laser_whitening_1794757585578.jpg';
import afterLaserWhiteningImg from '../assets/images/after_laser_whitening_1794757496642.jpg';
import beforeAlignersTeethImg from '../assets/images/before_aligners_teeth_1794754341073.jpg';
import afterAlignersTeethImg from '../assets/images/after_aligners_teeth_1794754135183.jpg';
import beforeUnderEyeImg from '../assets/images/before_undereye_renewal_1794754320477.jpg';
import afterUnderEyeImg from '../assets/images/after_undereye_renewal_1794754136796.jpg';
import beforeMicroneedlingCheekImg from '../assets/images/before_microneedling_cheek_1794754322235.jpg';
import afterMicroneedlingCheekImg from '../assets/images/after_microneedling_cheek_1794754176696.jpg';
import beforeLaserToningImg from '../assets/images/before_laser_toning_1794754175076.jpg';
import afterLaserToningImg from '../assets/images/after_laser_toning_1794754137324.jpg';
import beforeCoolingSculptImg from '../assets/images/before_cooling_sculpt_1794754178686.jpg';
import afterCoolingSculptImg from '../assets/images/after_cooling_sculpt_1794754138867.jpg';

import type { ComparisonCase } from './clinicData';

export interface MediaAsset {
  src: string;
  alt: string;
  objectPosition?: string;
}

export const HERO_HEADING_TEXTURE = espressoTextureImg;

export const CONCIERGE_SUITE_MEDIA: MediaAsset = {
  src: clinicExteriorImg,
  alt: 'Elara Atelier limestone and bronze clinic storefront entrance in Beverly Hills',
  objectPosition: 'object-center',
};

export const HERO_BOUNCE_CARDS: MediaAsset[] = [
  {
    src: rfMicroneedlingServiceImg,
    alt: 'Skin specialist performing gentle RF microneedling skin renewal treatment',
  },
  {
    src: dentalVeneersImg,
    alt: 'Custom ultra-thin porcelain veneers arranged on a walnut shade tray',
  },
  {
    src: teethWhiteningServiceImg,
    alt: 'Cosmetic dentist performing an in-chair laser teeth whitening session',
  },
  {
    src: lipShapingServiceImg,
    alt: 'Doctor consulting with a patient for natural facial and lip balancing',
  },
];

export const TRUST_METRIC_VIGNETTES: MediaAsset[] = [
  {
    src: interiorImg,
    alt: 'Elara Atelier reception lounge bathed in morning light',
  },
  {
    src: dentalImg,
    alt: 'Private sunlit cosmetic dental suite with warm walnut finishes',
  },
  {
    src: skincareImg,
    alt: 'Gentle restorative skin serums on natural stone',
  },
];

export const TREATMENT_MEDIA: Record<string, MediaAsset> = {
  'fa-contouring': {
    src: cheekContouringServiceImg,
    alt: 'Doctor gently marking cheekbone and jawline balance on a patient in clinic',
    objectPosition: 'object-[50%_20%]',
  },
  'fa-neuromodulator': {
    src: wrinkleTreatmentServiceImg,
    alt: 'Specialist performing a gentle forehead and brow wrinkle smoothing treatment',
    objectPosition: 'object-[50%_20%]',
  },
  'fa-lip-architecture': {
    src: lipShapingServiceImg,
    alt: 'Doctor consulting and measuring balanced lip hydration and shape with a patient',
    objectPosition: 'object-[50%_20%]',
  },
  'fa-biostimulator': {
    src: collagenFirmingServiceImg,
    alt: 'Doctor checking cheek firmness and lower facial support with a smiling patient',
    objectPosition: 'object-[50%_20%]',
  },
  'cd-veneers': {
    src: dentalVeneersImg,
    alt: 'Custom ultra-thin porcelain veneers arranged on a shade tray for smile restoration',
  },
  'cd-smile-design': {
    src: smileScanImg,
    alt: 'Painless 3D mouth scanner showing a digital preview of tooth alignment',
  },
  'cd-whitening': {
    src: teethWhiteningServiceImg,
    alt: 'Cosmetic dentist performing an in-chair LED laser teeth whitening session',
    objectPosition: 'object-[50%_25%]',
  },
  'cd-aligners': {
    src: clearAlignersServiceImg,
    alt: 'Cosmetic dentist fitting clear removable orthodontic aligner trays alongside a teeth model',
  },
  'sl-polynucleotide': {
    src: underEyeRenewalServiceImg,
    alt: 'Clinician gently treating dark circles and fine lines beneath the eyes',
    objectPosition: 'object-[50%_25%]',
  },
  'sl-microneedling': {
    src: rfMicroneedlingServiceImg,
    alt: 'Skin specialist gliding a gold-tipped RF microneedling handpiece gently across a cheek',
    objectPosition: 'object-[50%_25%]',
  },
  'sl-laser-toning': {
    src: laserToningServiceImg,
    alt: 'Patient wearing protective eyewear during a gentle sun-spot laser facial session',
    objectPosition: 'object-[50%_20%]',
  },
  'sl-barrier-infusion': {
    src: skinLongevityImg,
    alt: 'Cooling cryo facial wands prepared for calming puffiness and hydrating sensitive skin',
  },
};

export const TESTIMONIAL_MEDIA: Record<string, MediaAsset> = {
  't-hannah': {
    src: testimonialSmileImg,
    alt: 'Natural daylight close-up smile photo of Hannah after porcelain veneer care',
    objectPosition: 'object-[50%_22%]',
  },
  't-david': {
    src: testimonialJawlineImg,
    alt: 'Natural daylight portrait of David showing balanced jawline results',
    objectPosition: 'object-[50%_22%]',
  },
  't-priya': {
    src: testimonialSkinImg,
    alt: 'Daylight close-up portrait of Priya showing brighter under-eye skin',
    objectPosition: 'object-[50%_22%]',
  },
};

const CLEAN_SMILE_PHOTO = '/assets/aistudio/Radiant_Professional_Smile_Close-Up_2485c4d0.png';

export const COMPARISON_CASES: ComparisonCase[] = [
  {
    id: 'cheek-jawline',
    treatmentId: 'fa-contouring',
    categoryLabel: 'Facial Results',
    title: 'Lifted Cheeks & Defined Jawline',
    treatment: 'Cheek & Jawline Contouring',
    timeframe: '45 min visit · Immediate Result',
    startingPrice: '$450',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Contouring',
    beforeSrc: beforeCheekJawlineImg,
    afterSrc: afterCheekJawlineImg,
    summary:
      'Subtle structural filler adds gentle lift under the cheekbones and sharpens the jawline while keeping your natural side profile completely authentic.',
  },
  {
    id: 'forehead-wrinkles',
    treatmentId: 'fa-neuromodulator',
    categoryLabel: 'Facial Results',
    title: 'Smoother Forehead & Relaxed Brows',
    treatment: 'Wrinkle Relaxing Injections',
    timeframe: '30 min visit · Results in 5–7 Days',
    startingPrice: '$140',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Treatment',
    beforeSrc: beforeForeheadSmoothImg,
    afterSrc: afterForeheadSmoothImg,
    summary:
      'Small targeted injections soften horizontal forehead lines and frown creases between the brows so you look rested without losing natural expressions.',
  },
  {
    id: 'lip-shaping',
    treatmentId: 'fa-lip-architecture',
    categoryLabel: 'Facial Results',
    title: 'Soft, Hydrated & Balanced Lips',
    treatment: 'Natural Lip Shaping & Hydration',
    timeframe: '40 min visit · Minimal Downtime',
    startingPrice: '$260',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Lip Shaping',
    beforeSrc: beforeLipShapingImg,
    afterSrc: afterLipShapingImg,
    summary:
      'Smooth hyaluronic lip filler gently restores border definition, smooths vertical dry lines, and adds subtle natural volume tailored to your face.',
  },
  {
    id: 'collagen-firming',
    treatmentId: 'fa-biostimulator',
    categoryLabel: 'Facial Results',
    title: 'Firmer Lower Face & Softer Smile Folds',
    treatment: 'Collagen Skin-Firming Session',
    timeframe: '50 min visit · Builds Over 4–8 Weeks',
    startingPrice: '$420',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Collagen Boost',
    beforeSrc: beforeCollagenFirmingImg,
    afterSrc: afterCollagenFirmingImg,
    summary:
      'Helps your own skin rebuild fresh collagen to soften deeper smile folds and gently tighten lower cheeks and jawline skin without surgery.',
  },
  {
    id: 'porcelain-veneers',
    treatmentId: 'cd-veneers',
    categoryLabel: 'Smile Results',
    title: 'Brighter, Even Smile Results',
    treatment: 'Porcelain Veneers (Smile Makeover)',
    timeframe: '1–2 Visits · Up to 14 Days',
    startingPrice: '$240',
    retouchMode: 'teeth',
    beforeLabel: 'Before',
    afterLabel: 'After Veneers',
    beforeSrc: CLEAN_SMILE_PHOTO,
    afterSrc: CLEAN_SMILE_PHOTO,
    summary:
      'Ultra-thin custom porcelain shells cover chips, gaps, and deep stains—giving you a naturally brighter, even smile.',
  },
  {
    id: 'digital-smile-preview',
    treatmentId: 'cd-smile-design',
    categoryLabel: 'Smile Results',
    title: 'See Your New Smile Before You Start',
    treatment: '3D Digital Smile Preview',
    timeframe: '60 min visit · Same-Day Preview',
    startingPrice: '$60',
    retouchMode: 'pair',
    beforeLabel: '3D Scan Blueprint',
    afterLabel: 'Finished Smile',
    beforeSrc: beforeSmilePreviewImg,
    afterSrc: afterSmilePreviewImg,
    summary:
      'A gentle 3D mouth scan maps tooth proportions digitally so you can preview and approve your exact smile shape before any dental work begins.',
  },
  {
    id: 'laser-whitening',
    treatmentId: 'cd-whitening',
    categoryLabel: 'Smile Results',
    title: 'Single-Visit Laser Teeth Whitening',
    treatment: 'In-Chair Laser Teeth Whitening',
    timeframe: '75 min visit · Same-Day Brightening',
    startingPrice: '$150',
    retouchMode: 'whitening-pair',
    beforeLabel: 'Before Whitening',
    afterLabel: 'After Laser Session',
    beforeSrc: beforeLaserWhiteningImg,
    afterSrc: afterLaserWhiteningImg,
    summary:
      'Dentist-guided LED laser whitening gently lifts years of coffee, tea, and wine stains in a single 75-minute visit while protecting enamel and gum comfort.',
  },
  {
    id: 'clear-aligners',
    treatmentId: 'cd-aligners',
    categoryLabel: 'Smile Results',
    title: 'Straighter Teeth Without Metal Braces',
    treatment: 'Clear Orthodontic Aligners',
    timeframe: '4–8 months · Removable Trays',
    startingPrice: '$950',
    retouchMode: 'pair',
    beforeLabel: 'Before Aligners',
    afterLabel: 'After Alignment',
    beforeSrc: beforeAlignersTeethImg,
    afterSrc: afterAlignersTeethImg,
    summary:
      'Custom transparent trays gently close front gaps and align rotated teeth discreetly, fitted and tracked directly by our dental team.',
  },
  {
    id: 'undereye-renewal',
    treatmentId: 'sl-polynucleotide',
    categoryLabel: 'Skin Results',
    title: 'Brighter, Well-Rested Under-Eyes',
    treatment: 'Under-Eye Renewal Treatment',
    timeframe: '45 min visit · Minimal Downtime',
    startingPrice: '$180',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Under-Eye Care',
    beforeSrc: beforeUnderEyeImg,
    afterSrc: afterUnderEyeImg,
    summary:
      'Targets dark under-eye shadows, delicate crepey lines, and mild hollowness to leave the eye area noticeably smoother and fresher.',
  },
  {
    id: 'rf-microneedling',
    treatmentId: 'sl-microneedling',
    categoryLabel: 'Skin Results',
    title: 'Tighter Pores & Smoother Acne Scars',
    treatment: 'RF Microneedling Skin Tightening',
    timeframe: '60 min visit · Progressive Glow',
    startingPrice: '$220',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Microneedling',
    beforeSrc: beforeMicroneedlingCheekImg,
    afterSrc: afterMicroneedlingCheekImg,
    summary:
      'Fine needles with gentle warmth smooth textured acne scars, shrink visible cheek pores, and tighten surface skin tone.',
  },
  {
    id: 'laser-toning',
    treatmentId: 'sl-laser-toning',
    categoryLabel: 'Skin Results',
    title: 'Clearer Skin Free of Sun Spots',
    treatment: 'Tone & Sun-Spot Laser Facial',
    timeframe: '45 min visit · Zero Downtime',
    startingPrice: '$95',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Laser Facial',
    beforeSrc: beforeLaserToningImg,
    afterSrc: afterLaserToningImg,
    summary:
      'Gentle pigment-targeting laser energy fades brown sun spots, freckles, and patchy discoloration to restore clear, even skin tone.',
  },
  {
    id: 'cooling-sculpt-facial',
    treatmentId: 'sl-barrier-infusion',
    categoryLabel: 'Skin Results',
    title: 'Calmed Redness & Sculpted Glow',
    treatment: 'Sculpting Facial & Cooling Therapy',
    timeframe: '75 min visit · Instant Refresh',
    startingPrice: '$75',
    retouchMode: 'pair',
    beforeLabel: 'Before',
    afterLabel: 'After Cooling Facial',
    beforeSrc: beforeCoolingSculptImg,
    afterSrc: afterCoolingSculptImg,
    summary:
      'Hands-on sculpting massage paired with chilled cooling tools visibly calms cheek flushing, reduces puffiness, and deeply hydrates skin.',
  },
];
