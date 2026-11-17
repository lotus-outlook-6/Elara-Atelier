/**
 * Patient Reviews section rendering 3 authentic patient review cards
 * with real 4 and 4.5 star ratings and natural daylight patient portraits.
 */

import React from 'react';
import { Star } from 'lucide-react';
import { TESTIMONIALS } from '../../data/clinicData';
import { TESTIMONIAL_MEDIA } from '../../data/clinicMedia';
import FadeContent from '../reactbits/FadeContent';
import GlareHover from '../reactbits/GlareHover';

/**
 * Render a 5-star row supporting full and half stars (e.g. 4 and 4.5).
 * Inputs: rating number out of 5.
 * Output: React node showing 5 star icons plus numeric score.
 * Errors: None.
 */
function renderRatingStars(rating: number) {
  return (
    <div
      className="flex items-center gap-1"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, idx) => {
        const isFull = rating >= idx + 1;
        const isHalf = !isFull && rating >= idx + 0.5;

        if (isFull) {
          return (
            <Star
              key={idx}
              className="h-3.5 w-3.5 fill-[#B68D5E] text-[#B68D5E]"
              aria-hidden="true"
            />
          );
        }

        if (isHalf) {
          return (
            <span key={idx} className="relative inline-block h-3.5 w-3.5" aria-hidden="true">
              <Star className="h-3.5 w-3.5 text-[#B68D5E]/40" />
              <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                <Star className="h-3.5 w-3.5 fill-[#B68D5E] text-[#B68D5E]" />
              </span>
            </span>
          );
        }

        return (
          <Star
            key={idx}
            className="h-3.5 w-3.5 text-[#B68D5E]/40"
            aria-hidden="true"
          />
        );
      })}
      <span className="ml-1.5 text-xs font-medium text-[#6E655F] tabular-nums">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

/**
 * Three-column patient reviews section with natural portraits and verified visit labels.
 * Output: Rendered patient reviews section.
 * Errors: None.
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
            Patient Reviews
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-[1.12] font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
            What Our Patients Say
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
                        height="184px"
                        background="#E5DACB"
                        borderRadius="12px"
                        borderColor="#E2D9CE"
                        glareColor="#FAF7F2"
                        glareOpacity={0.5}
                        variant="sheen"
                        playOnce={true}
                        transitionDuration={550}
                        className="mb-5 !block h-46 w-full overflow-hidden 2xl:h-52"
                      >
                        <img
                          src={media.src}
                          alt={media.alt}
                          referrerPolicy="no-referrer"
                          className={`h-full w-full object-cover ${media.objectPosition ?? 'object-center'}`}
                        />
                      </GlareHover>
                    ) : null}

                    {renderRatingStars(item.rating)}

                    <blockquote className="mt-4 text-base leading-relaxed text-[#1F1B18]">
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
