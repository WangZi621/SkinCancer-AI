"""Build the Stryde logo kit from concept C, Contours: the outline of one spot at three
visits, growing toward the lower right.

    python3 brand/logo/kit.py        # needs fonttools, brotli, Pillow and Playwright's Chromium

Writes brand/logo/kit/ (SVG masters, PNG icons, favicon.ico) and brand/logo/usage.png, and
copies the web icons into docs/icons/.
"""
import io
import json
import math
import pathlib
import shutil
import subprocess

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image

from build import FONT, SPOT, blob, f, ring

ROOT = pathlib.Path(__file__).resolve().parent
KIT = ROOT / 'kit'
DOCS_ICONS = ROOT.parent.parent / 'docs' / 'icons'
COBALT = '#1B4FD8'
NAVY = '#14213D'
WHITE = '#FFFFFF'
K = 1 / math.sqrt(2)


# ---------------------------------------------------------------- geometry (256 x 256)
def contours(w=18, gap=9):
    """The full mark. Outer outline r 100, middle r 52, spot r 23, each band w wide (close to the
    wordmark's stem weight). Each shape sits `gap` inside the next on the upper left and further
    away on the lower right."""
    c2 = 128
    c1 = c2 - ((100 - w / 2) - (52 + w / 2) - gap) * K
    c0 = c1 - ((52 - w / 2) - 23 - gap) * K
    return ring(c2, c2, 100, w, SPOT, 8) + ring(c1, c1, 52, w, SPOT, 8) + blob(c0, c0, 23, SPOT, 8)


def contours_small(w=26, gap=20):
    """16 to 24 px: the middle outline is dropped and the rest made heavier, so gaps stay open."""
    c2 = 128
    c0 = c2 - ((98 - w / 2) - 40 - gap) * K
    return ring(c2, c2, 98, w, SPOT, 8) + blob(c0, c0, 40, SPOT, 8)


def path(d, fill):
    return f'<path fill="{fill}" fill-rule="evenodd" d="{d}"/>'


def svg(view, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}">{body}</svg>\n'


def placed(d, size, x, y):
    """The 256-unit mark scaled to `size` at (x, y), as a group transform."""
    return f'<g transform="translate({f(x)} {f(y)}) scale({size / 256:.5f})">{d}</g>'


# ---------------------------------------------------------------- wordmark (outlined Archivo)
def wordmark(cap_px, x0=0.0, y0=0.0, text='Stryde', wdth=115, wght=850, track=-0.01):
    """Path data for the wordmark (Archivo, as the Stryde headlines) with its cap height `cap_px`, top of the caps at y0.
    Returns (d, width)."""
    font = TTFont(FONT)
    inst = instancer.instantiateVariableFont(font, {'wdth': wdth, 'wght': wght})
    gs, cmap, hmtx = inst.getGlyphSet(), inst.getBestCmap(), inst['hmtx']
    upm, cap = inst['head'].unitsPerEm, inst['OS/2'].sCapHeight
    s = cap_px / cap
    pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
    x = 0
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x0 + x * s, y0 + cap * s)))
        x += hmtx[g][0] + track * upm
    return pen.getCommands(), (x - track * upm) * s


# Lockup proportions, in symbol heights (H = 256):
CAP = 0.40  # wordmark cap height
GAP = 0.27  # symbol to wordmark, horizontal
STACK_GAP = 0.22  # symbol to wordmark, stacked


def horizontal(sym_fill, word_fill, H=256):
    cap = CAP * H
    d, w = wordmark(cap, H * (1 + GAP), (H - cap) / 2)
    width = H * (1 + GAP) + w
    return svg(f'0 0 {f(width)} {H}', path(contours(), sym_fill) + path(d, word_fill)), width


def stacked(sym_fill, word_fill, H=256):
    cap = CAP * H * 0.75
    _, w = wordmark(cap)
    width = max(w, H)
    d, _ = wordmark(cap, (width - w) / 2, H * (1 + STACK_GAP))
    total = H * (1 + STACK_GAP) + cap
    sym = placed(path(contours(), sym_fill), H, (width - H) / 2, 0)
    return svg(f'0 0 {f(width)} {f(total)}', sym + path(d, word_fill))


