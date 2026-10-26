// The app's pages: the public landing page and sign-up, sign-in, home, patients, patient,
// lesion, all scans, report and settings. Every page renders from the on-device store
// (store.js) on each visit.

import * as store from './store.js';
import { CLASSES, MELANOMA_CUTOFF } from './model.js';
import { mountLesionMap } from './bodymap.js';
import { scoreChart } from './chart.js';
import {
  $, $$, html, raw, render, pct, fmtDate, fmtDateTime, ago, daysUntil, isoToday, initials, LEVELS, levelBadge,
  SITE_NAMES, SEX_NAMES, FITZ, ageFrom, patientLine, toast, dialog, confirmDialog, download,
} from './ui.js';

let app; // set by init(): model access, navigation and the scan in progress
export function init(appApi) {
  app = appApi;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.5"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  pin: '<path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
};
const icon = (k) => raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`);
const avatar = (name, cls = '') => html`<span class="avatar ${cls}" aria-hidden="true">${initials(name)}</span>`;
const thumb = (src, alt = '') =>
  src ? html`<img class="thumb" src="${src}" alt="${alt}" loading="lazy">` : html`<span class="thumb thumb-empty">${icon('photo')}</span>`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lc = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
// "today", "3 days ago", or a date, to follow a comma
const when = (ts) => (/^(Today|Yesterday|\d)/.test(ago(ts)) ? lc(ago(ts)) : ago(ts));

// Melanoma risk factors from skin cancer screening checklists. Recorded for the referral;
// the model does not use them.
const RISKS = [
  ['personal', 'Has had melanoma before'],
  ['family', 'Melanoma in a parent, brother, sister or child'],
  ['otherSkin', 'Has had another skin cancer'],
  ['moles', 'More than 50 moles'],
  ['atypical', 'Atypical (dysplastic) moles'],
  ['sunburn', 'Three or more blistering sunburns'],
  ['tanning', 'Has used tanning beds'],
  ['immuno', 'Immunosuppressed, for example after a transplant'],
];
const riskList = (p) => RISKS.filter(([k]) => p?.risks?.[k]).map(([, t]) => t);

// ---------------------------------------------------------------- shared lookups
function lesionNumber(lesion) {
  return store.lesionsOf(lesion.patientId).findIndex((l) => l.id === lesion.id) + 1;
}
function lesionName(lesion) {
  return lesion.label || `Lesion ${lesionNumber(lesion)}`;
}
function lesionWhere(lesion) {
  return SITE_NAMES[lesion.site] || 'Site not recorded';
}

/** One entry per lesion (its latest scan) plus every scan not linked to a lesion. */
function queueItems() {
  const items = [];
  for (const l of store.all('lesion')) {
    const s = store.latestScan(l.id);
    if (s) items.push({ scan: s, lesion: l, patient: store.get(l.patientId) });
  }
  for (const s of store.all('scan').filter((x) => !x.lesionId)) items.push({ scan: s, lesion: null, patient: s.patientId ? store.get(s.patientId) : null });
  return items.sort((a, b) => LEVELS[a.scan.level].rank - LEVELS[b.scan.level].rank || b.scan.probs[0] - a.scan.probs[0] || b.scan.ts - a.scan.ts);
}
const itemHref = (it) => (it.lesion ? `#/lesion/${it.lesion.id}` : `#/report/${it.scan.id}`);
function itemTitle(it) {
  if (it.patient) return it.patient.name;
  return it.scan.sample ? `Sample ${it.scan.sample.index || ''}, no patient` : 'No patient';
}

function worstLevel(patientId) {
  let best = null;
  for (const l of store.lesionsOf(patientId)) {
    const s = store.latestScan(l.id);
    if (s && (!best || LEVELS[s.level].rank < LEVELS[best].rank)) best = s.level;
  }
  return best;
}

// ---------------------------------------------------------------- patient dialog
export async function editPatient(existing = null) {
  const p = existing || {};
  const year = new Date().getFullYear();
  const fd = await dialog({
    title: existing ? 'Edit patient' : 'Add a patient',
    submit: existing ? 'Save patient' : 'Add patient',
    body: html`
      <label class="f"><span>Name or initials</span><input name="name" required maxlength="80" value="${p.name || ''}" autocomplete="off"></label>
      <div class="f-row">
        <label class="f"><span>Patient ID <small>optional</small></span><input name="ref" maxlength="40" value="${p.ref || ''}" autocomplete="off"></label>
        <label class="f"><span>Year of birth</span><input name="birthYear" type="number" min="${year - 115}" max="${year}" value="${p.birthYear || ''}" placeholder="${year - 50}"></label>
      </div>
      <fieldset class="f"><legend>Sex</legend>
        <div class="seg">
          ${['female', 'male', 'unknown'].map((v) => html`<label><input type="radio" name="sex" value="${v}" ${raw((p.sex || 'unknown') === v ? 'checked' : '')}><span>${v === 'unknown' ? 'Not recorded' : SEX_NAMES[v]}</span></label>`)}
        </div>
      </fieldset>
      <label class="f"><span>Fitzpatrick skin type</span>
        <select name="fitzpatrick"><option value="">Not sure</option>${FITZ.map((r, i) => html`<option value="${i + 1}" ${raw(p.fitzpatrick === i + 1 ? 'selected' : '')}>Type ${r}</option>`)}</select>
      </label>
      <fieldset class="f"><legend>Risk factors <small>for the referral; the model does not use them</small></legend>
        <div class="checks">${RISKS.map(([k, t]) => html`<label class="check"><input type="checkbox" name="risk_${k}" ${raw(p.risks?.[k] ? 'checked' : '')}><span>${t}</span></label>`)}</div>
      </fieldset>
      <label class="f"><span>Notes <small>optional</small></span><textarea name="notes" rows="3" maxlength="2000">${p.notes || ''}</textarea></label>
      <p class="dlg-fine">${icon('shield')} Saved only in this browser${store.current()?.locked ? ', encrypted with your passcode' : ''}.</p>`,
  });
  if (!fd) return null;
  const by = Number(fd.get('birthYear'));
  const fz = Number(fd.get('fitzpatrick'));
  const risks = {};
  for (const [k] of RISKS) if (fd.get(`risk_${k}`)) risks[k] = true;
  const saved = await store.save({
    ...p,
    kind: 'patient',
    name: String(fd.get('name')).trim(),
    ref: String(fd.get('ref') || '').trim(),
    birthYear: by >= 1900 ? by : null,
    sex: fd.get('sex') || 'unknown',
    fitzpatrick: fz >= 1 && fz <= 6 ? fz : null,
    risks,
    notes: String(fd.get('notes') || '').trim(),
  });
  toast(existing ? 'Patient saved' : `${saved.name} added`);
  return saved;
}

async function editLesion(lesion) {
  const fd = await dialog({
    title: lesion.id ? 'Edit lesion' : 'New lesion',
    submit: 'Save lesion',
    body: html`
      <label class="f"><span>Label</span><input name="label" maxlength="60" value="${lesion.label || ''}" placeholder="For example: left forearm, below the elbow"></label>
      <label class="f"><span>Body site</span>
        <select name="site">${Object.entries(SITE_NAMES).map(([v, n]) => html`<option value="${v}" ${raw(lesion.site === v ? 'selected' : '')}>${n}</option>`)}</select>
      </label>`,
  });
  if (!fd) return null;
  return store.save({ ...lesion, kind: 'lesion', label: String(fd.get('label') || '').trim(), site: fd.get('site') });
}

// ---------------------------------------------------------------- landing page and sign-up
// Encrypts the sample scan shown in the hero the way store.js seals a saved record (AES-GCM,
// 256-bit key, random 12-byte IV) and shows the start of the result.
async function cipherDemo(pre) {
  try {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const record = { kind: 'scan', patient: 'Demo patient A', lesion: 'Left cheek', title: 'Refer urgently', finding: 'Possible melanoma' };
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(record))));
    pre.textContent = btoa(String.fromCharCode(...ct.slice(0, 96)));
  } catch {
    pre.closest('.l-visual').hidden = true; // WebCrypto needs HTTPS or localhost
  }
}

export async function welcome(el, r) {
  const profiles = await store.listProfiles();
  const create = r.params.get('step') === 'create' || r.params.has('new');
  return create ? signup(el, r, profiles) : landing(el, profiles);
}

