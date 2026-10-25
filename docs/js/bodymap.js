// Front and back body chart. The outline is a smooth Catmull-Rom spline through
// anatomical landmarks; each of the eight ISIC body sites is the outline clipped to
// a band, so regions follow the body's real edges. The <select> beside the chart is
// the accessible control, and the chart stays in sync with it.

// Right half of the trunk and legs, top to bottom (x, y). The left half is mirrored.
const BODY_RIGHT = [
  [54.4, 26.5], [55.4, 34.2], [62.4, 37.2], [67.6, 40.6], [66.6, 47], [65.4, 54], [64.6, 64],
  [61.6, 80], [63.6, 92], [65, 104], [63.8, 128], [60.8, 152], [61.4, 172], [57.6, 198],
  [59.6, 207], [56.6, 212], [51.8, 211.4], [52.6, 199], [53.2, 176], [52.9, 156], [52.2, 128], [50, 111],
];
// Right arm, as a closed loop starting at the top of the shoulder.
const ARM_RIGHT = [
  [65.5, 39], [71.4, 42.2], [74.2, 54], [75.6, 79], [77.6, 99], [78.8, 115], [81, 125.5],
  [78.8, 134], [74.6, 131.5], [73.6, 117], [71.2, 100], [69.6, 82], [67.6, 63], [65.4, 52],
];

function smooth(points, closed = true) {
  const p = points;
  const n = p.length;
  const at = (i) => p[(i + n) % n];
  let d = `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = closed ? at(i - 1) : p[Math.max(i - 1, 0)];
    const p1 = at(i);
    const p2 = closed ? at(i + 1) : p[Math.min(i + 1, n - 1)];
    const p3 = closed ? at(i + 2) : p[Math.min(i + 2, n - 1)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + (closed ? 'Z' : '');
}

const mirror = (pts) => pts.map(([x, y]) => [100 - x, y]);
const BODY = smooth([...BODY_RIGHT, ...mirror(BODY_RIGHT).reverse().slice(1)]);
const ARM_R = smooth(ARM_RIGHT);
const ARM_L = smooth(mirror(ARM_RIGHT));
const HEAD = 'M50 4.2c5.6 0 9.6 4.6 9.6 11.2 0 6.9-4.3 12.6-9.6 12.6s-9.6-5.7-9.6-12.6C40.4 8.8 44.4 4.2 50 4.2Z';

// Bands that cut the outline into ISIC body sites.
function regions(view) {
  const torso = view === 'front' ? 'anterior torso' : 'posterior torso';
  const r = [
    { site: 'head/neck', clip: 'all', shape: '<rect x="0" y="0" width="100" height="36.5"/>' },
    { site: torso, clip: 'body', shape: '<rect x="40.5" y="36.5" width="19" height="70"/>' },
    { site: 'lateral torso', clip: 'body', shape: '<rect x="0" y="46" width="40.5" height="58"/><rect x="59.5" y="46" width="40.5" height="58"/>' },
    { site: torso, clip: 'body', shape: '<rect x="0" y="36.5" width="40.5" height="9.5"/><rect x="59.5" y="36.5" width="40.5" height="9.5"/><rect x="0" y="104" width="40.5" height="2.5"/><rect x="59.5" y="104" width="40.5" height="2.5"/>' },
    { site: 'lower extremity', clip: 'body', shape: '<rect x="0" y="106.5" width="100" height="93"/>' },
    { site: 'palms/soles', clip: 'body', shape: '<rect x="0" y="199.5" width="100" height="20"/>' },
    { site: 'upper extremity', clip: 'arms', shape: '<rect x="0" y="0" width="100" height="117"/>' },
    { site: 'palms/soles', clip: 'arms', shape: '<rect x="0" y="117" width="100" height="30"/>' },
  ];
  if (view === 'front') {
    r.push({ site: 'oral/genital', clip: 'body', shape: '<path d="M44.5 102 Q50 105.5 55.5 102 L52.6 113.5 Q50 116 47.4 113.5 Z"/>' });
  }
  return r;
}

function figure(view, dx, uid) {
  const clips = `
    <clipPath id="${uid}-body"><path d="${BODY}"/></clipPath>
    <clipPath id="${uid}-arms"><path d="${ARM_R}"/><path d="${ARM_L}"/></clipPath>
    <clipPath id="${uid}-all"><path d="${BODY}"/><path d="${HEAD}"/><path d="${ARM_R}"/><path d="${ARM_L}"/></clipPath>`;
  const parts = regions(view)
    .map((r) => `<g class="region" data-site="${r.site}" clip-path="url(#${uid}-${r.clip})">${r.shape}</g>`)
    .join('');
  const detail = view === 'front'
    ? '<circle cx="50" cy="88" r="0.9" class="detail-dot"/>'
    : '<path d="M50 40 V100" class="detail-line"/><path d="M44 46 Q50 50 56 46" class="detail-line"/>';
  return `<g transform="translate(${dx} 0)">
    <defs>${clips}</defs>
    ${parts}
    <g class="outline"><path d="${BODY}"/><path d="${HEAD}"/><path d="${ARM_R}"/><path d="${ARM_L}"/></g>
    ${detail}
    <text x="50" y="230" text-anchor="middle">${view === 'front' ? 'Front' : 'Back'}</text>
  </g>`;
}

let counter = 0;
export function mountBodyMap(container, select) {
  const uid = `bm${counter++}`;
  container.innerHTML = `<svg viewBox="0 0 220 236" aria-hidden="true" focusable="false">
    ${figure('front', 4, uid + 'f')}${figure('back', 116, uid + 'b')}</svg>`;
  const regionsEls = [...container.querySelectorAll('.region')];

  const sync = () => {
    for (const r of regionsEls) r.classList.toggle('is-selected', r.dataset.site === select.value);
  };
  const hover = (site) => {
    for (const r of regionsEls) r.classList.toggle('is-hover', site !== null && r.dataset.site === site);
  };
  for (const r of regionsEls) {
    r.addEventListener('click', () => {
      select.value = select.value === r.dataset.site ? '' : r.dataset.site;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    r.addEventListener('pointerenter', () => hover(r.dataset.site));
    r.addEventListener('pointerleave', () => hover(null));
  }
  select.addEventListener('change', sync);
  sync();
  return { sync };
}
