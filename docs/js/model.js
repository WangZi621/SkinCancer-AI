// SkinScan AI: on-device inference with ONNX Runtime Web (WebAssembly).
// Preprocessing mirrors the training notebook exactly:
//   image  -> RGB, bilinear resize (half-pixel centers, like cv2.resize / tf.image.resize)
//             to the model's input size, raw 0-255 floats (EfficientNet normalizes internally)
//   patient -> the same 17 metadata features, in the same order, as META_COLS in training.

import * as ort from '../vendor/ort/ort.wasm.min.mjs';

// skinscan-v3.onnx is skin_cancer_v3.tflite with its INT8 activation quantization removed
// (tools/make_weight_only_onnx.py). Weights stay int8; all activations run in float32.
export const MODEL_URL = 'model/skinscan-v3.onnx';
const WASM_DIR = new URL('../vendor/ort/', import.meta.url).href;

// Output order from training: CLASS_NAMES = ['Melanoma', 'Benign Nevi', 'Other Malignant']
export const CLASSES = [
  { key: 'melanoma', name: 'Melanoma', short: 'Melanoma' },
  { key: 'benign', name: 'Benign lesion', short: 'Benign' },
  { key: 'other', name: 'Other skin cancer (BCC or SCC)', short: 'Other skin cancer' },
];

// Melanoma cutoff tuned on the 9,080 validation images: 90.0% sensitivity, 81.5% specificity.
export const MELANOMA_CUTOFF = 0.278;

// ---- metadata encoding (17 features) --------------------------------------
// Constants come from preprocessed_validated_data.csv and the training notebook.
const AGE_MEAN = 58.41137842150485; // age_normalized = (age - mean) / sd over all 48,882 rows
const AGE_SD = 16.797384722992433;
const AGE_FILL = 60; // median age, used when age is not recorded
const SIZE_FILL_MM = 6.1; // median clin_size_long_diam_mm, used when size is not measured

// Column order of the site one-hots in the training CSV.
export const SITES = [
  'anterior torso',
  'head/neck',
  'lateral torso',
  'lower extremity',
  'oral/genital',
  'palms/soles',
  'posterior torso',
  'upper extremity',
];

/**
 * @param {{age?: number, sex?: 'female'|'male'|'unknown', site?: string,
 *          diameterMm?: number, fitzpatrick?: number, melanocytic?: 'yes'|'no'|'unsure'}} p
 */
export function encodeMetadata(p = {}) {
  const age = Number.isFinite(p.age) ? p.age : AGE_FILL;
  const v = new Float32Array(17);
  v[0] = p.sex === 'male' ? 1 : 0; // sex_encoded: male 1, female 0, missing 0
  v[1] = (age - AGE_MEAN) / AGE_SD; // age_normalized
  v[2] = age < 35 ? 1 : 0; // age_lt35
  v[3] = age >= 35 && age < 50 ? 1 : 0; // age_35_50
  v[4] = age >= 50 && age < 65 ? 1 : 0; // age_50_65
  v[5] = age >= 65 ? 1 : 0; // age_gt65
  const s = SITES.indexOf(p.site);
  if (s >= 0) v[6 + s] = 1; // site_* one-hots (all zero when not recorded)
  v[14] = (Number.isFinite(p.diameterMm) && p.diameterMm > 0 ? p.diameterMm : SIZE_FILL_MM) / 50; // size_norm
  v[15] = (p.fitzpatrick >= 1 && p.fitzpatrick <= 6 ? p.fitzpatrick : 3) / 6; // skin_type_norm
  v[16] = p.melanocytic === 'yes' ? 1 : p.melanocytic === 'no' ? 0 : 0.5; // melanocytic_flag
  return v;
}

/** The metadata vector the model sees when nothing about the patient is known. */
export const UNKNOWN_PATIENT = Object.freeze({ sex: 'unknown', melanocytic: 'unsure' });

// ---- image preprocessing --------------------------------------------------
const MAX_SOURCE_SIDE = 4096; // larger photos are first scaled down by the browser

