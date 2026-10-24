// Front and back body figure. Each region maps to one of the eight ISIC body sites
// the model was trained on. The <select> next to it is the accessible control;
// the figure is a pointer shortcut that stays in sync with it.

const FRONT = 62;
const BACK = 188;

function figure(cx, view) {
  const torso = view === 'front' ? 'anterior torso' : 'posterior torso';
  const parts = [
    // head and neck
    `<circle class="region" data-site="head/neck" cx="${cx}" cy="24" r="15"/>`,
    `<rect class="region" data-site="head/neck" x="${cx - 6}" y="37" width="12" height="11" rx="3"/>`,
    // arms (shoulder to wrist)
    `<path class="region" data-site="upper extremity" d="M${cx - 28} 50 Q${cx - 37} 51 ${cx - 38} 61 L${cx - 45} 125 L${cx - 35} 126 L${cx - 30} 74 Z"/>`,
    `<path class="region" data-site="upper extremity" d="M${cx + 28} 50 Q${cx + 37} 51 ${cx + 38} 61 L${cx + 45} 125 L${cx + 35} 126 L${cx + 30} 74 Z"/>`,
    // hands
    `<ellipse class="region" data-site="palms/soles" cx="${cx - 40}" cy="135" rx="6.5" ry="9"/>`,
    `<ellipse class="region" data-site="palms/soles" cx="${cx + 40}" cy="135" rx="6.5" ry="9"/>`,
    // legs
    `<path class="region" data-site="lower extremity" d="M${cx - 25} 119 L${cx - 2} 119 L${cx - 4} 204 L${cx - 17} 204 Q${cx - 24} 160 ${cx - 25} 119 Z"/>`,
    `<path class="region" data-site="lower extremity" d="M${cx + 25} 119 L${cx + 2} 119 L${cx + 4} 204 L${cx + 17} 204 Q${cx + 24} 160 ${cx + 25} 119 Z"/>`,
    // feet
    `<ellipse class="region" data-site="palms/soles" cx="${cx - 11}" cy="212" rx="9" ry="6"/>`,
    `<ellipse class="region" data-site="palms/soles" cx="${cx + 11}" cy="212" rx="9" ry="6"/>`,
    // torso: center, then the two sides
    `<path class="region" data-site="${torso}" d="M${cx - 19} 48 L${cx + 19} 48 L${cx + 16} 120 L${cx - 16} 120 Z"/>`,
    `<path class="region" data-site="lateral torso" d="M${cx - 28} 52 Q${cx - 27} 48 ${cx - 19} 48 L${cx - 16} 120 L${cx - 25} 120 Q${cx - 29} 90 ${cx - 28} 52 Z"/>`,
    `<path class="region" data-site="lateral torso" d="M${cx + 28} 52 Q${cx + 27} 48 ${cx + 19} 48 L${cx + 16} 120 L${cx + 25} 120 Q${cx + 29} 90 ${cx + 28} 52 Z"/>`,
  ];
  if (view === 'front') {
    parts.push(`<path class="region" data-site="oral/genital" d="M${cx - 9} 119 L${cx + 9} 119 L${cx + 4} 132 L${cx - 4} 132 Z"/>`);
  }
  parts.push(`<text x="${cx}" y="242" text-anchor="middle">${view === 'front' ? 'Front' : 'Back'}</text>`);
  return parts.join('');
}

export function mountBodyMap(container, select) {
  container.innerHTML = `<svg viewBox="0 0 250 250" aria-hidden="true" focusable="false">${figure(FRONT, 'front')}${figure(BACK, 'back')}</svg>`;
  const regions = [...container.querySelectorAll('.region')];

  const sync = () => {
    for (const r of regions) r.classList.toggle('is-selected', r.dataset.site === select.value);
  };
  const hover = (site) => {
    for (const r of regions) r.classList.toggle('is-hover', site !== null && r.dataset.site === site);
  };

  for (const r of regions) {
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