function landing(el, profiles) {
  render(
    el,
    html`<div class="landing">
      <section class="l-hero">
        <div>
          <h1>Which skin spot should be seen first?</h1>
          <p class="lead">SkinScan AI reads a dermoscopic photo together with the patient's age, sex and body site, and suggests how soon to refer: urgently, for review, or at the next routine visit. It runs on your device and keeps working offline.</p>
          <div class="l-actions">
            <a class="btn btn-primary btn-lg" href="#/welcome?step=create">Create a free profile</a>
            <a class="btn btn-secondary btn-lg" href="#/scan">Try a scan first</a>
          </div>
          ${profiles.length ? html`<p class="l-alt">Already have a profile on this device? <a href="#/signin">Sign in</a></p>` : ''}
        </div>
        <div class="l-scope" aria-hidden="true">
          <img src="samples/ISIC_5700648.jpg" alt="">
          <svg viewBox="0 0 400 400"><circle class="l-track" cx="200" cy="200" r="197"/><circle class="l-arc" cx="200" cy="200" r="197"/></svg>
          <div class="l-result"><strong>Refer urgently</strong><span>Possible melanoma</span></div>
        </div>
      </section>

      <section class="l-section on-slide">
        <h2>A scan takes about a minute</h2>
        <ol class="l-steps">
          <li><strong>Add the photo</strong><span>Upload a dermoscopic close-up or take one with the camera. It is checked for focus, exposure, contrast and size before the model runs.</span></li>
          <li><strong>Add what you know</strong><span>Age, sex, body site, skin type, size, and whether the spot looks melanocytic. Each one is optional, and each one helps.</span></li>
          <li><strong>Read the suggestion</strong><span>Three scores, how soon to refer, and why. A heat map shows which part of the photo the model relied on.</span></li>
        </ol>
      </section>

      <section class="l-section">
        <div>
          <h2>Follow each lesion from visit to visit</h2>
          <p>Every patient gets a body map. Mark where a lesion is, rescan it at each visit, and its scores line up on one chart. Rechecks that are due or overdue show on the home screen.</p>
        </div>
        <div class="l-visual"><div class="body-fig lesion-map" id="l-map"></div></div>
      </section>

      <section class="l-section is-flipped">
        <div>
          <h2>See all of a patient's spots side by side</h2>
          <p>Moles on one person tend to look alike, and a melanoma often looks different from the rest. Dermatologists call this the ugly duckling sign (Grob and Bonerandi, 1998). The patient page lines up the latest photo of every lesion, so the one that looks different is easy to find.</p>
        </div>
        <div class="l-visual"><ul class="l-gallery">
          ${[
            ['ISIC_5700648', 'Left cheek', 'Melanoma in situ'],
            ['ISIC_8821098', 'Upper chest', 'Seborrheic keratosis'],
            ['ISIC_1464567', 'Left upper arm', 'Basal cell carcinoma'],
            ['ISIC_6991057', 'Left calf', 'Seborrheic keratosis'],
          ].map(([id, where, dx], i) => html`<li class="${i === 0 ? 'is-odd' : ''}"><span class="l-thumb"><img src="samples/${id}.jpg" alt="" loading="lazy"></span><strong>${i + 1}. ${where}</strong><span>Biopsy: ${lc(dx)}</span></li>`)}
        </ul></div>
      </section>

      <section class="l-section">
        <div>
          <h2>Patient data stays on this device</h2>
          <p>Photos and details are never uploaded. Give your profile a passcode and every patient and scan is encrypted in the browser with AES-GCM, using a key made from the passcode that is never stored.</p>
        </div>
        <div class="l-visual l-cipher-wrap"><p class="l-cipher-cap">The scan at the top of this page, encrypted in your browser a moment ago:</p><pre class="l-cipher" id="l-cipher"></pre></div>
      </section>

      <section class="l-section">
        <div>
          <h2>Trained on 45,400 biopsy-confirmed images</h2>
          <p>The numbers below come from 9,080 images the model never trained on. They are likely a little better than what it will do in a clinic. <a href="#/how">How it works, and what it can't do</a></p>
        </div>
        <dl class="l-numbers">
          <div><dt>AUC across the three classes</dt><dd>93.2%</dd></div>
          <div><dt>Melanoma AUC</dt><dd>0.940</dd></div>
          <div><dt>Melanomas caught at the 0.278 cutoff</dt><dd>90.0%</dd></div>
          <div><dt>Specificity at that cutoff</dt><dd>81.5%</dd></div>
          <div><dt>Overall accuracy</dt><dd>78.6%</dd></div>
          <div><dt>Model size</dt><dd>21 MB</dd></div>
        </dl>
      </section>

      <section class="l-close">
        <h2>Start with four demo patients</h2>
        <p>Create a profile, then load demo patients built from biopsy-confirmed ISIC images. Every score is computed by the model in your browser. SkinScan AI is a research prototype, not a medical device, and it does not diagnose.</p>
        <a class="btn btn-lg" href="#/welcome?step=create">Create a free profile</a>
      </section>
    </div>`,
  );
  cipherDemo($('#l-cipher', el));
  // live body map with a few lesions, to show what a patient page looks like
  mountLesionMap($('#l-map', el), {
    sex: 'female',
    lesions: [
      { id: 'a', n: 1, level: 'urgent', point: { view: 'front', u: 0.53, v: 0.085 } },
      { id: 'b', n: 2, level: 'routine', point: { view: 'front', u: 0.468, v: 0.23 } },
      { id: 'c', n: 3, level: 'soon', point: { view: 'front', u: 0.72, v: 0.31 } },
      { id: 'd', n: 4, level: 'routine', point: { view: 'back', u: 0.413, v: 0.803 } },
    ],
  });
}

function signup(el, r, profiles) {
  const pending = app.pendingSave();
  render(
    el,
    html`<div class="signup">
      <aside class="signup-side">
        <div>
          <h1>Create your profile</h1>
          <p>Your profile, patients and scans stay in this browser.</p>
        </div>
        <ul>
          <li>${icon('lock')}<span>A passcode encrypts everything you save on this device.</span></li>
          <li>${icon('people')}<span>Each person sharing a computer gets their own profile and patients.</span></li>
          <li>${icon('doc')}<span>Your name and clinic go on the referral reports you print.</span></li>
        </ul>
      </aside>
      <section class="signup-main">
        <a class="w-back" href="${profiles.length && r.params.has('new') ? '#/signin' : '#/welcome'}">${icon('back')}Back</a>
        <h2>About you</h2>
        ${pending ? html`<p class="check-block">The scan you just ran will be saved to this profile.</p>` : ''}
        <form class="w-form" id="signup-form" novalidate>
          <label class="f"><span>Your name</span><input name="name" required maxlength="60" autocomplete="name" placeholder="Jason Xiao"></label>
          <div class="f-row">
            <label class="f"><span>Role</span>
              <select name="role">${['Clinician', 'Nurse', 'Medical student', 'Researcher', 'Other'].map((x) => html`<option>${x}</option>`)}</select>
            </label>
            <label class="f"><span>Clinic or school <small>optional</small></span><input name="org" maxlength="80" autocomplete="organization"></label>
          </div>
          <div class="f-row">
            <label class="f"><span>Passcode <small>optional</small></span><input name="passcode" type="password" minlength="4" maxlength="64" autocomplete="new-password" placeholder="4 or more characters"></label>
            <label class="f"><span>Repeat the passcode</span><input name="passcode2" type="password" maxlength="64" autocomplete="new-password"></label>
          </div>
          <label class="check check-block"><input type="checkbox" name="ack" required><span>I understand SkinScan AI is a research prototype, not a medical device, and that it does not diagnose.</span></label>
          <p class="f-error" id="signup-error" role="alert" hidden></p>
          <button class="btn btn-primary btn-lg" type="submit">Create profile</button>
        </form>
      </section>
    </div>`,
  );
  const form = $('#signup-form', el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#signup-error', el);
    const fd = new FormData(form);
    const pass = String(fd.get('passcode') || '');
    const problems = [];
    if (!String(fd.get('name') || '').trim()) problems.push('Enter your name.');
    if (pass && pass.length < 4) problems.push('Use at least 4 characters for the passcode.');
    if (pass !== String(fd.get('passcode2') || '')) problems.push('The two passcodes are different.');
    if (!fd.get('ack')) problems.push('Tick the box to confirm you understand what SkinScan AI is.');
    if (problems.length) {
      err.textContent = problems.join(' ');
      err.hidden = false;
      return;
    }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    btn.textContent = pass ? 'Encrypting…' : 'Creating…';
    try {
      const p = await store.createProfile({ name: fd.get('name'), role: fd.get('role'), org: fd.get('org'), passcode: pass });
      await app.refreshProfiles();
      toast(`Welcome, ${p.name.split(' ')[0]}`);
      app.go(pending ? '#/scan?resume=save' : '#/home');
    } catch (ex) {
      console.error(ex);
      err.textContent = 'This browser blocked on-device storage, so the profile could not be created. Private browsing windows often do this; try a normal window.';
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Create profile';
    }
  });
}

