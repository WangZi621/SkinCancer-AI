// Score history for one lesion: the three model scores over time on one 0-100 % axis,
// with the melanoma cutoff as a reference line. Lines are 2 px, markers 8 px with a
// surface ring, each series has its own marker shape and a direct label, and a
// crosshair tooltip shows every score at the hovered scan.

import { MELANOMA_CUTOFF } from './model.js';
import { esc, fmtDate, pct } from './ui.js';

const SERIES = [
  { i: 0, key: 'mel', name: 'Melanoma', shape: 'circle' },
  { i: 1, key: 'ben', name: 'Benign', shape: 'square' },
  { i: 2, key: 'oth', name: 'Other skin cancer', shape: 'triangle' },
];

const marker = (shape, x, y, cls) => {
  if (shape === 'square') return `<rect class="${cls}" x="${x - 4.5}" y="${y - 4.5}" width="9" height="9" rx="1.5"/>`;
  if (shape === 'triangle') return `<path class="${cls}" d="M${x} ${y - 5.6}L${x + 5.4} ${y + 4}H${x - 5.4}Z"/>`;
  return `<circle class="${cls}" cx="${x}" cy="${y}" r="4.6"/>`;
};

/** Render into `host` (a .chart element). `scans` are sorted oldest first. */
export function scoreChart(host, scans) {
  const W = Math.max(320, Math.round(host.clientWidth || 640));
  const H = 260;
  const m = { l: 44, r: 128, t: 16, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const t0 = scans[0].ts;
  const t1 = scans.at(-1).ts;
  // Time-proportional when scans are days apart; evenly spaced when they are close together.
  const spanDays = (t1 - t0) / 86400000;
  const xAt = (s, k) => {
    if (scans.length === 1) return m.l + iw / 2;
    return spanDays >= 2 ? m.l + ((s.ts - t0) / (t1 - t0)) * iw : m.l + (k / (scans.length - 1)) * iw;
  };
  const yAt = (p) => m.t + (1 - p) * ih;

  let g = '';
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const y = yAt(v);
    g += `<line class="ch-grid" x1="${m.l}" x2="${m.l + iw}" y1="${y}" y2="${y}"/><text class="ch-tick" x="${m.l - 8}" y="${y + 4}" text-anchor="end">${v * 100}%</text>`;
  }
  const yc = yAt(MELANOMA_CUTOFF);
  g += `<line class="ch-cut" x1="${m.l}" x2="${m.l + iw}" y1="${yc}" y2="${yc}"/><text class="ch-cut-label" x="${m.l + iw + 8}" y="${yc + 4}">Cutoff ${pct(MELANOMA_CUTOFF, 1)}</text>`;

  // x labels: every scan when there are few, else the first and last
  scans.forEach((s, k) => {
    if (scans.length <= 6 || k === 0 || k === scans.length - 1) {
      const x = xAt(s, k);
      g += `<text class="ch-tick" x="${x}" y="${H - 10}" text-anchor="middle">${esc(fmtDate(s.ts, { year: undefined }))}</text>`;
    }
  });

  // series: lines, then markers on top, then direct labels at the last point
  const labels = [];
  for (const sr of SERIES) {
    const pts = scans.map((s, k) => [xAt(s, k), yAt(s.probs[sr.i])]);
    if (pts.length > 1) g += `<polyline class="ch-line ch-${sr.key}" points="${pts.map((p) => p.join(',')).join(' ')}"/>`;
    for (const [x, y] of pts) g += marker(sr.shape, x, y, `ch-dot ch-${sr.key}`);
    const last = scans.at(-1).probs[sr.i];
    labels.push({ sr, y: yAt(last), text: `${sr.name} ${pct(last)}` });
  }
  // keep direct labels from colliding: sort by y and push apart by 16 px
  labels.sort((a, b) => a.y - b.y);
  for (let k = 1; k < labels.length; k++) labels[k].y = Math.max(labels[k].y, labels[k - 1].y + 16);
  const lastX = xAt(scans.at(-1), scans.length - 1);
  for (const l of labels) {
    g += marker(l.sr.shape, lastX + 16, l.y, `ch-dot ch-${l.sr.key} ch-key`);
    g += `<text class="ch-label" x="${lastX + 26}" y="${l.y + 4}">${esc(l.text)}</text>`;
  }

  g += `<line class="ch-cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>`;
  g += `<rect class="ch-hit" x="${m.l - 10}" y="${m.t}" width="${iw + 20}" height="${ih}"/>`;

  const legend = SERIES.map(
    (s) => `<span class="ch-legend-item"><svg viewBox="-7 -7 14 14" aria-hidden="true">${marker(s.shape, 0, 0, `ch-dot ch-${s.key}`)}</svg>${s.name}</span>`,
  ).join('');
  host.innerHTML = `<div class="ch-legend">${legend}<span class="ch-legend-item"><i class="ch-cut-key"></i>Melanoma cutoff</span></div>
    <svg class="ch-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Scores at each of ${scans.length} scans">${g}</svg>
    <div class="ch-tip" hidden></div>`;

  // hover: snap to the nearest scan
  const svg = host.querySelector('.ch-svg');
  const tip = host.querySelector('.ch-tip');
  const cross = svg.querySelector('.ch-cross');
  const hit = svg.querySelector('.ch-hit');
  const xs = scans.map((s, k) => xAt(s, k));
  const show = (evt) => {
    const r = svg.getBoundingClientRect();
    const x = ((evt.clientX - r.left) / r.width) * W;
    let k = 0;
    xs.forEach((v, j) => {
      if (Math.abs(v - x) < Math.abs(xs[k] - x)) k = j;
    });
    const s = scans[k];
    cross.setAttribute('x1', xs[k]);
    cross.setAttribute('x2', xs[k]);
    cross.setAttribute('visibility', 'visible');
    tip.innerHTML = `<strong>${esc(fmtDate(s.ts))}</strong>${SERIES.map((sr) => `<span><svg viewBox="-7 -7 14 14" aria-hidden="true">${marker(sr.shape, 0, 0, `ch-dot ch-${sr.key}`)}</svg>${sr.name}<b>${pct(s.probs[sr.i])}</b></span>`).join('')}`;
    tip.hidden = false;
    const left = (xs[k] / W) * r.width;
    tip.style.left = `${Math.min(r.width - 200, Math.max(0, left + 12))}px`;
  };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerleave', () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
  });
}
