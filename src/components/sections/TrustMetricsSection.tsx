/**
 * Clinical trust metrics band showcasing key practice outcomes
 * inside SpotlightCard containers paired with architectural studio photography.
 */

import React, { type CSSProperties } from 'react';
import { TRUST_METRICS } from '../../data/clinicData';
import { TRUST_METRIC_VIGNETTES } from '../../data/clinicMedia';
import CountUp from '../reactbits/CountUp';
import SpotlightCard from '../reactbits/SpotlightCard';

/**
 * 3-column clinical trust metric band on Warm Sand cards with studio vignettes.
 * Output: Rendered trust metrics section.
 */
export const TrustMetricsSection: React.FC = () => {
  const vignettes = TRUST_METRIC_VIGNETTES;

  return (
    <section
      className="border-b border-[#E2D9CE] bg-[#FAF7F2] py-14 sm:py-16 md:py-20"
      aria-label="Clinical trust metrics"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-8 2xl:max-w-[1440px]">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 2xl:gap-8">
          {TRUST_METRICS.map((metric, idx) => {
            const media = vignettes[idx % vignettes.length];
            return (
              <SpotlightCard
                key={metric.id}
                theme="light"
                spotlightColor="#B68D5E"
                intensity={0.22}
                borderGlow={0.55}
                spotlightSize={260}
                className="rounded-2xl p-5 sm:p-7 2xl:p-8"
                style={
                  {
                    '--spotlight-card-surface': '#EFE9E0',
                    '--spotlight-card-border': '#E2D9CE',
                    '--spotlight-card-shadow': 'none',
                  } as CSSProperties
                }
              >
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <div className="mb-5 h-32 w-full overflow-hidden rounded-xl border border-[#E2D9CE] bg-[#E5DACB] sm:h-36 2xl:h-40">
                      <img
                        src={media.src}
                        alt={media.alt}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="font-serif text-4xl font-semibold tracking-tight text-[#1F1B18] sm:text-5xl">
                      <CountUp
                        to={metric.to}
                        decimals={metric.decimals}
                        separator={metric.separator}
                        prefix={metric.prefix}
                        suffix={metric.suffix}
                        duration={1.6}
                        trigger="view"
                        style={{ fontVariantNumeric: 'lining-nums proportional-nums' }}
                      />
                    </div>
                    <h3 className="mt-2.5 font-sans text-xs font-semibold tracking-[0.18em] text-[#B68D5E] uppercase">
                      {metric.label}
                    </h3>
                  </div>

                  <p className="mt-2.5 text-sm leading-relaxed text-[#6E655F]">{metric.detail}</p>
                </div>
              </SpotlightCard>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default TrustMetricsSection;