// ---------------------------------------------------------------- sign-in
export async function signin(el) {
  const profiles = await store.listProfiles();
  if (!profiles.length) return app.go('#/welcome');
  render(
    el,
    html`<div class="signin"><div class="signin-card">
      <h1>Who's scanning?</h1>
      <p class="lead">Profiles on this device. Each one keeps its own patients and scans.</p>
      <ul class="profile-list">
        ${profiles.map(
          (p) => html`<li>
            <button class="profile-card" type="button" data-id="${p.id}" data-locked="${p.locked ? '1' : ''}">
              ${avatar(p.name, 'avatar-lg')}
              <span class="pc-main"><strong>${p.name}</strong><span>${[p.role, p.org].filter(Boolean).join(', ') || 'Profile'}</span></span>
              ${p.locked ? html`<span class="pc-lock" title="Protected with a passcode">${icon('lock')}</span>` : icon('chev')}
            </button>
            ${p.locked
              ? html`<form class="unlock" data-id="${p.id}" hidden>
                  <label class="visually-hidden" for="pass-${p.id}">Passcode for ${p.name}</label>
                  <input id="pass-${p.id}" name="passcode" type="password" placeholder="Passcode" autocomplete="current-password" required>
                  <button class="btn btn-primary" type="submit">Unlock</button>
                  <p class="f-error" role="alert" hidden></p>
                </form>`
              : ''}
          </li>`,
        )}
      </ul>
      <p class="w-alt"><a href="#/welcome?new=1">Create another profile</a>, or <a href="#/scan">scan without signing in</a>.</p>
    </div></div>`,
  );
  for (const b of $$('.profile-card', el)) {
    b.addEventListener('click', async () => {
      if (b.dataset.locked) {
        for (const f of $$('.unlock', el)) f.hidden = f.dataset.id !== b.dataset.id;
        $(`#pass-${b.dataset.id}`, el).focus();
        return;
      }
      await store.unlock(b.dataset.id);
      app.go(app.takeIntended() || '#/home');
    });
  }
  for (const f of $$('.unlock', el)) {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = $('.f-error', f);
      const btn = $('button', f);
      btn.disabled = true;
      btn.textContent = 'Unlocking…';
      try {
        await store.unlock(f.dataset.id, f.passcode.value);
        app.go(app.takeIntended() || '#/home');
      } catch {
        errEl.textContent = 'That passcode is wrong. Check caps lock and try again.';
        errEl.hidden = false;
        f.passcode.select();
      } finally {
        btn.disabled = false;
        btn.textContent = 'Unlock';
      }
    });
  }
}

// ---------------------------------------------------------------- home
export function home(el) {
  const me = store.current();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const pts = store.patients();
  const lesions = store.all('lesion');
  const scans = store.scans();
  const queue = queueItems();
  const waiting = queue.filter((it) => it.scan.level !== 'routine').length;
  const rechecks = lesions
    .filter((l) => l.recheckOn)
    .map((l) => ({ l, days: daysUntil(l.recheckOn), p: store.get(l.patientId) }))
    .filter((x) => x.days <= 30)
    .sort((a, b) => a.days - b.days);
  const groups = ['urgent', 'soon', 'routine'].map((lv) => ({ lv, items: queue.filter((it) => it.scan.level === lv) }));
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const summary = scans.length ? ` ${plural(pts.length, 'patient')}, ${plural(lesions.length, 'lesion')}, ${waiting} waiting for a referral.` : '';

  const queueRow = (it) => html`<li><a class="q-row" href="${itemHref(it)}">
      ${thumb(it.scan.thumb)}
      <span class="q-main"><strong>${itemTitle(it)}</strong><span>${it.lesion ? lesionName(it.lesion) : it.scan.finding}, ${when(it.scan.ts)}</span></span>
      <span class="q-score" title="Melanoma score"><span class="q-bar"><i style="width:${Math.max(2, it.scan.probs[0] * 100)}%"></i><b style="left:${MELANOMA_CUTOFF * 100}%"></b></span>${pct(it.scan.probs[0])}</span>
      ${icon('chev')}
    </a></li>`;
  const due = (days) => (days < 0 ? `Overdue by ${plural(-days, 'day')}` : days === 0 ? 'Due today' : `Due in ${plural(days, 'day')}`);

  render(
    el,
    html`<div class="page-head page-head-row">
        <div><h1>${greet}, ${me.name.split(' ')[0]}</h1>
        <p class="date-line">${today}${me.org ? `, ${me.org}` : ''}.${summary}</p></div>
        <div class="head-actions">
          <button class="btn btn-secondary" type="button" id="h-add">${icon('plus')}Add patient</button>
          <a class="btn btn-primary" href="#/scan">${icon('scan')}New scan</a>
        </div>
      </div>
      ${scans.length === 0
        ? html`<div class="card onboard">
            <h2>Start with a patient</h2>
            <ol class="steps">
              <li><strong>Add a patient.</strong> Their age, sex and skin type then fill in on every scan.</li>
              <li><strong>Scan a lesion.</strong> Tap where it is on the body map. The photo is checked before the model runs.</li>
              <li><strong>Follow it over time.</strong> Rescan it at the next visit and compare the photos and scores.</li>
            </ol>
            <div class="head-actions">
              <button class="btn btn-primary" type="button" id="h-add2">${icon('plus')}Add a patient</button>
              <button class="btn btn-secondary" type="button" id="h-demo">Load demo patients</button>
            </div>
            <p class="fine">The demo patients use the eight biopsy-confirmed sample images, and every score comes from the model running in this browser. They are marked as demo data, and Settings removes them.</p>
          </div>`
        : html`<div class="home-grid">
            <section class="card queue">
              <header class="card-head"><h2>See first</h2><a href="#/scans">All scans</a></header>
              <p class="card-sub">Each lesion's latest result, most urgent first.</p>
              ${groups.map((g) =>
                g.items.length
                  ? html`<div class="q-group"><h3 data-level="${g.lv}"><i></i>${LEVELS[g.lv].title}<span>${g.items.length}</span></h3><ul class="q-list">${g.items.slice(0, 6).map(queueRow)}</ul>
                    ${g.items.length > 6 ? html`<a class="q-more" href="#/scans?level=${g.lv}">${g.items.length - 6} more</a>` : ''}</div>`
                  : '',
              )}
            </section>
            <div class="home-side">
              <section class="card">
                <header class="card-head"><h2>Rechecks</h2></header>
                ${rechecks.length
                  ? html`<ul class="r-list">${rechecks.map(
                      (x) => html`<li><a href="#/lesion/${x.l.id}">${icon('calendar')}<span><strong>${x.p?.name || ''}</strong><span>${lesionName(x.l)}, <span class="${x.days < 0 ? 'due-late' : x.days <= 7 ? 'due-soon' : ''}">${lc(due(x.days))}</span> (${fmtDate(new Date(x.l.recheckOn + 'T12:00').getTime(), { year: undefined })})</span></span></a></li>`,
                    )}</ul>`
                  : html`<p class="card-sub">No rechecks in the next 30 days. A lesion's page sets one.</p>`}
              </section>
              <section class="card">
                <header class="card-head"><h2>Recent scans</h2></header>
                <ul class="r-list">${scans.slice(0, 5).map((s) => {
                  const l = s.lesionId ? store.get(s.lesionId) : null;
                  const p = s.patientId ? store.get(s.patientId) : null;
                  return html`<li><a href="${l ? `#/lesion/${l.id}` : `#/report/${s.id}`}">${thumb(s.thumb)}<span><strong>${p ? p.name : 'No patient'}</strong><span>${fmtDateTime(s.ts)}</span></span>${levelBadge(s.level)}</a></li>`;
                })}</ul>
              </section>
            </div>
          </div>`}`,
  );
  const add = async () => {
    const p = await editPatient();
    if (p) app.go(`#/patient/${p.id}`);
  };
  $('#h-add', el)?.addEventListener('click', add);
  $('#h-add2', el)?.addEventListener('click', add);
  $('#h-demo', el)?.addEventListener('click', (e) => loadDemo(e.currentTarget));
}

