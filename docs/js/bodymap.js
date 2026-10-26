// Front and back body figures, cut into the eight body sites the model was trained on.
// The scan form uses it as a site picker (the <select> next to it is the accessible control);
// a patient's page uses it to show their lesions as numbered markers.
//
// A point is stored as { view, u, v, site }: u and v are fractions of the body's bounding box,
// so a lesion marked on one figure lands in the same place on the other.

import { FIGURES } from './body-figures.js';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

/** 'f' for female patients, 'm' otherwise (the male outline doubles as the neutral figure). */
export const figureFor = (sex) => (sex === 'female' ? 'f' : 'm');

// Every view is framed on its body's bounding box with the same margin, so front and back (and
// the male and female figures) draw at the same height.
function frame(v) {
  const [x, y, w, h] = v.bbox;
  const pad = 56;
  return `${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`;
}

function figureMarkup(fig, id) {
  return ['front', 'back']
    .map((view) => {
      const v = FIGURES[fig][view];
      const clip = `${id}-${view}`;
      const regions = Object.entries(v.regions)
        .map(([site, polys]) => polys.map((p) => `<polygon class="region" data-site="${site}" data-view="${view}" points="${p}"/>`).join(''))
        .join('');
      return `<figure class="fig-view" data-view="${view}">
        <svg viewBox="${frame(v)}" aria-hidden="true" focusable="false">
          <defs><clipPath id="${clip}">${v.body.map((d) => `<path d="${d}"/>`).join('')}</clipPath></defs>
          <g clip-path="url(#${clip})">${regions}</g>
          ${v.body.map((d) => `<path class="outline" d="${d}"/>`).join('')}
          <g class="marks"></g>
        </svg>
        <figcaption>${view === 'front' ? 'Front' : 'Back'}</figcaption>
      </figure>`;
    })
    .join('');
}

function toFigure(fig, view, x, y) {
  const [bx, by, bw, bh] = FIGURES[fig][view].bbox;
  return { u: +((x - bx) / bw).toFixed(4), v: +((y - by) / bh).toFixed(4) };
}
function fromFigure(fig, p) {
  const [bx, by, bw, bh] = FIGURES[fig][p.view].bbox;
  return { x: bx + p.u * bw, y: by + p.v * bh };
}
const validPoint = (p) => p && (p.view === 'front' || p.view === 'back') && Number.isFinite(p.u) && Number.isFinite(p.v);

function svgPoint(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function mount(container, sex) {
  const state = { fig: figureFor(sex), id: `body${++uid}` };
  container.classList.add('body-fig');
  const draw = () => {
    container.innerHTML = figureMarkup(state.fig, state.id);
    container.dataset.figure = state.fig;
  };
  draw();
  return state;
}

/** The scan form's body map: a site picker that also remembers where on the figure it was tapped. */
export function mountBodyMap(container, select, { sex } = {}) {
  const st = mount(container, sex);
  let point = null;

  const regions = () => [...container.querySelectorAll('.region')];
  const showPin = () => {
    for (const m of container.querySelectorAll('.marks')) m.innerHTML = '';
    if (!validPoint(point) || point.site !== select.value) return;
    const { x, y } = fromFigure(st.fig, point);
    const g = container.querySelector(`.fig-view[data-view="${point.view}"] .marks`);
    if (g) g.innerHTML = `<circle class="pin" cx="${x}" cy="${y}" r="22"/>`;
  };
  const sync = () => {
    for (const r of regions()) r.classList.toggle('is-selected', r.dataset.site === select.value);
    if (point && point.site !== select.value) point = null;
    showPin();
  };
  const wire = () => {
    for (const r of regions()) {
      r.addEventListener('click', (evt) => {
        const same = select.value === r.dataset.site && point;
        const svg = r.ownerSVGElement;
        const p = svgPoint(svg, evt);
        select.value = same ? '' : r.dataset.site;
        point = same ? null : { view: r.dataset.view, site: r.dataset.site, ...toFigure(st.fig, r.dataset.view, p.x, p.y) };
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      r.addEventListener('pointerenter', () => {
        for (const o of regions()) o.classList.toggle('is-hover', o.dataset.site === r.dataset.site);
      });
      r.addEventListener('pointerleave', () => regions().forEach((o) => o.classList.remove('is-hover')));
    }
  };
  wire();
  select.addEventListener('change', sync);
  sync();
  return {
    sync,
    getPoint: () => (validPoint(point) && point.site === select.value ? point : null),
    setPoint(p) {
      point = validPoint(p) ? p : null;
      showPin();
    },
    setSex(sex) {
      const fig = figureFor(sex);
      if (fig === st.fig) return;
      st.fig = fig;
      container.innerHTML = figureMarkup(fig, st.id);
      container.dataset.figure = fig;
      wire();
      sync();
    },
  };
}

/**
 * A patient's figure with their lesions. `lesions`: [{id, n, point, level}].
 * In pick mode, a tap on the figure calls onPick({site, view, u, v}).
 */
export function mountLesionMap(container, { lesions = [], onSelect, onPick, sex } = {}) {
  const st = mount(container, sex);
  let picking = false;

  const draw = (list) => {
    for (const g of container.querySelectorAll('.marks')) g.innerHTML = '';
    for (const l of list) {
      if (!validPoint(l.point)) continue;
      const { x, y } = fromFigure(st.fig, l.point);
      const g = container.querySelector(`.fig-view[data-view="${l.point.view}"] .marks`);
      const m = document.createElementNS(NS, 'g');
      m.setAttribute('class', 'mark');
      m.setAttribute('data-id', l.id);
      m.setAttribute('data-level', l.level || '');
      m.setAttribute('tabindex', '0');
      m.setAttribute('role', 'button');
      m.setAttribute('aria-label', `Lesion ${l.n}`);
      m.innerHTML = `<circle cx="${x}" cy="${y}" r="44"/><text x="${x}" y="${y + 19}" text-anchor="middle">${l.n}</text>`;
      const go = () => onSelect && onSelect(l.id);
      m.addEventListener('click', go);
      m.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go());
      g.appendChild(m);
    }
  };
  draw(lesions);

  for (const r of container.querySelectorAll('.region')) {
    r.addEventListener('click', (evt) => {
      if (!picking || !onPick) return;
      const p = svgPoint(r.ownerSVGElement, evt);
      onPick({ view: r.dataset.view, site: r.dataset.site, ...toFigure(st.fig, r.dataset.view, p.x, p.y) });
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
