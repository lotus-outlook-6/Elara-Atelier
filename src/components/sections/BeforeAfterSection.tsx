/**
 * Interactive Before & After comparison showcase wrapped in FadeContent.
 * Dynamically updates its imagery, details, and interactive controls based on the
 * selected treatment above—using pixel-accurate tooth retouching for Porcelain Veneers
 * & Laser Whitening and aligned Before/After clinical imagery for every other service.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, MoveHorizontal } from 'lucide-react';
import { TREATMENTS } from '../../data/clinicData';
import { COMPARISON_CASES } from '../../data/clinicMedia';
import {
  calculateSmileProgressByDays,
  clampComparisonPercentage,
  getComparisonCaseForTreatment,
} from '../../utils/booking';
import {
  buildToothMaskBuffer,
  renderSmileVariantImageData,
} from '../../utils/smileRetouch';
import FadeContent from '../reactbits/FadeContent';
import GlideSelect, { type GlideSelectOption } from '../reactbits/GlideSelect';

export interface BeforeAfterSectionProps {
  selectedTreatmentId: string;
  onSelectTreatment: (treatmentId: string) => void;
  onProceedToBook: () => void;
}

interface CachedSmilePixels {
  width: number;
  height: number;
  baseRgba: Uint8ClampedArray;
  toothMask: Float32Array;
}

/**
 * Interactive split-image Before & After showcase dynamically bound to the active treatment.
 * Inputs: selectedTreatmentId, onSelectTreatment callback, onProceedToBook callback.
 * Output: Rendered Before & After comparison section.
 */