def wordmark_svg(fill):
    cap = 100
    d, w = wordmark(cap)
    return svg(f'0 0 {f(w)} {cap}', path(d, fill))


def tile(small=False, maskable=False):
    """App icon: white mark on a cobalt square. Rounded for the favicon and app tile; full-bleed
    for the maskable icon, with the mark inside the 80% safe circle."""
    corner = '' if maskable else ' rx="56"'
    size = 150 if maskable else 168
    mark = path(contours_small() if small else contours(w=17), WHITE)
    # optical centre: the mark's weight sits upper left, so nudge it right and down a little
    return svg('0 0 256 256', f'<rect width="256" height="256"{corner} fill="{COBALT}"/>' + placed(mark, size, (256 - size) / 2 + 3, (256 - size) / 2 + 3))


# ---------------------------------------------------------------- rendering (Chromium)
def render_pngs(jobs):
    """jobs: [(svg_text, out_path, width_px, height_px)] rendered with a transparent background."""
    tmp = KIT / '.render'
    tmp.mkdir(exist_ok=True)
    spec = []
    for i, (text, out, w, h) in enumerate(jobs):
        src = tmp / f'{i}.svg'
        src.write_text(text)
        spec.append({'src': str(src), 'out': str(out), 'w': w, 'h': h})
    js = """
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const spec = JSON.parse(process.argv[1]);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const j of spec) {
    await p.setViewportSize({ width: j.w, height: j.h });
    await p.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${j.w}px;height:${j.h}px}</style><img src="file://${j.src}">`);
    await p.waitForFunction(() => document.images[0].complete);
    await p.screenshot({ path: j.out, omitBackground: true });
  }
  await b.close();
})();"""
    subprocess.run(['node', '-e', js, json.dumps(spec)], check=True)
    shutil.rmtree(tmp)


def screenshot(html, out, width=1600):
    page = ROOT / '.usage.html'
    page.write_text(html)
    js = f"""
const {{ chromium }} = require('/opt/node-tools/node_modules/playwright');
(async () => {{
  const b = await chromium.launch();
  const p = await b.newPage({{ viewport: {{ width: {width}, height: 900 }} }});
  await p.goto('file://{page}');
  await p.evaluate(() => document.fonts.ready);
  await p.locator('.page').screenshot({{ path: '{out}' }});
  await b.close();
}})();"""
    subprocess.run(['node', '-e', js], check=True)
    page.unlink()


