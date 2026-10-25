// "Inside the model": one real forward pass of SkinScan v3, shown stage by stage.
// Every number and map on this page comes from the model's own intermediate tensors
// (model.explain), computed in this browser for the chosen photo and patient details.

import { CLASSES, MELANOMA_CUTOFF, SITES, encodeMetadata, readPixels, resizeToInput, triage } from './model.js';

const GEM_P = 2.9221582; // learned GeM exponent, read from the trained model
const S = 380;
const SITE_LABELS = {
  'head/neck': 'Head or neck', 'anterior torso': 'Chest or abdomen', 'posterior torso': 'Back',
  'lateral torso': 'Side of torso', 'upper extremity': 'Arm', 'lower extremity': 'Leg',
  'palms/soles': 'Palm or sole', 'oral/genital': 'Mouth or genitals',
};
const FEATURES = [
  'Sex (male is 1)', 'Age as a z-score', 'Age under 35', 'Age 35 to 49', 'Age 50 to 64', 'Age 65 or older',
  ...SITES.map((s) => `Site: ${SITE_LABELS[s].toLowerCase()}`),
  'Diameter in mm, divided by 50', 'Skin type, divided by 6', 'Melanocytic (yes 1, no 0, unsure 0.5)',
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// ---------------------------------------------------------------- color
// Activations use a melanin ramp (white to umber). Layers that can go negative add a slate ramp below zero.
const MEL = [[255, 255, 255], [247, 228, 201], [224, 172, 112], [170, 98, 46], [92, 46, 19], [33, 15, 6]];
const SLATE = [[255, 255, 255], [208, 220, 230], [128, 156, 182], [52, 80, 110]];
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(Math.floor(t), stops.length - 2);
  const f = t - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const colorFor = (v, scale, signed) => (signed && v < 0 ? ramp(SLATE, -v / scale) : ramp(MEL, Math.max(0, v) / scale));
const css = ([r, g, b]) => `rgb(${r | 0} ${g | 0} ${b | 0})`;
const fmt = (v, d = 2) => {
  const s = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(d);
  return Number(s) === 0 ? s.replace('-', '') : s.replace('-', '−');
};
const pct = (p) => `${(p * 100).toFixed(1)}%`;
const num = (n) => n.toLocaleString('en-US');

function quantile(arr, q) {
  const step = Math.max(1, Math.floor(arr.length / 4000));
  const sample = [];
  for (let i = 0; i < arr.length; i += step) sample.push(Math.abs(arr[i]));
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(q * sample.length))] || 1;
}

