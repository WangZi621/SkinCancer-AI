// Small DOM helpers shared by the pages.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Tagged template that escapes every interpolated value unless it is wrapped in raw(). */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      if (v && v.__raw) out += v.html;
      else if (Array.isArray(v)) out += v.map((x) => (x && x.__raw ? x.html : esc(x))).join('');
      else out += esc(v);
    }
  });
  return { __raw: true, html: out };
}
export const raw = (s) => ({ __raw: true, html: String(s) });
export function render(el, tpl) {
  el.innerHTML = tpl.__raw ? tpl.html : esc(tpl);
  return el;
}

export const pct = (p, digits = 0) => `${(p * 100).toFixed(digits)}%`;

const DAY = 86400000;
export function fmtDate(ts, opts = {}) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...opts });
}
export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function ago(ts) {
  const d = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return fmtDate(ts);
}
export const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Days from today to an ISO date (negative when it has passed). */
export function daysUntil(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - startOfDay(Date.now())) / DAY);
}
export const isoToday = (plusDays = 0) => {
  const d = new Date(Date.now() + plusDays * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';

// Triage levels in the order they should be seen.
export const LEVELS = {
  urgent: { rank: 0, title: 'Refer urgently', short: 'Urgent' },
  soon: { rank: 1, title: 'Refer for review', short: 'Review' },
  routine: { rank: 2, title: 'Routine follow-up', short: 'Routine' },
};
export const levelBadge = (level) =>
  level ? html`<span class="badge" data-level="${level}">${LEVELS[level]?.title || level}</span>` : html`<span class="badge">No scan yet</span>`;

export const SITE_NAMES = {
  'head/neck': 'Head or neck',
  'anterior torso': 'Chest or abdomen',
  'posterior torso': 'Back',
  'lateral torso': 'Side of torso',
  'upper extremity': 'Arm',
  'lower extremity': 'Leg',
  'palms/soles': 'Palm or sole',
  'oral/genital': 'Mouth or genitals',
};
export const SEX_NAMES = { female: 'Female', male: 'Male', unknown: 'Sex not recorded' };
export const FITZ = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function ageFrom(patient) {
  return patient?.birthYear ? new Date().getFullYear() - patient.birthYear : undefined;
}
export function patientLine(p) {
  const bits = [];
  const age = ageFrom(p);
  if (Number.isFinite(age)) bits.push(`${age} years`);
  if (p.sex && p.sex !== 'unknown') bits.push(SEX_NAMES[p.sex]);
  if (p.fitzpatrick) bits.push(`Skin type ${FITZ[p.fitzpatrick - 1]}`);
  return bits.join(' · ') || 'No details recorded';
}

// ---------------------------------------------------------------- toast
let toastTimer;
export function toast(message, { tone = 'info', ms = 3200 } = {}) {
  const t = $('#toast');
  t.textContent = message;
  t.dataset.tone = tone;
  t.hidden = false;
  t.classList.remove('is-out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.add('is-out');
    setTimeout(() => (t.hidden = true), 250);
  }, ms);
}

// ---------------------------------------------------------------- dialogs
/**
 * Open the shared <dialog> with a form. `body` is an html`` template; the form's
 * submit resolves with FormData (or null when cancelled). `onOpen` can wire inputs.
 */
export function dialog({ title, body, submit = 'Save', danger = false, cancel = 'Cancel', onOpen } = {}) {
  const dlg = $('#dlg');
  render(
    dlg,
    html`<form method="dialog" class="dlg-form">
      <header class="dlg-head"><h2 id="dlg-title">${title}</h2><button class="icon-btn" value="cancel" formnovalidate aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
      <div class="dlg-body">${body}</div>
      <footer class="dlg-foot">
        <button class="btn btn-ghost" value="cancel" formnovalidate>${cancel}</button>
        <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" value="ok">${submit}</button>
      </footer>
    </form>`,
  );
  return new Promise((resolve) => {
    const form = $('form', dlg);
    let submitted = null;
    form.addEventListener('submit', (e) => {
      if (e.submitter?.value === 'ok') {
        if (!form.checkValidity()) {
          e.preventDefault();
          form.reportValidity();
          return;
        }
        submitted = new FormData(form);
      }
    });
    dlg.addEventListener('close', () => resolve(submitted), { once: true });
    dlg.showModal();
    if (onOpen) onOpen(dlg);
    const first = $('input:not([type=hidden]), select, textarea', dlg);
    if (first) first.focus();
  });
}

export async function confirmDialog({ title, message, confirm = 'Delete', danger = true }) {
  const r = await dialog({ title, body: html`<p class="dlg-text">${message}</p>`, submit: confirm, danger });
  return !!r;
}

/** Download a string as a file. */
export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** A canvas or bitmap as a JPEG data URL, scaled so its longer side is `max` px. */
export function toJpeg(source, max = 640, quality = 0.86) {
  const s = Math.min(1, max / Math.max(source.width, source.height));
  const c = document.createElement('canvas');
  c.width = Math.round(source.width * s);
  c.height = Math.round(source.height * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