// ---------------------------------------------------------------- patients
export function patients(el, r) {
  const q = (r.params.get('q') || '').toLowerCase();
  const all = store.patients();
  const list = all.filter((p) => !q || `${p.name} ${p.ref}`.toLowerCase().includes(q));
  render(
    el,
    html`<div class="page-head page-head-row">
        <div><h1>Patients</h1><p>${plural(all.length, 'patient')} on this device${store.current().locked ? ', encrypted' : ''}.</p></div>
        <div class="head-actions"><button class="btn btn-primary" type="button" id="p-add">${icon('plus')}Add patient</button></div>
      </div>
      ${all.length
        ? html`<div class="toolbar"><label class="search">${raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>')}<span class="visually-hidden">Search patients</span><input id="p-q" type="search" placeholder="Search by name or ID" value="${r.params.get('q') || ''}"></label></div>
          <ul class="rows">${list.map((p) => {
            const ls = store.lesionsOf(p.id);
            const last = store.all('scan').filter((s) => s.patientId === p.id).sort((a, b) => b.ts - a.ts)[0];
            return html`<li><a class="row" href="#/patient/${p.id}">
              ${avatar(p.name)}
              <span class="row-main"><strong>${p.name}${p.demo ? raw(' <em class="tag">Demo</em>') : ''}</strong><span>${[p.ref, patientLine(p)].filter(Boolean).join(', ')}</span></span>
              <span class="row-meta">${plural(ls.length, 'lesion')}${last ? `, last scan ${when(last.ts)}` : ''}</span>
              ${levelBadge(worstLevel(p.id))}
              ${icon('chev')}
            </a></li>`;
          })}</ul>
          ${list.length ? '' : html`<p class="empty-line">No patient matches "${q}".</p>`}`
        : html`<div class="empty"><h2>No patients yet</h2><p>Add a patient to keep their lesions, scans and reports together. Their age, sex and skin type then fill in on every scan.</p><button class="btn btn-primary" type="button" id="p-add2">${icon('plus')}Add a patient</button></div>`}`,
  );
  const add = async () => {
    const p = await editPatient();
    if (p) app.go(`#/patient/${p.id}`);
  };
  $('#p-add', el)?.addEventListener('click', add);
  $('#p-add2', el)?.addEventListener('click', add);
  const input = $('#p-q', el);
  if (input) {
    input.addEventListener('input', () => {
      const pos = input.selectionStart;
      history.replaceState(null, '', `#/patients${input.value ? `?q=${encodeURIComponent(input.value)}` : ''}`);
      patients(el, { params: new URLSearchParams(input.value ? { q: input.value } : {}) });
      const again = $('#p-q', el);
      again.focus();
      again.setSelectionRange(pos, pos);
    });
  }
}

// ---------------------------------------------------------------- one patient
export function patient(el, r) {
  const p = store.get(r.id);
  if (!p || p.kind !== 'patient') return notFound(el, 'patient');
  const ls = store.lesionsOf(p.id);
  const loose = store.all('scan').filter((s) => s.patientId === p.id && !s.lesionId).sort((a, b) => b.ts - a.ts);
  const marks = ls.map((l, i) => ({ id: l.id, n: i + 1, point: l.point, level: store.latestScan(l.id)?.level }));
  const withPhoto = ls.map((l, i) => ({ l, n: i + 1, s: store.latestScan(l.id) })).filter((x) => x.s);
  const risks = riskList(p);
  render(
    el,
    html`<nav class="crumbs" aria-label="Breadcrumb"><a href="#/patients">Patients</a>${icon('chev')}<span>${p.name}</span></nav>
      <div class="page-head page-head-row">
        <div class="ph-person">${avatar(p.name, 'avatar-lg')}<div><h1>${p.name}${p.demo ? raw(' <em class="tag">Demo</em>') : ''}</h1><p>${[p.ref, patientLine(p)].filter(Boolean).join(', ')}</p></div></div>
        <div class="head-actions">
          <button class="btn btn-ghost" type="button" id="pt-del">${icon('trash')}Delete</button>
          <button class="btn btn-secondary" type="button" id="pt-edit">${icon('edit')}Edit</button>
          <a class="btn btn-primary" href="#/scan?patient=${p.id}&lesion=new">${icon('scan')}Scan a new lesion</a>
        </div>
      </div>
      <div class="pt-grid">
        <section class="card pt-map">
          <header class="card-head"><h2>Body map</h2><button class="btn btn-secondary btn-sm" type="button" id="pt-pick">${icon('pin')}Mark a lesion</button></header>
          <div class="lesion-map" id="pt-map"></div>
          <p class="card-sub" id="pt-pick-hint" hidden>Tap where the lesion is on the front or back.</p>
        </section>
        <div class="pt-side">
          <section class="pt-lesions">
            <h2 class="section-title">Lesions <span>${ls.length}</span></h2>
            ${ls.length
              ? html`<ul class="lesion-cards">${ls.map((l, i) => {
                  const sc = store.scansOf(l.id);
                  const last = sc.at(-1);
                  return html`<li class="lesion-card">
                    <a class="lc-link" href="#/lesion/${l.id}">
                      <span class="lc-n" data-level="${last?.level || ''}">${i + 1}</span>
                      ${thumb(last?.thumb)}
                      <span class="lc-main"><strong>${lesionName(l)}</strong><span>${lesionWhere(l)}, ${plural(sc.length, 'scan')}${last ? `, ${when(last.ts)}` : ''}</span>
                        ${l.recheckOn ? html`<span class="lc-recheck">${icon('calendar')}Recheck ${fmtDate(new Date(l.recheckOn + 'T12:00').getTime())}</span>` : ''}</span>
                      ${levelBadge(last?.level)}
                    </a>
                    <a class="btn btn-secondary btn-sm" href="#/scan?patient=${p.id}&lesion=${l.id}">Rescan</a>
                  </li>`;
                })}</ul>`
              : html`<div class="empty empty-sm"><p>No lesions yet. Mark one on the body map, or scan a new lesion.</p></div>`}
          </section>
          ${withPhoto.length > 1
            ? html`<section class="card">
                <header class="card-head"><h2>All lesions side by side</h2></header>
                <p class="card-sub">Moles on one person usually look alike. A spot that looks different from the others deserves a closer look (the ugly duckling sign).</p>
                <ul class="gallery">${withPhoto.map((x) => html`<li><a href="#/lesion/${x.l.id}"><img src="${x.s.image || x.s.thumb}" alt=""><strong>${x.n}. ${lesionName(x.l)}</strong><span>${LEVELS[x.s.level].title}, melanoma ${pct(x.s.probs[0])}</span></a></li>`)}</ul>
              </section>`
            : ''}
          <section class="card">
            <header class="card-head"><h2>Risk factors</h2><button class="btn btn-ghost btn-sm" type="button" id="pt-risk">${icon('edit')}Edit</button></header>
            ${risks.length ? html`<ul class="risk-list">${risks.map((t) => html`<li>${icon('flag')}<span>${t}</span></li>`)}</ul>` : html`<p class="card-sub">None recorded.</p>`}
            <p class="fine" style="margin-top:10px">Printed on referral reports. The model does not use them.</p>
          </section>
          ${loose.length
            ? html`<h2 class="section-title">Other scans <span>${loose.length}</span></h2><ul class="r-list card">${loose.map((s) => html`<li><a href="#/report/${s.id}">${thumb(s.thumb)}<span><strong>${s.finding}</strong><span>${fmtDateTime(s.ts)}</span></span>${levelBadge(s.level)}</a></li>`)}</ul>`
            : ''}
          ${p.notes ? html`<section class="card"><header class="card-head"><h2>Notes</h2></header><p class="notes">${p.notes}</p></section>` : ''}
        </div>
      </div>`,
  );
  const map = mountLesionMap($('#pt-map', el), {
    sex: p.sex,
    lesions: marks,
    onSelect: (id) => app.go(`#/lesion/${id}`),
    onPick: async (pt) => {
      setPick(false);
      const saved = await editLesion({ patientId: p.id, site: pt.site, point: pt });
      if (saved) {
        toast(`${lesionName(saved)} added`);
        patient(el, r);
      }
    },
  });
  let picking = false;
  const setPick = (on) => {
    picking = on;
    map.setPicking(on);
    $('#pt-pick-hint', el).hidden = !on;
    $('#pt-pick', el).classList.toggle('is-on', on);
  };
  $('#pt-pick', el).addEventListener('click', () => setPick(!picking));
  const edit = async () => {
    if (await editPatient(p)) patient(el, r);
  };
  $('#pt-edit', el).addEventListener('click', edit);
  $('#pt-risk', el).addEventListener('click', edit);
  $('#pt-del', el).addEventListener('click', async () => {
    const n = store.all('scan').filter((s) => s.patientId === p.id).length;
    if (await confirmDialog({ title: `Delete ${p.name}?`, message: `This removes the patient, ${plural(ls.length, 'lesion')} and ${plural(n, 'scan')} from this device. It cannot be undone.`, confirm: 'Delete patient' })) {
      await store.removePatient(p.id);
      toast('Patient deleted');
      app.go('#/patients');
    }
  });
}

// ---------------------------------------------------------------- one lesion
export function lesion(el, r) {
  const l = store.get(r.id);
  if (!l || l.kind !== 'lesion') return notFound(el, 'lesion');
  const p = store.get(l.patientId);
  const sc = store.scansOf(l.id);
  const last = sc.at(-1);
  const first = sc[0];
  const n = lesionNumber(l);
  const due = l.recheckOn ? daysUntil(l.recheckOn) : null;
  // from the rounded percentages shown, so the label adds up
  const delta = sc.length > 1 ? Math.round(last.probs[0] * 100) - Math.round(first.probs[0] * 100) : null;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  render(
    el,
    html`<nav class="crumbs" aria-label="Breadcrumb"><a href="#/patients">Patients</a>${icon('chev')}<a href="#/patient/${p.id}">${p.name}</a>${icon('chev')}<span>${lesionName(l)}</span></nav>
      <div class="page-head page-head-row">
        <div class="ph-person"><span class="lc-n lc-n-lg" data-level="${last?.level || ''}">${n}</span><div><h1>${lesionName(l)}</h1><p>${lesionWhere(l)}, ${p.name}, ${plural(sc.length, 'scan')}</p></div></div>
        <div class="head-actions">
          <button class="btn btn-ghost" type="button" id="ls-del">${icon('trash')}Delete</button>
          <button class="btn btn-secondary" type="button" id="ls-edit">${icon('edit')}Edit</button>
          ${last ? html`<a class="btn btn-secondary" href="#/report/${last.id}">${icon('doc')}Report</a>` : ''}
          <a class="btn btn-primary" href="#/scan?patient=${p.id}&lesion=${l.id}">${icon('scan')}Rescan</a>
        </div>
      </div>
      ${last
        ? html`<div class="ls-top">
            <div class="verdict" data-level="${last.level}">
              <img class="ls-photo" src="${last.image || last.thumb}" alt="Latest photo of ${lesionName(l)}">
              <div><p class="verdict-title">${last.title}</p><h2 class="verdict-finding">${last.finding}</h2>
              <p class="verdict-why">Latest scan ${fmtDateTime(last.ts)}. Melanoma ${pct(last.probs[0])}, benign ${pct(last.probs[1])}, other skin cancer ${pct(last.probs[2])}.</p></div>
            </div>
            <form class="card recheck" id="ls-recheck">
              <h2>${icon('calendar')}Recheck</h2>
              <p class="card-sub">${due === null ? 'No recheck set.' : due < 0 ? `Overdue by ${plural(-due, 'day')}.` : due === 0 ? 'Due today.' : `Due in ${plural(due, 'day')}.`}</p>
              <div class="recheck-row"><label class="visually-hidden" for="ls-date">Recheck date</label><input id="ls-date" type="date" value="${l.recheckOn || ''}" min="${isoToday()}">
              <button class="btn btn-secondary" type="submit">Save date</button></div>
              <div class="chips">${[30, 90, 180].map((d) => html`<button type="button" class="chip" data-days="${d}">In ${d === 30 ? '1 month' : d === 90 ? '3 months' : '6 months'}</button>`)}</div>
            </form>
          </div>
          <section class="card">
            <header class="card-head"><h2>Scores at each scan</h2>${delta !== null ? html`<span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">Melanoma ${pct(first.probs[0])} to ${pct(last.probs[0])}, ${delta > 0 ? '+' : ''}${delta} points</span>` : ''}</header>
            ${sc.length === 1 ? html`<p class="card-sub">One scan so far. Rescan this lesion at the next visit to see how its scores change.</p>` : ''}
            <div class="chart" id="ls-chart"></div>
          </section>
          ${sc.length > 1
            ? html`<section class="card">
                <header class="card-head"><h2>Compare two photos</h2>
                  <div class="cmp-pick"><label>Earlier <select id="cmp-a">${sc.map((s, i) => html`<option value="${i}" ${raw(i === 0 ? 'selected' : '')}>${fmtDate(s.ts)}</option>`)}</select></label>
                  <label>Later <select id="cmp-b">${sc.map((s, i) => html`<option value="${i}" ${raw(i === sc.length - 1 ? 'selected' : '')}>${fmtDate(s.ts)}</option>`)}</select></label></div>
                </header>
                <p class="card-sub">Drag across the photo to wipe between them${reduceMotion ? '' : ', or flicker them so a change in size, shape or color stands out'}.</p>
                <div class="compare" id="cmp"><img class="cmp-a" alt=""><div class="cmp-b-wrap"><img class="cmp-b" alt=""></div><i class="cmp-line"></i>
                  <input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="Drag to compare the two photos"></div>
                ${reduceMotion ? '' : html`<div class="cmp-tools"><button class="btn btn-secondary btn-sm" type="button" id="cmp-flicker" aria-pressed="false">Flicker</button></div>`}
                <div class="cmp-captions"><span id="cmp-ca"></span><span id="cmp-cb"></span></div>
              </section>`
            : ''}`
        : html`<div class="empty"><h2>No scans of this lesion yet</h2><p>Scan it to start its history.</p><a class="btn btn-primary" href="#/scan?patient=${p.id}&lesion=${l.id}">${icon('scan')}Scan this lesion</a></div>`}
      ${sc.length
        ? html`<h2 class="section-title">Scans <span>${sc.length}</span></h2>
          <ol class="timeline">${[...sc].reverse().map((s) => html`<li class="tl-item">
            <img class="thumb" src="${s.thumb}" alt="">
            <div class="tl-main">
              <div class="tl-head">${levelBadge(s.level)}<strong>${s.finding}</strong><span class="tl-date">${fmtDateTime(s.ts)}</span></div>
              <div class="tl-scores">${CLASSES.map((c, i) => html`<span><i data-key="${c.key}"></i>${c.short} ${pct(s.probs[i])}</span>`)}</div>
              <p class="tl-detail">${detailsLine(s.details)}</p>
              ${abcdeLine(s.abcde) ? html`<p class="tl-detail">Observations: ${abcdeLine(s.abcde)}</p>` : ''}
              ${s.quality && !s.quality.ok ? html`<p class="tl-detail tl-warn">Photo check: ${s.quality.checks.filter((c) => !c.ok).map((c) => c.label.toLowerCase()).join(', ')}</p>` : ''}
              ${s.notes ? html`<p class="tl-note">${s.notes}</p>` : ''}
            </div>
            <div class="tl-actions"><a class="btn btn-ghost btn-sm" href="#/report/${s.id}">${icon('doc')}Report</a><button class="btn btn-ghost btn-sm tl-del" type="button" data-id="${s.id}" aria-label="Delete this scan">${icon('trash')}</button></div>
          </li>`)}</ol>`
        : ''}`,
  );

  if (sc.length) scoreChart($('#ls-chart', el), sc);
  if (sc.length > 1) {
    const cmp = $('#cmp', el);
    const setPair = () => {
      const a = sc[Number($('#cmp-a', el).value)];
      const b = sc[Number($('#cmp-b', el).value)];
      $('.cmp-a', cmp).src = a.image || a.thumb;
      $('.cmp-b', cmp).src = b.image || b.thumb;
      render($('#cmp-ca', el), html`${fmtDate(a.ts)}: ${lc(LEVELS[a.level].title)}, melanoma ${pct(a.probs[0])}`);
      render($('#cmp-cb', el), html`${fmtDate(b.ts)}: ${lc(LEVELS[b.level].title)}, melanoma ${pct(b.probs[0])}`);
    };
    const range = $('.cmp-range', cmp);
    const setSplit = () => cmp.style.setProperty('--split', `${range.value}%`);
    range.addEventListener('input', setSplit);
    $('#cmp-a', el).addEventListener('change', setPair);
    $('#cmp-b', el).addEventListener('change', setPair);
    $('#cmp-flicker', el)?.addEventListener('click', (e) => {
      const on = !cmp.classList.contains('is-flicker');
      cmp.classList.toggle('is-flicker', on);
      e.currentTarget.setAttribute('aria-pressed', String(on));
      e.currentTarget.classList.toggle('is-on', on);
      e.currentTarget.textContent = on ? 'Stop flicker' : 'Flicker';
    });
    setPair();
    setSplit();
  }
  const form = $('#ls-recheck', el);
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await store.save({ ...l, recheckOn: $('#ls-date', el).value || null });
      toast($('#ls-date', el).value ? 'Recheck date saved' : 'Recheck cleared');
      lesion(el, r);
    });
    for (const c of $$('.chip', form)) {
      c.addEventListener('click', () => {
        $('#ls-date', el).value = isoToday(Number(c.dataset.days));
      });
    }
  }
  $('#ls-edit', el).addEventListener('click', async () => {
    if (await editLesion(l)) lesion(el, r);
  });
  $('#ls-del', el).addEventListener('click', async () => {
    if (await confirmDialog({ title: `Delete ${lesionName(l)}?`, message: `This removes the lesion and its ${plural(sc.length, 'scan')} from this device.`, confirm: 'Delete lesion' })) {
      await store.removeLesion(l.id);
      toast('Lesion deleted');
      app.go(`#/patient/${p.id}`);
    }
  });
  for (const b of $$('.tl-del', el)) {
    b.addEventListener('click', async () => {
      if (await confirmDialog({ title: 'Delete this scan?', message: 'Its photo, scores and notes are removed from this device.', confirm: 'Delete scan' })) {
        await store.remove(b.dataset.id);
        lesion(el, r);
      }
    });
  }
}

