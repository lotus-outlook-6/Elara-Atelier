/**
 * Pure pixel-level tooth-mask and enamel shade retouching utilities.
 * Keeps facial skin, lips, and pink gums 100% identical across Before and After,
 * applies subtle natural everyday yellowing only to teeth on Before, and cleanly scales
 * from stain removal (Day 1) to luminous porcelain white (Day 14) across upper & lower teeth.
 */

/**
 * Smooth Hermite interpolation between edge0 and edge1.
 * Inputs: edge0, edge1 thresholds and sample value x.
 * Output: clamped weight in [0, 1].
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Compute a soft [0, 1] mask weight indicating whether a pixel belongs to upper or lower teeth
 * inside the centered smile arch, excluding facial skin, lips, pink gums, and dark shadows.
 * Inputs: r, g, b (0-255), normX and normY normalized image coordinates (0-1).
 * Output: tooth mask weight in [0, 1].
 */
export function computeToothMaskWeight(
  r: number,
  g: number,
  b: number,
  normX: number,
  normY: number
): number {
  const dx = (normX - 0.5) / 0.34;
  const dy = (normY - 0.5) / 0.195;
  const distSq = dx * dx + dy * dy;
  if (distSq >= 1) return 0;

  const spatial = smoothstep(1, 0.85, distSq);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const lumWeight = smoothstep(68, 112, lum);
  const blueWeight = smoothstep(50, 88, b);

  const rgDiff = r - g;
  const redRatio = rgDiff / Math.max(r, 1);
  const nonRedWeight = smoothstep(0.27, 0.185, redRatio);
  const tissueExclusion = smoothstep(48, 32, rgDiff);

  return spatial * lumWeight * blueWeight * nonRedWeight * tissueExclusion;
}

/**
 * Apply subtle, realistic everyday yellowing solely to masked tooth pixels for the Before state.
 * Inputs: r, g, b (0-255), toothWeight in [0, 1].
 * Output: [r, g, b] integer tuple (0-255).
 */
export function applyBeforeToothStain(
  r: number,
  g: number,
  b: number,
  toothWeight: number
): [number, number, number] {
  if (toothWeight <= 0.001) return [r, g, b];

  const stainedR = r * 0.985;
  const stainedG = g * 0.955;
  const stainedB = b * 0.855;

  const outR = Math.round(Math.max(0, Math.min(255, r + (stainedR - r) * toothWeight)));
  const outG = Math.round(Math.max(0, Math.min(255, g + (stainedG - g) * toothWeight)));
  const outB = Math.round(Math.max(0, Math.min(255, b + (stainedB - b) * toothWeight)));
  return [outR, outG, outB];
}

/**
 * Apply progressive teeth-only cleaning and whitening for the After state.
 * whiteningLevel = 0 (Day 1 / 1 Visit): cleanly removes yellow stain without over-bleaching.
 * whiteningLevel = 1 (Day 14 / 2 Visits): bright porcelain white while preserving enamel shading.
 * Inputs: r, g, b (0-255), toothWeight in [0, 1], whiteningLevel in [0, 1].
 * Output: [r, g, b] integer tuple (0-255).
 */
export function applyAfterToothWhitening(
  r: number,
  g: number,
  b: number,
  toothWeight: number,
  whiteningLevel: number
): [number, number, number] {
  if (toothWeight <= 0.001) return [r, g, b];

  const w = Math.max(0, Math.min(1, whiteningLevel));
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const liftFactor = 0.04 + w * 0.42;
  const targetLum = lum + (255 - lum) * liftFactor;
  const neutralize = 0.22 + w * 0.68;

  const cleanR = r * (1 - neutralize) + targetLum * neutralize;
  const cleanG = g * (1 - neutralize) + targetLum * neutralize;
  const cleanB = b * (1 - neutralize) + targetLum * neutralize;

  const outR = Math.round(Math.max(0, Math.min(255, r + (cleanR - r) * toothWeight)));
  const outG = Math.round(Math.max(0, Math.min(255, g + (cleanG - g) * toothWeight)));
  const outB = Math.round(Math.max(0, Math.min(255, b + (cleanB - b) * toothWeight)));
  return [outR, outG, outB];
}

/**
 * Precompute a Float32Array tooth mask for an entire RGBA ImageData buffer.
 * Inputs: pixel Uint8ClampedArray (length = width * height * 4), width, height.
 * Output: Float32Array of length width * height.
 */
export function buildToothMaskBuffer(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Float32Array {
  const count = width * height;
  const weights = new Float32Array(count);
  for (let y = 0; y < height; y += 1) {
    const normY = (y + 0.5) / height;
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x;
      const p = idx * 4;
      weights[idx] = computeToothMaskWeight(
        rgba[p],
        rgba[p + 1],
        rgba[p + 2],
        (x + 0.5) / width,
        normY
      );
    }
  }
  return weights;
}

/**
 * Render either the yellowed Before frame or the Day 1–14 whitened After frame
 * from a base RGBA buffer and precomputed tooth mask buffer.
 * Inputs: baseRgba, toothMask, width, height, mode ('before' | 'after'), whiteningLevel (0-1).
 * Output: new ImageData ready to putImageData onto a 2D canvas.
 */
export function renderSmileVariantImageData(
  baseRgba: Uint8ClampedArray,
  toothMask: Float32Array,
  width: number,
  height: number,
  mode: 'before' | 'after',
  whiteningLevel = 1
): ImageData {
  const out = new Uint8ClampedArray(baseRgba.length);
  const count = width * height;
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    const weight = toothMask[i];
    const r = baseRgba[p];
    const g = baseRgba[p + 1];
    const b = baseRgba[p + 2];

    if (weight <= 0.001) {
      out[p] = r;
      out[p + 1] = g;
      out[p + 2] = b;
      out[p + 3] = baseRgba[p + 3];
      continue;
    }

    const [nr, ng, nb] =
      mode === 'before'
        ? applyBeforeToothStain(r, g, b, weight)
        : applyAfterToothWhitening(r, g, b, weight, whiteningLevel);

    out[p] = nr;
    out[p + 1] = ng;
    out[p + 2] = nb;
    out[p + 3] = baseRgba[p + 3];
  }
  return new ImageData(out, width, height);
}