/** Read the full-resolution RGBA pixels of an ImageBitmap (or image/canvas). */
export function readPixels(source) {
  let w = source.width;
  let h = source.height;
  const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Bilinear resize with half-pixel centers (cv2.INTER_LINEAR / tf.image.resize),
 * rounded to whole pixel values like the uint8 images used in training.
 * Returns Float32Array(size*size*3), RGB, values 0-255.
 */
export function resizeToInput(imageData, size) {
  const { width: sw, height: sh, data } = imageData;
  const out = new Float32Array(size * size * 3);
  const sx = sw / size;
  const sy = sh / size;
  const x0s = new Int32Array(size);
  const x1s = new Int32Array(size);
  const fxs = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    let fx = (x + 0.5) * sx - 0.5;
    if (fx < 0) fx = 0;
    let x0 = Math.floor(fx);
    if (x0 > sw - 1) x0 = sw - 1;
    x0s[x] = x0;
    x1s[x] = Math.min(x0 + 1, sw - 1);
    fxs[x] = fx - x0;
  }
  let o = 0;
  for (let y = 0; y < size; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    let y0 = Math.floor(fy);
    if (y0 > sh - 1) y0 = sh - 1;
    const y1 = Math.min(y0 + 1, sh - 1);
    const dy = fy - y0;
    const r0 = y0 * sw * 4;
    const r1 = y1 * sw * 4;
    for (let x = 0; x < size; x++) {
      const dx = fxs[x];
      const a = r0 + x0s[x] * 4;
      const b = r0 + x1s[x] * 4;
      const c = r1 + x0s[x] * 4;
      const d = r1 + x1s[x] * 4;
      for (let ch = 0; ch < 3; ch++) {
        const top = data[a + ch] + (data[b + ch] - data[a + ch]) * dx;
        const bot = data[c + ch] + (data[d + ch] - data[c + ch]) * dx;
        out[o++] = Math.round(top + (bot - top) * dy);
      }
    }
  }
  return out;
}

// ---- runtime ----------------------------------------------------------------
export class SkinScanModel {
  constructor() {
    this.session = null;
    this.inputSize = 380;
    this.imageName = null;
    this.metaName = null;
    this.outputName = null;
    this.queue = Promise.resolve();
    this.loading = null;
  }

  /** Download (with progress) and prepare the model. Safe to call more than once. */
  load(onProgress = () => {}) {
    if (!this.loading) {
      this.loading = this.#load(onProgress).catch((err) => {
        this.loading = null;
        throw err;
      });
    }
    return this.loading;
  }

  async #load(onProgress) {
    ort.env.wasm.wasmPaths = WASM_DIR;
    // Threads need cross-origin isolation, which sw.js turns on after the first visit.
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    const bytes = await fetchWithProgress(MODEL_URL, (loaded, total) =>
      onProgress({ phase: 'download', loaded, total }),
    );
    onProgress({ phase: 'compile' });
    this.session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    // Find the image and patient inputs by name, not by position.
    this.imageName = this.session.inputNames.find((n) => /image/i.test(n)) || this.session.inputNames[0];
    this.metaName = this.session.inputNames.find((n) => n !== this.imageName);
    this.outputName = this.session.outputNames[0];
    onProgress({ phase: 'ready' });
    return this;
  }

  /** Run one forward pass. Calls are queued so the model is never used twice at once. */
  predict(imageTensorData, metaVector) {
    const job = this.queue.then(() => this.#run(imageTensorData, metaVector));
    this.queue = job.catch(() => {});
    return job;
  }

  async #run(imageTensorData, metaVector) {
    const s = this.inputSize;
    const feeds = {
      [this.imageName]: new ort.Tensor('float32', imageTensorData, [1, s, s, 3]),
      [this.metaName]: new ort.Tensor('float32', metaVector, [1, metaVector.length]),
    };
    const t0 = performance.now();
    const out = await this.session.run(feeds);
    const probs = Float32Array.from(out[this.outputName].data);
    return { probs, ms: performance.now() - t0 };
  }
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the model (HTTP ${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}

// ---- triage -----------------------------------------------------------------
/**
 * Melanoma at or above the validated cutoff -> refer urgently.
 * Otherwise the highest-scoring class decides between "refer" and "routine".
 */
export function triage(probs) {
  const [mel, ben, oth] = probs;
  const ranked = CLASSES.map((c, i) => ({ ...c, p: probs[i], index: i })).sort((a, b) => b.p - a.p);
  const close = ranked[0].p - ranked[1].p < 0.1;
  if (mel >= MELANOMA_CUTOFF) {
    return { level: 'urgent', title: 'Refer urgently', finding: 'Possible melanoma', ranked, close };
  }
  if (oth >= ben) {
    return { level: 'soon', title: 'Refer for review', finding: 'Possible basal or squamous cell carcinoma', ranked, close };
  }
  return { level: 'routine', title: 'Routine follow-up', finding: 'Looks benign', ranked, close };
}