export function detailsLine(d = {}) {
  const bits = [];
  if (Number.isFinite(d.age)) bits.push(`${d.age} years`);
  if (d.sex === 'female' || d.sex === 'male') bits.push(SEX_NAMES[d.sex].toLowerCase());
  if (d.site) bits.push((SITE_NAMES[d.site] || d.site).toLowerCase());
  if (Number.isFinite(d.fitzpatrick)) bits.push(`skin type ${FITZ[d.fitzpatrick - 1]}`);
  if (Number.isFinite(d.diameterMm)) bits.push(`${d.diameterMm} mm`);
  if (d.melanocytic === 'yes') bits.push('looks melanocytic');
  if (d.melanocytic === 'no') bits.push('not melanocytic');
  return bits.length ? `Details: ${bits.join(', ')}` : 'Photo only, no patient details';
}
export function abcdeLine(a) {
  if (!a) return '';
  const names = { a: 'asymmetry', b: 'irregular border', c: 'varied color', d: 'diameter over 6 mm', e: 'evolving' };
  return Object.keys(names).filter((k) => a[k]).map((k) => names[k]).join(', ');
}

// ---------------------------------------------------------------- all scans
export function scans(el, r) {
  const level = r.params.get('level') || 'all';
  const all = store.scans();
  const list = all.filter((s) => level === 'all' || s.level === level);
  const tabs = [['all', 'All'], ['urgent', 'Refer urgently'], ['soon', 'Refer for review'], ['routine', 'Routine']];
  render(
    el,
    html`<div class="page-head page-head-row">
        <div><h1>Scans</h1><p>${plural(all.length, 'scan')} saved on this device.</p></div>
        <div class="head-actions">${all.length ? html`<button class="btn btn-secondary" type="button" id="sc-csv">Export CSV</button>` : ''}<a class="btn btn-primary" href="#/scan">${icon('scan')}New scan</a></div>
      </div>
      ${all.length
        ? html`<div class="toolbar"><div class="seg seg-tabs" role="tablist">${tabs.map(([k, t]) => html`<a role="tab" href="#/scans${k === 'all' ? '' : `?level=${k}`}" aria-selected="${k === level ? 'true' : 'false'}">${t}<span>${k === 'all' ? all.length : all.filter((s) => s.level === k).length}</span></a>`)}</div></div>
          <div class="table-wrap card"><table class="table">
            <thead><tr><th scope="col">Photo</th><th scope="col">Patient and lesion</th><th scope="col">Result</th><th scope="col" class="num">Melanoma</th><th scope="col">Date</th><th scope="col"><span class="visually-hidden">Report</span></th></tr></thead>
            <tbody>${list.map((s) => {
              const p = s.patientId ? store.get(s.patientId) : null;
              const l = s.lesionId ? store.get(s.lesionId) : null;
              return html`<tr>
                <td>${thumb(s.thumb)}</td>
                <td>${l ? html`<a href="#/lesion/${l.id}">${p?.name}, ${lesionName(l)}</a>` : p ? html`<a href="#/patient/${p.id}">${p.name}</a>` : html`<span class="muted">No patient</span>`}<div class="muted small">${s.finding}</div></td>
                <td>${levelBadge(s.level)}</td>
                <td class="num">${pct(s.probs[0])}</td>
                <td class="nowrap">${fmtDateTime(s.ts)}</td>
                <td><a class="btn btn-ghost btn-sm" href="#/report/${s.id}">${icon('doc')}Report</a></td>
              </tr>`;
            })}</tbody></table></div>`
        : html`<div class="empty"><h2>No saved scans</h2><p>Run a scan and choose <strong>Save to patient</strong> to keep it here.</p><a class="btn btn-primary" href="#/scan">${icon('scan')}Start a scan</a></div>`}`,
  );
  $('#sc-csv', el)?.addEventListener('click', () => download(`skinscan-scans-${isoToday()}.csv`, toCSV(all), 'text/csv'));
}

