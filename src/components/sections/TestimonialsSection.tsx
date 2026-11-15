/**
 * Verified Patient Testimonials section rendering 3 editorial review cards
 * paired with clinical studio photography inside FadeContent and GlareHover containers.
 */

import React from 'react';
import { Star } from 'lucide-react';
import { TESTIMONIALS } from '../../data/clinicData';
import { TESTIMONIAL_MEDIA } from '../../data/clinicMedia';
import FadeContent from '../reactbits/FadeContent';
import GlareHover from '../reactbits/GlareHover';

/**
 * Three-column editorial testimonial section with treatment photography and GlareHover sheen.
 * Output: Rendered patient testimonials section.
 */
export const TestimonialsSection: React.FC = () => {
  return (
    <section
      id="testimonials"
      className="border-b border-[#E2D9CE] bg-[#FAF7F2] py-16 sm:py-20 md:py-24 2xl:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-8 2xl:max-w-[1440px]">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-[#B68D5E] uppercase">
            Patient Voices
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-[1.12] font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
            Quiet Transformations, Verified in Person
          </h2>
        </div>

        <FadeContent trigger="scroll" effect="fade" duration={0.85} threshold={0.12}>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 2xl:gap-8">
            {TESTIMONIALS.map(item => {
              const media = TESTIMONIAL_MEDIA[item.id];
              return (
                <article
                  key={item.id}
                  className="flex h-full w-full flex-col justify-between rounded-[16px] border border-[#E2D9CE] bg-[#EFE9E0] p-5 text-left sm:p-7 2xl:p-8"
                >
                  <div>
                    {media ? (
                      <GlareHover
                        width="100%"
                        height="160px"
                        background="#E5DACB"
                        borderRadius="12px"
                        borderColor="#E2D9CE"
                        glareColor="#FAF7F2"
                        glareOpacity={0.5}
                        variant="sheen"
                        playOnce={true}
                        transitionDuration={550}
                        className="mb-5 !block h-40 w-full overflow-hidden 2xl:h-48"
                      >
                        <img
                          src={media.src}
                          alt={media.alt}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </GlareHover>
                    ) : null}

                    <div
                      className="flex items-center gap-1"
                      aria-label={`${item.rating} out of 5 stars`}
                    >
                      {Array.from({ length: item.rating }).map((_, idx) => (
                        <Star
                          key={idx}
                          className="h-3.5 w-3.5 fill-[#B68D5E] text-[#B68D5E]"
                          aria-hidden="true"
                        />
                      ))}
                    </div>

                    <blockquote className="mt-4 font-serif text-xl leading-relaxed text-[#1F1B18]">
                      “{item.quote}”
                    </blockquote>
                  </div>

                  <footer className="mt-6 border-t border-[#E2D9CE] pt-4">
                    <p className="text-sm font-semibold text-[#1F1B18]">
                      {item.patientName} ·{' '}
                      <span className="font-normal text-[#6E655F]">{item.location}</span>
                    </p>
                    <p className="mt-1 text-xs tracking-[0.12em] text-[#B68D5E] uppercase">
                      {item.treatment}
                    </p>
                  </footer>
                </article>
              );
            })}
          </div>
        </FadeContent>
      </div>
    </section>
  );
};

export default TestimonialsSection;
