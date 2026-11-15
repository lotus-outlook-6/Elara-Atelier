/**
 * Interactive Before & After comparison showcase wrapped in FadeContent.
 * Dynamically updates imagery, pricing/timing details, and interactive controls per treatment,
 * locks the selector with a loading bar and blur mask until both Before and After assets finish loading,
 * and gives Porcelain Veneers and In-Chair Laser Teeth Whitening separate imagery and sliders.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, MoveHorizontal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { TREATMENTS } from '../../data/clinicData';
import { COMPARISON_CASES } from '../../data/clinicMedia';
import {
  calculateLaserWhiteningPass,
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
  onLoadingChange?: (loading: boolean) => void;
}

interface CachedSmilePixels {
  width: number;
  height: number;
  baseRgba: Uint8ClampedArray;
  toothMask: Float32Array;
}

interface ResolvedPreviewMedia {
  treatmentId: string;
  beforeUrl: string;
  afterUrl: string;
}

/**
 * Race a promise against a bounded timeout so slow browser decoders never stall UI readiness.
 * Inputs: promise Promise<T>, timeoutMs duration in milliseconds.
 * Output: Promise<void> resolving when either finishes.
 */
function settleWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve();
    }, timeoutMs);
    promise
      .catch(() => {})
      .finally(() => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve();
      });
  });
}

/**
 * Load and decode a single image element (from direct URL or blob object URL) without hanging.
 * Inputs: src URL string.
 * Output: Promise resolving to decoded HTMLImageElement (or null on failure).
 */
function loadDecodedImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safetyTimer);
      if (!ok) {
        resolve(null);
        return;
      }
      if (typeof img.decode === 'function') {
        settleWithTimeout(img.decode(), 2000).then(() => resolve(img));
      } else {
        resolve(img);
      }
    };
    const safetyTimer = window.setTimeout(() => finish(false), 8000);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
    if (img.complete && img.naturalWidth > 0) {
      finish(true);
    }
  });
}

/**
 * Fetch an image asset while streaming download bytes cleanly so progress advances continuously from 0 to 1,
 * returning an in-memory object URL (revoked on cleanup) paired with the decoded HTMLImageElement.
 * Inputs: src string, onFraction progress callback (0..1), AbortSignal.
 * Output: Promise resolving to { url, revoke, img }.
 */