function toCSV(items) {
  const cols = ['date', 'patient', 'patient_id', 'lesion', 'suggestion', 'finding', 'melanoma', 'benign', 'other_skin_cancer', 'age', 'sex', 'body_site', 'fitzpatrick', 'diameter_mm', 'melanocytic', 'abcde', 'notes'];
  const q = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = items.map((s) => {
    const p = s.patientId ? store.get(s.patientId) : null;
    const l = s.lesionId ? store.get(s.lesionId) : null;
    const d = s.details || {};
    return [new Date(s.ts).toISOString(), p?.name, p?.ref, l ? lesionName(l) : '', s.title, s.finding, s.probs[0].toFixed(4), s.probs[1].toFixed(4), s.probs[2].toFixed(4), d.age, d.sex, d.site, d.fitzpatrick, d.diameterMm, d.melanocytic, abcdeLine(s.abcde), s.notes];
  });
  return [cols, ...rows].map((r) => r.map(q).join(',')).join('\n');
}

// ---------------------------------------------------------------- report and referral letter
const ONSETS = [['', 'Not known'], ['under a month', 'Under a month'], ['1 to 6 months', '1 to 6 months'], ['6 to 12 months', '6 to 12 months'], ['over a year', 'Over a year']];
const CHANGES = [['grown', 'has grown'], ['shape', 'has changed shape'], ['color', 'has changed color'], ['bleeds', 'bleeds'], ['itches', 'itches'], ['new', 'is new']];
const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

