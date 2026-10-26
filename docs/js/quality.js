// Photo quality check, run before the model on a 256 px grey copy of the photo.
// It flags the things that most often spoil a dermoscopic photo: blur, poor exposure,
// low contrast and a photo smaller than the model's 380 px input.

const SIDE = 256;

// Thresholds were set on the eight bundled ISIC samples and on blurred (6 px), darkened (35 %),
// overexposed (190 %) and flattened (25 % contrast) copies of them. Every original passes
// (sharpness 94 or more, brightness 137 to 191, contrast 23 or more) and every degraded copy
// fails its check (blurred 34 or less, dark 66 or less, bright 213 or more, flat 13 or less).
const LIMITS = {
  sharpness: 40, // variance of the Laplacian on the 256 px copy
  darkMean: 75,
  brightMean: 210,
  contrast: 16, // standard deviation of brightness
  minSide: 380,
};

/** @returns {{ok: boolean, checks: Array<{key: string, label: string, ok: boolean, note: string}>, metrics: object}} */
export function checkPhoto(bitmap) {
  const c = document.createElement('canvas');
  const s = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(8, Math.round(bitmap.width * s));
  const h = Math.max(8, Math.round(bitmap.height * s));
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const g = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    g[p] = y;
    sum += y;
  }
  const mean = sum / g.length;
  let varSum = 0;
  for (let p = 0; p < g.length; p++) varSum += (g[p] - mean) ** 2;
  const contrast = Math.sqrt(varSum / g.length);

  // Laplacian over the centre 80% (vignetted dermoscope edges would add false detail)
  const x0 = Math.round(w * 0.1);
  const y0 = Math.round(h * 0.1);
  const x1 = w - x0;
  const y1 = h - y0;
  let lsum = 0;
  let lsq = 0;
  let n = 0;
  for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y++) {
    for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
      const i = y * w + x;
      const lap = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      lsum += lap;
      lsq += lap * lap;
      n++;
    }
  }
  const lmean = lsum / n;
  const sharpness = lsq / n - lmean * lmean;
  const minSide = Math.min(bitmap.width, bitmap.height);

  const checks = [
    {
      key: 'focus',
      label: 'In focus',
      ok: sharpness >= LIMITS.sharpness,
      note: 'The photo looks blurred. Hold the dermoscope still and retake it.',
    },
    {
      key: 'exposure',
      label: 'Exposure',
      ok: mean >= LIMITS.darkMean && mean <= LIMITS.brightMean,
      note: mean < LIMITS.darkMean ? 'The photo is too dark.' : 'The photo is too bright or washed out.',
    },
    {
      key: 'contrast',
      label: 'Contrast',
      ok: contrast >= LIMITS.contrast,
      note: 'There is very little contrast; the lesion may not stand out from the skin.',
    },
    {
      key: 'size',
      label: 'Resolution',
      ok: minSide >= LIMITS.minSide,
      note: `The photo is ${minSide} px on its short side; the model works at 380 px, so detail is lost.`,
    },
  ];
  return {
    ok: checks.every((c) => c.ok),
    checks,
    metrics: { sharpness: +sharpness.toFixed(1), mean: +mean.toFixed(1), contrast: +contrast.toFixed(1), minSide },
  };
}
