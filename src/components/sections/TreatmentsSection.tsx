/**
 * Interactive Treatments & Services section with ScrollReveal heading,
 * category filter tabs, and visual MagicBento + GlareHover treatment cards
 * featuring bespoke editorial photography that sync into the booking concierge form.
 */

import React, { useMemo, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import {
  TREATMENTS,
  TREATMENT_CATEGORIES,
  type TreatmentCategory,
  type TreatmentItem,
} from '../../data/clinicData';
import { TREATMENT_MEDIA } from '../../data/clinicMedia';
import { filterTreatmentsByCategory } from '../../utils/booking';
import GlareHover from '../reactbits/GlareHover';
import MagicBento, { type MagicBentoItem } from '../reactbits/MagicBento';
import ScrollReveal from '../reactbits/ScrollReveal';

export interface TreatmentsSectionProps {
  selectedTreatmentId: string;
  onSelectTreatment: (treatmentId: string) => void;
}

/**
 * Filterable clinical treatment menu rendered inside MagicBento and GlareHover
 * with editorial photography for every protocol.
 */
export const TreatmentsSection: React.FC<TreatmentsSectionProps> = ({
  selectedTreatmentId,
  onSelectTreatment,
}) => {
  const [activeCategory, setActiveCategory] = useState<TreatmentCategory>('Facial Aesthetics');

  const filteredTreatments = useMemo(
    () => filterTreatmentsByCategory(activeCategory, TREATMENTS),
    [activeCategory]
  );

  /**
   * Handle selecting a treatment card and scrolling smoothly to the booking section.
   * Inputs: TreatmentItem object.
   */
  const handleSelect = (treatment: TreatmentItem) => {
    onSelectTreatment(treatment.id);
    const bookingEl = document.getElementById('booking');
    bookingEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const bentoItems: MagicBentoItem[] = useMemo(
    () =>
      filteredTreatments.map(treatment => {
        const isSelected = treatment.id === selectedTreatmentId;
        const isWide = (treatment.colSpan ?? 1) >= 2;
        const media = TREATMENT_MEDIA[treatment.id];

        return {
          id: treatment.id,
          title: treatment.name,
          colSpan: treatment.colSpan ?? 1,
          rowSpan: treatment.rowSpan ?? 1,
          onClick: () => handleSelect(treatment),
          content: (
            <GlareHover
              width="100%"
              height="100%"
              background={isSelected ? '#FAF7F2' : '#EFE9E0'}
              borderRadius="16px"
              borderColor={isSelected ? '#1F1B18' : '#E2D9CE'}
              glareColor="#FAF7F2"
              glareOpacity={0.45}
              variant="sheen"
              playOnce={true}
              transitionDuration={550}
              className={`!block h-full w-full transition-colors duration-200 ${
                isSelected ? 'border-2' : ''
              }`}
            >
              {isWide ? (
                <div className="grid h-full w-full grid-cols-1 gap-4 p-4 text-left sm:grid-cols-12 sm:p-5">
                  <div
                    className={`h-36 overflow-hidden rounded-xl border bg-[#E5DACB] sm:col-span-5 sm:h-full ${
                      isSelected ? 'border-[#1F1B18]/40' : 'border-[#E2D9CE]'
                    }`}
                  >
                    {media ? (
                      <img
                        src={media.src}
                        alt={media.alt}
                        referrerPolicy="no-referrer"
                        className={`h-full w-full object-cover ${media.objectPosition ?? 'object-center'}`}
                      />
                    ) : null}
                  </div>

                  <div className="flex flex-col justify-between py-1 sm:col-span-7 sm:pl-2">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold tracking-[0.18em] text-[#B68D5E] uppercase">
                          In-Clinic Service · {treatment.duration}
                        </span>
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#1F1B18] px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase">
                            <Check className="h-3 w-3 text-[#B68D5E]" aria-hidden="true" />
                            Active
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-2 font-serif text-xl leading-snug font-semibold text-[#1F1B18] sm:text-2xl">
                        {treatment.name}
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#6E655F]">
                        {treatment.benefit}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[#E2D9CE] pt-3">
                      <span className="text-sm font-semibold text-[#1F1B18] tabular-nums">
                        From {treatment.startingPrice}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#1F1B18] px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase">
                          <Check className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
                          Selected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-3 py-1.5 text-[11px] font-medium tracking-[0.12em] text-[#1F1B18] uppercase">
                          Select Service
                          <ArrowUpRight className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full w-full flex-col justify-between p-4 text-left sm:p-5">
                  <div>
                    <div
                      className={`mb-3.5 h-32 w-full overflow-hidden rounded-xl border bg-[#E5DACB] ${
                        isSelected ? 'border-[#1F1B18]/40' : 'border-[#E2D9CE]'
                      }`}
                    >
                      {media ? (
                        <img
                          src={media.src}
                          alt={media.alt}
                          referrerPolicy="no-referrer"
                          className={`h-full w-full object-cover ${media.objectPosition ?? 'object-center'}`}
                        />
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold tracking-[0.14em] text-[#B68D5E] uppercase">
                        {treatment.duration}
                      </span>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#1F1B18] px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase">
                          <Check className="h-3 w-3 text-[#B68D5E]" aria-hidden="true" />
                          Active
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-1.5 font-serif text-xl leading-snug font-semibold text-[#1F1B18]">
                      {treatment.name}
                    </h3>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#6E655F]">
                      {treatment.benefit}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-[#E2D9CE] pt-3">
                    <span className="text-sm font-semibold text-[#1F1B18] tabular-nums">
                      From {treatment.startingPrice}
                    </span>
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[#1F1B18] px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-[#FAF7F2] uppercase">
                        <Check className="h-3 w-3 text-[#B68D5E]" aria-hidden="true" />
                        Selected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-[#E2D9CE] bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-[#1F1B18] uppercase">
                        Select
                        <ArrowUpRight className="h-3 w-3 text-[#B68D5E]" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                </div>
              )}
            </GlareHover>
          ),
        };
      }),
    [filteredTreatments, selectedTreatmentId]
  );

  return (
    <section
      id="treatments"
      className="border-b border-[#E2D9CE] bg-[#FAF7F2] py-16 sm:py-20 md:py-24"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold tracking-[0.22em] text-[#B68D5E] uppercase">
              In-Clinic Services · Book by Appointment
            </p>
            <ScrollReveal
              mode="enter"
              effect="rise"
              baseOpacity={0.25}
              baseRotation={0}
              enableBlur={false}
              duration={0.75}
              stagger={0.04}
              containerClassName="my-2"
              textClassName="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold text-[#1F1B18] leading-[1.12] tracking-tight"
            >
              Tailored Treatments Across Face, Smile &amp; Skin
            </ScrollReveal>
            <p className="mt-2 text-sm leading-relaxed text-[#6E655F]">
              Every option below is an in-clinic appointment performed by our doctors or cosmetic
              dentists. Select a service to pre-fill your visit booking.
            </p>
          </div>

          {/* Interactive Category Filter Tabs */}
          <div
            role="tablist"
            aria-label="Treatment categories"
            className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#E2D9CE] pb-2 sm:flex-nowrap"
          >
            {TREATMENT_CATEGORIES.map(category => {
              const active = category === activeCategory;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCategory(category)}
                  className={`cursor-pointer rounded-lg px-4 py-2 text-xs font-semibold tracking-[0.12em] whitespace-nowrap uppercase transition-colors duration-200 ${
                    active
                      ? 'bg-[#1F1B18] text-[#FAF7F2]'
                      : 'bg-transparent text-[#6E655F] hover:bg-[#EFE9E0] hover:text-[#1F1B18]'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-10">
          <MagicBento
            key={activeCategory}
            items={bentoItems}
            columns={3}
            rowHeight={340}
            gap={16}
            radius={16}
            theme="light"
            glowColor="#B68D5E"
            enableBorderGlow={true}
            enableSpotlight={true}
            spotlightRadius={280}
            enableStars={false}
            enableTilt={false}
            enableMagnetism={false}
            clickEffect={false}
            intro={false}
            style={
              {
                '--mb-surface': '#EFE9E0',
                '--mb-edge': '#E2D9CE',
                '--mb-ink': '#1F1B18',
                '--mb-muted': '#6E655F',
                '--mb-shadow': 'none',
                '--mb-pad': '0px',
              } as CSSProperties
            }
          />
        </div>
      </div>
    </section>
  );
};

export default TreatmentsSection;
