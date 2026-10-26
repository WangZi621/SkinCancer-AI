import {
  SkinScanModel, CLASSES, MELANOMA_CUTOFF, encodeMetadata, UNKNOWN_PATIENT,
  readPixels, resizeToInput, triage,
} from './model.js';
import { mountBodyMap } from './bodymap.js';
import { occlusionMap, heatToCanvas } from './heatmap.js';
import { checkPhoto } from './quality.js';
import * as store from './store.js';
import * as pages from './pages.js';
import { createExplainer } from './explain.js';
import { $, $$, html, raw, render, pct, toast, dialog, initials, SITE_NAMES, ageFrom, isoToday, LEVELS } from './ui.js';

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
  quality: $('#quality'),
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
  report: $('#report-btn'),
  edit: $('#edit-btn'),
  reset: $('#new-btn'),
  savedTo: $('#saved-to'),
  context: $('#scan-context'),
  hero: $('#scan-hero'),
};

const state = {
  bitmap: null, // ImageBitmap of the current photo
  tensor: null, // preprocessed model input, cached per photo
  sample: null, // sample metadata when a sample is in use
  quality: null, // photo check of the current photo
  result: null,
  heat: null,
  savedId: null, // id of the saved scan record for the current result
  ctx: { patientId: null, lesionId: null }, // who and what this scan is for; lesionId 'new' = a new lesion
  busy: false,
  modelReady: false,
};

// ---------------------------------------------------------------- routing
const AUTH = new Set(['home', 'patients', 'patient', 'lesion', 'scans', 'settings']);
const VIEWS = ['welcome', 'signin', 'home', 'patients', 'patient', 'lesion', 'scan', 'scans', 'report', 'settings', 'inside', 'how', 'kiosk'];
let profiles = [];
let intended = null;
let explainer = null; // Inside the model (explain.js), created once the samples start loading
let explainScan = false;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const [name, id] = path.split('/');
  return { name: name || '', id: id ? decodeURIComponent(id) : undefined, params: new URLSearchParams(query) };
}
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const r = parseHash();
  const signed = !!store.current();
  let name = r.name;
  if (!name) name = signed ? 'home' : profiles.length ? 'signin' : 'welcome';
  if (!VIEWS.includes(name)) name = signed ? 'home' : 'scan';
  if ((AUTH.has(name) || (name === 'report' && r.id !== 'current')) && !signed) {
    intended = location.hash;
    name = profiles.length ? 'signin' : 'welcome';
  }
  if (name === 'signin' && signed) name = 'home';

  for (const v of $$('.view')) v.hidden = v.dataset.view !== name;
  const navName = { patient: 'patients', lesion: 'patients', report: 'scans' }[name] || name;
  for (const a of $$('.nav a, .tabbar a')) {
    if (a.dataset.route === navName) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  document.body.dataset.view = name;
  closeMenu();

  const view = $(`#view-${name}`);
  try {
    if (name === 'scan') enterScan(r);
    else if (name === 'inside') {
      explainer.open({ preferScan: explainScan });
      explainScan = false;
    } else if (pages[name]) await pages[name](view, { ...r, name });
  } catch (err) {
    console.error(err);
    render(view, html`<div class="empty"><h2>Something went wrong</h2><p>Reload the page to try again.</p></div>`);
  }
  if (name !== 'scan') window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);
// the top bar gets a hairline once the page scrolls under it
window.addEventListener('scroll', () => document.body.classList.toggle('is-scrolled', window.scrollY > 4), { passive: true });

async function refreshProfiles() {
  profiles = await store.listProfiles();
  updateChrome();
}

// ---------------------------------------------------------------- account chrome
function updateChrome() {
  const me = store.current();
  document.body.dataset.signedIn = me ? 'yes' : 'no';
  $('#account').hidden = !me;
  const link = $('#signup-link');
  link.hidden = !!me;
  link.textContent = profiles.length ? 'Sign in' : 'Create profile';
  link.href = profiles.length ? '#/signin' : '#/welcome';
  for (const a of $$('[data-auth]')) a.hidden = !me;
  if (el.hero) el.hero.hidden = !!me;
  if (me) {
    $('#account-avatar').textContent = initials(me.name);
    $('#account-name').textContent = me.name;
    $('#menu-name').textContent = me.name;
    $('#menu-org').textContent = [me.role, me.org].filter(Boolean).join(', ');
    $('#menu-lock').hidden = !me.locked;
  }
}
store.onChange((me) => {
  updateChrome();
  if (!me) {
    refreshProfiles(); // the sign-in link and screen list every profile on this device
    const r = parseHash();
    if (AUTH.has(r.name) || (r.name === 'report' && r.id !== 'current')) {
      intended = location.hash;
      go('#/signin');
    }
  }
});

