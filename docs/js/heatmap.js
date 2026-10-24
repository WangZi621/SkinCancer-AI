// Occlusion sensitivity: cover one part of the image at a time with the image's
// average color and measure how much the predicted class score drops.
// Areas whose removal lowers the score most are the ones the model relied on.

export async function occlusionMap(model, tensor, size, meta, target, baseProb, { grid = 5, frac = 1 / 3, onProgress } = {}) {
  const patch = Math.round(size * frac);
  const stride = (size - patch) / (grid - 1);
  const px = size * size;
  const mean = [0, 0, 0];
  for (let i = 0; i < px; i++) {
    mean[0] += tensor[i * 3];
    mean[1] += tensor[i * 3 + 1];
    mean[2] += tensor[i * 3 + 2];
  }
  for (let c = 0; c < 3; c++) mean[c] = Math.round(mean[c] / px);

  const sum = new Float32Array(px);
  const count = new Float32Array(px);
  const work = new Float32Array(tensor.length);
  const total = grid * grid;
  let done = 0;

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x0 = Math.round(gx * stride);
      const y0 = Math.round(gy * stride);
      work.set(tensor);
      for (let y = y0; y < y0 + patch; y++) {
        for (let x = x0; x < x0 + patch; x++) {
          const o = (y * size + x) * 3;
          work[o] = mean[0];
          work[o + 1] = mean[1];
          work[o + 2] = mean[2];
        }
      }
      const { probs } = await model.predict(work, meta);
      const drop = baseProb - probs[target];
      for (let y = y0; y < y0 + patch; y++) {
        for (let x = x0; x < x0 + patch; x++) {
          const i = y * size + x;
          sum[i] += drop;
          count[i] += 1;
        }
      }
      done += 1;
      if (onProgress) onProgress(done / total);
    }
  }
  let max = 0;
  for (let i = 0; i < px; i++) {
    sum[i] = count[i] ? sum[i] / count[i] : 0;
    if (sum[i] > max) max = sum[i];
  }
  return { heat: sum, size, max };
}

/** Paint the heat values into a small canvas: violet (low) to yellow (high), transparent at zero. */
export function heatToCanvas({ heat, size, max }) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const lo = [69, 52, 181];
  const hi = [255, 222, 89];
  const scale = max > 0.005 ? 1 / max : 0;
  for (let i = 0; i < heat.length; i++) {
    const v = Math.max(0, Math.min(1, heat[i] * scale));
    const t = Math.pow(v, 0.8);
    img.data[i * 4] = lo[0] + (hi[0] - lo[0]) * t;
    img.data[i * 4 + 1] = lo[1] + (hi[1] - lo[1]) * t;
    img.data[i * 4 + 2] = lo[2] + (hi[2] - lo[2]) * t;
    img.data[i * 4 + 3] = v < 0.15 ? 0 : 60 + 170 * t;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