# ---------------------------------------------------------------- usage page
def usage_html():
    files = {p.name: p.read_text() for p in KIT.glob('*.svg')}

    def img(name, h, extra=''):
        s = files[name]
        return s.replace('<svg ', f'<svg style="height:{h}px;width:auto;display:block;{extra}" ', 1)

    swatches = ''.join(
        f'<div class="sw"><i style="background:{hx}{";outline:1px solid #d7d5df" if hx == WHITE else ""}"></i><b>{n}</b><span>{hx}<br>RGB {r}</span><span>{u}</span></div>'
        for n, hx, r, u in [
            ('Cobalt', COBALT, '27 79 216', 'The symbol, links, primary buttons, app icon'),
            ('Dress blue', NAVY, '20 33 61', 'The wordmark and headlines'),
            ('White', WHITE, '255 255 255', 'The mark on cobalt or dress blue'),
        ]
    )
    backgrounds = ''.join(
        f'<div class="bg" style="background:{bg}">{img(name, 54)}</div>'
        for bg, name in [('#fff', 'stryde-horizontal-color.svg'), ('#ececec', 'stryde-horizontal-color.svg'), (COBALT, 'stryde-horizontal-white.svg'), (NAVY, 'stryde-horizontal-white.svg')]
    )
    sizes = ''.join(f'<div class="cell">{img("stryde-symbol-cobalt.svg" if s >= 32 else "stryde-symbol-small-cobalt.svg", s)}<span>{s} px</span></div>' for s in (128, 64, 32, 24, 16))
    misuse = ''.join(
        f'<div class="cell bad">{img(n, 64, st)}<span>{t}</span></div>'
        for n, st, t in [
            ('stryde-symbol-cobalt.svg', 'transform:scaleX(1.35)', 'Stretched'),
            ('stryde-symbol-cobalt.svg', 'transform:rotate(90deg)', 'Rotated'),
            ('stryde-symbol-cobalt.svg', 'filter:drop-shadow(4px 6px 6px rgba(0,0,0,.35))', 'Shadow'),
            ('stryde-symbol-navy.svg', 'filter:hue-rotate(150deg) saturate(3)', 'Other colours'),
        ]
    )
    return f"""<!doctype html><meta charset="utf-8"><style>
@font-face {{ font-family: 'Archivo'; src: url('../../docs/fonts/archivo.woff2') format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }}
body {{ margin: 0; background: #ececec; color: {NAVY}; font-family: 'Archivo', sans-serif; }}
.page {{ display: grid; gap: 18px; padding: 48px; width: 1600px; box-sizing: border-box; }}
section {{ display: grid; grid-template-columns: 320px 1fr; gap: 40px; padding: 40px; border-radius: 28px; background: #fff; align-items: center; }}
h1 {{ margin: 0 0 4px; font-size: 52px; font-weight: 850; font-stretch: 115%; letter-spacing: -0.02em; }}
h2 {{ margin: 0 0 8px; font-size: 26px; font-weight: 800; font-stretch: 112%; }}
p {{ margin: 0; color: #4c525d; font-size: 17px; line-height: 1.45; }}
.row {{ display: flex; flex-wrap: wrap; gap: 48px; align-items: center; }}
.cell {{ display: grid; justify-items: center; gap: 10px; color: #4c525d; font-size: 14px; }}
.sw {{ display: grid; gap: 4px; width: 250px; font-size: 14px; color: #4c525d; }}
.sw i {{ height: 96px; border-radius: 16px; margin-bottom: 8px; }}
.sw b {{ color: {NAVY}; font-size: 17px; }}
.bg {{ display: grid; place-items: center; height: 140px; padding: 0 36px; border-radius: 20px; }}
.space {{ position: relative; padding: 38px; outline: 2px dashed #b9bdc6; outline-offset: -2px; border-radius: 4px; }}
.space::before {{ content: ''; position: absolute; left: 0; top: 0; width: 38px; height: 38px; background: #e4ebfc; }}
.bad {{ position: relative; }}
.bad::after {{ content: ''; position: absolute; left: 50%; top: 32px; width: 92px; height: 3px; background: #b42318; transform: translate(-50%, 0) rotate(-35deg); }}
.tab {{ display: flex; align-items: center; gap: 10px; width: 260px; padding: 12px 16px; border-radius: 14px 14px 0 0; background: #e3e5ea; font-size: 15px; }}
.home {{ display: grid; grid-template-columns: repeat(4, 76px); gap: 18px 22px; padding: 26px; border-radius: 30px; background: #1e2433; }}
.home div {{ display: grid; justify-items: center; gap: 6px; color: #fff; font-size: 12px; }}
.home i {{ width: 64px; height: 64px; border-radius: 16px; background: #3a4152; }}
</style>
<div class="page">
  <div style="padding:8px 8px 16px"><h1>Stryde logo</h1><p>Contours: the outline of one skin spot at three visits, spreading toward the lower right where it grew. It stands for the job the app does between visits.</p></div>
  <section><div><h2>Lockups</h2><p>Use the horizontal lockup by default. Use the stacked lockup in square spaces, and the symbol alone when the name is already on screen.</p></div>
    <div class="row">{img('stryde-horizontal-color.svg', 80)}{img('stryde-stacked-color.svg', 170)}{img('stryde-symbol-cobalt.svg', 110)}</div></section>
  <section><div><h2>Colour</h2><p>One colour per mark, from the Stryde palette. The symbol is cobalt and the wordmark is dress blue. On cobalt or dress blue, everything is white.</p></div><div class="row" style="gap:28px">{swatches}</div></section>
  <section><div><h2>Backgrounds</h2><p>White, off-white, cobalt or dress blue. Never over a photo, and on the lattice only where it is quiet.</p></div><div class="row" style="gap:16px">{backgrounds}</div></section>
  <section><div><h2>Clear space and sizes</h2><p>Keep clear space of a quarter of the symbol's height (the shaded square) on every side. Below 32 px, use the small version, which drops the middle outline so the gaps stay open.</p></div>
    <div class="row"><div class="space">{img('stryde-symbol-cobalt.svg', 150)}</div>{sizes}</div></section>
  <section><div><h2>In use</h2><p>The app icon and favicon put the white mark on a cobalt square.</p></div>
    <div class="row"><div class="cell"><div class="tab">{img('stryde-favicon.svg', 18)}Stryde</div><span>Browser tab</span></div>
      <div class="cell"><div class="home">{''.join('<div><i></i>App</div>' for _ in range(2))}<div>{img('stryde-app-icon.svg', 64)}Stryde</div>{''.join('<div><i></i>App</div>' for _ in range(5))}</div><span>Home screen</span></div></div></section>
  <section><div><h2>Don't</h2><p>Stretch it, rotate it, add a shadow or gradient, or recolour it.</p></div><div class="row">{misuse}</div></section>
</div>"""