const menuBtn = $('#account-btn');
const menu = $('#account-menu');
function closeMenu() {
  menu.hidden = true;
  menuBtn.setAttribute('aria-expanded', 'false');
}
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = menu.hidden;
  menu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => {
  if (!menu.hidden && !menu.contains(e.target)) closeMenu();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
$('#menu-lock').addEventListener('click', () => {
  closeMenu();
  store.lock();
  toast('Locked. Your data is encrypted on this device.');
  go('#/signin');
});
$('#menu-switch').addEventListener('click', () => {
  closeMenu();
  store.lock();
  go('#/signin');
});

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

function coverRect(W, w, h) {
  const s = Math.max(W / w, W / h);
  return [(W - w * s) / 2, (W - h * s) / 2, w * s, h * s];
}
function drawScope() {
  const ctx = el.canvas.getContext('2d');
  const W = el.canvas.width;
  ctx.clearRect(0, 0, W, W);
  if (!state.bitmap) return;
  state.drawRect = coverRect(W, state.bitmap.width, state.bitmap.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.bitmap, ...state.drawRect);
}

/** A centre square crop of the photo (what the scope shows), as JPEG. */
function squareJpeg(bitmap, side, q = 0.86) {
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, ...coverRect(side, bitmap.width, bitmap.height));
  return c.toDataURL('image/jpeg', q);
}

function clearHeat() {
  state.heat = null;
  el.scope.dataset.heat = 'off';
  el.heat.getContext('2d').clearRect(0, 0, el.heat.width, el.heat.height);
  el.heatLabel.textContent = 'Show where it looked';
}

function renderQuality() {
  const q = state.quality;
  el.quality.hidden = !q;
  if (!q) return;
  const ok = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
  const bad = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/></svg>';
  render(
    el.quality,
    html`<div class="q-head"><strong>Photo check</strong><span class="${q.ok ? 'q-ok' : 'q-warn'}">${q.ok ? 'Good to analyze' : 'Check the photo'}</span></div>
      <ul class="q-checks">${q.checks.map((c) => html`<li class="${c.ok ? 'ok' : 'bad'}">${raw(c.ok ? ok : bad)}${c.label}</li>`)}</ul>
      ${q.ok ? '' : html`<p class="q-notes">${q.checks.filter((c) => !c.ok).map((c) => c.note).join(' ')} You can still analyze it, but results on poor photos are less reliable.</p>`}`,
  );
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
  state.savedId = null;
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
  applyContextToForm();
  state.quality = checkPhoto(bitmap);
  renderQuality();
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
  if (document.body.dataset.view !== 'scan') return;
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) setImage(f);
});

// ---------------------------------------------------------------- samples
let SAMPLES = [];
const samplesReady = (async () => {
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
})();

// ---------------------------------------------------------------- patient form
const bodymap = mountBodyMap($('#bodymap'), el.site, { sex: 'unknown' });

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
function readAbcde() {
  const f = new FormData(el.form);
  const a = {};
  for (const k of ['a', 'b', 'c', 'd', 'e']) if (f.get(`abcde_${k}`)) a[k] = true;
  return a;
}
const setRadio = (name, value) => {
  for (const r of el.form.querySelectorAll(`input[name="${name}"]`)) r.checked = r.value === String(value ?? '');
};

function fillPatient(p = {}) {
  el.form.age.value = p.age ?? '';
  el.form.diameter.value = p.diameterMm ?? '';
  setRadio('sex', p.sex || 'unknown');
  bodymap.setSex(p.sex || 'unknown');
  setRadio('fitz', p.fitzpatrick ?? '');
  setRadio('melanocytic', p.melanocytic || 'unsure');
  el.site.value = p.site || '';
  bodymap.setPoint(null);
  bodymap.sync();
  updateFitzNote();
  syncDiameterFlag();
}

