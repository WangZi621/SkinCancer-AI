import {
  SkinScanModel, CLASSES, MELANOMA_CUTOFF, encodeMetadata, UNKNOWN_PATIENT,
  readPixels, resizeToInput, triage,
} from './model.js';
import { mountBodyMap } from './bodymap.js';
import { occlusionMap, heatToCanvas } from './heatmap.js';
import * as history from './history.js';
import { createExplainer } from './explain.js';

const $ = (sel, root = document) => root.querySelector(sel);
const model = new SkinScanModel();

const el = {
  scope: $('#scope'),
  bench: $('#workbench'),
  heatLabel: $('#heat-btn span'),
  canvas: $('#scope-canvas'),
  heat: $('#scope-heat'),
  status: $('#scope-status'),
  file: $('#file-input'),
  camera: $('#camera-input'),
  heatBtn: $('#heat-btn'),
  samples: $('#sample-list'),
  form: $('#patient-form'),
  analyze: $('#analyze-btn'),
  analyzeNote: $('#analyze-note'),
  site: $('#site'),
  fitzNote: $('#fitz-note'),
  result: $('#result'),
  verdict: $('#verdict'),
  verdictTitle: $('#verdict-title'),
  verdictFinding: $('#verdict-finding'),
  verdictWhy: $('#verdict-why'),
  scores: $('#scores'),
  closeNote: $('#close-note'),
  metaEffect: $('#meta-effect'),
  truth: $('#truth'),
  truthText: $('#truth-text'),
  runInfo: $('#run-info'),
  save: $('#save-btn'),
  print: $('#print-btn'),
  edit: $('#edit-btn'),
  reset: $('#new-btn'),
  printNote: $('#print-note'),
  historyList: $('#history-list'),
  historyEmpty: $('#history-empty'),
  historyTools: $('#history-tools'),
};

const state = {
  bitmap: null, // ImageBitmap of the current photo
  tensor: null, // preprocessed model input, cached per photo
  sample: null, // sample metadata when a sample is in use
  result: null,
  heat: null,
  busy: false,
  modelReady: false,
};

const pct = (p, digits = 0) => `${(p * 100).toFixed(digits)}%`;

// ---------------------------------------------------------------- routing
const VIEWS = ['scan', 'history', 'inside', 'how', 'kiosk'];
let explainer = null;
let explainScan = false;
function route() {
  const name = (location.hash.match(/^#\/(\w+)/) || [])[1];
  const view = VIEWS.includes(name) ? name : 'scan';
  for (const v of document.querySelectorAll('.view')) v.hidden = v.dataset.view !== view;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.route === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (view === 'history') renderHistory();
  if (view === 'inside') {
    explainer.open({ preferScan: explainScan });
    explainScan = false;
  }
  if (name && name !== 'scan') window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

// ---------------------------------------------------------------- model loading
function setNote(text) {
  el.analyzeNote.textContent = text;
}
function refreshAnalyzeState() {
  el.analyze.disabled = !state.bitmap || state.busy;
  if (state.busy) return;
  if (!state.bitmap) setNote(state.modelReady ? 'Model ready. Add a photo to start.' : 'Add a photo to start.');
  else if (state.modelReady) setNote('Runs on this device. Nothing is uploaded.');
}

function loadModel() {
  return model
    .load((p) => {
      if (state.busy && !state.bitmap) return;
      if (p.phase === 'download') {
        const mb = (n) => (n / 1e6).toFixed(1);
        setNote(p.total ? `Downloading the model, ${mb(p.loaded)} of ${mb(p.total)} MB (one time only)` : `Downloading the model, ${mb(p.loaded)} MB`);
      } else if (p.phase === 'compile' || p.phase === 'runtime') {
        setNote('Preparing the model…');
      }
    })
    .then(() => {
      state.modelReady = true;
      refreshAnalyzeState();
    })
    .catch((err) => {
      console.error(err);
      setNote('This browser could not start the model. Try a current version of Chrome, Edge, Safari, or Firefox.');
      throw err;
    });
}
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
idle(() => loadModel().catch(() => {}));

// ---------------------------------------------------------------- photo input
function setScopeState(s) {
  el.scope.dataset.state = s;
  el.bench.dataset.step = s === 'empty' ? '1' : s === 'done' || s === 'mapping' ? '3' : '2';
}

function drawScope() {
  const ctx = el.canvas.getContext('2d');
  const W = el.canvas.width;
  ctx.clearRect(0, 0, W, W);
  if (!state.bitmap) return;
  const { width: w, height: h } = state.bitmap;
  const s = Math.max(W / w, W / h); // cover the circle
  const dw = w * s;
  const dh = h * s;
  state.drawRect = [(W - dw) / 2, (W - dh) / 2, dw, dh];
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.bitmap, ...state.drawRect);
}

function clearHeat() {
  state.heat = null;
  el.scope.dataset.heat = 'off';
  el.heat.getContext('2d').clearRect(0, 0, el.heat.width, el.heat.height);
  el.heatLabel.textContent = 'Show where it looked';
}

async function setImage(blob, sample = null) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    el.status.textContent = 'That file is not an image this browser can open.';
    setTimeout(() => (el.status.textContent = ''), 3000);
    return;
  }
  if (state.bitmap) state.bitmap.close();
  state.bitmap = bitmap;
  state.tensor = null;
  state.sample = sample;
  state.result = null;
  clearHeat();
  drawScope();
  delete el.scope.dataset.level;
  setScopeState('image');
  el.heatBtn.hidden = true;
  showForm();
  for (const b of el.samples.querySelectorAll('.sample')) {
    b.setAttribute('aria-pressed', String(!!sample && b.dataset.id === sample.id));
  }
  if (sample) fillPatient(sample.patient);
  refreshAnalyzeState();
}

