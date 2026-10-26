"""Make test and concept sheets for the logo concepts and render them to PNG with Chromium.

    python3 brand/logo/sheet.py test       # brand/logo/test-sheet.png: sizes, reversed, one colour, blur, app icon
    python3 brand/logo/sheet.py concepts   # brand/logo/concepts.png: the checkpoint overview, greyscale

Needs Playwright (node) and the Chromium that comes with it.
"""
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
C = ROOT / 'concepts'
VIOLET = '#5A2CB0'
INK = '#201A3D'

CONCEPTS = [
    ('a', 'Circled spot', 'A spot ringed by the dots a surgeon draws around a lesion before a biopsy.'),
    ('b', 'Odd one out', 'Eight spots alike and one that is not: the ugly duckling sign.'),
    ('c', 'Contours', "A spot's edge at three visits, growing to one side."),
]
RECOMMEND = sys.argv[2] if len(sys.argv) > 2 else 'b'


def mark(name, fill, size=None, kind='symbol', style=''):
    s = (C / f'{name}-{kind}.svg').read_text().replace('fill="#000"', f'fill="{fill}"')
    attrs = f'style="{style}' + (f'height:{size}px;' if size else '') + '"'
    return s.replace('<svg ', f'<svg {attrs} ', 1)


CSS = """
body { margin: 0; font-family: 'Mona Sans', system-ui, sans-serif; color: #201a3d; background: #ececef; }
@font-face { font-family: 'Mona Sans'; src: url('../../docs/fonts/mona-sans.woff2') format('woff2'); font-weight: 200 900; font-stretch: 75% 125%; }
.page { padding: 48px; display: grid; gap: 24px; width: 1600px; box-sizing: border-box; }
.row { display: grid; grid-template-columns: 300px 1fr; gap: 32px; align-items: center; padding: 32px; border-radius: 24px; background: #fff; }
h1 { margin: 0; font-size: 44px; font-weight: 800; font-stretch: 115%; letter-spacing: -0.02em; }
h2 { margin: 0 0 8px; font-size: 28px; font-weight: 800; font-stretch: 112%; }
p { margin: 0; color: #5d5970; font-size: 17px; line-height: 1.45; }
.cells { display: flex; flex-wrap: wrap; gap: 20px; align-items: center; }
.cell { display: grid; justify-items: center; gap: 8px; font-size: 13px; color: #5d5970; }
.tile { display: grid; place-items: center; border-radius: 22%; }
.dark { background: #201a3d; padding: 14px; border-radius: 12px; }
.blur svg { filter: blur(3px); }
.tab { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 10px 10px 0 0; background: #dedde5; font-size: 13px; }
.rec { display: inline-block; margin-left: 10px; padding: 3px 10px; border: 2px solid #201a3d; border-radius: 8px; font-size: 14px; font-weight: 700; vertical-align: 6px; font-stretch: 100%; }
.lock svg { height: 64px; }
.big svg { width: 256px; height: 256px; }
"""


def test_sheet():
    rows = []
    for key, name, idea in CONCEPTS:
        cells = [
            f'<div class="cell">{mark(key, "#000", 96)}96 px</div>',
            f'<div class="cell">{mark(key, "#000", 64)}64</div>',
            f'<div class="cell">{mark(key, "#000", 32)}32</div>',
            f'<div class="cell">{mark(key, "#000", 24)}24</div>',
            f'<div class="cell">{mark(key, "#000", 16)}16</div>',
            f'<div class="cell"><div class="dark">{mark(key, "#fff", 64)}</div>reversed</div>',
            f'<div class="cell">{mark(key, VIOLET, 64)}one colour</div>',
            f'<div class="cell"><div class="tile" style="width:88px;height:88px;background:{VIOLET}">{mark(key, "#fff", 56)}</div>app icon</div>',
            f'<div class="cell"><div class="tab">{mark(key, VIOLET, 16)}SkinScan AI</div>favicon</div>',
            f'<div class="cell blur">{mark(key, "#000", 64)}squint</div>',
            f'<div class="cell">{mark(key, "#000", 64, style="transform:scaleX(-1);")}mirror</div>',
            f'<div class="cell">{mark(key, "#000", 64, style="transform:rotate(180deg);")}180°</div>',
        ]
        rows.append(f'<section class="row"><div><h2>{key.upper()}. {name}</h2><p>{idea}</p></div><div class="cells">{"".join(cells)}</div></section>')
        rows.append(f'<section class="row"><div><p>Lockup</p></div><div class="lock">{mark(key, INK, kind="lockup")}</div></section>')
    return f'<div class="page"><h1>Logo concepts: test sheet</h1>{"".join(rows)}</div>'


def concept_sheet():
    cols = []
    for key, name, idea in CONCEPTS:
        rec = '<span class="rec">Recommended</span>' if key == RECOMMEND else ''
        cols.append(f"""<section style="display:grid;gap:22px;align-content:start;padding:36px;border-radius:24px;background:#fff">
          <div class="big" style="display:grid;place-items:center;padding:20px 0">{mark(key, '#111')}</div>
          <div class="cells" style="justify-content:center;gap:28px">{''.join(f'<div class="cell">{mark(key, "#111", s)}{s}</div>' for s in (64, 32, 16))}</div>
          <div class="lock" style="display:grid;place-items:center;padding:12px 0"><div style="height:48px">{mark(key, '#111', 48, kind='lockup')}</div></div>
          <div><h2>{key.upper()}. {name}{rec}</h2><p>{idea}</p></div>
        </section>""")
    return f'<div class="page" style="width:1800px"><h1>SkinScan AI logo concepts</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px">{"".join(cols)}</div></div>'


def render(html, out):
    page = ROOT / f'.{out.stem}.html'
    page.write_text(f'<!doctype html><meta charset="utf-8"><style>{CSS}</style>{html}')
    js = f"""
const {{ chromium }} = require('/opt/node-tools/node_modules/playwright');
(async () => {{
  const b = await chromium.launch();
  const p = await b.newPage({{ viewport: {{ width: 1900, height: 900 }}, deviceScaleFactor: 1 }});
  await p.goto('file://' + {json.dumps(str(page))});
  await p.evaluate(() => document.fonts.ready);
  await p.locator('.page').screenshot({{ path: {json.dumps(str(out))} }});
  await b.close();
}})();"""
    subprocess.run(['node', '-e', js], check=True)
    page.unlink()
    print('wrote', out)


if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'test'
    if which == 'test':
        render(test_sheet(), ROOT / 'test-sheet.png')
    else:
        render(concept_sheet(), ROOT / 'concepts.png')