export const BeforeAfterSection: React.FC<BeforeAfterSectionProps> = ({
  selectedTreatmentId,
  onSelectTreatment,
  onProceedToBook,
}) => {
  const activeCase = useMemo(
    () => getComparisonCaseForTreatment(selectedTreatmentId, COMPARISON_CASES),
    [selectedTreatmentId]
  );

  const [position, setPosition] = useState<number>(52);
  const [visitDays, setVisitDays] = useState<number>(14);
  const [whiteningIntensity, setWhiteningIntensity] = useState<number>(14);
  const [dragging, setDragging] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const beforeCanvasRef = useRef<HTMLCanvasElement>(null);
  const afterCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelCacheRef = useRef<CachedSmilePixels | null>(null);

  const isTeethMode = activeCase.retouchMode === 'teeth';
  const isVeneers = activeCase.treatmentId === 'cd-veneers';

  const activeToothSliderValue = isVeneers ? visitDays : whiteningIntensity;
  const stage = useMemo(
    () => calculateSmileProgressByDays(activeToothSliderValue),
    [activeToothSliderValue]
  );

  const treatmentOptions: GlideSelectOption[] = useMemo(
    () =>
      TREATMENTS.map(item => ({
        value: item.id,
        label: item.name,
        tag: item.startingPrice,
      })),
    []
  );

  // Reset split divider to balanced center when treatment changes
  useEffect(() => {
    setPosition(52);
  }, [activeCase.treatmentId]);

  // Initialize pixel tooth-retouch canvas only when active treatment uses the teeth simulator
  useEffect(() => {
    if (!isTeethMode) {
      setCanvasReady(false);
      pixelCacheRef.current = null;
      return undefined;
    }

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
    // Intentionally initialize once per teeth mode activation / image src; whiteningLevel updates separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeethMode, activeCase.afterSrc, activeCase.treatmentId]);

  // Repaint the After teeth canvas smoothly as the slider changes
  useEffect(() => {
    if (!isTeethMode) return;
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
  }, [isTeethMode, stage.whiteningLevel]);

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

  const afterBadgeText = isTeethMode
    ? isVeneers
      ? `After · ${stage.visitTimeLabel}`
      : `After · ${stage.stageLabel}`
    : activeCase.afterLabel;

  return (
    <section
      id="results"
      className="border-b border-[#E2D9CE] bg-[#EFE9E0]/55 py-16 sm:py-20 md:py-24 2xl:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-8 2xl:max-w-[1440px]">
        <FadeContent trigger="scroll" effect="fade" duration={0.85} threshold={0.12}>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 2xl:gap-16">
            {/* Editorial Copy, Service Switcher & Action Column */}
            <div className="lg:col-span-5">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-[#B68D5E] uppercase">
                {activeCase.categoryLabel}
              </p>
              <h2 className="mt-3 font-serif text-3xl leading-[1.14] font-semibold tracking-tight text-[#1F1B18] sm:text-4xl lg:text-5xl">
                {activeCase.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#6E655F]">
                {activeCase.summary}
              </p>

              {/* Quick Switch Treatment Dropdown synced with catalog & booking */}
              <div className="mt-6">
                <label className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase">
                  Preview Results by Treatment
                </label>
                <GlideSelect
                  options={treatmentOptions}
                  value={activeCase.treatmentId}
                  onChange={onSelectTreatment}
                  showTags={true}
                  size="lg"
                  radius={10}
                  menuWidth={360}
                  surfaceColor="#FAF7F2"
                  highlightColor="#EFE9E0"
                  accentColor="#B68D5E"
                  textColor="#1F1B18"
                  ariaLabel="Preview results by treatment"
                  className="w-full"
                />
              </div>

              <dl className="mt-6 space-y-3.5 border-t border-[#E2D9CE] pt-5">
                <div className="flex items-baseline justify-between gap-4 border-b border-[#E2D9CE] pb-3">
                  <dt className="text-xs font-medium tracking-[0.14em] text-[#6E655F] uppercase">
                    Selected Service
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
                    {isVeneers ? stage.visitTimeLabel : activeCase.timeframe}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-xs font-medium tracking-[0.14em] text-[#6E655F] uppercase">
                    {isVeneers ? 'Estimated Charge' : 'Starting Price'}
                  </dt>
                  <dd className="text-right font-serif text-xl font-semibold text-[#1F1B18] tabular-nums">
                    {isVeneers ? stage.formattedCharge : activeCase.startingPrice}
                  </dd>
                </div>
              </dl>

              {/* Tooth Shade / Visit Days Slider when viewing Veneers or Laser Whitening */}
              {isTeethMode ? (
                <div className="mt-5 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="visit-days-slider"
                      className="text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                    >
                      {isVeneers ? 'Adjust Visit Time & Days' : 'Whitening Shade Lift'}
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
                    value={activeToothSliderValue}
                    onChange={e => {
                      const next = Number(e.target.value);
                      if (isVeneers) setVisitDays(next);
                      else setWhiteningIntensity(next);
                    }}
                    aria-label={
                      isVeneers
                        ? 'Adjust visit days to preview tooth brightness and estimated charge'
                        : 'Adjust whitening level to preview shade brightness'
                    }
                    aria-valuetext={
                      isVeneers ? `${stage.visitTimeLabel}, ${stage.formattedCharge}` : stage.stageLabel
                    }
                    className="mt-3 h-2 w-full cursor-pointer accent-[#1F1B18]"
                  />

                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-medium text-[#6E655F] sm:text-[11px]">
                    {isVeneers ? (
                      <>
                        <span>1 Day · 1 Visit</span>
                        <span>7 Days · Mid</span>
                        <span>14 Days · 2 Visits</span>
                      </>
                    ) : (
                      <>
                        <span>Gentle Polish</span>
                        <span>Natural Lift</span>
                        <span>Brightest Lift</span>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="mt-6">
                <button
                  type="button"
                  onClick={onProceedToBook}
                  className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[#1F1B18] px-6 text-xs font-semibold tracking-[0.14em] text-[#FAF7F2] uppercase transition-colors duration-200 hover:bg-[#352F2B] sm:w-auto"
                >
                  Book This Treatment
                  <ArrowDownRight className="h-4 w-4 text-[#B68D5E]" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Interactive Split Comparison Frame */}
            <div className="lg:col-span-7">
              <div
                ref={frameRef}
                role="group"
                aria-label={`Interactive before and after comparison for ${activeCase.treatment}`}
                data-testid="smile-comparison-frame"
                data-treatment-id={activeCase.treatmentId}
                data-retouch-mode={activeCase.retouchMode}
                data-canvas-ready={canvasReady ? 'true' : 'false'}
                className="relative aspect-[4/3] w-full cursor-ew-resize overflow-hidden rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] select-none touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {isTeethMode ? (
                  <>
                    {/* Fallback Base Photo while canvas initializes */}
                    <img
                      src={activeCase.afterSrc}
                      alt={activeCase.beforeLabel}
                      className="pointer-events-none block h-full w-full object-cover"
                      draggable={false}
                    />

                    {/* Before Layer: natural yellowed teeth */}
                    <canvas
                      ref={beforeCanvasRef}
                      aria-label="Before treatment: natural yellowed teeth"
                      data-testid="before-smile-canvas"
                      className={`pointer-events-none absolute inset-0 block h-full w-full object-cover transition-opacity duration-150 ${
                        canvasReady ? 'opacity-100' : 'opacity-0'
                      }`}
                    />

                    {/* After Layer: cleaned/whitened teeth */}
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
                  </>
                ) : (
                  <>
                    {/* Before Photo Layer */}
                    <img
                      src={activeCase.beforeSrc}
                      alt={`${activeCase.treatment} — ${activeCase.beforeLabel}`}
                      data-testid="before-comparison-image"
                      className="pointer-events-none block h-full w-full object-cover"
                      draggable={false}
                    />

                    {/* After Photo Layer Clipped by Slider Position */}
                    <img
                      src={activeCase.afterSrc}
                      alt={`${activeCase.treatment} — ${activeCase.afterLabel}`}
                      data-testid="after-comparison-image"
                      className="pointer-events-none absolute inset-0 block h-full w-full object-cover"
                      style={{
                        clipPath: `inset(0 0 0 ${position}%)`,
                      }}
                      draggable={false}
                    />
                  </>
                )}

                {/* Top Corner Labels */}
                <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-[#1F1B18]/85 px-2 py-1 text-[9px] font-semibold tracking-[0.15em] text-[#FAF7F2] uppercase sm:top-4 sm:left-4 sm:px-2.5 sm:text-[10px] sm:tracking-[0.18em]">
                  {activeCase.beforeLabel}
                </span>
                <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-[#FAF7F2]/92 px-2 py-1 text-[9px] font-semibold tracking-[0.15em] text-[#1F1B18] uppercase sm:top-4 sm:right-4 sm:px-2.5 sm:text-[10px] sm:tracking-[0.18em]">
                  {afterBadgeText}
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