function updateFitzNote() {
  const v = Number(new FormData(el.form).get('fitz'));
  el.fitzNote.hidden = !(v >= 5);
}
function syncDiameterFlag() {
  const d = parseFloat(el.form.diameter.value);
  if (Number.isFinite(d)) el.form.abcde_d.checked = d > 6;
}
el.form.addEventListener('change', (e) => {
  if (e.target.name === 'fitz') updateFitzNote();
  if (e.target.name === 'sex') bodymap.setSex(e.target.value);
});
el.form.diameter.addEventListener('input', syncDiameterFlag);

// ---------------------------------------------------------------- scan context (patient and lesion)
function enterScan(r) {
  updateChrome();
  const pid = r.params.get('patient');
  if (pid !== null) {
    state.ctx = { patientId: pid || null, lesionId: r.params.get('lesion') || null };
    if (state.ctx.lesionId === 'new') state.ctx.lesionId = 'new';
    applyContextToForm();
  }
  renderContext();
  if (r.params.get('resume') === 'save' && state.result && store.current()) {
    history.replaceState(null, '', '#/scan');
    openSaveDialog();
  }
}

function applyContextToForm() {
  const p = state.ctx.patientId && store.get(state.ctx.patientId);
  if (p) {
    const age = ageFrom(p);
    if (Number.isFinite(age)) el.form.age.value = age;
    if (p.sex && p.sex !== 'unknown') {
      setRadio('sex', p.sex);
      bodymap.setSex(p.sex);
    }
    if (p.fitzpatrick) setRadio('fitz', p.fitzpatrick);
    updateFitzNote();
  }
  const l = state.ctx.lesionId && state.ctx.lesionId !== 'new' && store.get(state.ctx.lesionId);
  if (l) {
    el.site.value = l.site || '';
    bodymap.sync();
    bodymap.setPoint(l.point || null);
  }
}

function renderContext() {
  const me = store.current();
  if (!me) {
    render(
      el.context,
      html`<p class="ctx-guest"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/></svg>Scans run on this device. <a href="${profiles.length ? '#/signin' : '#/welcome?step=create'}">${profiles.length ? 'Sign in' : 'Create a profile'}</a> to save them to patients and follow lesions over time.</p>`,
    );
    return;
  }
  const pts = store.patients();
  const p = state.ctx.patientId && store.get(state.ctx.patientId);
  const ls = p ? store.lesionsOf(p.id) : [];
  render(
    el.context,
    html`<div class="ctx">
      <span class="ctx-label">Scanning for</span>
      <label class="ctx-field"><span class="visually-hidden">Patient</span>
        <select id="ctx-patient"><option value="">No patient (quick scan)</option>${pts.map((x) => html`<option value="${x.id}" ${raw(p && p.id === x.id ? 'selected' : '')}>${x.name}${x.ref ? ` (${x.ref})` : ''}</option>`)}<option value="__add">+ Add a patient…</option></select>
      </label>
      ${p
        ? html`<label class="ctx-field"><span class="visually-hidden">Lesion</span>
            <select id="ctx-lesion"><option value="new" ${raw(state.ctx.lesionId === 'new' || !state.ctx.lesionId ? 'selected' : '')}>New lesion</option>${ls.map((l, i) => html`<option value="${l.id}" ${raw(state.ctx.lesionId === l.id ? 'selected' : '')}>Rescan: ${l.label || `Lesion ${i + 1}`} (${SITE_NAMES[l.site] || 'site not recorded'})</option>`)}</select>
          </label>
          <span class="ctx-hint">${state.ctx.lesionId && state.ctx.lesionId !== 'new' ? 'Body site filled in from the lesion.' : 'Age, sex and skin type filled in from the patient.'}</span>`
        : ''}
    </div>`,
  );
  $('#ctx-patient', el.context).addEventListener('change', async (e) => {
    let id = e.target.value;
    if (id === '__add') {
      const np = await pages.editPatient();
      id = np ? np.id : '';
    }
    state.ctx = { patientId: id || null, lesionId: id ? 'new' : null };
    applyContextToForm();
    renderContext();
  });
  $('#ctx-lesion', el.context)?.addEventListener('change', (e) => {
    state.ctx.lesionId = e.target.value;
    applyContextToForm();
    renderContext();
  });
}

