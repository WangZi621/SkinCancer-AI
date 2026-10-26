// The app's pages: sign-up, sign-in, home, patients, patient, lesion, all scans, report, settings.
// Every page renders from the on-device store (store.js) on each visit.

import * as store from './store.js';
import { CLASSES, MELANOMA_CUTOFF } from './model.js';
import { mountLesionMap } from './bodymap.js';
import { scoreChart } from './chart.js';
import {
  $, $$, html, raw, render, esc, pct, fmtDate, fmtDateTime, ago, daysUntil, isoToday, initials, LEVELS, levelBadge,
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
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.4a9.5 9.5 0 0 1 13 0M8.6 15.8a5 5 0 0 1 6.8 0"/><circle cx="12" cy="19.2" r="1"/>',
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
};
const icon = (k) => raw(`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`);
const avatar = (name, cls = '') => html`<span class="avatar ${cls}" aria-hidden="true">${initials(name)}</span>`;
const thumb = (src, alt = '') =>
  src ? html`<img class="thumb" src="${src}" alt="${alt}" loading="lazy">` : html`<span class="thumb thumb-empty">${icon('photo')}</span>`;

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
function itemHref(it) {
  return it.lesion ? `#/lesion/${it.lesion.id}` : `#/report/${it.scan.id}`;
}
function itemTitle(it) {
  if (it.patient && it.lesion) return `${it.patient.name} · ${lesionName(it.lesion)}`;
  if (it.patient) return it.patient.name;
  return it.scan.sample ? `Sample ${it.scan.sample.index || ''} (not linked to a patient)`.replace('  ', ' ') : 'Not linked to a patient';
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
    submit: existing ? 'Save' : 'Add patient',
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
      <label class="f"><span>Notes <small>optional</small></span><textarea name="notes" rows="3" maxlength="2000">${p.notes || ''}</textarea></label>
      <p class="dlg-fine">${icon('shield')} Saved only in this browser${store.current()?.locked ? ', encrypted with your passcode' : ''}.</p>`,
  });
  if (!fd) return null;
  const by = Number(fd.get('birthYear'));
  const fz = Number(fd.get('fitzpatrick'));
  const saved = await store.save({
    ...p,
    kind: 'patient',
    name: String(fd.get('name')).trim(),
    ref: String(fd.get('ref') || '').trim(),
    birthYear: by >= 1900 ? by : null,
    sex: fd.get('sex') || 'unknown',
    fitzpatrick: fz >= 1 && fz <= 6 ? fz : null,
    notes: String(fd.get('notes') || '').trim(),
  });
  toast(existing ? 'Patient updated' : `${saved.name} added`);
  return saved;
}

async function editLesion(lesion) {
  const fd = await dialog({
    title: lesion.id ? 'Edit lesion' : 'New lesion',
    submit: 'Save',
    body: html`
      <label class="f"><span>Label</span><input name="label" maxlength="60" value="${lesion.label || ''}" placeholder="For example: left forearm, below the elbow"></label>
      <label class="f"><span>Body site</span>
        <select name="site">${Object.entries(SITE_NAMES).map(([v, n]) => html`<option value="${v}" ${raw(lesion.site === v ? 'selected' : '')}>${n}</option>`)}</select>
      </label>`,
  });
  if (!fd) return null;
  return store.save({ ...lesion, kind: 'lesion', label: String(fd.get('label') || '').trim(), site: fd.get('site') });
}

// ---------------------------------------------------------------- welcome / sign-up
export async function welcome(el, r) {
  const profiles = await store.listProfiles();
  const step = r.params.get('step') === 'create' || r.params.has('new') ? 'create' : 'intro';
  const pending = app.pendingSave();
  const points = [
    ['shield', 'Runs on this device', 'Photos and patient details never leave it, and it keeps working offline.'],
    ['people', 'Patients and lesions', 'Track each lesion on a body map and see how its scores change over time.'],
    ['photo', 'Photo check', 'Blur, exposure and resolution are checked before the model runs.'],
    ['doc', 'Referral reports', 'A one-page report with the photo, scores and your notes, ready to print.'],
  ];
  render(
    el,
    html`<div class="welcome">
      <div class="welcome-art" aria-hidden="true">
        <div class="w-scope"><img src="samples/ISIC_5700648.jpg" alt=""><svg viewBox="0 0 400 400"><circle class="w-track" cx="200" cy="200" r="196"/><circle class="w-arc" cx="200" cy="200" r="196" pathLength="100"/></svg></div>
        <div class="w-chip w-chip-a"><i data-level="urgent"></i>Refer urgently</div>
        <div class="w-chip w-chip-b"><i data-level="routine"></i>Routine follow-up</div>
      </div>
      <div class="welcome-card">
        ${step === 'intro'
          ? html`<svg class="w-logo" aria-hidden="true"><use href="#logo"/></svg>
            <h1>Skin lesion triage that runs on your device</h1>
            <p class="lead">SkinScan AI reads a dermoscopic photo and the patient's details together and suggests how soon to refer. It is a research prototype and does not diagnose.</p>
            <ul class="w-points">${points.map(([i, t, d]) => html`<li>${icon(i)}<div><strong>${t}</strong><span>${d}</span></div></li>`)}</ul>
            <div class="w-actions">
              <a class="btn btn-primary btn-lg" href="#/welcome?step=create">Create a profile</a>
              <a class="btn btn-secondary btn-lg" href="#/scan">Try a scan first</a>
            </div>
            ${profiles.length ? html`<p class="w-alt">Already have a profile on this device? <a href="#/signin">Sign in</a></p>` : ''}`
          : html`<a class="w-back" href="${profiles.length && r.params.has('new') ? '#/signin' : '#/welcome'}">${icon('back')}Back</a>
            <h1>Create your profile</h1>
            <p class="lead">${pending ? 'Your scan will be saved to this profile. ' : ''}Your profile and everything you save stay in this browser. Add a passcode to encrypt them on this device.</p>
            <form class="w-form" id="signup-form" novalidate>
              <label class="f"><span>Your name</span><input name="name" required maxlength="60" autocomplete="name" placeholder="Jason Xiao"></label>
              <div class="f-row">
                <label class="f"><span>Role</span>
                  <select name="role">${['Clinician', 'Nurse', 'Medical student', 'Researcher', 'Other'].map((x) => html`<option>${x}</option>`)}</select>
                </label>
                <label class="f"><span>Clinic or school <small>optional</small></span><input name="org" maxlength="80" autocomplete="organization"></label>
              </div>
              <div class="f-row">
                <label class="f"><span>Passcode <small>optional, 4+ characters</small></span><input name="passcode" type="password" minlength="4" maxlength="64" autocomplete="new-password"></label>
                <label class="f"><span>Repeat passcode</span><input name="passcode2" type="password" maxlength="64" autocomplete="new-password"></label>
              </div>
              <label class="check check-block"><input type="checkbox" name="ack" required><span>I understand SkinScan AI is a research prototype, not a medical device, and that it does not diagnose.</span></label>
              <p class="f-error" id="signup-error" role="alert" hidden></p>
              <button class="btn btn-primary btn-lg" type="submit">Create profile</button>
            </form>`}
      </div>
    </div>`,
  );
  const form = $('#signup-form', el);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#signup-error', el);
    const fd = new FormData(form);
    const pass = String(fd.get('passcode') || '');
    const problems = [];
    if (!String(fd.get('name') || '').trim()) problems.push('Enter your name.');
    if (pass && pass.length < 4) problems.push('The passcode needs at least 4 characters.');
    if (pass !== String(fd.get('passcode2') || '')) problems.push('The two passcodes do not match.');
    if (!fd.get('ack')) problems.push('Please confirm you understand what SkinScan AI is.');
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
      if (pending) app.go('#/scan?resume=save');
      else app.go('#/home');
    } catch (ex) {
      console.error(ex);
      err.textContent = 'This browser could not create the profile. Private browsing can block on-device storage.';
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
    html`<div class="signin">
      <svg class="w-logo" aria-hidden="true"><use href="#logo"/></svg>
      <h1>Who's scanning?</h1>
      <p class="lead">Profiles on this device. Each keeps its own patients and scans.</p>
      <ul class="profile-list">
        ${profiles.map(
          (p) => html`<li>
            <button class="profile-card" type="button" data-id="${p.id}" data-locked="${p.locked ? '1' : ''}">
              ${avatar(p.name, 'avatar-lg')}
              <span class="pc-main"><strong>${p.name}</strong><span>${[p.role, p.org].filter(Boolean).join(' · ') || 'Profile'}</span></span>
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
      <p class="w-alt"><a href="#/welcome?new=1">Create another profile</a><span aria-hidden="true"> · </span><a href="#/scan">Scan without signing in</a></p>
    </div>`,
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
        errEl.textContent = 'That passcode is not right.';
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
  const month = scans.filter((s) => s.ts > Date.now() - 30 * 86400000).length;
  const queue = queueItems();
  const waiting = queue.filter((it) => it.scan.level !== 'routine').length;
  const rechecks = lesions
    .filter((l) => l.recheckOn)
    .map((l) => ({ l, days: daysUntil(l.recheckOn), p: store.get(l.patientId) }))
    .filter((x) => x.days <= 30)
    .sort((a, b) => a.days - b.days);
  const groups = ['urgent', 'soon', 'routine'].map((lv) => ({ lv, items: queue.filter((it) => it.scan.level === lv) }));

  const queueRow = (it) => html`<li><a class="q-row" href="${itemHref(it)}">
      ${thumb(it.scan.thumb)}
      <span class="q-main"><strong>${itemTitle(it)}</strong><span>${it.lesion ? lesionWhere(it.lesion) : it.scan.finding} · ${ago(it.scan.ts)}</span></span>
      <span class="q-score" title="Melanoma score"><span class="q-bar"><i style="width:${Math.max(2, it.scan.probs[0] * 100)}%"></i><b style="left:${MELANOMA_CUTOFF * 100}%"></b></span>${pct(it.scan.probs[0])}</span>
      ${icon('chev')}
    </a></li>`;

  render(
    el,
    html`<div class="page-head page-head-row">
        <div><p class="eyebrow">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${me.org ? ` · ${me.org}` : ''}</p>
        <h1>${greet}, ${me.name.split(' ')[0]}</h1></div>
        <div class="head-actions">
          <button class="btn btn-secondary" type="button" id="h-add">${icon('plus')}Add patient</button>
          <a class="btn btn-primary" href="#/scan">${icon('scan')}New scan</a>
        </div>
      </div>
      <ul class="stats">
        <li><span>Patients</span><strong>${pts.length}</strong></li>
        <li><span>Lesions tracked</span><strong>${lesions.length}</strong></li>
        <li><span>Scans, last 30 days</span><strong>${month}</strong></li>
        <li><span>Waiting for referral</span><strong>${waiting}</strong></li>
      </ul>
      ${scans.length === 0
        ? html`<div class="card onboard">
            <h2>Start with a patient</h2>
            <ol class="steps">
              <li><strong>Add a patient.</strong> Age, sex and skin type fill in on every scan for them.</li>
              <li><strong>Scan a lesion.</strong> Tap where it is on the body map; the photo check runs before the model.</li>
              <li><strong>Follow it over time.</strong> Rescan it later and compare the scores and photos side by side.</li>
            </ol>
            <div class="head-actions">
              <button class="btn btn-primary" type="button" id="h-add2">${icon('plus')}Add a patient</button>
              <button class="btn btn-secondary" type="button" id="h-demo">Load demo patients</button>
            </div>
            <p class="fine">Demo patients use the eight biopsy-confirmed sample images and real results from the model on this device. They are marked as demo data and can be removed in Settings.</p>
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
                      (x) => html`<li><a href="#/lesion/${x.l.id}">${icon('calendar')}<span><strong>${x.p?.name || ''} · ${lesionName(x.l)}</strong><span class="${x.days < 0 ? 'due-late' : x.days <= 7 ? 'due-soon' : ''}">${x.days < 0 ? `Overdue by ${-x.days} day${x.days === -1 ? '' : 's'}` : x.days === 0 ? 'Due today' : `Due in ${x.days} day${x.days === 1 ? '' : 's'}`} · ${fmtDate(new Date(x.l.recheckOn + 'T12:00').getTime())}</span></span></a></li>`,
                    )}</ul>`
                  : html`<p class="card-sub">No rechecks in the next 30 days. Set one from a lesion's page.</p>`}
              </section>
              <section class="card">
                <header class="card-head"><h2>Recent scans</h2></header>
                <ul class="r-list">${scans.slice(0, 5).map((s) => {
                  const l = s.lesionId ? store.get(s.lesionId) : null;
                  const p = s.patientId ? store.get(s.patientId) : null;
                  return html`<li><a href="${l ? `#/lesion/${l.id}` : `#/report/${s.id}`}">${thumb(s.thumb)}<span><strong>${p ? p.name : 'Not linked to a patient'}</strong><span>${fmtDateTime(s.ts)}</span></span>${levelBadge(s.level)}</a></li>`;
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
        <div><h1>Patients</h1><p>${all.length} on this device${store.current().locked ? ', encrypted' : ''}.</p></div>
        <div class="head-actions"><button class="btn btn-primary" type="button" id="p-add">${icon('plus')}Add patient</button></div>
      </div>
      ${all.length
        ? html`<div class="toolbar"><label class="search">${raw('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>')}<span class="visually-hidden">Search patients</span><input id="p-q" type="search" placeholder="Search by name or ID" value="${r.params.get('q') || ''}"></label></div>
          <ul class="rows">${list.map((p) => {
            const ls = store.lesionsOf(p.id);
            const scans = store.all('scan').filter((s) => s.patientId === p.id);
            const last = scans.sort((a, b) => b.ts - a.ts)[0];
            return html`<li><a class="row" href="#/patient/${p.id}">
              ${avatar(p.name)}
              <span class="row-main"><strong>${p.name}${p.demo ? raw(' <em class="tag">Demo</em>') : ''}</strong><span>${[p.ref, patientLine(p)].filter(Boolean).join(' · ')}</span></span>
              <span class="row-meta">${ls.length} lesion${ls.length === 1 ? '' : 's'}${last ? ` · ${ago(last.ts)}` : ''}</span>
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
  const marks = ls.map((l, i) => ({ id: l.id, n: i + 1, point: l.point, site: l.site, level: store.latestScan(l.id)?.level }));
  render(
    el,
    html`<nav class="crumbs" aria-label="Breadcrumb"><a href="#/patients">Patients</a>${icon('chev')}<span>${p.name}</span></nav>
      <div class="page-head page-head-row">
        <div class="ph-person">${avatar(p.name, 'avatar-lg')}<div><h1>${p.name}${p.demo ? raw(' <em class="tag">Demo</em>') : ''}</h1><p>${[p.ref, patientLine(p)].filter(Boolean).join(' · ')}</p></div></div>
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
          <p class="card-sub" id="pt-pick-hint" hidden>Tap where the lesion is on the front or back view.</p>
        </section>
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
                    <span class="lc-main"><strong>${lesionName(l)}</strong><span>${lesionWhere(l)} · ${sc.length} scan${sc.length === 1 ? '' : 's'}${last ? ` · ${ago(last.ts)}` : ''}</span>
                      ${l.recheckOn ? html`<span class="lc-recheck">${icon('calendar')}Recheck ${fmtDate(new Date(l.recheckOn + 'T12:00').getTime())}</span>` : ''}</span>
                    ${levelBadge(last?.level)}
                  </a>
                  <a class="btn btn-secondary btn-sm" href="#/scan?patient=${p.id}&lesion=${l.id}">Rescan</a>
                </li>`;
              })}</ul>`
            : html`<div class="empty empty-sm"><p>No lesions yet. Mark one on the body map, or scan a new lesion.</p></div>`}
          ${loose.length
            ? html`<h2 class="section-title">Other scans <span>${loose.length}</span></h2><ul class="r-list card">${loose.map((s) => html`<li><a href="#/report/${s.id}">${thumb(s.thumb)}<span><strong>${s.finding}</strong><span>${fmtDateTime(s.ts)}</span></span>${levelBadge(s.level)}</a></li>`)}</ul>`
            : ''}
          ${p.notes ? html`<h2 class="section-title">Notes</h2><p class="card notes">${p.notes}</p>` : ''}
        </section>
      </div>`,
  );
  const map = mountLesionMap($('#pt-map', el), {
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
  $('#pt-edit', el).addEventListener('click', async () => {
    if (await editPatient(p)) patient(el, r);
  });
  $('#pt-del', el).addEventListener('click', async () => {
    const n = store.all('scan').filter((s) => s.patientId === p.id).length;
    if (await confirmDialog({ title: `Delete ${p.name}?`, message: `This removes the patient, ${ls.length} lesion${ls.length === 1 ? '' : 's'} and ${n} scan${n === 1 ? '' : 's'} from this device. It cannot be undone.` })) {
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

  render(
    el,
    html`<nav class="crumbs" aria-label="Breadcrumb"><a href="#/patients">Patients</a>${icon('chev')}<a href="#/patient/${p.id}">${p.name}</a>${icon('chev')}<span>${lesionName(l)}</span></nav>
      <div class="page-head page-head-row">
        <div class="ph-person"><span class="lc-n lc-n-lg" data-level="${last?.level || ''}">${n}</span><div><h1>${lesionName(l)}</h1><p>${lesionWhere(l)} · ${p.name} · ${sc.length} scan${sc.length === 1 ? '' : 's'}</p></div></div>
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
              <p class="card-sub">${due === null ? 'No recheck set.' : due < 0 ? `Overdue by ${-due} day${due === -1 ? '' : 's'}.` : due === 0 ? 'Due today.' : `Due in ${due} day${due === 1 ? '' : 's'}.`}</p>
              <div class="recheck-row"><label class="visually-hidden" for="ls-date">Recheck date</label><input id="ls-date" type="date" value="${l.recheckOn || ''}" min="${isoToday()}">
              <button class="btn btn-secondary" type="submit">Save</button></div>
              <div class="chips">${[30, 90, 180].map((d) => html`<button type="button" class="chip" data-days="${d}">In ${d === 30 ? '1 month' : d === 90 ? '3 months' : '6 months'}</button>`)}</div>
            </form>
          </div>
          <section class="card">
            <header class="card-head"><h2>Scores over time</h2>${delta !== null ? html`<span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">Melanoma ${pct(first.probs[0])} to ${pct(last.probs[0])} (${delta > 0 ? '+' : ''}${delta} points)</span>` : ''}</header>
            ${sc.length === 1 ? html`<p class="card-sub">One scan so far. Rescan this lesion later to see how its scores change.</p>` : ''}
            <div class="chart" id="ls-chart"></div>
          </section>
          ${sc.length > 1
            ? html`<section class="card">
                <header class="card-head"><h2>Compare photos</h2>
                  <div class="cmp-pick"><label>Before <select id="cmp-a">${sc.map((s, i) => html`<option value="${i}" ${raw(i === 0 ? 'selected' : '')}>${fmtDate(s.ts)}</option>`)}</select></label>
                  <label>After <select id="cmp-b">${sc.map((s, i) => html`<option value="${i}" ${raw(i === sc.length - 1 ? 'selected' : '')}>${fmtDate(s.ts)}</option>`)}</select></label></div>
                </header>
                <div class="compare" id="cmp"><img class="cmp-a" alt=""><div class="cmp-b-wrap"><img class="cmp-b" alt=""></div><i class="cmp-line"></i>
                  <input class="cmp-range" type="range" min="0" max="100" value="50" aria-label="Drag to compare the two photos"></div>
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
      render($('#cmp-ca', el), html`${fmtDate(a.ts)} · ${LEVELS[a.level].title} · melanoma ${pct(a.probs[0])}`);
      render($('#cmp-cb', el), html`${fmtDate(b.ts)} · ${LEVELS[b.level].title} · melanoma ${pct(b.probs[0])}`);
    };
    const range = $('.cmp-range', cmp);
    const setSplit = () => cmp.style.setProperty('--split', `${range.value}%`);
    range.addEventListener('input', setSplit);
    $('#cmp-a', el).addEventListener('change', setPair);
    $('#cmp-b', el).addEventListener('change', setPair);
    setPair();
    setSplit();
  }
  const form = $('#ls-recheck', el);
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await store.save({ ...l, recheckOn: $('#ls-date', el).value || null });
      toast($('#ls-date', el).value ? 'Recheck saved' : 'Recheck cleared');
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
    if (await confirmDialog({ title: `Delete ${lesionName(l)}?`, message: `This removes the lesion and its ${sc.length} scan${sc.length === 1 ? '' : 's'} from this device.` })) {
      await store.removeLesion(l.id);
      toast('Lesion deleted');
      app.go(`#/patient/${p.id}`);
    }
  });
  for (const b of $$('.tl-del', el)) {
    b.addEventListener('click', async () => {
      if (await confirmDialog({ title: 'Delete this scan?', message: 'The photo, scores and notes of this scan are removed from this device.' })) {
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
  const names = { a: 'asymmetry', b: 'irregular border', c: 'varied colour', d: 'diameter over 6 mm', e: 'evolving' };
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
        <div><h1>Scans</h1><p>${all.length} saved on this device.</p></div>
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
                <td>${l ? html`<a href="#/lesion/${l.id}">${p?.name} · ${lesionName(l)}</a>` : p ? html`<a href="#/patient/${p.id}">${p.name}</a>` : html`<span class="muted">Not linked to a patient</span>`}<div class="muted small">${s.finding}</div></td>
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

// ---------------------------------------------------------------- report
export function report(el, r) {
  const s = r.id === 'current' ? app.currentScan() : store.get(r.id);
  if (!s || s.kind !== 'scan') return notFound(el, 'scan');
  const p = s.patientId ? store.get(s.patientId) : null;
  const l = s.lesionId ? store.get(s.lesionId) : null;
  const me = store.current();
  const hist = l ? store.scansOf(l.id) : [];
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
          <div class="rd-by">${me ? html`<strong>${me.name}</strong><span>${[me.role, me.org].filter(Boolean).join(' · ')}</span>` : html`<span>Not signed in</span>`}</div>
        </header>
        <section class="rd-grid">
          <div class="rd-photo"><div class="rd-scope" data-level="${s.level}"><img src="${s.image || s.thumb}" alt="Lesion photo">${s.heat ? html`<img class="rd-heat" src="${s.heat}" alt="">` : ''}</div>
            ${s.heat ? html`<p class="rd-cap">Highlighted: the parts of the photo that, when covered, lowered the top score the most.</p>` : ''}</div>
          <div class="rd-main">
            <dl class="rd-facts">
              <div><dt>Patient</dt><dd>${p ? `${p.name}${p.ref ? ` (${p.ref})` : ''}` : 'Not linked to a patient'}</dd></div>
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
          <div><h3>Notes</h3><p>${s.notes || 'None'}</p></div>
        </section>
        ${hist.length > 1
          ? html`<section class="rd-hist"><h3>History of this lesion</h3><table class="table"><thead><tr><th>Date</th><th>Result</th><th class="num">Melanoma</th><th class="num">Benign</th><th class="num">Other</th></tr></thead>
            <tbody>${hist.map((h) => html`<tr class="${h.id === s.id ? 'is-this' : ''}"><td>${fmtDate(h.ts)}</td><td>${h.title}</td><td class="num">${pct(h.probs[0])}</td><td class="num">${pct(h.probs[1])}</td><td class="num">${pct(h.probs[2])}</td></tr>`)}</tbody></table></section>`
          : ''}
        <footer class="rd-foot">SkinScan AI is a research prototype, not a medical device, and is not FDA-cleared. It does not diagnose skin cancer; this report supports, and does not replace, clinical judgment. Model: SkinScan v3 (EfficientNet-B4 image branch, 17 patient features), run on this device with ONNX Runtime Web${s.sample ? `. Sample image ${s.sample.id}, biopsy result: ${s.sample.diagnosis}` : ''}.</footer>
      </article>`,
  );
  $('#rp-print', el).addEventListener('click', () => {
    const area = $('#print-area');
    area.innerHTML = $('#report-doc', el).outerHTML;
    window.print();
  });
}

// ---------------------------------------------------------------- settings
export async function settings(el) {
  const me = store.current();
  const theme = (() => {
    try {
      return localStorage.getItem('skinscan.theme') || 'system';
    } catch {
      return 'system';
    }
  })();
  const st = await app.modelStatus();
  const demoCount = store.patients().filter((p) => p.demo).length;
  render(
    el,
    html`<div class="page-head"><h1>Settings</h1><p>${me.name}${me.org ? ` · ${me.org}` : ''}</p></div>
      <div class="settings">
        <section class="set-card card">
          <div class="set-title"><h2>Profile</h2><p>Shown on your referral reports.</p></div>
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
          <div class="set-title"><h2>Security</h2><p>${me.locked ? 'Your patients and scans are encrypted on this device with your passcode (AES-GCM, key from PBKDF2).' : 'Without a passcode, anyone using this browser can open this profile.'}</p></div>
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
          <div class="set-title"><h2>Appearance</h2></div>
          <div class="set-body"><div class="seg seg-fit" id="st-theme">${['system', 'light', 'dark'].map((t) => html`<label><input type="radio" name="theme" value="${t}" ${raw(theme === t ? 'checked' : '')}><span>${t === 'system' ? 'Match device' : t[0].toUpperCase() + t.slice(1)}</span></label>`)}</div></div>
        </section>
        <section class="set-card card">
          <div class="set-title"><h2>Model and offline use</h2><p>Every scan runs in this browser. Nothing is uploaded.</p></div>
          <div class="set-body">
            <dl class="kv">
              <div><dt>Model</dt><dd>SkinScan v3: EfficientNet-B4 image branch and a 17-feature patient branch</dd></div>
              <div><dt>File</dt><dd>skinscan-v3.onnx, 21 MB</dd></div>
              <div><dt>Runtime</dt><dd>ONNX Runtime Web, WebAssembly, ${st.threads} thread${st.threads === 1 ? '' : 's'}</dd></div>
              <div><dt>Status</dt><dd>${st.ready ? 'Loaded' : 'Not loaded yet'}</dd></div>
              <div><dt>Offline</dt><dd class="${st.offline ? 'ok' : ''}">${st.offline ? 'Ready: the app and model are cached on this device' : 'Not cached yet. Open the app once over HTTPS to cache it.'}</dd></div>
            </dl>
            <div class="head-actions"><button class="btn btn-secondary" type="button" id="st-test">Run a self-test</button></div>
            <p class="fine" id="st-test-out" role="status"></p>
          </div>
        </section>
        <section class="set-card card">
          <div class="set-title"><h2>Data</h2><p>Back up this profile to a file, or restore one. ${me.locked ? 'Backups stay encrypted with your passcode.' : 'Without a passcode, the backup file is readable by anyone who has it.'}</p></div>
          <div class="set-body">
            <div class="head-actions">
              <button class="btn btn-secondary" type="button" id="st-export">Export backup</button>
              <label class="btn btn-secondary" for="st-import">Restore a backup</label>
              <input class="visually-hidden" type="file" id="st-import" accept="application/json,.json">
            </div>
            <div class="head-actions">
              ${demoCount ? html`<button class="btn btn-ghost" type="button" id="st-undemo">Remove ${demoCount} demo patient${demoCount === 1 ? '' : 's'}</button>` : html`<button class="btn btn-ghost" type="button" id="st-demo">Load demo patients</button>`}
              <button class="btn btn-ghost btn-danger" type="button" id="st-delete">${icon('trash')}Delete this profile</button>
            </div>
          </div>
        </section>
        <section class="set-card card">
          <div class="set-title"><h2>About</h2></div>
          <div class="set-body"><p class="muted">SkinScan AI is a research prototype, not a medical device. It has not been cleared by the FDA and it does not diagnose skin cancer. <a href="#/how">How it works</a> · <a href="https://github.com/WangZi621/SkinCancer-AI" rel="noopener">Source on GitHub</a></p></div>
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
      body: html`<p class="dlg-text">Every patient and scan in this profile will be encrypted on this device. If you forget the passcode, the data cannot be recovered.</p>
        <label class="f"><span>New passcode</span><input name="a" type="password" minlength="4" required autocomplete="new-password"></label>
        <label class="f"><span>Repeat it</span><input name="b" type="password" required autocomplete="new-password"></label>`,
    });
    if (!fd) return;
    if (fd.get('a') !== fd.get('b')) return toast('The passcodes did not match. Nothing changed.', { tone: 'warn' });
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
    toast('Saved');
  });
  for (const r of $$('#st-theme input', el)) r.addEventListener('change', () => app.setTheme(r.value));
  $('#st-test', el).addEventListener('click', async (e) => {
    const out = $('#st-test-out', el);
    e.currentTarget.disabled = true;
    out.textContent = 'Running Sample 1 through the model…';
    try {
      const t = await app.selfTest();
      out.textContent = t.pass
        ? `Passed: Sample 1 (melanoma in situ) scored ${pct(t.probs[0])} melanoma and was flagged "Refer urgently", in ${(t.ms / 1000).toFixed(2)} s on this device.`
        : `Unexpected result: Sample 1 was "${t.title}". The model may not have loaded correctly.`;
    } catch (ex) {
      out.textContent = 'The self-test could not run the model in this browser.';
    } finally {
      e.currentTarget.disabled = false;
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
      toast(`Restored "${p.name}". Sign in to it from Switch profile.`);
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
      body: html`<p class="dlg-text">This permanently removes ${me.name}'s profile, ${store.patients().length} patients and ${store.scans().length} scans from this device. Export a backup first if you might need them.</p>
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
 * model on this device now; the dates are spread over the last few months.
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
      { name: 'Demo patient A', ref: 'DEMO-01', birthYear: year - 65, sex: 'female', fitzpatrick: 2, lesions: [{ s: 0, label: 'Left cheek', pt: { view: 'front', x: 63, y: 24 }, scans: [{ daysAgo: 42, photoOnly: true }, { daysAgo: 2 }] }, { s: 5, label: 'Upper chest', pt: { view: 'front', x: 56, y: 57 }, scans: [{ daysAgo: 9 }] }] },
      { name: 'Demo patient B', ref: 'DEMO-02', birthYear: year - 30, sex: 'female', fitzpatrick: 3, lesions: [{ s: 1, label: 'Upper abdomen', pt: { view: 'front', x: 61, y: 80 }, scans: [{ daysAgo: 5 }], recheck: 75 }] },
      { name: 'Demo patient C', ref: 'DEMO-03', birthYear: year - 60, sex: 'female', fitzpatrick: null, lesions: [{ s: 2, label: 'Left upper arm', pt: { view: 'front', x: 87.5, y: 70 }, scans: [{ daysAgo: 1 }] }, { s: 7, label: 'Left calf', pt: { view: 'back', x: 154, y: 170 }, scans: [{ daysAgo: 30 }], recheck: 10 }] },
      { name: 'Demo patient D', ref: 'DEMO-04', birthYear: year - 70, sex: 'male', fitzpatrick: 3, lesions: [{ s: 4, label: 'Right forearm', pt: { view: 'front', x: 25, y: 94 }, scans: [{ daysAgo: 12 }] }, { s: 3, label: 'Right flank', pt: { view: 'back', x: 179, y: 85 }, scans: [{ daysAgo: 20 }], recheck: -2 }] },
    ];
    let k = 0;
    const total = plan.reduce((n, p) => n + p.lesions.reduce((m, l) => m + l.scans.length, 0), 0);
    for (const pp of plan) {
      const p = await store.save({ kind: 'patient', name: pp.name, ref: pp.ref, birthYear: pp.birthYear, sex: pp.sex, fitzpatrick: pp.fitzpatrick, notes: 'Demo data built from biopsy-confirmed ISIC sample images.', demo: true });
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
    toast('Could not load the demo patients.', { tone: 'warn' });
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function notFound(el, what) {
  render(el, html`<div class="empty"><h2>This ${what} is not on this device</h2><p>It may have been deleted, or it belongs to another profile.</p><a class="btn btn-secondary" href="#/home">Go home</a></div>`);
}