// ---------------------------------------------------------------- tensor helpers
function channel(layer, c) {
  const [, , H, W] = layer.dims;
  return layer.data.subarray(c * H * W, (c + 1) * H * W);
}
function rankChannels(layer, k) {
  const [, C, H, W] = layer.dims;
  const scores = [];
  for (let c = 0; c < C; c++) {
    const ch = layer.data.subarray(c * H * W, (c + 1) * H * W);
    let s = 0;
    for (let i = 0; i < ch.length; i++) s += Math.abs(ch[i]);
    scores.push([s / ch.length, c]);
  }
  return scores.sort((a, b) => b[0] - a[0]).slice(0, k).map((x) => x[1]);
}
function mapCanvas(values, H, W, scale, signed) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < values.length; i++) {
    const [r, g, b] = colorFor(values[i], scale, signed);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function stripCanvas(values, cols, scale, signed, cell = 6) {
  const rows = Math.ceil(values.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * cell;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < values.length; i++) {
    ctx.fillStyle = css(colorFor(values[i], scale, signed));
    ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell - 1, cell - 1);
  }
  return c;
}
function cellAt(canvas, e, cols, count) {
  const r = canvas.getBoundingClientRect();
  const rows = Math.ceil(count / cols);
  const col = Math.floor(((e.clientX - r.left) / r.width) * cols);
  const row = Math.floor(((e.clientY - r.top) / r.height) * rows);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
  const k = row * cols + col;
  return k < count ? k : -1;
}
function tensorToImageCanvas(tensor) {
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    img.data[i * 4] = tensor[i * 3];
    img.data[i * 4 + 1] = tensor[i * 3 + 1];
    img.data[i * 4 + 2] = tensor[i * 3 + 2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
};
function legend(signed) {
  const bar = (stops) => h('span', { style: `background: linear-gradient(90deg, ${stops.map(css).join(', ')})` });
  if (!signed) {
    return h('div', { class: 'ex-legend' },
      h('div', { class: 'ex-legend-bar' }, bar(MEL)),
      h('div', { class: 'ex-legend-labels' }, h('span', { text: 'Zero' }), h('span', { text: 'Strong' })));
  }
  return h('div', { class: 'ex-legend is-signed' },
    h('div', { class: 'ex-legend-bar' }, bar([...SLATE].reverse()), bar(MEL)),
    h('div', { class: 'ex-legend-labels' }, h('span', { text: 'Below zero' }), h('span', { text: 'Zero' }), h('span', { text: 'Strong' })));
}

// ---------------------------------------------------------------- page
export function createExplainer({ root, model, samples, samplesReady, getScan }) {
  const ctx = { tensor: null, original: null, imageCanvas: null, patient: {}, layers: null, source: '', truth: null, hover: [190, 190] };
  let running = false;
  let pending = null;
  let observer = null;

  root.innerHTML = '';
  const head = h('div', { class: 'ex-head' },
    h('h1', { text: 'Inside the model' }),
    h('p', { text: 'Follow one photo through SkinScan, from raw pixels to a referral. Every map and number on this page is computed in your browser by the trained network, for the photo and patient details you pick.' }));
  const picker = h('div', { class: 'ex-picker', role: 'group', 'aria-label': 'Choose a photo' });
  const status = h('p', { class: 'ex-status', role: 'status', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'btn btn-secondary', type: 'button', text: 'Play the forward pass' });
  const tools = h('div', { class: 'ex-tools' }, playBtn, status);
  const rail = h('nav', { class: 'ex-rail', 'aria-label': 'Stages' });
  const stagesEl = h('div', { class: 'ex-stages' });
  root.append(head, picker, tools, h('div', { class: 'ex-body' }, rail, stagesEl));

  // ---- picker
  function renderPicker() {
    picker.innerHTML = '';
    const scan = getScan();
    if (scan) {
      picker.append(h('button', { class: 'ex-pick', type: 'button', 'data-id': 'scan', onclick: () => useScan() },
        h('img', { src: scan.thumb, alt: '' }), h('span', { text: 'Your photo' })));
    }
    samples().forEach((s, i) => {
      picker.append(h('button', { class: 'ex-pick', type: 'button', 'data-id': s.id, onclick: () => useSample(s, i + 1) },
        h('img', { src: s.thumb, alt: '' }), h('span', { text: `Sample ${i + 1}` })));
    });
    markPicked(ctx.picked);
  }
  function markPicked(id) {
    ctx.picked = id;
    for (const b of picker.querySelectorAll('.ex-pick')) b.setAttribute('aria-pressed', String(b.dataset.id === id));
  }
  async function useSample(s, n) {
    markPicked(s.id);
    const blob = await (await fetch(s.image)).blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    ctx.tensor = resizeToInput(readPixels(bmp), S);
    ctx.original = [bmp.width, bmp.height];
    bmp.close();
    ctx.imageCanvas = tensorToImageCanvas(ctx.tensor);
    ctx.patient = { ...s.patient };
    ctx.source = `Sample ${n}`;
    ctx.truth = s.diagnosis;
    await run('full');
  }
  async function useScan() {
    const scan = getScan();
    if (!scan) return;
    markPicked('scan');
    ctx.tensor = scan.tensor;
    ctx.original = scan.original;
    ctx.imageCanvas = tensorToImageCanvas(ctx.tensor);
    ctx.patient = { ...scan.patient };
    ctx.source = 'Your photo';
    ctx.truth = scan.truth || null;
    await run('full');
  }

  // ---- run
  async function run(mode) {
    if (running) {
      pending = pending === 'full' || mode === 'full' ? 'full' : 'patient';
      return;
    }
    running = true;
    root.classList.add('is-running');
    status.textContent = model.session ? 'Running the model…' : 'Loading the model, 21 MB the first time…';
    try {
      await model.load(() => {});
      await document.fonts.load('500 10px "Geist Mono"').catch(() => {});
      const { layers, ms } = await model.explain(ctx.tensor, encodeMetadata(ctx.patient));
      if (pending === 'full') return;
      ctx.layers = layers;
      if (mode === 'full') renderAll();
      else renderPatient();
      status.textContent = mode === 'full'
        ? `${ctx.source}. One full pass took ${(ms / 1000).toFixed(2)} s on this device.`
        : `Ran the whole network again with the new details in ${(ms / 1000).toFixed(2)} s.`;
    } catch (err) {
      console.error(err);
      status.textContent = 'The model could not run in this browser. Try a current version of Chrome, Edge, Safari, or Firefox.';
    } finally {
      running = false;
      root.classList.remove('is-running');
      if (pending) {
        const next = pending;
        pending = null;
        run(next);
      }
    }
  }

  // ---- stages
  const STAGES = [
    ['pixels', 'Pixels become numbers'],
    ['normalize', 'Rescale the numbers'],
    ['stem', 'First filters'],
    ['deeper', 'Deeper layers'],
    ['attention', 'Attention'],
    ['pool', 'Pooling'],
    ['patient', 'Patient details'],
    ['fusion', 'Photo and patient combined'],
    ['decision', 'Referral rule'],
  ];
  const BUILDERS = {
    pixels: stagePixels, normalize: stageNormalize, stem: stageStem, deeper: stageDeeper, attention: stageAttention,
    pool: stagePool, patient: stagePatient, fusion: stageFusion, decision: stageDecision,
  };

  function stage(id, title, text, viz) {
    const n = STAGES.findIndex((s) => s[0] === id) + 1;
    return h('section', { class: 'ex-stage', id: `ex-${id}`, 'data-stage': id, 'aria-labelledby': `ex-${id}-h` },
      h('div', { class: 'ex-text' },
        h('p', { class: 'ex-n mono', text: `Step ${n} of ${STAGES.length}` }),
        h('h2', { id: `ex-${id}-h`, text: title }),
        ...[].concat(text)),
      h('div', { class: 'ex-viz' }, viz));
  }

  function renderAll() {
    const L = ctx.layers;
    stagesEl.innerHTML = '';
    rail.innerHTML = '';
    for (const [id, title] of STAGES) {
      rail.append(h('button', { type: 'button', 'data-stage': id, onclick: () => document.getElementById(`ex-${id}`).scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }) },
        title));
      stagesEl.append(BUILDERS[id](L));
    }
    watchRail();
    updateHover(...ctx.hover);
  }
  function renderPatient() {
    const L = ctx.layers;
    const out = patientOutputs(L);
    ctx.patientOut.replaceWith(out);
    ctx.patientOut = out;
    for (const id of ['fusion', 'decision']) {
      const old = stagesEl.querySelector(`[data-stage="${id}"]`);
      const fresh = BUILDERS[id](L);
      old.replaceWith(fresh);
      observer?.observe(fresh);
    }
  }

  // 1. pixels -------------------------------------------------------------
  let overlayCtx = null;
  let zoomCanvas = null;
  let pixelReadout = null;
  function stagePixels() {
    const view = h('canvas', { class: 'ex-photo', width: S, height: S });
    const overlay = h('canvas', { class: 'ex-photo-overlay', width: S, height: S });
    view.getContext('2d').drawImage(ctx.imageCanvas, 0, 0);
    overlayCtx = overlay.getContext('2d');
    zoomCanvas = h('canvas', { class: 'ex-zoom', width: 9 * 40, height: 9 * 40, 'aria-hidden': 'true' });
    pixelReadout = h('p', { class: 'ex-readout mono' });
    const stack = h('div', { class: 'ex-photo-stack', role: 'img', 'aria-label': 'The model input photo. Move the pointer over it to read pixel values.' }, view, overlay);
    const move = (e) => {
      const r = view.getBoundingClientRect();
      const x = Math.max(0, Math.min(S - 1, Math.floor(((e.clientX - r.left) / r.width) * S)));
      const y = Math.max(0, Math.min(S - 1, Math.floor(((e.clientY - r.top) / r.height) * S)));
      updateHover(x, y);
    };
    stack.addEventListener('pointermove', move);
    stack.addEventListener('pointerdown', move);
    const size = ctx.original ? `${ctx.original[0]} × ${ctx.original[1]}` : 'its original size';
    return stage('pixels', 'Pixels become numbers', [
      h('p', { text: `The model never sees a picture. The photo is resized from ${size} to 380 × 380 pixels, and each pixel is stored as three numbers from 0 to 255 for red, green, and blue. That is ${num(S * S * 3)} numbers.` }),
      h('p', { class: 'ex-hint', text: 'Move over the photo, or tap it, to read the numbers under the white square.' }),
    ], h('div', { class: 'ex-lens' },
      h('figure', {}, stack),
      h('figure', {}, zoomCanvas, h('figcaption', {}, pixelReadout))));
  }
  function drawZoom(x, y) {
    if (!zoomCanvas) return;
    const z = zoomCanvas.getContext('2d');
    const cell = 40;
    z.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
    z.font = '500 10px "Geist Mono", ui-monospace, monospace';
    z.textAlign = 'center';
    for (let j = 0; j < 9; j++) {
      for (let i = 0; i < 9; i++) {
        const px = Math.max(0, Math.min(S - 1, x - 4 + i));
        const py = Math.max(0, Math.min(S - 1, y - 4 + j));
        const o = (py * S + px) * 3;
        const r = ctx.tensor[o];
        const g = ctx.tensor[o + 1];
        const b = ctx.tensor[o + 2];
        z.fillStyle = `rgb(${r} ${g} ${b})`;
        z.fillRect(i * cell, j * cell, cell - 1, cell - 1);
        z.fillStyle = 0.299 * r + 0.587 * g + 0.114 * b > 140 ? 'rgba(0,0,0,0.78)' : 'rgba(255,255,255,0.92)';
        z.fillText(String(r), i * cell + cell / 2, j * cell + 13);
        z.fillText(String(g), i * cell + cell / 2, j * cell + 24);
        z.fillText(String(b), i * cell + cell / 2, j * cell + 35);
      }
    }
    z.strokeStyle = '#ffffff';
    z.lineWidth = 2;
    z.strokeRect(4 * cell + 1, 4 * cell + 1, cell - 3, cell - 3);
  }

  // 2. normalize ------------------------------------------------------------
  let normBody = null;
  function stageNormalize() {
    const tiles = h('div', { class: 'ex-rgb' });
    ['Red', 'Green', 'Blue'].forEach((name, c) => {
      const cv = h('canvas', { width: S, height: S });
      const g = cv.getContext('2d');
      const img = g.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        const v = ctx.tensor[i * 3 + c];
        img.data[i * 4] = c === 0 ? v : 0;
        img.data[i * 4 + 1] = c === 1 ? v : 0;
        img.data[i * 4 + 2] = c === 2 ? v : 0;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      tiles.append(h('figure', {}, cv, h('figcaption', { text: `${name} channel` })));
    });
    normBody = h('tbody');
    const table = h('table', { class: 'ex-table' },
      h('thead', {}, h('tr', {}, h('th', { text: 'Channel' }), h('th', { text: 'Pixel value' }), h('th', { text: 'After rescaling' }))),
      normBody);
    return stage('normalize', 'Rescale the numbers', [
      h('p', { text: 'The three color channels are split apart. Then every value is shifted and scaled so each channel sits near zero, using the average colors of ImageNet, the 1.2 million everyday photos the network first learned from before I trained it on skin.' }),
      h('p', { class: 'ex-hint', text: 'The table follows the pixel under the white square in step 1.' }),
    ], h('div', { class: 'ex-stack' }, tiles, table));
  }
  function drawNorm(x, y) {
    if (!normBody || !ctx.layers) return;
    const o = (y * S + x) * 3;
    const n = ctx.layers.norm.data;
    normBody.innerHTML = '';
    ['Red', 'Green', 'Blue'].forEach((name, c) => {
      normBody.append(h('tr', {}, h('td', { text: name }), h('td', { class: 'mono', text: String(ctx.tensor[o + c]) }), h('td', { class: 'mono', text: fmt(n[o + c], 3) })));
    });
  }

  // shared inspector for feature maps --------------------------------------
  function inspector() {
    const big = h('canvas', { class: 'ex-insp-map' });
    const photo = h('canvas', { class: 'ex-insp-photo', width: S, height: S });
    photo.getContext('2d').drawImage(ctx.imageCanvas, 0, 0);
    const title = h('p', { class: 'ex-insp-title' });
    const info = h('p', { class: 'ex-insp-info mono' });
    const cb = h('input', { type: 'checkbox' });
    const el = h('div', { class: 'ex-insp' }, title, h('div', { class: 'ex-insp-stack' }, photo, big), info,
      h('label', { class: 'ex-toggle' }, cb, h('span', { text: 'Lay it over the photo' })));
    cb.addEventListener('change', () => el.classList.toggle('is-overlay', cb.checked));
    let shown = false;
    const show = (layerKey, label, c, signed) => {
      const layer = ctx.layers[layerKey];
      const [, C, H, W] = layer.dims;
      const vals = channel(layer, c);
      const scale = quantile(vals, 0.995) || 1;
      big.width = W;
      big.height = H;
      big.getContext('2d').drawImage(mapCanvas(vals, H, W, scale, signed), 0, 0);
      let mn = Infinity;
      let mx = -Infinity;
      let sum = 0;
      for (const v of vals) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; }
      title.textContent = `${label}, map ${c + 1} of ${num(C)}`;
      info.textContent = `${W} × ${H} values. Min ${fmt(mn)}, max ${fmt(mx)}, mean ${fmt(sum / vals.length)}`;
      shown = true;
    };
    return { el, show, get shown() { return shown; } };
  }
  function tileGrid(layerKey, label, channels, signed, insp, cls, first = channels[0]) {
    const layer = ctx.layers[layerKey];
    const [, , H, W] = layer.dims;
    const grid = h('div', { class: `ex-tiles ${cls}` });
    channels.forEach((c, i) => {
      const vals = channel(layer, c);
      const btn = h('button', { class: 'ex-tile', type: 'button', 'aria-label': `${label}, map ${c + 1}`, 'aria-pressed': 'false' },
        mapCanvas(vals, H, W, quantile(vals, 0.995) || 1, signed));
      btn.addEventListener('click', () => {
        btn.closest('.ex-viz').querySelectorAll('.ex-tile[aria-pressed="true"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        insp.show(layerKey, label, c, signed);
      });
      if (c === first && !insp.shown) {
        btn.setAttribute('aria-pressed', 'true');
        insp.show(layerKey, label, c, signed);
      }
      grid.append(btn);
    });
    return grid;
  }

  // 3. stem ----------------------------------------------------------------
  function stageStem() {
    const insp = inspector();
    const grid = tileGrid('stem', 'First layer', Array.from({ length: 48 }, (_, i) => i), true, insp, 'ex-tiles-stem', rankChannels(ctx.layers.stem, 1)[0]);
    return stage('stem', 'First filters', [
      h('p', { text: 'The first layer slides 48 small filters, each 3 × 3 pixels, across the image, two pixels at a time. Each filter makes its own 190 × 190 map of where it found its pattern, such as an edge, a dark dot, or a patch of one color.' }),
      legend(true),
      h('p', { class: 'ex-hint', text: 'These are all 48 maps for your photo. Pick one to see it large.' }),
    ], h('div', { class: 'ex-split' }, grid, insp.el));
  }

  // 4. deeper ----------------------------------------------------------------
  function stageDeeper(L) {
    const insp = inspector();
    const cols = h('div', { class: 'ex-funnel' });
    const blocks = [['b2', 'Block 2'], ['b3', 'Block 3'], ['b4', 'Block 4'], ['b5', 'Block 5'], ['b6', 'Block 6'], ['top', 'Final layer']];
    for (const [key, name] of blocks) {
      const [, C, H, W] = L[key].dims;
      cols.append(h('div', { class: 'ex-col' },
        h('p', { class: 'ex-col-name', text: name }),
        h('p', { class: 'ex-col-dims mono' }, `${num(C)} maps`, h('br'), `${W} × ${H}`),
        tileGrid(key, name, rankChannels(L[key], 4), key !== 'top', insp, 'ex-tiles-col')));
    }
    return stage('deeper', 'Deeper layers', [
      h('p', { text: 'After the first layer come 32 blocks. Each one combines the maps before it, so the grid shrinks from 190 × 190 down to 12 × 12 while the number of maps grows to 1,792. Early maps react to edges and color. Later maps react to larger structures, like the pigment network of a mole or the branching vessels of a basal cell carcinoma.' }),
      h('p', { class: 'ex-hint', text: 'Each column shows the four most active maps at that depth for this photo. Pick one to see it large.' }),
    ], h('div', { class: 'ex-deeper' }, cols, insp.el));
  }

  // 5. attention ----------------------------------------------------------------
  function stageAttention(L) {
    const att = L.att.data;
    const order = Array.from(att).map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    let boosted = 0;
    let damped = 0;
    for (const v of att) { if (v > 1.5) boosted++; if (v < 0.5) damped++; }
    const cols = 64;
    const cvs = stripCanvas(att, cols, 2, false, 7);
    cvs.classList.add('ex-cells');
    const mini = h('canvas', { class: 'ex-mini', width: 12, height: 12 });
    const tip = h('p', { class: 'mono ex-tip' });
    const sortBox = h('input', { type: 'checkbox' });
    let idx = Array.from({ length: att.length }, (_, i) => i);
    const draw = () => {
      const g = cvs.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, cvs.width, cvs.height);
      idx.forEach((c, k) => {
        g.fillStyle = css(colorFor(att[c], 2, false));
        g.fillRect((k % cols) * 7, Math.floor(k / cols) * 7, 6, 6);
      });
    };
    const show = (c) => {
      const vals = channel(L.top, c);
      mini.getContext('2d').drawImage(mapCanvas(vals, 12, 12, quantile(vals, 0.995) || 1, false), 0, 0);
      tip.textContent = `Map ${c + 1}, weight ${fmt(att[c], 3)}`;
    };
    sortBox.addEventListener('change', () => {
      idx = sortBox.checked ? order.map((x) => x[1]) : Array.from({ length: att.length }, (_, i) => i);
      draw();
    });
    const pick = (e) => {
      const k = cellAt(cvs, e, cols, att.length);
      if (k >= 0) show(idx[k]);
    };
    cvs.addEventListener('pointermove', pick);
    cvs.addEventListener('pointerdown', pick);
    draw();
    show(order[0][1]);
    return stage('attention', 'Attention', [
      h('p', { text: 'An attention module looks at all 1,792 final maps together and gives each one a weight between 0 and 2. Every map is multiplied by its weight, so patterns that matter for this photo count more, and distractions like hair or glare can be turned down.' }),
      h('p', { text: `For this photo, ${boosted} maps were boosted above 1.5 and ${damped} were turned down below 0.5.` }),
      legend(false),
      h('p', { class: 'ex-hint', text: 'Each cell is one map. Point at a cell to see the map it weighs.' }),
    ], h('div', { class: 'ex-att' },
      h('div', {}, cvs, h('label', { class: 'ex-toggle' }, sortBox, h('span', { text: 'Sort from highest weight to lowest' }))),
      h('figure', { class: 'ex-att-side' }, mini, h('figcaption', {}, tip))));
  }

  // 6. pooling ----------------------------------------------------------------
  function stagePool(L) {
    const gem = L.gem.data;
    const att = L.att.data;
    const cols = 64;
    const cvs = stripCanvas(gem, cols, quantile(gem, 0.99), false, 7);
    cvs.classList.add('ex-cells');
    const mini = h('canvas', { class: 'ex-mini', width: 12, height: 12 });
    const work = h('div', { class: 'ex-work mono' });
    const show = (c) => {
      const raw = channel(L.top, c);
      const weighted = Array.from(raw, (x) => Math.max(1e-6, x * att[c]));
      const sum = weighted.reduce((a, x) => a + Math.pow(x, GEM_P), 0);
      const mean = sum / weighted.length;
      const g = Math.pow(mean, 1 / GEM_P);
      mini.getContext('2d').drawImage(mapCanvas(weighted, 12, 12, quantile(weighted, 0.995) || 1, false), 0, 0);
      work.innerHTML = '';
      work.append(
        h('p', { text: `Map ${c + 1}: 144 values, each times its weight ${fmt(att[c], 3)}` }),
        h('p', { text: `Average of every value to the power ${GEM_P.toFixed(2)}: ${fmt(mean, 4)}` }),
        h('p', { text: `${fmt(mean, 4)} to the power 1/${GEM_P.toFixed(2)}: ${fmt(g, 4)}` }),
        h('p', { class: 'ex-check', text: `The model's own output for this map: ${fmt(gem[c], 4)}` }),
      );
    };
    const pick = (e) => {
      const k = cellAt(cvs, e, cols, gem.length);
      if (k >= 0) show(k);
    };
    cvs.addEventListener('pointermove', pick);
    cvs.addEventListener('pointerdown', pick);
    let best = 0;
    for (let i = 1; i < gem.length; i++) if (gem[i] > gem[best]) best = i;
    show(best);
    return stage('pool', 'Pooling', [
      h('p', { text: `Generalized mean pooling turns each 12 × 12 map into one number. It raises every value to a power p, takes the average, then takes the p-th root. The network learned p = ${GEM_P.toFixed(2)} during training, which lands between a plain average (p = 1) and keeping only the largest value.` }),
      h('p', { text: 'What comes out is 1,792 numbers that describe this lesion.' }),
      h('p', { class: 'ex-hint', text: 'Point at any cell to redo the math for that map, by hand, in your browser.' }),
    ], h('div', { class: 'ex-att' }, h('div', {}, cvs), h('div', { class: 'ex-att-side' }, mini, work)));
  }

  // 7. patient ----------------------------------------------------------------
  function stagePatient(L) {
    const p = ctx.patient;
    const rerun = () => { clearTimeout(rerun.t); rerun.t = setTimeout(() => run('patient'), 200); };
    const seg = (name, opts, value, onchange) => {
      const g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name });
      opts.forEach(([v, label]) => {
        const inp = h('input', { type: 'radio', name: `ex-${name}`, value: v, checked: String(value) === v });
        inp.addEventListener('change', () => onchange(v));
        g.append(h('label', {}, inp, h('span', { text: label })));
      });
      return g;
    };
    const range = (label, min, max, step, value, fallback, unit, key) => {
      const out = h('output', { class: 'mono' });
      const inp = h('input', { type: 'range', min, max, step, value: String(Number.isFinite(value) ? value : fallback), 'aria-label': label });
      const say = () => { out.textContent = Number.isFinite(p[key]) ? `${p[key]} ${unit}` : `Not recorded, uses ${fallback}`; };
      inp.addEventListener('input', () => { p[key] = Number(inp.value); say(); rerun(); });
      say();
      return h('div', { class: 'ex-ctl' }, h('span', { class: 'ex-ctl-label', text: label }), h('div', { class: 'ex-range' }, inp, out));
    };
    const select = (label, options, value, onchange) => {
      const s = h('select', { 'aria-label': label }, ...options.map(([v, t]) => h('option', { value: v, text: t })));
      s.value = value;
      s.addEventListener('change', () => onchange(s.value));
      return h('div', { class: 'ex-ctl' }, h('span', { class: 'ex-ctl-label', text: label }), s);
    };
    const controls = h('div', { class: 'ex-controls' },
      range('Age', 5, 95, 1, p.age, 60, 'years', 'age'),
      h('div', { class: 'ex-ctl' }, h('span', { class: 'ex-ctl-label', text: 'Sex' }),
        seg('sex', [['female', 'Female'], ['male', 'Male'], ['unknown', 'Unknown']], p.sex || 'unknown', (v) => { p.sex = v; rerun(); })),
      select('Body site', [['', 'Not recorded'], ...SITES.map((s) => [s, SITE_LABELS[s]])], p.site || '', (v) => { p.site = v; rerun(); }),
      range('Diameter', 1, 30, 0.5, p.diameterMm, 6.1, 'mm', 'diameterMm'),
      select('Skin type', [['', 'Not recorded'], ...ROMAN.map((r, i) => [String(i + 1), `Type ${r}`])], p.fitzpatrick ? String(p.fitzpatrick) : '', (v) => { p.fitzpatrick = v ? Number(v) : undefined; rerun(); }),
      h('div', { class: 'ex-ctl' }, h('span', { class: 'ex-ctl-label', text: 'Looks melanocytic?' }),
        seg('mel', [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']], p.melanocytic || 'unsure', (v) => { p.melanocytic = v; rerun(); })),
    );
    ctx.patientOut = patientOutputs(L);
    return stage('patient', 'Patient details', [
      h('p', { text: 'Age, sex, body site, size, skin type, and whether the lesion looks melanocytic become 17 numbers. Blank answers get the same fill-in values used in training. Three dense layers, of 256, 128, and 64 units, then learn how those details combine.' }),
      h('p', { class: 'ex-hint', text: 'Change any detail and the whole network runs again. Watch steps 8 and 9 change.' }),
    ], h('div', { class: 'ex-stack' }, controls, ctx.patientOut));
  }
  function patientOutputs(L) {
    const vec = encodeMetadata(ctx.patient);
    const tb = h('tbody');
    FEATURES.forEach((f, i) => tb.append(h('tr', { class: vec[i] !== 0 ? 'is-on' : null },
      h('td', { class: 'mono', text: String(i + 1) }), h('td', { text: f }), h('td', { class: 'mono', text: fmt(vec[i], 3) }))));
    const table = h('table', { class: 'ex-table ex-vec' },
      h('thead', {}, h('tr', {}, h('th', { text: '#' }), h('th', { text: 'Feature' }), h('th', { text: 'Value' }))), tb);
    const strips = h('div', { class: 'ex-strips' });
    for (const [key, units] of [['m1', 256], ['m2', 128], ['m3', 64]]) {
      const v = L[key].data;
      strips.append(h('figure', { class: 'ex-strip' }, stripCanvas(v, 32, quantile(v, 0.99), true, 8),
        h('figcaption', { class: 'mono', text: `${units} units` })));
    }
    strips.append(legend(true));
    return h('div', { class: 'ex-split ex-split-even' }, table, strips);
  }

  // 8. fusion ----------------------------------------------------------------
  function stageFusion(L) {
    const flow = h('div', { class: 'ex-flow' });
    const cat = L.cat.data;
    const catCanvas = stripCanvas(cat, 64, quantile(cat, 0.99), true, 6);
    // Outline the 64 patient numbers at the end of the joined list.
    const g = catCanvas.getContext('2d');
    g.strokeStyle = '#0e7c7b';
    g.lineWidth = 2;
    g.strokeRect(1, 28 * 6 + 1, 64 * 6 - 3, 6 - 2);
    flow.append(h('figure', { class: 'ex-strip' }, catCanvas,
      h('figcaption', { class: 'mono', text: '1,856 numbers: 1,792 from the photo, then 64 from the patient (outlined)' })));
    for (const [key, units] of [['h1', 768], ['h2', 384], ['h3', 128]]) {
      const v = L[key].data;
      flow.append(h('figure', { class: 'ex-strip' }, stripCanvas(v, 64, quantile(v, 0.99), true, 6),
        h('figcaption', { class: 'mono', text: `Dense layer, ${units} units` })));
    }
    const z = L.logits.data;
    const probs = L.probs.data;
    const out = h('div', { class: 'ex-out' });
    CLASSES.forEach((c, i) => out.append(h('div', { class: 'ex-node', 'data-key': c.key },
      h('p', { class: 'ex-node-name', text: c.short }),
      h('p', { class: 'ex-node-p mono', text: pct(probs[i]) }),
      h('p', { class: 'mono ex-node-z', text: `raw score ${fmt(z[i], 3)}` }))));
    const e = Array.from(z, Math.exp);
    const sum = e.reduce((a, b) => a + b, 0);
    return stage('fusion', 'Photo and patient combined', [
      h('p', { text: 'The 1,792 photo numbers go through one more normalization layer and are joined with the 64 patient numbers into a single list of 1,856. Three more dense layers narrow it to three raw scores, one for each class.' }),
      h('p', { text: 'Softmax turns the raw scores into probabilities that add up to 100%. For melanoma:' }),
      h('p', { class: 'mono ex-formula', text: `e^${fmt(z[0], 2)} ÷ (e^${fmt(z[0], 2)} + e^${fmt(z[1], 2)} + e^${fmt(z[2], 2)}) = ${fmt(e[0], 2)} ÷ ${fmt(sum, 2)} = ${pct(e[0] / sum)}` }),
    ], h('div', { class: 'ex-stack' }, flow, out));
  }

  // 9. decision ----------------------------------------------------------------
  function stageDecision(L) {
    const probs = L.probs.data;
    const t = triage(probs);
    const urgent = probs[0] >= MELANOMA_CUTOFF;
    const rule = h('ol', { class: 'ex-rule' },
      h('li', { class: urgent ? 'is-hit' : null },
        h('span', { text: `Is the melanoma score at least ${pct(MELANOMA_CUTOFF)}?` }),
        h('span', { class: 'mono', text: `${pct(probs[0])}, so ${urgent ? 'yes. Refer urgently.' : 'no.'}` })),
      h('li', { class: urgent ? 'is-skipped' : 'is-hit' },
        h('span', { text: 'If not, is other skin cancer higher than benign?' }),
        h('span', { class: 'mono', text: urgent ? 'Not needed.' : `${pct(probs[2])} against ${pct(probs[1])}, so ${probs[2] >= probs[1] ? 'yes. Refer for review.' : 'no. Routine follow-up.'}` })),
    );
    const verdict = h('div', { class: 'ex-verdict', 'data-level': t.level },
      h('p', { class: 'ex-verdict-title', text: t.title }),
      h('p', { class: 'ex-verdict-finding', text: t.finding }),
      ctx.truth ? h('p', { class: 'ex-verdict-truth', text: `Biopsy result for this sample: ${ctx.truth.toLowerCase()}.` }) : null);
    return stage('decision', 'Referral rule', [
      h('p', { text: 'The melanoma cutoff is 27.8%, not 50%, because missing a melanoma costs far more than an extra referral. On 9,080 validation images, this cutoff caught 90% of melanomas.' }),
      h('p', { text: 'The scan page uses this same rule.' }),
    ], h('div', { class: 'ex-stack' }, rule, verdict));
  }

  // ---- hover sync
  function updateHover(x, y) {
    ctx.hover = [x, y];
    if (overlayCtx) {
      overlayCtx.clearRect(0, 0, S, S);
      overlayCtx.strokeStyle = 'rgba(0,0,0,0.55)';
      overlayCtx.lineWidth = 3;
      overlayCtx.strokeRect(x - 4.5, y - 4.5, 10, 10);
      overlayCtx.strokeStyle = '#ffffff';
      overlayCtx.lineWidth = 1.5;
      overlayCtx.strokeRect(x - 4.5, y - 4.5, 10, 10);
    }
    drawZoom(x, y);
    drawNorm(x, y);
    if (pixelReadout && ctx.tensor) {
      const o = (y * S + x) * 3;
      pixelReadout.textContent = `Pixel (${x}, ${y}): red ${ctx.tensor[o]}, green ${ctx.tensor[o + 1]}, blue ${ctx.tensor[o + 2]}`;
    }
  }

  // ---- rail highlighting
  function watchRail() {
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const id = en.target.dataset.stage;
        for (const b of rail.querySelectorAll('button')) {
          if (b.dataset.stage === id) b.setAttribute('aria-current', 'step');
          else b.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-35% 0px -60% 0px' });
    stagesEl.querySelectorAll('.ex-stage').forEach((s) => observer.observe(s));
  }

  // ---- guided playback, one stage at a time
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let playing = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  playBtn.addEventListener('click', async () => {
    if (!ctx.layers) return;
    if (playing) {
      playing = false;
      return;
    }
    playing = true;
    playBtn.textContent = 'Stop';
    for (const sec of [...stagesEl.querySelectorAll('.ex-stage')]) {
      if (!playing) break;
      sec.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      sec.classList.add('is-live');
      if (sec.dataset.stage === 'pixels') {
        // Sweep the reading square around the lesion.
        for (let k = 0; k <= 40 && playing; k++) {
          const a = (k / 40) * Math.PI * 2;
          updateHover(Math.round(190 + 110 * Math.cos(a)), Math.round(190 + 110 * Math.sin(a)));
          await sleep(70);
        }
      } else {
        for (let k = 0; k < 28 && playing; k++) await sleep(100);
      }
      sec.classList.remove('is-live');
    }
    playing = false;
    playBtn.textContent = 'Play the forward pass';
  });

  return {
    async open({ preferScan = false } = {}) {
      await samplesReady;
      renderPicker();
      const scan = getScan();
      if (preferScan && scan) await useScan();
      else if (!ctx.layers && samples().length) await useSample(samples()[0], 1);
    },
  };
}