function pickFile(input) {
  const f = input.files && input.files[0];
  if (f) setImage(f);
  input.value = '';
}
el.file.addEventListener('change', () => pickFile(el.file));
el.camera.addEventListener('change', () => pickFile(el.camera));

el.scope.addEventListener('dragover', (e) => {
  e.preventDefault();
  el.scope.classList.add('is-dragover');
});
el.scope.addEventListener('dragleave', () => el.scope.classList.remove('is-dragover'));
el.scope.addEventListener('drop', (e) => {
  e.preventDefault();
  el.scope.classList.remove('is-dragover');
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) setImage(f);
});
window.addEventListener('paste', (e) => {
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) setImage(f);
});

// ---------------------------------------------------------------- samples
let SAMPLES = [];
let samplesReady = null;
async function loadSamples() {
  try {
    const res = await fetch('samples/samples.json');
    SAMPLES = (await res.json()).samples;
  } catch {
    return;
  }
  const tpl = $('#tpl-sample');
  SAMPLES.forEach((s, i) => {
    const node = tpl.content.cloneNode(true);
    const btn = node.querySelector('.sample');
    btn.dataset.id = s.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', `Sample ${i + 1}`);
    node.querySelector('img').src = s.thumb;
    node.querySelector('span').textContent = `Sample ${i + 1}`;
    btn.addEventListener('click', async () => {
      const blob = await (await fetch(s.image)).blob();
      setImage(blob, { ...s, index: i + 1 });
    });
    el.samples.appendChild(node);
  });
}
samplesReady = loadSamples();

// ---------------------------------------------------------------- patient form
const bodymap = mountBodyMap($('#bodymap'), el.site);

function readPatient() {
  const f = new FormData(el.form);
  const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    age: num(f.get('age')),
    sex: f.get('sex') || 'unknown',
    site: f.get('site') || '',
    fitzpatrick: num(f.get('fitz')),
    diameterMm: num(f.get('diameter')),
    melanocytic: f.get('melanocytic') || 'unsure',
  };
}

function fillPatient(p = {}) {
  el.form.age.value = p.age ?? '';
  el.form.diameter.value = p.diameterMm ?? '';
  const setRadio = (name, value) => {
    for (const r of el.form.querySelectorAll(`input[name="${name}"]`)) r.checked = r.value === String(value ?? '');
  };
  setRadio('sex', p.sex || 'unknown');
  setRadio('fitz', p.fitzpatrick ?? '');
  setRadio('melanocytic', p.melanocytic || 'unsure');
  el.site.value = p.site || '';
  bodymap.sync();
  updateFitzNote();
}

function updateFitzNote() {
  const v = Number(new FormData(el.form).get('fitz'));
  el.fitzNote.hidden = !(v >= 5);
}
el.form.addEventListener('change', (e) => {
  if (e.target.name === 'fitz') updateFitzNote();
});