function letterText(s, p, l, me, ref = {}) {
  const age = p ? ageFrom(p) : s.details?.age;
  const sex = (p?.sex || s.details?.sex) === 'female' ? 'woman' : (p?.sex || s.details?.sex) === 'male' ? 'man' : 'patient';
  const who = p ? `${p.name}${p.ref ? ` (${p.ref})` : ''}` : 'this patient';
  const desc = Number.isFinite(age) ? `, a ${age}-year-old ${sex},` : '';
  const site = l ? `${lesionName(l).toLowerCase()} (${lesionWhere(l).toLowerCase()})` : SITE_NAMES[s.details?.site] ? SITE_NAMES[s.details.site].toLowerCase() : 'skin';
  const changes = CHANGES.filter(([k]) => ref.changes?.[k]).map(([, t]) => t);
  const clinical = [];
  if (ref.onset) clinical.push(`It has been there for ${ref.onset}.`);
  if (changes.length) clinical.push(`The patient says it ${andList(changes)}.`);
  if (abcdeLine(s.abcde)) clinical.push(`On examination: ${abcdeLine(s.abcde)}.`);
  const risks = riskList(p);
  if (risks.length) clinical.push(`Risk factors: ${risks.map(lc).join('; ')}.`);
  if (ref.history) clinical.push(`History: ${ref.history.replace(/\.?$/, '.')}`);
  const lines = [
    'Dear dermatology team,',
    '',
    `Please see ${who}${desc} about a lesion on the ${site}.${clinical.length ? ` ${clinical.join(' ')}` : ''}`,
    '',
    `SkinScan AI, a research triage tool that does not diagnose, suggests: ${s.title.toLowerCase()} (${s.finding.toLowerCase()}). Its scores were melanoma ${pct(s.probs[0])}, benign ${pct(s.probs[1])} and other skin cancer ${pct(s.probs[2])}, against a melanoma cutoff of ${pct(MELANOMA_CUTOFF, 1)}.`,
  ];
  if (ref.question) lines.push('', `My question: ${ref.question}`);
  lines.push('', 'The dermoscopic photo and the full report are attached.', '', [me?.name, me?.role, me?.org].filter(Boolean).join(', ') || '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function report(el, r) {
  const s = r.id === 'current' ? app.currentScan() : store.get(r.id);
  if (!s || s.kind !== 'scan') return notFound(el, 'scan');
  const p = s.patientId ? store.get(s.patientId) : null;
  const l = s.lesionId ? store.get(s.lesionId) : null;
  const me = store.current();
  const hist = l ? store.scansOf(l.id) : [];
  const risks = riskList(p);
  const ref = { ...(s.referral || {}) };
  const why =
    s.level === 'urgent'
      ? `The melanoma score, ${pct(s.probs[0])}, is at or above the ${pct(MELANOMA_CUTOFF, 1)} cutoff. On 9,080 validation images this cutoff caught 90% of melanomas.`
      : s.level === 'soon'
        ? `The highest score is for basal or squamous cell carcinoma, ${pct(s.probs[2])}. The melanoma score, ${pct(s.probs[0])}, is below the ${pct(MELANOMA_CUTOFF, 1)} cutoff.`
        : `The highest score is benign, ${pct(s.probs[1])}, and the melanoma score, ${pct(s.probs[0])}, is below the ${pct(MELANOMA_CUTOFF, 1)} cutoff.`;
  render(
    el,
    html`<div class="report-bar">
        <a class="btn btn-ghost" href="${l ? `#/lesion/${l.id}` : r.id === 'current' ? '#/scan' : '#/scans'}">${icon('back')}Back</a>
        <button class="btn btn-primary" type="button" id="rp-print">${icon('print')}Print or save as PDF</button>
      </div>
      <article class="report-doc" id="report-doc">
        <header class="rd-head">
          <div class="rd-brand"><svg aria-hidden="true"><use href="#logo"/></svg><div><strong>SkinScan AI triage report</strong><span>${fmtDateTime(s.ts)}</span></div></div>
          <div class="rd-by">${me ? html`<strong>${me.name}</strong><span>${[me.role, me.org].filter(Boolean).join(', ')}</span>` : html`<span>Not signed in</span>`}</div>
        </header>
        <section class="rd-grid">
          <div class="rd-photo"><div class="rd-scope" data-level="${s.level}"><img src="${s.image || s.thumb}" alt="Lesion photo">${s.heat ? html`<img class="rd-heat" src="${s.heat}" alt="">` : ''}</div>
            ${s.heat ? html`<p class="rd-cap">Left clear: the parts of the photo that, when covered, lowered the top score the most. Darkened: the parts that mattered least.</p>` : ''}</div>
          <div class="rd-main">
            <dl class="rd-facts">
              <div><dt>Patient</dt><dd>${p ? `${p.name}${p.ref ? ` (${p.ref})` : ''}` : 'No patient'}</dd></div>
              ${p ? html`<div><dt>Details</dt><dd>${patientLine(p)}</dd></div>` : ''}
              <div><dt>Lesion</dt><dd>${l ? `${lesionName(l)}, ${lesionWhere(l).toLowerCase()}` : SITE_NAMES[s.details?.site] || 'Not recorded'}</dd></div>
            </dl>
            <div class="verdict" data-level="${s.level}"><div><p class="verdict-title">${s.title}</p><h2 class="verdict-finding">${s.finding}</h2><p class="verdict-why">${why}</p></div></div>
            <ul class="scores">${CLASSES.map(
              (c, i) => html`<li class="score" data-key="${c.key}"><span class="score-name">${c.name}</span><span class="score-val">${pct(s.probs[i])}</span><span class="score-bar"><span class="score-fill" style="width:${Math.max(1, s.probs[i] * 100)}%"></span>${c.key === 'melanoma' ? html`<span class="score-cut" style="left:calc(${MELANOMA_CUTOFF * 100}% - 1px)"></span>` : ''}</span></li>`,
            )}</ul>
          </div>
        </section>
        <section class="rd-cols">
          <div><h3>Details the model used</h3><p>${detailsLine(s.details).replace(/^Details: /, '')}</p>
            ${s.probsPhotoOnly ? html`<p class="muted small">With every detail blank: melanoma ${pct(s.probsPhotoOnly[0])}, benign ${pct(s.probsPhotoOnly[1])}, other skin cancer ${pct(s.probsPhotoOnly[2])}.</p>` : ''}</div>
          <div><h3>Clinician observations</h3><p>${abcdeLine(s.abcde) || 'None recorded'}</p></div>
          <div><h3>Photo check</h3><p>${s.quality ? (s.quality.ok ? 'Passed: in focus, well exposed, enough contrast and resolution.' : s.quality.checks.filter((c) => !c.ok).map((c) => c.note).join(' ')) : 'Not recorded'}</p></div>
          <div><h3>Risk factors</h3><p>${p ? (risks.length ? risks.map((t, i) => (i ? lc(t) : t)).join('; ') : 'None recorded') : 'No patient'}</p></div>
          <div><h3>Notes</h3><p>${s.notes || 'None'}</p></div>
        </section>
        ${hist.length > 1
          ? html`<section class="rd-hist"><h3>History of this lesion</h3><table class="table"><thead><tr><th>Date</th><th>Result</th><th class="num">Melanoma</th><th class="num">Benign</th><th class="num">Other</th></tr></thead>
            <tbody>${hist.map((h) => html`<tr class="${h.id === s.id ? 'is-this' : ''}"><td>${fmtDate(h.ts)}</td><td>${h.title}</td><td class="num">${pct(h.probs[0])}</td><td class="num">${pct(h.probs[1])}</td><td class="num">${pct(h.probs[2])}</td></tr>`)}</tbody></table></section>`
          : ''}
        <section class="rd-letter"><h3>Referral letter</h3><pre id="rp-letter"></pre></section>
        <footer class="rd-foot">SkinScan AI is a research prototype, not a medical device, and is not FDA-cleared. It does not diagnose skin cancer; this report supports clinical judgment and does not replace it. Model: SkinScan v3 (EfficientNet-B4 image branch, 17 patient features), run on this device with ONNX Runtime Web${s.sample ? `. Sample image ${s.sample.id}, biopsy result: ${s.sample.diagnosis}` : ''}.</footer>
      </article>
      <form class="letter-form" id="rp-form">
        <h2>Write the referral letter</h2>
        <p class="card-sub">These answers fill in the letter above${r.id === 'current' ? '' : ' and are saved with the scan'}. The fields follow common store-and-forward referral guidelines.</p>
        <div class="f-row">
          <label class="f"><span>How long has it been there?</span><select name="onset">${ONSETS.map(([v, t]) => html`<option value="${v}" ${raw(ref.onset === v ? 'selected' : '')}>${t}</option>`)}</select></label>
        </div>
        <fieldset class="f"><legend>What the patient has noticed</legend>
          <div class="checks">${CHANGES.map(([k, t]) => html`<label class="check"><input type="checkbox" name="ch_${k}" ${raw(ref.changes?.[k] ? 'checked' : '')}><span>It ${t}</span></label>`)}</div>
        </fieldset>
        <label class="f"><span>Relevant history, medications, allergies <small>optional</small></span><textarea name="history" rows="2" maxlength="1000">${ref.history || ''}</textarea></label>
        <label class="f"><span>Your question for the dermatologist <small>optional</small></span><textarea name="question" rows="2" maxlength="600" placeholder="For example: is this suitable for excision biopsy?">${ref.question || ''}</textarea></label>
        <div class="head-actions"><button class="btn btn-secondary" type="button" id="rp-copy">${icon('copy')}Copy letter</button></div>
      </form>`,
  );
  const form = $('#rp-form', el);
  const pre = $('#rp-letter', el);
  let timer;
  const update = () => {
    const fd = new FormData(form);
    ref.onset = fd.get('onset') || '';
    ref.changes = Object.fromEntries(CHANGES.filter(([k]) => fd.get(`ch_${k}`)).map(([k]) => [k, true]));
    ref.history = String(fd.get('history') || '').trim();
    ref.question = String(fd.get('question') || '').trim();
    pre.textContent = letterText(s, p, l, me, ref);
    if (r.id !== 'current' && store.current()) {
      clearTimeout(timer);
      timer = setTimeout(() => store.save({ ...store.get(s.id), referral: ref }), 500);
    }
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  pre.textContent = letterText(s, p, l, me, ref);
  $('#rp-copy', el).addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.textContent);
      toast('Letter copied');
    } catch {
      toast('This browser blocked copying. Select the letter in the report and copy it.', { tone: 'warn' });
    }
  });
  $('#rp-print', el).addEventListener('click', () => {
    $('#print-area').innerHTML = $('#report-doc', el).outerHTML;
    window.print();
  });
}

// ---------------------------------------------------------------- settings
export async function settings(el) {
  const me = store.current();
  const st = await app.modelStatus();
  const demoCount = store.patients().filter((p) => p.demo).length;
  render(
    el,
    html`<div class="page-head"><h1>Settings</h1><p>${me.name}${me.org ? `, ${me.org}` : ''}</p></div>
      <div class="settings">
        <section class="set-card card">
          <div class="set-title"><h2>Profile</h2><p>Shown on your referral reports and letters.</p></div>
          <form class="set-body" id="st-profile">
            <label class="f"><span>Name</span><input name="name" required maxlength="60" value="${me.name}"></label>
            <div class="f-row">
              <label class="f"><span>Role</span><select name="role">${['Clinician', 'Nurse', 'Medical student', 'Researcher', 'Other'].map((x) => html`<option ${raw(me.role === x ? 'selected' : '')}>${x}</option>`)}</select></label>
              <label class="f"><span>Clinic or school</span><input name="org" maxlength="80" value="${me.org || ''}"></label>
            </div>
            <div><button class="btn btn-secondary" type="submit">Save profile</button></div>
          </form>
        </section>
        <section class="set-card card">
          <div class="set-title"><h2>Passcode</h2><p>${me.locked ? 'Your patients and scans are encrypted on this device with your passcode (AES-GCM, with a key made from the passcode by PBKDF2).' : 'Without a passcode, anyone using this browser can open this profile.'}</p></div>
          <div class="set-body">
            <p class="set-state ${me.locked ? 'ok' : ''}">${icon(me.locked ? 'lock' : 'shield')}${me.locked ? 'Passcode on, data encrypted' : 'No passcode'}</p>
            <div class="head-actions">
              <button class="btn btn-secondary" type="button" id="st-pass">${me.locked ? 'Change passcode' : 'Set a passcode'}</button>
              ${me.locked ? html`<button class="btn btn-ghost" type="button" id="st-nopass">Remove passcode</button>` : ''}
            </div>
            ${me.locked
              ? html`<label class="f f-inline"><span>Lock automatically after</span><select id="st-autolock">${[0, 5, 10, 30].map((m) => html`<option value="${m}" ${raw((me.settings.autoLockMinutes ?? 10) === m ? 'selected' : '')}>${m ? `${m} minutes idle` : 'Never'}</option>`)}</select></label>`
              : ''}
          </div>
        </section>
        <section class="set-card card">
          <div class="set-title"><h2>Model and offline use</h2><p>Every scan runs in this browser. Nothing is uploaded.</p></div>
          <div class="set-body">
            <dl class="kv">
              <div><dt>Model</dt><dd>SkinScan v3: an EfficientNet-B4 image branch and a 17-feature patient branch</dd></div>
              <div><dt>File</dt><dd>skinscan-v3.onnx, 21 MB</dd></div>
              <div><dt>Runtime</dt><dd>ONNX Runtime Web, WebAssembly, ${plural(st.threads, 'thread')}</dd></div>
              <div><dt>Status</dt><dd>${st.ready ? 'Loaded' : 'Not loaded yet'}</dd></div>
              <div><dt>Offline</dt><dd class="${st.offline ? 'ok' : ''}">${st.offline ? 'Ready: the app and the model are saved on this device' : 'Not saved yet. Open the app once over HTTPS to save it for offline use.'}</dd></div>
            </dl>
            <div class="head-actions"><button class="btn btn-secondary" type="button" id="st-test">Run a self-test</button></div>
            <p class="fine" id="st-test-out" role="status"></p>
          </div>
        </section>
        <section class="set-card card">
          <div class="set-title"><h2>Data</h2><p>Back up this profile to a file, or restore one. ${me.locked ? 'Backups stay encrypted with your passcode.' : 'Without a passcode, anyone with the backup file can read it.'}</p></div>
          <div class="set-body">
            <div class="head-actions">
              <button class="btn btn-secondary" type="button" id="st-export">Export backup</button>
              <label class="btn btn-secondary" for="st-import">Restore a backup</label>
              <input class="visually-hidden" type="file" id="st-import" accept="application/json,.json">
            </div>
            <div class="head-actions">
              ${demoCount ? html`<button class="btn btn-ghost" type="button" id="st-undemo">Remove ${plural(demoCount, 'demo patient')}</button>` : html`<button class="btn btn-ghost" type="button" id="st-demo">Load demo patients</button>`}
              <button class="btn btn-ghost btn-danger" type="button" id="st-delete">${icon('trash')}Delete this profile</button>
            </div>
          </div>
        </section>
        <section class="set-card card">
          <div class="set-title"><h2>About</h2></div>
          <div class="set-body"><p class="muted">SkinScan AI is a research prototype, not a medical device. It has not been cleared by the FDA and it does not diagnose skin cancer. <a href="#/how">How it works</a>. <a href="https://github.com/WangZi621/SkinCancer-AI" rel="noopener">Source code on GitHub</a>.</p></div>
        </section>
      </div>`,
  );

  $('#st-profile', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await store.updateProfile({ name: String(fd.get('name')).trim(), role: fd.get('role'), org: String(fd.get('org') || '').trim() });
    toast('Profile saved');
  });
  $('#st-pass', el).addEventListener('click', async () => {
    const fd = await dialog({
      title: me.locked ? 'Change passcode' : 'Set a passcode',
      submit: me.locked ? 'Change passcode' : 'Set passcode',
      body: html`<p class="dlg-text">Every patient and scan in this profile will be encrypted on this device. If you forget the passcode, nobody can recover the data.</p>
        <label class="f"><span>New passcode</span><input name="a" type="password" minlength="4" required autocomplete="new-password"></label>
        <label class="f"><span>Repeat it</span><input name="b" type="password" required autocomplete="new-password"></label>`,
    });
    if (!fd) return;
    if (fd.get('a') !== fd.get('b')) return toast('The two passcodes were different, so nothing changed.', { tone: 'warn' });
    await store.setPasscode(String(fd.get('a')));
    toast('Passcode set. Your data is encrypted.');
    settings(el);
  });
  $('#st-nopass', el)?.addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Remove the passcode?', message: 'Your patients and scans will be stored without encryption, and anyone using this browser can open this profile.', confirm: 'Remove passcode' })) {
      await store.setPasscode('');
      toast('Passcode removed');
      settings(el);
    }
  });
  $('#st-autolock', el)?.addEventListener('change', async (e) => {
    await store.updateProfile({ settings: { autoLockMinutes: Number(e.target.value) } });
    toast('Auto-lock saved');
  });
  $('#st-test', el).addEventListener('click', async (e) => {
    const out = $('#st-test-out', el);
    const btn = e.currentTarget;
    btn.disabled = true;
    out.textContent = 'Running Sample 1 through the model…';
    try {
      const t = await app.selfTest();
      out.textContent = t.pass
        ? `Passed. Sample 1 (melanoma in situ) scored ${pct(t.probs[0])} melanoma and was flagged "Refer urgently", in ${(t.ms / 1000).toFixed(2)} s on this device.`
        : `Unexpected result: Sample 1 came back "${t.title}". The model may not have loaded correctly; reload the page and run the test again.`;
    } catch {
      out.textContent = 'The self-test could not run the model in this browser. Try a current version of Chrome, Edge, Safari or Firefox.';
    } finally {
      btn.disabled = false;
    }
  });
  $('#st-export', el).addEventListener('click', async () => {
    download(`skinscan-backup-${me.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${isoToday()}.json`, await store.exportBackup());
    toast('Backup downloaded');
  });
  $('#st-import', el).addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const p = await store.importBackup(await f.text());
      await app.refreshProfiles();
      toast(`Restored "${p.name}". Open it from Switch profile.`);
    } catch {
      toast('That file is not a SkinScan AI backup.', { tone: 'warn' });
    }
    e.target.value = '';
  });
  $('#st-demo', el)?.addEventListener('click', (e) => loadDemo(e.currentTarget));
  $('#st-undemo', el)?.addEventListener('click', async () => {
    for (const p of store.patients().filter((x) => x.demo)) await store.removePatient(p.id);
    toast('Demo patients removed');
    settings(el);
  });
  $('#st-delete', el).addEventListener('click', async () => {
    const fd = await dialog({
      title: 'Delete this profile?',
      danger: true,
      submit: 'Delete profile',
      body: html`<p class="dlg-text">This permanently removes ${me.name}'s profile, ${plural(store.patients().length, 'patient')} and ${plural(store.scans().length, 'scan')} from this device. Export a backup first if you might need them.</p>
        <label class="f"><span>Type DELETE to confirm</span><input name="c" required pattern="DELETE" autocomplete="off"></label>`,
    });
    if (!fd) return;
    await store.deleteProfile();
    await app.refreshProfiles();
    toast('Profile deleted');
    app.go('#/');
  });
}

// ---------------------------------------------------------------- demo data
/**
 * Demo patients built from the eight bundled samples. Every score comes from running the
 * model on this device now; the dates are spread over the last few months. Points are
 * fractions of the body figure (see bodymap.js).
 */
async function loadDemo(btn) {
  btn.disabled = true;
  const label = btn.textContent;
  try {
    const samples = await app.samples();
    const day = 86400000;
    const now = Date.now();
    const year = new Date().getFullYear();
    const plan = [
      { name: 'Demo patient A', ref: 'DEMO-01', birthYear: year - 65, sex: 'female', fitzpatrick: 2, risks: { sunburn: true, atypical: true }, lesions: [{ s: 0, label: 'Left cheek', pt: { view: 'front', u: 0.53, v: 0.085 }, scans: [{ daysAgo: 42, photoOnly: true }, { daysAgo: 2 }] }, { s: 5, label: 'Upper chest', pt: { view: 'front', u: 0.468, v: 0.23 }, scans: [{ daysAgo: 9 }] }] },
      { name: 'Demo patient B', ref: 'DEMO-02', birthYear: year - 30, sex: 'female', fitzpatrick: 3, risks: {}, lesions: [{ s: 1, label: 'Upper abdomen', pt: { view: 'front', u: 0.515, v: 0.335 }, scans: [{ daysAgo: 5 }], recheck: 75 }] },
      { name: 'Demo patient C', ref: 'DEMO-03', birthYear: year - 60, sex: 'female', fitzpatrick: null, risks: { family: true }, lesions: [{ s: 2, label: 'Left upper arm', pt: { view: 'front', u: 0.72, v: 0.31 }, scans: [{ daysAgo: 1 }] }, { s: 7, label: 'Left calf', pt: { view: 'back', u: 0.413, v: 0.803 }, scans: [{ daysAgo: 30 }], recheck: 10 }] },
      { name: 'Demo patient D', ref: 'DEMO-04', birthYear: year - 70, sex: 'male', fitzpatrick: 3, risks: { otherSkin: true }, lesions: [{ s: 4, label: 'Right forearm', pt: { view: 'front', u: 0.195, v: 0.369 }, scans: [{ daysAgo: 12 }] }, { s: 3, label: 'Right flank', pt: { view: 'back', u: 0.635, v: 0.37 }, scans: [{ daysAgo: 20 }], recheck: -2 }] },
    ];
    let k = 0;
    const total = plan.reduce((n, p) => n + p.lesions.reduce((m, l) => m + l.scans.length, 0), 0);
    for (const pp of plan) {
      const p = await store.save({ kind: 'patient', name: pp.name, ref: pp.ref, birthYear: pp.birthYear, sex: pp.sex, fitzpatrick: pp.fitzpatrick, risks: pp.risks, notes: 'Demo data built from biopsy-confirmed ISIC sample images.', demo: true });
      for (const ll of pp.lesions) {
        const sample = samples[ll.s];
        const l = await store.save({ kind: 'lesion', patientId: p.id, label: ll.label, site: sample.patient.site, point: { ...ll.pt, site: sample.patient.site }, recheckOn: ll.recheck !== undefined ? isoToday(ll.recheck) : null });
        for (const sc of ll.scans) {
          btn.textContent = `Running the model on sample ${++k} of ${total}…`;
          const details = sc.photoOnly ? { sex: 'unknown', melanocytic: 'unsure' } : { ...sample.patient, age: year - pp.birthYear, sex: pp.sex, fitzpatrick: pp.fitzpatrick ?? undefined };
          const res = await app.analyzeSample(sample, details);
          await store.save({ kind: 'scan', patientId: p.id, lesionId: l.id, ts: now - sc.daysAgo * day, ...res, sample: { id: sample.id, diagnosis: sample.diagnosis, index: ll.s + 1 }, notes: sc.photoOnly ? 'First look, photo only.' : '' });
        }
      }
    }
    toast('Demo patients loaded');
    app.go('#/home');
    app.rerender();
  } catch (err) {
    console.error(err);
    toast('The demo patients could not be loaded. Reload the page and try again.', { tone: 'warn' });
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function notFound(el, what) {
  render(el, html`<div class="empty"><h2>This ${what} is not on this device</h2><p>It may have been deleted, or it belongs to another profile.</p><a class="btn btn-secondary" href="#/home">Go to home</a></div>`);
}
