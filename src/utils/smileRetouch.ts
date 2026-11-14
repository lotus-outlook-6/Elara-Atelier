/**
 * Pure pixel-level tooth-mask and enamel shade retouching utilities.
 * Keeps facial skin, lips, and pink gums 100% identical across Before and After,
 * applies subtle natural everyday yellowing only to teeth on Before, and cleanly scales
 * from stain removal (Day 1) to luminous porcelain white (Day 14) across upper & lower teeth,
 * including shaded lower incisors and upper cervical enamel edges near the gumline.
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
 * Compute RGB hue angle in degrees [0, 360).
 * Inputs: r, g, b channels (0-255).
 * Output: hue in degrees [0, 360).
 */
function computeHueDegrees(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d <= 0) return 0;

  let h = 0;
  if (max === r) {
    h = 60 * (((g - b) / d) % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / d + 2);
  } else {
    h = 60 * ((r - g) / d + 4);
  }
  return h < 0 ? h + 360 : h;
}

/**
 * Compute a soft [0, 1] mask weight indicating whether a pixel belongs to upper or lower teeth
 * inside the centered smile arch, including warm/yellowed cervical edges and shaded lower teeth,
 * while strictly excluding pink gums, lips, facial skin, and dark oral shadows.
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
  const dx = (normX - 0.5) / 0.375;
  const dy = (normY - 0.5) / 0.205;
  const distSq = dx * dx + dy * dy;
  if (distSq >= 1) return 0;

  const spatial = smoothstep(1, 0.8, distSq);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const lumWeight = smoothstep(52, 95, lum);
  const blueWeight = smoothstep(32, 70, b);

  const rgDiff = r - g;
  const gbDiff = g - b;
  const redRatio = rgDiff / Math.max(r, 1);

  // Pink gums & lips have low hue (< 13 deg) and strong red excess over (g - b).
  // Warm/yellowed tooth enamel has higher hue (15-55 deg) and strong yellow separation (g - b >= 14).
  const hue = computeHueDegrees(r, g, b);
  const pinkness = rgDiff - 1.35 * Math.max(0, gbDiff);

  const neutralToothWeight =
    smoothstep(0.245, 0.165, redRatio) * smoothstep(42, 28, rgDiff);

  const warmEnamelWeight =
    smoothstep(13, 18, hue) *
    smoothstep(62, 52, hue) *
    smoothstep(10, 18, gbDiff) *
    smoothstep(34, 21, pinkness);

  const enamelWeight =
    Math.max(neutralToothWeight, warmEnamelWeight) * smoothstep(38, 22, pinkness);

  return spatial * lumWeight * blueWeight * enamelWeight;
}

/**
 * Apply natural everyday yellowing solely to masked tooth pixels for the Before state
 * starting from an already clean white smile photograph.
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

  const stainedR = r * 0.965;
  const stainedG = g * 0.915;
  const stainedB = b * 0.775;

  const outR = Math.round(Math.max(0, Math.min(255, r + (stainedR - r) * toothWeight)));
  const outG = Math.round(Math.max(0, Math.min(255, g + (stainedG - g) * toothWeight)));
  const outB = Math.round(Math.max(0, Math.min(255, b + (stainedB - b) * toothWeight)));
  return [outR, outG, outB];
}

/**
 * Progressively transition a clean white teeth image based on Visit Time & Days slider:
 * whiteningLevel = 1 (Day 14 / 2 Visits): 100% original untouched clean teeth image.
 * whiteningLevel -> 0 (Day 1 / 1 Visit): gradually adds subtle warm yellow-ivory tint
 * as slider decreases, remaining noticeably cleaner than the Before state.
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
  if (w >= 0.999) return [r, g, b];

  // As slider decreases from Day 14 (w=1) down to Day 1 (w=0), gradually warm/yellow teeth
  const stainAmount = 1 - w;
  const targetR = r * (1 - 0.02 * stainAmount);
  const targetG = g * (1 - 0.055 * stainAmount);
  const targetB = b * (1 - 0.155 * stainAmount);

  const outR = Math.round(Math.max(0, Math.min(255, r + (targetR - r) * toothWeight)));
  const outG = Math.round(Math.max(0, Math.min(255, g + (targetG - g) * toothWeight)));
  const outB = Math.round(Math.max(0, Math.min(255, b + (targetB - b) * toothWeight)));
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