function describePatient(p) {
  const bits = [];
  if (Number.isFinite(p.age)) bits.push(`${p.age} years`);
  if (p.sex === 'female' || p.sex === 'male') bits.push(p.sex);
  const siteOpt = [...el.site.options].find((o) => o.value === p.site);
  if (p.site && siteOpt) bits.push(siteOpt.textContent.toLowerCase());
  if (Number.isFinite(p.fitzpatrick)) bits.push(`skin type ${['I', 'II', 'III', 'IV', 'V', 'VI'][p.fitzpatrick - 1]}`);
  if (Number.isFinite(p.diameterMm)) bits.push(`${p.diameterMm} mm`);
  if (p.melanocytic === 'yes') bits.push('looks melanocytic');
  if (p.melanocytic === 'no') bits.push('not melanocytic');
  return bits;
}

// ---------------------------------------------------------------- analysis
function showForm() {
  el.result.hidden = true;
  el.form.hidden = false;
}

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.bitmap || state.busy) return;
  state.busy = true;
  el.analyze.disabled = true;
  el.analyze.textContent = 'Analyzing…';
  clearHeat();
  delete el.scope.dataset.level;
  setScopeState('scanning');
  el.status.textContent = state.modelReady ? 'Analyzing' : 'Loading the model';
  try {
    await loadModel();
    el.status.textContent = 'Analyzing';
    if (!state.tensor) state.tensor = resizeToInput(readPixels(state.bitmap), model.inputSize);
    const patient = readPatient();
    const withDetails = await model.predict(state.tensor, encodeMetadata(patient));
    const photoOnly = await model.predict(state.tensor, encodeMetadata(UNKNOWN_PATIENT));
    state.result = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      patient,
      probs: Array.from(withDetails.probs),
      probsPhotoOnly: Array.from(photoOnly.probs),
      ms: withDetails.ms,
      triage: triage(withDetails.probs),
      triagePhotoOnly: triage(photoOnly.probs),
      detailsGiven: !encodeMetadata(patient).every((v, i) => v === encodeMetadata(UNKNOWN_PATIENT)[i]),
      sample: state.sample,
      saved: false,
    };
    renderResult();
  } catch (err) {
    console.error(err);
    setScopeState('image');
    el.status.textContent = '';
    setNote('The analysis failed. Reload the page and try again.');
  } finally {
    state.busy = false;
    el.analyze.textContent = 'Analyze lesion';
    refreshAnalyzeState();
  }
});