async function fetchAndDecodeImage(
  src: string,
  onFraction: (fraction: number) => void,
  signal: AbortSignal
): Promise<{ url: string; revoke: boolean; img: HTMLImageElement | null }> {
  try {
    const response = await fetch(src, { signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentLengthHeader = response.headers.get('content-length');
    const totalBytes = contentLengthHeader ? Number(contentLengthHeader) : 0;

    if (response.body && Number.isFinite(totalBytes) && totalBytes > 0) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.byteLength;
          onFraction(Math.min(0.95, received / totalBytes));
        }
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const blob = new Blob(chunks, { type: contentType });
      const objectUrl = URL.createObjectURL(blob);
      onFraction(0.97);
      const img = await loadDecodedImageElement(objectUrl);
      onFraction(1);
      return { url: objectUrl, revoke: true, img };
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    onFraction(0.92);
    const img = await loadDecodedImageElement(objectUrl);
    onFraction(1);
    return { url: objectUrl, revoke: true, img };
  } catch (err) {
    if (signal.aborted) {
      return { url: src, revoke: false, img: null };
    }
    const img = await loadDecodedImageElement(src);
    onFraction(1);
    return { url: src, revoke: false, img };
  }
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
  onLoadingChange,
}) => {
  const activeCase = useMemo(
    () => getComparisonCaseForTreatment(selectedTreatmentId, COMPARISON_CASES),
    [selectedTreatmentId]
  );

  const [position, setPosition] = useState<number>(52);
  const [visitDays, setVisitDays] = useState<number>(14);
  const [whiteningPass, setWhiteningPass] = useState<number>(3);
  const [dragging, setDragging] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [pixelCacheVersion, setPixelCacheVersion] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [loadProgress, setLoadProgress] = useState(1);
  const [resolvedMedia, setResolvedMedia] = useState<ResolvedPreviewMedia>(() => ({
    treatmentId: activeCase.treatmentId,
    beforeUrl: activeCase.beforeSrc,
    afterUrl: activeCase.afterSrc,
  }));

  const frameRef = useRef<HTMLDivElement>(null);
  const [beforeCanvasEl, setBeforeCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const [afterCanvasEl, setAfterCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const pixelCacheRef = useRef<CachedSmilePixels | null>(null);
  const loadSeqRef = useRef<number>(0);

  const isTeethMode = activeCase.retouchMode === 'teeth';
  const isWhiteningPairMode = activeCase.retouchMode === 'whitening-pair';
  const isVeneers = activeCase.treatmentId === 'cd-veneers';

  useEffect(() => {
    onLoadingChange?.(loadingPreview);
  }, [loadingPreview, onLoadingChange]);

  const stage = useMemo(
    () => calculateSmileProgressByDays(visitDays),
    [visitDays]
  );
  const whiteningPassInfo = useMemo(
    () => calculateLaserWhiteningPass(whiteningPass),
    [whiteningPass]
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

  // Lock selectors, stream real asset progress smoothly 1->100%, and keep media blurred until assets decode
  useEffect(() => {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    const abortController = new AbortController();
    const objectUrlsToRevoke: string[] = [];
    let cancelled = false;
    let settledOut = false;
    let settleTimer: number | undefined;
    let finishTimer: number | undefined;

    setPosition(52);
    setLoadingPreview(true);
    setLoadProgress(1);
    setResolvedMedia({
      treatmentId: activeCase.treatmentId,
      beforeUrl: activeCase.beforeSrc,
      afterUrl: activeCase.afterSrc,
    });
    if (isTeethMode) {
      setCanvasReady(false);
      pixelCacheRef.current = null;
      setPixelCacheVersion(0);
    } else {
      pixelCacheRef.current = null;
    }

    const startTime = performance.now();
    const minTransitionMs = 340;
    let beforeFraction = 0;
    let afterFraction = 0;

    // Monotonic progress engine combining streamed download bytes + continuous asymptotic curve up to 99% (never hard-stopped at 88%)
    const progressTicker = window.setInterval(() => {
      if (cancelled || loadSeqRef.current !== seq || settledOut) return;
      const elapsed = performance.now() - startTime;
      const byteFraction = isTeethMode ? afterFraction : (beforeFraction + afterFraction) / 2;
      const bytePercent = Math.round(1 + byteFraction * 95);
      const curvePercent = Math.round(1 + 98 * (1 - Math.exp(-elapsed / 1400)));
      const target = Math.min(99, Math.max(bytePercent, curvePercent));

      setLoadProgress(prev => {
        if (prev >= 99) return prev;
        if (target > prev) {
          const step = Math.max(1, Math.ceil((target - prev) * 0.35));
          return Math.min(99, prev + step);
        }
        return prev;
      });
    }, 55);

    const finalizeReady = () => {
      if (settledOut || cancelled || loadSeqRef.current !== seq) return;
      settledOut = true;
      window.clearInterval(progressTicker);
      window.clearTimeout(failsafeTimer);
      const elapsed = performance.now() - startTime;
      const waitMs = Math.max(0, minTransitionMs - elapsed);
      settleTimer = window.setTimeout(() => {
        if (cancelled || loadSeqRef.current !== seq) return;
        setLoadProgress(100);
        finishTimer = window.setTimeout(() => {
          if (cancelled || loadSeqRef.current !== seq) return;
          setLoadingPreview(false);
        }, 160);
      }, waitMs);
    };

    // Hard failsafe ensures a stalled remote host never leaves selectors locked permanently
    const failsafeTimer = window.setTimeout(() => {
      if (!settledOut && !cancelled && loadSeqRef.current === seq) {
        if (isTeethMode) setCanvasReady(true);
        finalizeReady();
      }
    }, 9500);

    if (isTeethMode) {
      fetchAndDecodeImage(
        activeCase.afterSrc,
        fraction => {
          afterFraction = fraction * 0.85;
        },
        abortController.signal
      ).then(({ url, revoke, img }) => {
        if (revoke) objectUrlsToRevoke.push(url);
        if (cancelled || loadSeqRef.current !== seq) return;

        if (img && img.naturalWidth > 0) {
          const maxDim = 960;
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          const width = Math.max(1, Math.round((img.naturalWidth || 960) * scale));
          const height = Math.max(1, Math.round((img.naturalHeight || 720) * scale));

          const scratch = document.createElement('canvas');
          scratch.width = width;
          scratch.height = height;
          const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
          if (scratchCtx) {
            scratchCtx.drawImage(img, 0, 0, width, height);
            const baseData = scratchCtx.getImageData(0, 0, width, height);
            const toothMask = buildToothMaskBuffer(baseData.data, width, height);

            pixelCacheRef.current = {
              width,
              height,
              baseRgba: baseData.data,
              toothMask,
            };
            setPixelCacheVersion(prev => prev + 1);
          }
        }

        afterFraction = 1;
        setResolvedMedia({
          treatmentId: activeCase.treatmentId,
          beforeUrl: url,
          afterUrl: url,
        });
        setCanvasReady(true);
        finalizeReady();
      });
    } else {
      Promise.all([
        fetchAndDecodeImage(
          activeCase.beforeSrc,
          fraction => {
            beforeFraction = fraction;
          },
          abortController.signal
        ),
        fetchAndDecodeImage(
          activeCase.afterSrc,
          fraction => {
            afterFraction = fraction;
          },
          abortController.signal
        ),
      ]).then(([beforeAsset, afterAsset]) => {
        if (beforeAsset.revoke) objectUrlsToRevoke.push(beforeAsset.url);
        if (afterAsset.revoke) objectUrlsToRevoke.push(afterAsset.url);
        if (cancelled || loadSeqRef.current !== seq) return;

        setResolvedMedia({
          treatmentId: activeCase.treatmentId,
          beforeUrl: beforeAsset.url,
          afterUrl: afterAsset.url,
        });
        finalizeReady();
      });
    }

    return () => {
      cancelled = true;
      abortController.abort();
      window.clearInterval(progressTicker);
      window.clearTimeout(failsafeTimer);
      if (settleTimer !== undefined) {
        window.clearTimeout(settleTimer);
      }
      if (finishTimer !== undefined) {
        window.clearTimeout(finishTimer);
      }
      for (const blobUrl of objectUrlsToRevoke) {
        URL.revokeObjectURL(blobUrl);
      }
    };
    // Intentionally initialize once per treatment switch / image pair; slider adjusts intensity separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeethMode, activeCase.beforeSrc, activeCase.afterSrc, activeCase.treatmentId]);

  // Paint Before & After veneer canvases whenever cached pixels OR newly mounted canvas elements become ready
  useEffect(() => {
    if (!isTeethMode) return;
    const cache = pixelCacheRef.current;
    if (!cache) return;

    if (beforeCanvasEl) {
      beforeCanvasEl.width = cache.width;
      beforeCanvasEl.height = cache.height;
      const bCtx = beforeCanvasEl.getContext('2d');
      if (bCtx) {
        const stainedData = renderSmileVariantImageData(
          cache.baseRgba,
          cache.toothMask,
          cache.width,
          cache.height,
          'before'
        );
        bCtx.putImageData(stainedData, 0, 0);
      }
    }

    if (afterCanvasEl) {
      afterCanvasEl.width = cache.width;
      afterCanvasEl.height = cache.height;
      const aCtx = afterCanvasEl.getContext('2d');
      if (aCtx) {
        const updatedData = renderSmileVariantImageData(
          cache.baseRgba,
          cache.toothMask,
          cache.width,
          cache.height,
          'after',
          stage.whiteningLevel
        );
        aCtx.putImageData(updatedData, 0, 0);
      }
    }
  }, [isTeethMode, pixelCacheVersion, beforeCanvasEl, afterCanvasEl, stage.whiteningLevel]);

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
    if (loadingPreview) return;
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
    if (!dragging || loadingPreview) return;
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
    if (loadingPreview) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setPosition(prev => clampComparisonPercentage(prev - 5));
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setPosition(prev => clampComparisonPercentage(prev + 5));
    }
  };

  const afterBadgeText = isTeethMode
    ? `After · ${stage.visitTimeLabel}`
    : isWhiteningPairMode
      ? `After · ${whiteningPassInfo.passLabel}`
      : activeCase.afterLabel;

  const visitTimeText = isVeneers
    ? stage.visitTimeLabel
    : isWhiteningPairMode
      ? `${whiteningPassInfo.durationMinutes} min visit · Same-Day Brightening`
      : activeCase.timeframe;

  const activeBeforeSrc =
    resolvedMedia.treatmentId === activeCase.treatmentId
      ? resolvedMedia.beforeUrl
      : activeCase.beforeSrc;
  const activeAfterSrc =
    resolvedMedia.treatmentId === activeCase.treatmentId
      ? resolvedMedia.afterUrl
      : activeCase.afterSrc;

  return (
    <section
      id="results"
      className="scroll-mt-20 border-b border-[#E2D9CE] bg-[#EFE9E0]/55 py-16 sm:py-20 md:scroll-mt-24 md:py-24 2xl:py-28"
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

              {/* Quick Switch Treatment Dropdown locked while comparison pair is loading */}
              <div className="mt-6">
                <label className="mb-1.5 block text-xs font-semibold tracking-[0.14em] text-[#1F1B18] uppercase">
                  Preview Results by Treatment
                </label>
                <GlideSelect
                  options={treatmentOptions}
                  value={activeCase.treatmentId}
                  onChange={nextId => {
                    if (!loadingPreview) onSelectTreatment(nextId);
                  }}
                  disabled={loadingPreview}
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
                    {visitTimeText}
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

              {/* Veneers Days & Charge Slider */}
              {isTeethMode ? (
                <div className="mt-5 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-4">
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
                    disabled={loadingPreview}
                    value={visitDays}
                    onChange={e => setVisitDays(Number(e.target.value))}
                    aria-label="Adjust visit days to preview porcelain veneer brightness and estimated charge"
                    aria-valuetext={`${stage.visitTimeLabel}, ${stage.formattedCharge}`}
                    className="mt-3 h-2 w-full cursor-pointer accent-[#1F1B18] disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-medium text-[#6E655F] sm:text-[11px]">
                    <span>1 Day · 1 Visit</span>
                    <span>7 Days · Mid</span>
                    <span>14 Days · 2 Visits</span>
                  </div>
                </div>
              ) : null}

              {/* Distinct 3-Pass Slider for In-Chair Laser Teeth Whitening */}
              {isWhiteningPairMode ? (
                <div className="mt-5 rounded-xl border border-[#E2D9CE] bg-[#FAF7F2] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor="whitening-pass-slider"
                      className="text-xs font-semibold tracking-[0.12em] text-[#1F1B18] uppercase"
                    >
                      Laser Whitening Passes
                    </label>
                    <span className="text-xs font-medium text-[#B68D5E]">
                      {whiteningPassInfo.shadeGainLabel}
                    </span>
                  </div>

                  <input
                    id="whitening-pass-slider"
                    type="range"
                    min={1}
                    max={3}
                    step={1}
                    disabled={loadingPreview}
                    value={whiteningPass}
                    onChange={e => setWhiteningPass(Number(e.target.value))}
                    aria-label="Select in-chair laser whitening pass count"
                    aria-valuetext={`${whiteningPassInfo.passLabel}, ${whiteningPassInfo.shadeGainLabel}`}
                    className="mt-3 h-2 w-full cursor-pointer accent-[#1F1B18] disabled:cursor-not-allowed disabled:opacity-50"
                  />

                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-medium text-[#6E655F] sm:text-[11px]">
                    <span>Pass 1 · 25 min</span>
                    <span>Pass 2 · 50 min</span>
                    <span>Pass 3 · 75 min</span>
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
                aria-busy={loadingPreview}
                data-testid="smile-comparison-frame"
                data-treatment-id={activeCase.treatmentId}
                data-retouch-mode={activeCase.retouchMode}
                data-canvas-ready={canvasReady ? 'true' : 'false'}
                data-loading={loadingPreview ? 'true' : 'false'}
                className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#E2D9CE] bg-[#EFE9E0] select-none touch-none ${
                  loadingPreview ? 'cursor-wait' : 'cursor-ew-resize'
                }`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* Out / In Animated Media Layers (stay blurred until assets decode, then transition crisply into focus) */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeCase.treatmentId}
                    data-testid="comparison-media-layer"
                    initial={{ opacity: 0, scale: 1.025, filter: 'blur(14px)' }}
                    animate={
                      loadingPreview
                        ? { opacity: 0.55, scale: 1.016, filter: 'blur(14px)' }
                        : { opacity: 1, scale: 1, filter: 'blur(0px)' }
                    }
                    exit={{ opacity: 0, scale: 0.985, filter: 'blur(10px)' }}
                    transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                    className={`relative h-full w-full ${loadingPreview ? 'pointer-events-none' : ''}`}
                  >
                    {isTeethMode ? (
                      <>
                        {/* Fallback Base Photo while canvas initializes */}
                        <img
                          src={activeAfterSrc}
                          alt={activeCase.beforeLabel}
                          className="pointer-events-none block h-full w-full object-cover"
                          draggable={false}
                        />

                        {/* Before Layer: natural yellowed teeth */}
                        <canvas
                          ref={setBeforeCanvasEl}
                          aria-label="Before treatment: natural yellowed teeth"
                          data-testid="before-smile-canvas"
                          className={`pointer-events-none absolute inset-0 block h-full w-full object-cover transition-opacity duration-200 ${
                            canvasReady ? 'opacity-100' : 'opacity-0'
                          }`}
                        />

                        {/* After Layer: cleaned/whitened teeth */}
                        <canvas
                          ref={setAfterCanvasEl}
                          aria-label={`After ${stage.visitTimeLabel}: clean whitened teeth`}
                          data-testid="after-smile-canvas"
                          data-whitening-level={stage.whiteningLevel}
                          className={`pointer-events-none absolute inset-0 block h-full w-full object-cover transition-opacity duration-200 ${
                            canvasReady ? 'opacity-100' : 'opacity-0'
                          }`}
                          style={{
                            clipPath: `inset(0 0 0 ${position}%)`,
                          }}
                        />
                      </>
                    ) : isWhiteningPairMode ? (
                      <>
                        {/* Before Whitening Base Photo */}
                        <img
                          src={activeBeforeSrc}
                          alt={`${activeCase.treatment} — ${activeCase.beforeLabel}`}
                          data-testid="before-comparison-image"
                          className="pointer-events-none block h-full w-full object-cover"
                          draggable={false}
                        />

                        {/* Clipped After Region: blends smoothly from Before -> After across Laser Pass 1–3 */}
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
                        >
                          <img
                            src={activeBeforeSrc}
                            alt=""
                            aria-hidden="true"
                            className="pointer-events-none block h-full w-full object-cover"
                            draggable={false}
                          />
                          <img
                            src={activeAfterSrc}
                            alt={`${activeCase.treatment} — ${afterBadgeText}`}
                            data-testid="after-comparison-image"
                            data-whitening-pass={whiteningPassInfo.pass}
                            className="pointer-events-none absolute inset-0 block h-full w-full object-cover transition-opacity duration-200"
                            style={{ opacity: whiteningPassInfo.blendOpacity }}
                            draggable={false}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Before Photo Layer */}
                        <img
                          src={activeBeforeSrc}
                          alt={`${activeCase.treatment} — ${activeCase.beforeLabel}`}
                          data-testid="before-comparison-image"
                          className="pointer-events-none block h-full w-full object-cover"
                          draggable={false}
                        />

                        {/* After Photo Layer Clipped by Slider Position */}
                        <img
                          src={activeAfterSrc}
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
                        tabIndex={loadingPreview ? -1 : 0}
                        aria-label="Drag left or right to compare before and after"
                        aria-valuemin={5}
                        aria-valuemax={95}
                        aria-valuenow={Math.round(position)}
                        aria-disabled={loadingPreview}
                        onKeyDown={handleSliderKeyDown}
                        className="pointer-events-auto absolute top-1/2 left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-[#E2D9CE] bg-[#1F1B18] text-[#FAF7F2] outline-none focus-visible:ring-2 focus-visible:ring-[#B68D5E]"
                      >
                        <MoveHorizontal className="h-4 w-4 text-[#B68D5E]" />
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Single Centered Progress Bar Overlay with Out/In Transition */}
                <AnimatePresence>
                  {loadingPreview ? (
                    <motion.div
                      key="loading-overlay"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94, y: -4 }}
                      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#FAF7F2]/35 px-6"
                      data-testid="comparison-loading-overlay"
                    >
                      <div className="w-full max-w-xs rounded-xl border border-[#E2D9CE] bg-[#FAF7F2]/95 px-5 py-4 text-center">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold tracking-[0.12em] text-[#1F1B18] uppercase">
                          <span>Loading Preview</span>
                          <span className="text-[#6E655F] tabular-nums">{loadProgress}%</span>
                        </div>
                        <div
                          role="progressbar"
                          aria-label="Loading before and after treatment preview"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={loadProgress}
                          data-testid="preview-loading-bar"
                          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#E2D9CE]"
                        >
                          <div
                            className="h-full rounded-full bg-[#B68D5E] transition-[width] duration-100 ease-out"
                            style={{ width: `${loadProgress}%` }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </FadeContent>
      </div>
    </section>
  );
};

export default BeforeAfterSection;