# ---------------------------------------------------------------- build
if __name__ == '__main__':
    KIT.mkdir(exist_ok=True)
    for p in KIT.iterdir():
        if p.is_file():
            p.unlink()
    out = {}
    for name, fill in (('cobalt', COBALT), ('navy', NAVY), ('black', '#000'), ('white', WHITE)):
        out[f'stryde-symbol-{name}.svg'] = svg('0 0 256 256', path(contours(w=17 if name == 'white' else 18), fill))
    for name, fill in (('cobalt', COBALT), ('white', WHITE)):
        out[f'stryde-symbol-small-{name}.svg'] = svg('0 0 256 256', path(contours_small(), fill))
    for name, (sf, wf) in {'color': (COBALT, NAVY), 'navy': (NAVY, NAVY), 'black': ('#000', '#000'), 'white': (WHITE, WHITE)}.items():
        out[f'stryde-horizontal-{name}.svg'] = horizontal(sf, wf)[0]
    for name, (sf, wf) in {'color': (COBALT, NAVY), 'white': (WHITE, WHITE)}.items():
        out[f'stryde-stacked-{name}.svg'] = stacked(sf, wf)
    out['stryde-wordmark-navy.svg'] = wordmark_svg(NAVY)
    out['stryde-wordmark-white.svg'] = wordmark_svg(WHITE)
    out['stryde-app-icon.svg'] = tile()
    out['stryde-favicon.svg'] = tile(small=True)
    out['stryde-maskable.svg'] = tile(maskable=True)
    for n, text in out.items():
        (KIT / n).write_text(text)

    jobs = [(out['stryde-favicon.svg'], KIT / f'favicon-{s}.png', s, s) for s in (16, 32)]
    jobs += [(out['stryde-app-icon.svg'], KIT / f'icon-{s}.png', s, s) for s in (48, 180, 192, 512)]
    jobs += [(out['stryde-maskable.svg'], KIT / 'icon-maskable-512.png', 512, 512)]
    jobs += [(out['stryde-horizontal-color.svg'], KIT / 'stryde-horizontal-color-1200.png', 1200, round(1200 * 256 / horizontal(COBALT, NAVY)[1]))]
    render_pngs(jobs)
    # favicon.ico with 16, 32 and 48 px images
    imgs = [Image.open(KIT / 'favicon-16.png'), Image.open(KIT / 'favicon-32.png'), Image.open(KIT / 'icon-48.png')]
    imgs[2].save(KIT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=imgs[:2])

    screenshot(usage_html(), ROOT / 'usage.png')

    # web icons for the site
    shutil.copy(KIT / 'stryde-favicon.svg', DOCS_ICONS / 'icon.svg')
    shutil.copy(KIT / 'favicon.ico', DOCS_ICONS.parent / 'favicon.ico')
    for src, dst in (('icon-180.png', 'apple-touch-icon.png'), ('icon-192.png', 'icon-192.png'), ('icon-512.png', 'icon-512.png'), ('icon-maskable-512.png', 'icon-maskable-512.png')):
        shutil.copy(KIT / src, DOCS_ICONS / dst)
    print('kit:', len(list(KIT.iterdir())), 'files')