function renderResult() {
  const r = state.result;
  const t = r.triage;
  const [mel, ben, oth] = r.probs;
  el.status.textContent = '';
  setScopeState('done');
  el.scope.dataset.level = t.level;

  el.verdict.dataset.level = t.level;
  el.verdictTitle.textContent = t.title;
  el.verdictFinding.textContent = t.finding;
  const cut = pct(MELANOMA_CUTOFF, 1);
  if (t.level === 'urgent') {
    el.verdictWhy.textContent = `The melanoma score, ${pct(mel)}, is at or above the ${cut} cutoff. On 9,080 validation images this cutoff caught 90% of melanomas.`;
  } else if (t.level === 'soon') {
    el.verdictWhy.textContent = `The highest score is for basal or squamous cell carcinoma, ${pct(oth)}. The melanoma score, ${pct(mel)}, is below the ${cut} cutoff.`;
  } else {
    el.verdictWhy.textContent = `The highest score is benign, ${pct(ben)}, and the melanoma score, ${pct(mel)}, is below the ${cut} cutoff. Recheck if the lesion changes in size, shape, or color.`;
  }

  el.scores.innerHTML = '';
  CLASSES.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'score';
    li.dataset.key = c.key;
    li.innerHTML = `<span class="score-name"></span><span class="score-val"></span><span class="score-bar"><span class="score-fill"></span></span>`;
    li.querySelector('.score-name').textContent = c.name;
    li.querySelector('.score-val').textContent = pct(r.probs[i]);
    if (c.key === 'melanoma') {
      const tick = document.createElement('span');
      tick.className = 'score-cut';
      tick.style.left = `calc(${MELANOMA_CUTOFF * 100}% - 1px)`;
      tick.title = `Melanoma cutoff ${cut}`;
      li.querySelector('.score-bar').appendChild(tick);
      const lab = document.createElement('span');
      lab.className = 'score-cut-label';
      lab.textContent = `The line marks the ${cut} cutoff.`;
      li.appendChild(lab);
    }
    el.scores.appendChild(li);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      li.querySelector('.score-fill').style.width = `${Math.max(1, r.probs[i] * 100)}%`;
    }));
  });
  el.closeNote.hidden = !t.close;

  const q = r.probsPhotoOnly;
  const qScores = `melanoma ${pct(q[0])}, benign ${pct(q[1])}, other skin cancer ${pct(q[2])}`;
  if (!r.detailsGiven) {
    el.metaEffect.textContent = 'No patient details were entered, so this result comes from the photo alone. Adding age, body site, and the other details usually makes the model more accurate.';
  } else {
    let txt = `With every detail left blank, the same photo scores ${qScores}.`;
    txt += r.triagePhotoOnly.level !== t.level
      ? ` That would change the suggestion to ${r.triagePhotoOnly.title.toLowerCase()}, so the details you entered matter here.`
      : ' The suggestion would stay the same.';
    el.metaEffect.textContent = txt;
  }

  if (r.sample) {
    el.truth.hidden = false;
    el.truthText.textContent = `${r.sample.diagnosis}, confirmed by biopsy. Image ${r.sample.id} from ${r.sample.attribution} (${r.sample.license}) via the ISIC Archive.`;
  } else {
    el.truth.hidden = true;
  }

  el.runInfo.textContent = `Analyzed on this device in ${(r.ms / 1000).toFixed(2)} s. Model: SkinScan v3, running with ONNX Runtime Web.`;
  el.save.disabled = false;
  el.save.textContent = 'Save to history';
  el.heatBtn.hidden = false;

  el.form.hidden = true;
  el.result.hidden = false;
  el.result.focus({ preventScroll: true });
  const top = el.result.getBoundingClientRect().top;
  if (top < 80 || top > window.innerHeight * 0.6) {
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------------------------------------------------------------- heat map
el.heatBtn.addEventListener('click', async () => {
  if (!state.result || state.busy) return;
  if (state.heat) {
    const on = el.scope.dataset.heat !== 'on';
    el.scope.dataset.heat = on ? 'on' : 'off';
    el.heatLabel.textContent = on ? 'Hide heat map' : 'Show where it looked';
    return;
  }
  state.busy = true;
  el.heatBtn.disabled = true;
  const target = state.result.triage.ranked[0].index;
  const baseProb = state.result.probs[target];
  setScopeState('mapping');
  el.scope.style.setProperty('--progress', 0);
  try {
    const map = await occlusionMap(model, state.tensor, model.inputSize, encodeMetadata(state.result.patient), target, baseProb, {
      grid: 4,
      frac: 0.4,
      onProgress: (f) => {
        el.scope.style.setProperty('--progress', (f * 100).toFixed(1));
        el.status.textContent = `Mapping ${Math.round(f * 16)} of 16`;
      },
    });
    state.heat = map;
    const ctx = el.heat.getContext('2d');
    ctx.clearRect(0, 0, el.heat.width, el.heat.height);
    ctx.filter = 'blur(34px)';
    ctx.drawImage(heatToCanvas(map), ...state.drawRect);
    ctx.filter = 'none';
    el.scope.dataset.heat = 'on';
    el.heatLabel.textContent = 'Hide heat map';
    el.runInfo.textContent = map.max > 0.005
      ? `Heat map: the bright areas are the parts of the image that, when covered up, lowered the ${CLASSES[target].short.toLowerCase()} score the most.`
      : 'Covering any one part of the image barely changed the score, so no single area stands out.';
  } catch (err) {
    console.error(err);
  } finally {
    el.status.textContent = '';
    setScopeState('done');
    state.busy = false;
    el.heatBtn.disabled = false;
  }
});

// ---------------------------------------------------------------- result actions
function thumbnail(px = 128) {
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  ctx.drawImage(el.canvas, 0, 0, px, px);
  return c.toDataURL('image/jpeg', 0.82);
}

function entryFromResult() {
  const r = state.result;
  return {
    id: r.id,
    ts: r.ts,
    thumb: thumbnail(128),
    patient: r.patient,
    probs: r.probs,
    level: r.triage.level,
    title: r.triage.title,
    finding: r.triage.finding,
    sample: r.sample ? { id: r.sample.id, diagnosis: r.sample.diagnosis } : null,
  };
}

el.save.addEventListener('click', () => {
  if (!state.result) return;
  const ok = history.add(entryFromResult());
  el.save.textContent = ok ? 'Saved' : 'Storage is full or blocked';
  el.save.disabled = ok;
});

el.print.addEventListener('click', () => {
  if (!state.result) return;
  printNote({ ...entryFromResult(), thumb: thumbnail(300) });
});
el.edit.addEventListener('click', () => {
  showForm();
  setScopeState('image');
  delete el.scope.dataset.level;
  clearHeat();
  el.heatBtn.hidden = true;
  el.form.querySelector('#age').focus();
});
el.reset.addEventListener('click', () => {
  if (state.bitmap) state.bitmap.close();
  Object.assign(state, { bitmap: null, tensor: null, sample: null, result: null });
  clearHeat();
  drawScope();
  delete el.scope.dataset.level;
  setScopeState('empty');
  el.heatBtn.hidden = true;
  for (const b of el.samples.querySelectorAll('.sample')) b.setAttribute('aria-pressed', 'false');
  el.form.reset();
  fillPatient({});
  showForm();
  refreshAnalyzeState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function printNote(e) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const details = describePatient(e.patient);
  el.printNote.innerHTML = `
    <h1>SkinScan AI triage note</h1>
    <p>${esc(new Date(e.ts).toLocaleString())}</p>
    <div class="pn-grid">
      <img src="${e.thumb}" alt="">
      <div>
        <p class="pn-level">${esc(e.title)}: ${esc(e.finding)}</p>
        <p>Patient details: ${esc(details.length ? details.join(', ') : 'none entered')}</p>
        <table>
          <tbody>
            ${CLASSES.map((c, i) => `<tr><th>${esc(c.name)}</th><td>${pct(e.probs[i])}</td></tr>`).join('')}
          </tbody>
        </table>
        <p>Melanoma cutoff: ${pct(MELANOMA_CUTOFF, 1)}. On 9,080 validation images it caught 90.0% of melanomas at 81.5% specificity.</p>
        ${e.sample ? `<p>Sample image ${esc(e.sample.id)}. Biopsy result: ${esc(e.sample.diagnosis)}.</p>` : ''}
      </div>
    </div>
    <p class="pn-fine">SkinScan AI is a research prototype, not a medical device, and is not FDA-cleared. It does not diagnose skin cancer. This note supports, and does not replace, clinical judgment.</p>`;
  window.print();
}

// ---------------------------------------------------------------- history view
function renderHistory() {
  const items = history.list();
  el.historyList.innerHTML = '';
  el.historyEmpty.hidden = items.length > 0;
  el.historyTools.hidden = items.length === 0;
  for (const e of items) {
    const li = document.createElement('li');
    li.className = 'h-item';
    li.innerHTML = `
      <img alt="">
      <div class="h-main">
        <span class="h-level"></span>
        <span class="h-finding"></span>
        <span class="h-meta"></span>
      </div>
      <div class="h-actions">
        <button class="btn btn-quiet" type="button" data-act="print">Print</button>
        <button class="btn btn-quiet btn-danger" type="button" data-act="delete">Delete</button>
      </div>`;
    li.querySelector('img').src = e.thumb;
    const lvl = li.querySelector('.h-level');
    lvl.textContent = e.title;
    lvl.dataset.level = e.level;
    li.querySelector('.h-finding').textContent = e.finding + (e.sample ? ` (biopsy: ${e.sample.diagnosis.toLowerCase()})` : '');
    li.querySelector('.h-meta').textContent = `${new Date(e.ts).toLocaleString()}. Melanoma ${pct(e.probs[0])}, benign ${pct(e.probs[1])}, other skin cancer ${pct(e.probs[2])}.`;
    li.querySelector('[data-act="print"]').addEventListener('click', () => printNote(e));
    li.querySelector('[data-act="delete"]').addEventListener('click', () => {
      history.remove(e.id);
      renderHistory();
    });
    el.historyList.appendChild(li);
  }
}

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([history.toCSV(history.list())], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `skinscan-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#clear-btn').addEventListener('click', () => {
  if (history.list().length && window.confirm('Delete all saved scans from this browser?')) {
    history.clear();
    renderHistory();
  }
});

// ---------------------------------------------------------------- inside the model
function currentScan() {
  if (!state.bitmap) return null;
  if (!state.tensor) state.tensor = resizeToInput(readPixels(state.bitmap), model.inputSize);
  return {
    tensor: state.tensor,
    original: [state.bitmap.width, state.bitmap.height],
    patient: state.result ? state.result.patient : readPatient(),
    thumb: thumbnail(96),
    truth: state.sample ? state.sample.diagnosis : null,
  };
}
explainer = createExplainer({
  root: $('#inside-root'),
  model,
  samples: () => SAMPLES,
  samplesReady,
  getScan: currentScan,
});
$('#inside-btn').addEventListener('click', (e) => {
  e.preventDefault();
  explainScan = true;
  if (location.hash === '#/inside') route();
  else location.hash = '#/inside';
});
route();

// ---------------------------------------------------------------- offline support
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Expose a tiny hook for automated checks.
window.skinscan = { model, state, encodeMetadata, readPixels, resizeToInput, get explainer() { return explainer; } };
