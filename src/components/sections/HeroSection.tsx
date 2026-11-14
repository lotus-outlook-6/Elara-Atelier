/**
 * Hero section for Elara Atelier combining SoftAurora daylight atmosphere,
 * MaskedHeading editorial serif title, BlurText clinical subheadline,
 * hold-only HoldButton reservation highlight (with clinic day & hours), and BounceCards gallery.
 */

import React, { useEffect, useState } from 'react';
import { ArrowDownRight, Clock } from 'lucide-react';
import { CLINIC_CONFIG } from '../../config/clinicConfig';
import { HERO_BOUNCE_CARDS, HERO_HEADING_TEXTURE } from '../../data/clinicMedia';
import BlurText from '../reactbits/BlurText';
import BounceCards from '../reactbits/BounceCards';
import HoldButton from '../reactbits/HoldButton';
import MaskedHeading from '../reactbits/MaskedHeading';
import SoftAurora from '../reactbits/SoftAurora';

export interface HeroSectionProps {
  onReserveClick: () => void;
}

interface BounceDimensions {
  containerWidth: number;
  containerHeight: number;
  cardSize: number;
  spread: number;
  pushDistance: number;
}

/**
 * Compute responsive BounceCards geometry from viewport width.
 * Inputs: window width in pixels.
 * Output: BounceDimensions object preventing horizontal overflow on narrow mobile screens.
 */
function getResponsiveBounceDimensions(viewportWidth: number): BounceDimensions {
  if (viewportWidth < 400) {
    return {
      containerWidth: 292,
      containerHeight: 186,
      cardSize: 108,
      spread: 44,
      pushDistance: 48,
    };
  }
  if (viewportWidth < 480) {
    return {
      containerWidth: 336,
      containerHeight: 210,
      cardSize: 124,
      spread: 52,
      pushDistance: 58,
    };
  }
  if (viewportWidth < 1024) {
    return {
      containerWidth: 440,
      containerHeight: 260,
      cardSize: 158,
      spread: 68,
      pushDistance: 78,
    };
  }
  if (viewportWidth < 1536) {
    return {
      containerWidth: 480,
      containerHeight: 300,
      cardSize: 174,
      spread: 74,
      pushDistance: 92,
    };
  }
  return {
    containerWidth: 560,
    containerHeight: 340,
    cardSize: 202,
    spread: 88,
    pushDistance: 108,
  };
}

/**
 * Editorial luxury Hero section with WebGL daylight aura and interactive studio cards.
 * Inputs: onReserveClick handler triggered strictly after a full hold on HoldButton.
 * Output: Rendered hero section.
 */
export const HeroSection: React.FC<HeroSectionProps> = ({ onReserveClick }) => {
  const [dims, setDims] = useState<BounceDimensions>(() =>
    typeof window !== 'undefined'
      ? getResponsiveBounceDimensions(window.innerWidth)
      : getResponsiveBounceDimensions(1280)
  );

  useEffect(() => {
    const onResize = () => {
      setDims(getResponsiveBounceDimensions(window.innerWidth));
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /**
   * Handle click on any hero studio photo card by scrolling toward treatments.
   */
  const handleCardClick = () => {
    const el = document.getElementById('treatments');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-[#E2D9CE] bg-[#FAF7F2] pt-24 pb-14 sm:pt-32 sm:pb-20 lg:pt-36 lg:pb-24 2xl:pt-40 2xl:pb-28"
    >
      {/* Daylight Warm WebGL Atmosphere */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <SoftAurora
          color1="#EFE9E0"
          color2="#B68D5E"
          lightMode={true}
          spectrum={0}
          opacity={0.34}
          speed={0.35}
          brightness={0.95}
          bandHeight={0.52}
          bandSpread={1.15}
          enableMouseInteraction={true}
          mouseInfluence={0.18}
          clickPulse={false}
        />
      </div>

      <div className="relative z-10 mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 sm:gap-12 sm:px-8 lg:grid-cols-12 lg:gap-8 2xl:max-w-[1440px] 2xl:gap-12">
        {/* Left Editorial Column */}
        <div className="lg:col-span-7">
          <p className="mb-5 text-[11px] font-medium tracking-[0.22em] text-[#6E655F] uppercase sm:text-xs">
            Beverly Hills · Aesthetic Medicine &amp; Smile Architecture
          </p>

          <MaskedHeading
            tag="h1"
            text="Precision Aesthetics. Effortless Confidence."
            src={HERO_HEADING_TEXTURE}
            align="left"
            weight={600}
            tracking={-0.025}
            lineHeight={1.06}
            textScale={0.105}
            trigger="mount"
            reveal="rise"
            duration={0.95}
            stagger={0.07}
            parallax={14}
            drift={10}
            className="font-serif text-[#1F1B18]"
          />

          <BlurText
            text="Non-surgical facial harmonization, ultra-thin porcelain smile design, and cellular skin longevity protocols delivered with quiet clinical restraint."
            trigger="load"
            delay={35}
            stepDuration={0.32}
            blur={5}
            distance={20}
            color="#6E655F"
            className="mt-6 max-w-xl text-base leading-relaxed font-normal sm:text-lg"
          />

          {/* Highlighted Hold-Only Reserve Action + Studio Operating Day & Time */}
          <div className="mt-8 flex w-full max-w-full flex-wrap items-center gap-3 rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] p-2.5 sm:inline-flex sm:w-auto sm:gap-4 sm:pr-5">
            <HoldButton
              size="lg"
              radius={10}
              holdTime={850}
              backgroundColor="#1F1B18"
              fillColor="#B68D5E"
              textColor="#FAF7F2"
              fillTextColor="#FAF7F2"
              glow={false}
              doneLabel="Opening Concierge"
              icon={<ArrowDownRight className="h-4 w-4" />}
              onHold={onReserveClick}
              className="w-full text-xs font-medium tracking-[0.04em] sm:w-auto sm:text-sm"
            >
              Hold to Reserve Consultation
            </HoldButton>

            <div className="flex items-center gap-2 pl-1">
              <Clock className="h-4 w-4 shrink-0 text-[#B68D5E]" aria-hidden="true" />
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-[#1F1B18] uppercase">
                  {CLINIC_CONFIG.hoursShort}
                </p>
                <p className="text-[11px] text-[#6E655F]">Press &amp; hold to schedule</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Studio Gallery Column */}
        <div className="flex flex-col items-center lg:col-span-5 lg:items-end">
          <BounceCards
            images={HERO_BOUNCE_CARDS}
            containerWidth={dims.containerWidth}
            containerHeight={dims.containerHeight}
            cardSize={dims.cardSize}
            spread={dims.spread}
            rotation={7}
            arc={16}
            pushDistance={dims.pushDistance}
            hoverScale={1.06}
            borderWidth={4}
            borderColor="#FAF7F2"
            radius={18}
            shadow={false}
            animationDelay={0.2}
            onCardClick={handleCardClick}
          />
          <p className="mt-5 text-center text-xs tracking-[0.16em] text-[#6E655F] uppercase lg:text-right">
            Travertine Lounge · Private Suites · Bespoke Formulations
          </p>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
