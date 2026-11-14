/**
 * Interactive Before & After comparison showcase wrapped in FadeContent.
 * Uses the exact same base smile photo on both sides and applies tooth-only
 * enamel retouching on canvas so facial skin, lips, and gums stay identical
 * while Before shows natural yellowing and After scales cleanly from Day 1 to Day 14.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { COMPARISON_CASES } from '../../data/clinicMedia';
import {
  calculateSmileProgressByDays,
  clampComparisonPercentage,
} from '../../utils/booking';
import {
  buildToothMaskBuffer,
  renderSmileVariantImageData,
} from '../../utils/smileRetouch';
import FadeContent from '../reactbits/FadeContent';

interface CachedSmilePixels {
  width: number;
  height: number;
  baseRgba: Uint8ClampedArray;
  toothMask: Float32Array;
}

/**
 * Interactive split-image comparison section with a Visit Time & Days slider
 * showing how tooth cleanliness & whiteness and estimated charge progress over visits.
 * Output: Rendered Before & After comparison section.
 */
export const BeforeAfterSection: React.FC = () => {
  const activeCase = COMPARISON_CASES[0];
  const [position, setPosition] = useState<number>(52);
  const [visitDays, setVisitDays] = useState<number>(14);
  const [dragging, setDragging] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const beforeCanvasRef = useRef<HTMLCanvasElement>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelCacheRef = useRef<CachedSmilePixels | null>(null);

  const stage = useMemo(() => calculateSmileProgressByDays(visitDays), [visitDays]);

  // Load the single unified smile photograph once, precompute its tooth-only mask, and paint Before
  useEffect(() => {
    let cancelled = false;
    setCanvasReady(false);

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const width = Math.max(1, Math.round((img.naturalWidth || 960) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || 720) * scale));

      const scratch = document.createElement('canvas');
      scratch.width = width;
      scratch.height = height;
      const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
      if (!scratchCtx) return;

      scratchCtx.drawImage(img, 0, 0, width, height);
      const baseData = scratchCtx.getImageData(0, 0, width, height);
      const toothMask = buildToothMaskBuffer(baseData.data, width, height);

      pixelCacheRef.current = {
        width,
        height,
        baseRgba: baseData.data,
        toothMask,
      };

      const beforeCanvas = beforeCanvasRef.current;
      if (beforeCanvas) {
        beforeCanvas.width = width;
        beforeCanvas.height = height;
        const bCtx = beforeCanvas.getContext('2d');
        if (bCtx) {
          const stainedData = renderSmileVariantImageData(
            baseData.data,
            toothMask,
            width,
            height,
            'before'
          );
          bCtx.putImageData(stainedData, 0, 0);
        }
      }

      const afterCanvas = afterCanvasRef.current;
      if (afterCanvas) {
        afterCanvas.width = width;
        afterCanvas.height = height;
        const aCtx = afterCanvas.getContext('2d');
        if (aCtx) {
          const cleanData = renderSmileVariantImageData(
            baseData.data,
            toothMask,
            width,
            height,
            'after',
            stage.whiteningLevel
          );
          aCtx.putImageData(cleanData, 0, 0);
        }
      }

      setCanvasReady(true);
    };
    img.src = activeCase.afterSrc;

    return () => {
      cancelled = true;
    };
    // Intentionally initialize once per base image src; whiteningLevel updates are handled in the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCase.afterSrc]);

  // Repaint only the After teeth canvas whenever the Visit Time & Days slider moves
  useEffect(() => {
    const cache = pixelCacheRef.current;
    const afterCanvas = afterCanvasRef.current;
    if (!cache || !afterCanvas) return;

    const aCtx = afterCanvas.getContext('2d');
    if (!aCtx) return;

    const updatedData = renderSmileVariantImageData(
      cache.baseRgba,
      cache.toothMask,
      cache.width,
      cache.height,
      'after',
      stage.whiteningLevel
    );
    aCtx.putImageData(updatedData, 0, 0);
  }, [stage.whiteningLevel]);

  /**
   * Convert pointer horizontal clientX coordinate into a clamped 5–95% split value.
   * Inputs: clientX number in viewport pixels.
   */
  const updateFromClientX = (clientX: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const rawPct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(clampComparisonPercentage(rawPct));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore capture failures on synthetic events
    }
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore release errors
    }
  };

  /**
   * Support keyboard left/right arrow adjustment directly on the drag handle.
   * Inputs: KeyboardEvent on handle button.
   */
  const handleSliderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setPosition(prev => clampComparisonPercentage(prev - 5));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setPosition(prev => clampComparisonPercentage(prev + 5));
    }
  };

  return (
    <section
      id="results"
      className="border-b border-[#E2D9CE] bg-[#EFE9E0]/55 py-16 sm:py-20 md:py-24"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <FadeContent trigger="scroll" effect="fade" duration={0.85} threshold={0.12}>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Editorial Copy & Visit-Days Whiteness Slider Column */}
            <div className="lg:col-span-5">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-[#B68D5E] uppercase">
                Smile Results
              </p>
              <h2 className="mt-3 font-serif text-3xl leading-[1.14] font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
                {activeCase.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#6E655F]">
                {activeCase.summary}
              </p>

              <dl className="mt-7 space-y-3.5 border-t border-[#E2D9CE] pt-5">
                <div className="flex items-baseline justify-between gap-4 border-b border-[#E2D9CE] pb-3">
                  <dt className="text-xs font-medium tracking-[0.14em] text-[#6E655F] uppercase">
                    Treatment
                  </dt>
                  <dd className="text-right text-sm font-medium text-[#1F1B18]">
                    {activeCase.treatment}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-b border-[#E2D9CE] pb-3">
                  <dt className="text-xs font-medium tracking-[0.14em] text-[#6E655F] uppercase">
                    Visit Time
                  </dt>
                  <dd className="text-right text-sm font-semibold text-[#1F1B18] tabular-nums">
                    {stage.visitTimeLabel}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-xs font-medium tracking-[0.14em] text-[#6E655F] uppercase">
                    Estimated Charge
                  </dt>
                  <dd className="text-right font-serif text-xl font-semibold text-[#1F1B18] tabular-nums">
                    {stage.formattedCharge}
                  </dd>
                </div>
              </dl>

              {/* Visit Time & Days Slider */}
              <div className="mt-6 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-4">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="visit-days-slider"
                    className="text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                  >
                    Adjust Visit Time &amp; Days
                  </label>
                  <span className="text-xs font-medium text-[#B68D5E]">
                    {stage.stageLabel}
                  </span>
                </div>

                <input
                  id="visit-days-slider"
                  type="range"
                  min={1}
                  max={14}
                  step={1}
                  value={visitDays}
                  onChange={e => setVisitDays(Number(e.target.value))}
                  aria-label="Adjust visit days to preview tooth cleanliness, whiteness, and estimated charge"
                  aria-valuetext={`${stage.visitTimeLabel}, ${stage.formattedCharge}`}
                  className="mt-3 h-2 w-full cursor-pointer accent-[#1F1B18]"
                />

                <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-[#6E655F]">
                  <span>1 Day · 1 Visit (Clean)</span>
                  <span>7 Days · Mid</span>
                  <span>14 Days · 2 Visits (Whitest)</span>
                </div>
              </div>
            </div>

            {/* Interactive Split Comparison Frame (Exact Same Smile Photo, Teeth-Only Retouch) */}
            <div className="lg:col-span-7">
              <div
                ref={frameRef}
                role="group"
                aria-label="Interactive before and after smile comparison"
                data-testid="smile-comparison-frame"
                data-canvas-ready={canvasReady ? 'true' : 'false'}
                className="relative aspect-[4/3] w-full cursor-ew-resize overflow-hidden rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] select-none touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* Fallback Base Photo while canvas initializes */}
                <img
                  src={activeCase.afterSrc}
                  alt={activeCase.beforeLabel}
                  className="pointer-events-none block h-full w-full object-cover"
                  draggable={false}
                />

                {/* Before Layer: Exact same smile with natural everyday yellowed teeth */}
                <canvas
                  ref={beforeCanvasRef}
                  aria-label="Before treatment: natural yellowed teeth"
                  data-testid="before-smile-canvas"
                  className={`pointer-events-none absolute inset-0 block h-full w-full object-cover transition-opacity duration-150 ${
                    canvasReady ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {/* After Layer: Exact same smile with teeth-only cleaning (Day 1) to bright white (Day 14) */}
                <canvas
                  ref={afterCanvasRef}
                  aria-label={`After ${stage.visitTimeLabel}: clean whitened teeth`}
                  data-testid="after-smile-canvas"
                  data-whitening-level={stage.whiteningLevel}
                  className={`pointer-events-none absolute inset-0 block h-full w-full object-cover transition-opacity duration-150 ${
                    canvasReady ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    clipPath: `inset(0 0 0 ${position}%)`,
                  }}
                />

                {/* Top Corner Labels */}
                <span className="pointer-events-none absolute top-4 left-4 rounded-md bg-[#1F1B18]/85 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-[#FAF7F2] uppercase">
                  Before
                </span>
                <span className="pointer-events-none absolute top-4 right-4 rounded-md bg-[#FAF7F2]/92 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-[#1F1B18] uppercase">
                  After · {stage.visitTimeLabel}
                </span>

                {/* Vertical Divider & Interactive Handle */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#FAF7F2]"
                  style={{ left: `${position}%` }}
                >
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Drag left or right to compare before and after"
                    aria-valuemin={5}
                    aria-valuemax={95}
                    aria-valuenow={Math.round(position)}
                    onKeyDown={handleSliderKeyDown}
                    className="pointer-events-auto absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-[#E2D9CE] bg-[#1F1B18] text-[#FAF7F2] outline-none focus-visible:ring-2 focus-visible:ring-[#B68D5E]"
                  >
                    <MoveHorizontal className="h-4 w-4 text-[#B68D5E]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeContent>
      </div>
    </section>
  );
};

export default BeforeAfterSection;
