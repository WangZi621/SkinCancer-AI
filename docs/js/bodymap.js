// Front and back body figure. Each region maps to one of the eight ISIC body sites
// the model was trained on. The <select> next to it is the accessible control;
// the figure is a pointer shortcut that stays in sync with it.

const FRONT = 58;
const BACK = 162;

function figure(cx, view) {
  const torso = view === 'front' ? 'anterior torso' : 'posterior torso';
  const handY = 49 + 64 * Math.cos(Math.PI / 22.5);
  const handDx = 27 + 64 * Math.sin(Math.PI / 22.5);
  const parts = [
    // head and neck
    `<ellipse class="region" data-site="head/neck" cx="${cx}" cy="22" rx="12.5" ry="14"/>`,
    `<path class="region" data-site="head/neck" d="M${cx - 5.5} 34 L${cx + 5.5} 34 L${cx + 6.5} 44 Q${cx} 42 ${cx - 6.5} 44 Z"/>`,
    // arms and hands
    `<rect class="region" data-site="upper extremity" x="${cx - 31}" y="49" width="8" height="62" rx="4" transform="rotate(8 ${cx - 27} 49)"/>`,
    `<rect class="region" data-site="upper extremity" x="${cx + 23}" y="49" width="8" height="62" rx="4" transform="rotate(-8 ${cx + 27} 49)"/>`,
    `<ellipse class="region" data-site="palms/soles" cx="${cx - handDx}" cy="${handY + 3}" rx="4.6" ry="6.6"/>`,
    `<ellipse class="region" data-site="palms/soles" cx="${cx + handDx}" cy="${handY + 3}" rx="4.6" ry="6.6"/>`,
    // legs and feet
    `<path class="region" data-site="lower extremity" d="M${cx - 15} 113 L${cx - 1.5} 113 L${cx - 3.5} 201 Q${cx - 4} 205 ${cx - 8} 205 Q${cx - 12} 205 ${cx - 12.5} 201 Z"/>`,
    `<path class="region" data-site="lower extremity" d="M${cx + 15} 113 L${cx + 1.5} 113 L${cx + 3.5} 201 Q${cx + 4} 205 ${cx + 8} 205 Q${cx + 12} 205 ${cx + 12.5} 201 Z"/>`,
    `<ellipse class="region" data-site="palms/soles" cx="${cx - 8.5}" cy="211" rx="6" ry="4"/>`,
    `<ellipse class="region" data-site="palms/soles" cx="${cx + 8.5}" cy="211" rx="6" ry="4"/>`,
    // torso: center, then the two sides
    `<path class="region" data-site="${torso}" d="M${cx - 16} 45 Q${cx} 42 ${cx + 16} 45 L${cx + 14} 92 Q${cx + 15} 104 ${cx + 15} 113 L${cx - 15} 113 Q${cx - 15} 104 ${cx - 14} 92 Z"/>`,
    `<path class="region" data-site="lateral torso" d="M${cx - 16} 45 Q${cx - 22} 46 ${cx - 23} 53 L${cx - 19} 92 Q${cx - 21} 104 ${cx - 21} 113 L${cx - 15} 113 Q${cx - 15} 104 ${cx - 14} 92 Z"/>`,
    `<path class="region" data-site="lateral torso" d="M${cx + 16} 45 Q${cx + 22} 46 ${cx + 23} 53 L${cx + 19} 92 Q${cx + 21} 104 ${cx + 21} 113 L${cx + 15} 113 Q${cx + 15} 104 ${cx + 14} 92 Z"/>`,
  ];
  if (view === 'front') {
    parts.push(`<path class="region" data-site="oral/genital" d="M${cx - 9} 113 L${cx + 9} 113 Q${cx + 5} 122 ${cx} 126 Q${cx - 5} 122 ${cx - 9} 113 Z"/>`);
  }
  parts.push(`<text x="${cx}" y="236" text-anchor="middle">${view === 'front' ? 'Front' : 'Back'}</text>`);
  return parts.join('');
}

export function mountBodyMap(container, select) {
  container.innerHTML = `<svg viewBox="0 0 220 244" aria-hidden="true" focusable="false">${figure(FRONT, 'front')}${figure(BACK, 'back')}</svg>`;
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