// ---------------------------------------------------------------- analysis
function showForm() {
  el.result.hidden = true;
  el.form.hidden = false;
}

/** Run the model on a preprocessed photo with and without the patient details. */
async function runModel(tensor, details) {
  const withDetails = await model.predict(tensor, encodeMetadata(details));
  const photoOnly = await model.predict(tensor, encodeMetadata(UNKNOWN_PATIENT));
  const t = triage(withDetails.probs);
  return {
    probs: Array.from(withDetails.probs),
    probsPhotoOnly: Array.from(photoOnly.probs),
    ms: withDetails.ms,
    triage: t,
    triagePhotoOnly: triage(photoOnly.probs),
    level: t.level,
    title: t.title,
    finding: t.finding,
  };
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
    const out = await runModel(state.tensor, patient);
    state.result = {
      ...out,
      ts: Date.now(),
      patient,
      point: bodymap.getPoint(),
      abcde: readAbcde(),
      quality: state.quality,
      detailsGiven: !encodeMetadata(patient).every((v, i) => v === encodeMetadata(UNKNOWN_PATIENT)[i]),
      sample: state.sample,
    };
    state.savedId = null;
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

  el.runInfo.textContent = `Analyzed on this device in ${(r.ms / 1000).toFixed(2)} s. Model: Stryde v3, running with ONNX Runtime Web.`;
  renderSaveState();
  el.heatBtn.hidden = false;

  el.form.hidden = true;
  el.result.hidden = false;
  el.result.focus({ preventScroll: true });
  const top = el.result.getBoundingClientRect().top;
  if (top < 80 || top > window.innerHeight * 0.6) {
    el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------------------------------------------------------------- saving
function scanRecord(extra = {}) {
  const r = state.result;
  return {
    kind: 'scan',
    ts: r.ts,
    image: squareJpeg(state.bitmap, 640),
    thumb: squareJpeg(state.bitmap, 160, 0.82),
    heat: state.heat ? heatPng() : null,
    details: r.patient,
    probs: r.probs,
    probsPhotoOnly: r.probsPhotoOnly,
    level: r.level,
    title: r.title,
    finding: r.finding,
    quality: r.quality,
    abcde: r.abcde,
    ms: r.ms,
    sample: r.sample ? { id: r.sample.id, diagnosis: r.sample.diagnosis, index: r.sample.index } : null,
    notes: '',
    patientId: null,
    lesionId: null,
    ...extra,
  };
}
function heatPng() {
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 360;
  c.getContext('2d').drawImage(el.heat, 0, 0, 360, 360);
  return c.toDataURL('image/png');
}

function renderSaveState() {
  const s = state.savedId && store.get(state.savedId);
  el.savedTo.hidden = !s;
  el.save.disabled = !!s;
  el.save.textContent = s ? 'Saved' : store.current() ? 'Save to patient' : 'Save';
  if (s) {
    const p = s.patientId && store.get(s.patientId);
    const l = s.lesionId && store.get(s.lesionId);
    render(
      el.savedTo,
      html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg><span>Saved${p ? html` to <strong>${p.name}</strong>` : ''}${l ? `, ${l.label || 'new lesion'}` : ''}.</span>${l ? html`<a href="#/lesion/${l.id}">Open lesion history</a>` : html`<a href="#/scans">All scans</a>`}`,
    );
  }
}

async function openSaveDialog() {
  if (!state.result) return;
  if (!store.current()) {
    const ok = await dialog({
      title: 'Save this scan',
      submit: profiles.length ? 'Sign in' : 'Create a profile',
      body: html`<p class="dlg-text">Scans are saved to a profile on this device, so you can keep them with a patient, follow a lesion over time and print reports. Nothing is uploaded.</p>`,
    });
    if (ok) go(profiles.length ? '#/signin' : '#/welcome?step=create');
    if (ok && profiles.length) intended = '#/scan?resume=save';
    return;
  }
  const pts = store.patients();
  const ctxP = state.ctx.patientId && store.get(state.ctx.patientId);
  const r = state.result;
  const siteName = SITE_NAMES[r.patient.site];
  const fd = await dialog({
    title: 'Save scan',
    submit: 'Save',
    body: html`
      <div class="save-summary" data-level="${r.level}"><img src="${squareJpeg(state.bitmap, 120)}" alt=""><div><strong>${r.title}</strong><span>${r.finding}, melanoma ${pct(r.probs[0])}</span></div></div>
      <label class="f"><span>Patient</span>
        <select name="patient" id="sv-patient">${pts.map((p) => html`<option value="${p.id}" ${raw(ctxP && ctxP.id === p.id ? 'selected' : '')}>${p.name}${p.ref ? ` (${p.ref})` : ''}</option>`)}<option value="__new" ${raw(!ctxP && !pts.length ? 'selected' : '')}>+ New patient</option><option value="" ${raw(!ctxP && pts.length ? 'selected' : '')}>No patient</option></select>
      </label>
      <label class="f" id="sv-newname-f" hidden><span>New patient's name or initials</span><input name="newName" maxlength="80" autocomplete="off"></label>
      <label class="f" id="sv-lesion-f"><span>Lesion</span><select name="lesion" id="sv-lesion"></select></label>
      <label class="f" id="sv-label-f"><span>Label for the new lesion</span><input name="label" maxlength="60" placeholder="${siteName ? `For example: ${siteName.toLowerCase()}, left side` : 'For example: left forearm'}"></label>
      <label class="f"><span>Notes <small>optional</small></span><textarea name="notes" rows="3" maxlength="2000" placeholder="What you saw, what the patient said, next steps"></textarea></label>
      <label class="f"><span>Recheck</span><select name="recheck"><option value="">No recheck</option><option value="30">In 1 month</option><option value="90">In 3 months</option><option value="180">In 6 months</option></select></label>`,
    onOpen: (dlg) => {
      const ps = $('#sv-patient', dlg);
      const lsel = $('#sv-lesion', dlg);
      const sync = () => {
        const pid = ps.value;
        $('#sv-newname-f', dlg).hidden = pid !== '__new';
        $('#sv-newname-f input', dlg).required = pid === '__new';
        const ls = pid && pid !== '__new' ? store.lesionsOf(pid) : [];
        $('#sv-lesion-f', dlg).hidden = !pid;
        render(
          lsel,
          html`<option value="new">New lesion</option>${ls.map((l, i) => html`<option value="${l.id}" ${raw(state.ctx.lesionId === l.id ? 'selected' : '')}>${l.label || `Lesion ${i + 1}`} (${SITE_NAMES[l.site] || 'site not recorded'})</option>`)}`,
        );
        $('#sv-label-f', dlg).hidden = !pid || lsel.value !== 'new';
      };
      ps.addEventListener('change', sync);
      lsel.addEventListener('change', () => ($('#sv-label-f', dlg).hidden = lsel.value !== 'new'));
      sync();
    },
  });
  if (!fd) return;
  let pid = fd.get('patient');
  if (pid === '__new') {
    const np = await store.save({ kind: 'patient', name: String(fd.get('newName')).trim(), sex: r.patient.sex, birthYear: Number.isFinite(r.patient.age) ? new Date().getFullYear() - r.patient.age : null, fitzpatrick: r.patient.fitzpatrick || null, ref: '', notes: '' });
    pid = np.id;
  }
  let lid = null;
  if (pid) {
    lid = fd.get('lesion') || 'new';
    if (lid === 'new') {
      const l = await store.save({ kind: 'lesion', patientId: pid, label: String(fd.get('label') || '').trim(), site: r.patient.site || '', point: r.point || null, recheckOn: null });
      lid = l.id;
    }
    const days = Number(fd.get('recheck'));
    if (days) {
      const l = store.get(lid);
      await store.save({ ...l, recheckOn: isoToday(days) });
    }
  }
  const saved = await store.save(scanRecord({ patientId: pid || null, lesionId: lid, notes: String(fd.get('notes') || '').trim() }));
  state.savedId = saved.id;
  state.ctx = { patientId: pid || null, lesionId: lid };
  renderSaveState();
  renderContext();
  toast('Scan saved on this device');
}

el.save.addEventListener('click', openSaveDialog);
el.report.addEventListener('click', () => go(state.savedId ? `#/report/${state.savedId}` : '#/report/current'));
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
  Object.assign(state, { bitmap: null, tensor: null, sample: null, result: null, quality: null, savedId: null });
  clearHeat();
  drawScope();
  delete el.scope.dataset.level;
  setScopeState('empty');
  el.heatBtn.hidden = true;
  for (const b of el.samples.querySelectorAll('.sample')) b.setAttribute('aria-pressed', 'false');
  el.form.reset();
  fillPatient({});
  applyContextToForm();
  renderQuality();
  showForm();
  refreshAnalyzeState();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

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
      ? `Heat map: the clear areas are the parts of the image that, when covered up, lowered the ${CLASSES[target].short.toLowerCase()} score the most. The darkened areas mattered least.`
      : 'Covering any one part of the image barely changed the score, so no single area stands out.';
    if (state.savedId) {
      const s = store.get(state.savedId);
      if (s) await store.save({ ...s, heat: heatPng() });
    }
  } catch (err) {
    console.error(err);
  } finally {
    el.status.textContent = '';
    setScopeState('done');
    state.busy = false;
    el.heatBtn.disabled = false;
  }
});

// ---------------------------------------------------------------- what the pages use
async function analyzeSample(sample, details) {
  await loadModel();
  const blob = await (await fetch(sample.image)).blob();
  const bitmap = await createImageBitmap(blob);
  const tensor = resizeToInput(readPixels(bitmap), model.inputSize);
  const out = await runModel(tensor, details);
  const rec = {
    image: squareJpeg(bitmap, 640),
    thumb: squareJpeg(bitmap, 160, 0.82),
    details,
    probs: out.probs,
    probsPhotoOnly: out.probsPhotoOnly,
    level: out.level,
    title: out.title,
    finding: out.finding,
    quality: checkPhoto(bitmap),
    abcde: {},
    ms: out.ms,
  };
  bitmap.close();
  return rec;
}

pages.init({
  go,
  rerender: route,
  refreshProfiles,
  pendingSave: () => !!state.result && !state.savedId,
  takeIntended: () => {
    const i = intended;
    intended = null;
    return i;
  },
  currentScan: () => {
    if (!state.result || !state.bitmap) return null;
    const { patientId, lesionId } = state.ctx;
    return { ...scanRecord({ patientId, lesionId: lesionId === 'new' ? null : lesionId }), id: 'current' };
  },
  samples: async () => {
    await samplesReady;
    return SAMPLES;
  },
  analyzeSample,
  async modelStatus() {
    let offline = false;
    try {
      offline = !!(navigator.serviceWorker?.controller && (await caches.match('model/skinscan-v3.onnx')));
    } catch {
      offline = false;
    }
    return { ready: state.modelReady, threads: self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1, offline };
  },
  async selfTest() {
    await samplesReady;
    const s = SAMPLES[0];
    const r = await analyzeSample(s, s.patient);
    return { pass: r.level === 'urgent', probs: r.probs, title: r.title, ms: r.ms };
  },
});

// ---------------------------------------------------------------- inside the model
function explainData() {
  if (!state.bitmap) return null;
  if (!state.tensor) state.tensor = resizeToInput(readPixels(state.bitmap), model.inputSize);
  return {
    tensor: state.tensor,
    original: [state.bitmap.width, state.bitmap.height],
    patient: state.result ? state.result.patient : readPatient(),
    thumb: squareJpeg(state.bitmap, 96),
    truth: state.sample ? state.sample.diagnosis : null,
  };
}
explainer = createExplainer({
  root: $('#inside-root'),
  model,
  samples: () => SAMPLES,
  samplesReady,
  getScan: explainData,
});
$('#inside-btn').addEventListener('click', (e) => {
  e.preventDefault();
  explainScan = true;
  go('#/inside');
});

// ---------------------------------------------------------------- offline support
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------------------------------------------------------------- start
(async () => {
  try {
    await store.resume();
  } catch (err) {
    console.error(err);
  }
  await refreshProfiles();
  route();
})();

// Expose a tiny hook for automated checks.
window.skinscan = { model, state, store, encodeMetadata, readPixels, resizeToInput, get explainer() { return explainer; } };
