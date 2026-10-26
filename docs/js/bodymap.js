// Front and back body figure. Each region maps to one of the eight ISIC body sites
// the model was trained on. The <select> next to it is the accessible control;
// the figure is a pointer shortcut that stays in sync with it.
// The same figure shows a patient's tracked lesions as numbered markers.

const FRONT = 58;
const BACK = 162;

function figure(cx, view) {
  const torso = view === 'front' ? 'anterior torso' : 'posterior torso';
  const handY = 49 + 64 * Math.cos(Math.PI / 22.5);
  const handDx = 27 + 64 * Math.sin(Math.PI / 22.5);
  const v = `data-view="${view}"`;
  const parts = [
    // head and neck
    `<ellipse class="region" ${v} data-site="head/neck" cx="${cx}" cy="22" rx="12.5" ry="14"/>`,
    `<path class="region" ${v} data-site="head/neck" d="M${cx - 5.5} 34 L${cx + 5.5} 34 L${cx + 6.5} 44 Q${cx} 42 ${cx - 6.5} 44 Z"/>`,
    // arms and hands
    `<rect class="region" ${v} data-site="upper extremity" x="${cx - 31}" y="49" width="8" height="62" rx="4" transform="rotate(8 ${cx - 27} 49)"/>`,
    `<rect class="region" ${v} data-site="upper extremity" x="${cx + 23}" y="49" width="8" height="62" rx="4" transform="rotate(-8 ${cx + 27} 49)"/>`,
    `<ellipse class="region" ${v} data-site="palms/soles" cx="${cx - handDx}" cy="${handY + 3}" rx="4.6" ry="6.6"/>`,
    `<ellipse class="region" ${v} data-site="palms/soles" cx="${cx + handDx}" cy="${handY + 3}" rx="4.6" ry="6.6"/>`,
    // legs and feet
    `<path class="region" ${v} data-site="lower extremity" d="M${cx - 15} 113 L${cx - 1.5} 113 L${cx - 3.5} 201 Q${cx - 4} 205 ${cx - 8} 205 Q${cx - 12} 205 ${cx - 12.5} 201 Z"/>`,
    `<path class="region" ${v} data-site="lower extremity" d="M${cx + 15} 113 L${cx + 1.5} 113 L${cx + 3.5} 201 Q${cx + 4} 205 ${cx + 8} 205 Q${cx + 12} 205 ${cx + 12.5} 201 Z"/>`,
    `<ellipse class="region" ${v} data-site="palms/soles" cx="${cx - 8.5}" cy="211" rx="6" ry="4"/>`,
    `<ellipse class="region" ${v} data-site="palms/soles" cx="${cx + 8.5}" cy="211" rx="6" ry="4"/>`,
    // torso: center, then the two sides
    `<path class="region" ${v} data-site="${torso}" d="M${cx - 16} 45 Q${cx} 42 ${cx + 16} 45 L${cx + 14} 92 Q${cx + 15} 104 ${cx + 15} 113 L${cx - 15} 113 Q${cx - 15} 104 ${cx - 14} 92 Z"/>`,
    `<path class="region" ${v} data-site="lateral torso" d="M${cx - 16} 45 Q${cx - 22} 46 ${cx - 23} 53 L${cx - 19} 92 Q${cx - 21} 104 ${cx - 21} 113 L${cx - 15} 113 Q${cx - 15} 104 ${cx - 14} 92 Z"/>`,
    `<path class="region" ${v} data-site="lateral torso" d="M${cx + 16} 45 Q${cx + 22} 46 ${cx + 23} 53 L${cx + 19} 92 Q${cx + 21} 104 ${cx + 21} 113 L${cx + 15} 113 Q${cx + 15} 104 ${cx + 14} 92 Z"/>`,
  ];
  if (view === 'front') {
    parts.push(`<path class="region" ${v} data-site="oral/genital" d="M${cx - 9} 113 L${cx + 9} 113 Q${cx + 5} 122 ${cx} 126 Q${cx - 5} 122 ${cx - 9} 113 Z"/>`);
  }
  parts.push(`<text x="${cx}" y="236" text-anchor="middle">${view === 'front' ? 'Front' : 'Back'}</text>`);
  return parts.join('');
}

const SVG_OPEN = '<svg viewBox="0 0 220 244" aria-hidden="true" focusable="false">';
const figures = () => figure(FRONT, 'front') + figure(BACK, 'back');

function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
}

/** The scan form's body map: a site picker that also remembers where on the figure it was tapped. */
export function mountBodyMap(container, select) {
  container.innerHTML = `${SVG_OPEN}${figures()}<circle class="pin" r="3.6" cx="-10" cy="-10"/></svg>`;
  const svg = container.querySelector('svg');
  const pin = svg.querySelector('.pin');
  const regions = [...container.querySelectorAll('.region')];
  let point = null;

  const showPin = () => {
    const ok = point && select.value;
    pin.setAttribute('cx', ok ? point.x : -10);
    pin.setAttribute('cy', ok ? point.y : -10);
  };
  const sync = () => {
    for (const r of regions) r.classList.toggle('is-selected', r.dataset.site === select.value);
    if (point && point.site !== select.value) point = null;
    showPin();
  };
  const hover = (site) => {
    for (const r of regions) r.classList.toggle('is-hover', site !== null && r.dataset.site === site);
  };

  for (const r of regions) {
    r.addEventListener('click', (evt) => {
      const same = select.value === r.dataset.site && point;
      select.value = same ? '' : r.dataset.site;
      point = same ? null : { ...svgPoint(svg, evt), view: r.dataset.view, site: r.dataset.site };
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    r.addEventListener('pointerenter', () => hover(r.dataset.site));
    r.addEventListener('pointerleave', () => hover(null));
  }
  select.addEventListener('change', sync);
  sync();
  return {
    sync,
    getPoint: () => (point && point.site === select.value ? point : null),
    setPoint(p) {
      point = p && p.site ? p : null;
      showPin();
    },
  };
}

/**
 * A patient's figure with their lesions. `lesions`: [{id, n, point, site, level}].
 * In pick mode, a tap on the figure calls onPick({site, view, x, y}).
 */
export function mountLesionMap(container, { lesions = [], onSelect, onPick } = {}) {
  container.innerHTML = `${SVG_OPEN}${figures()}<g class="marks"></g></svg>`;
  const svg = container.querySelector('svg');
  const marks = svg.querySelector('.marks');
  let picking = false;

  const draw = (list) => {
    marks.innerHTML = list
      .filter((l) => l.point)
      .map(
        (l) =>
          `<g class="mark" data-id="${l.id}" data-level="${l.level || ''}" tabindex="0" role="button" aria-label="Lesion ${l.n}"><circle cx="${l.point.x}" cy="${l.point.y}" r="6.2"/><text x="${l.point.x}" y="${l.point.y + 2.6}" text-anchor="middle">${l.n}</text></g>`,
      )
      .join('');
    for (const m of marks.querySelectorAll('.mark')) {
      const go = () => onSelect && onSelect(m.dataset.id);
      m.addEventListener('click', go);
      m.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go());
    }
  };
  draw(lesions);

  for (const r of container.querySelectorAll('.region')) {
    r.addEventListener('click', (evt) => {
      if (!picking || !onPick) return;
      onPick({ ...svgPoint(svg, evt), view: r.dataset.view, site: r.dataset.site });
    });
  }
  return {
    draw,
    setPicking(on) {
      picking = on;
      container.classList.toggle('is-picking', on);
    },
  };
}
