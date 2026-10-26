"""One-off restyle of every scene from the old teal look to the app's Stryde system:
Archivo, cobalt, dress blue, ink, the off-white lattice ground, and no soft shadows.

    python3 scripts/restyle.py      # rewrites compositions/*.html in place

Scene-specific changes (white type on the old teal ground) are made by hand afterwards.
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
INK = '#0b0e14'

LATTICE = (
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='30' height='52' viewBox='0 0 30 52'%3E"
    "%3Cpath d='M0 0H30M0 26H30M0 52H30M0 0L30 52M30 0L0 52' stroke='rgba(20,33,61,0.05)' stroke-width='1' fill='none'/%3E"
    "%3Cg fill='rgba(20,33,61,0.2)'%3E%3Ccircle cx='0' cy='0' r='1.5'/%3E%3Ccircle cx='30' cy='0' r='1.5'/%3E"
    "%3Ccircle cx='15' cy='26' r='1.5'/%3E%3Ccircle cx='0' cy='52' r='1.5'/%3E%3Ccircle cx='30' cy='52' r='1.5'/%3E%3C/g%3E%3C/svg%3E\")"
)
# the same lattice as the app's page ground, at the same scale and phase as a full-frame recording
GROUND = f'#ececec {LATTICE} 15px 10px / 30px 52px'

FONT_OLD = re.compile(r'@font-face \{\s*font-family: "Geist";\s*src: url\("assets/fonts/geist\.woff2"\) format\("woff2"\);\s*font-weight: 100 900;\s*\}')
FONT_NEW = '''@font-face {
      font-family: "Archivo";
      src: url("assets/fonts/archivo.woff2") format("woff2");
      font-weight: 100 900;
      font-stretch: 62% 125%;
    }'''

SHADOWS = {
    # windows and devices: a 2 px ink outline and a hard ink offset, the app's button line
    'box-shadow: 0 0 0 1px #e2e7eb, 0 40px 90px -30px rgba(15, 27, 36, 0.35);': f'box-shadow: 0 0 0 2px {INK}, 12px 12px 0 2px {INK};',
    'box-shadow: 0 2px 4px rgba(15, 27, 36, 0.08), 0 60px 110px -40px rgba(15, 27, 36, 0.55);': f'box-shadow: 0 0 0 2px {INK}, 12px 12px 0 2px {INK};',
    # label cards: outline and a small hard offset
    'box-shadow: 0 0 0 1px #e2e7eb, 0 14px 34px -14px rgba(15, 27, 36, 0.4);': f'box-shadow: 0 0 0 2px {INK}, 5px 5px 0 2px {INK};',
    'box-shadow: 0 0 0 4px #ffffff, 0 4px 10px rgba(15, 27, 36, 0.3);': f'box-shadow: 0 0 0 4px #ffffff, 0 0 0 6px {INK};',
    'box-shadow: 0 0 0 3px #0e7c7b, 0 4px 10px rgba(15, 27, 36, 0.35);': f'box-shadow: 0 0 0 3px #1b4fd8, 0 0 0 5px {INK};',
    # lenses: a white rim and a thin ink line, no drop shadow
    'box-shadow: 0 0 0 9px #ffffff, 0 40px 80px -30px rgba(0, 0, 0, 0.55);': f'box-shadow: 0 0 0 9px #ffffff, 0 0 0 11px {INK};',
    'box-shadow: 0 0 0 8px #ffffff, 0 40px 80px -30px rgba(0, 0, 0, 0.55);': f'box-shadow: 0 0 0 8px #ffffff, 0 0 0 10px {INK};',
    'box-shadow: 0 0 0 7px #ffffff, 0 30px 60px -26px rgba(0, 0, 0, 0.55);': f'box-shadow: 0 0 0 7px #ffffff, 0 0 0 9px {INK};',
    'box-shadow: 0 0 0 7px #ffffff, 0 30px 60px -26px rgba(0, 0, 0, 0.45);': f'box-shadow: 0 0 0 7px #ffffff, 0 0 0 9px {INK};',
    'box-shadow: 0 0 0 6px #ffffff, 0 20px 44px -20px rgba(15, 27, 36, 0.45);': f'box-shadow: 0 0 0 6px #ffffff, 0 0 0 8px {INK};',
    'box-shadow: 0 0 0 4.5px #ffffff, 0 24px 50px -20px rgba(0, 0, 0, 0.5);': f'box-shadow: 0 0 0 4.5px #ffffff, 0 0 0 6.5px {INK};',
    'box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9), 0 18px 36px -18px rgba(0, 0, 0, 0.6);': f'box-shadow: 0 0 0 3px #ffffff, 0 0 0 5px {INK};',
    'box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.55);': f'box-shadow: 0 0 0 2px {INK}, 10px 10px 0 2px {INK};',
    'box-shadow: 0 0 10px rgba(15, 27, 36, 0.35);': 'box-shadow: none;',
}

COLORS = {
    '#0e7c7b': '#1b4fd8',  # teal accent -> cobalt
    '#0f6f6f': '#153fad',
    '#0f1b24': INK,  # ink
    '#4a5a66': '#4c525d',  # muted
    '#f5f7f8': '#ececec',  # ground
    '#e2e7eb': '#d5d7dc',  # rule
    '#f0f3f5': '#f2f3f5',  # well
    '#e7ecef': '#e3e5ea',
    '#cfd7dd': '#c4c8d0',
    '#a9b6be': '#a3a9b4',
    '#b8c0c5': '#a3a9b4',
    '#8fc7c3': '#a3a9b4',  # the grey a title starts from
    '#d92d20': '#b42318',  # urgent
    '#c4560a': '#9a4a06',  # review
    '#0a8456': '#1a7247',  # routine
    'rgba(15, 27, 36, 0.78)': 'rgba(11, 14, 20, 0.82)',
}

RADIAL = re.compile(r'background: radial-gradient\([^;]*#16928e[^;]*\);')

for f in sorted((ROOT / 'compositions').glob('*.html')):
    s = f.read_text()
    before = s
    s = FONT_OLD.sub(FONT_NEW, s)
    s = s.replace('font-family: "Geist", sans-serif;', 'font-family: "Archivo", sans-serif;')
    for a, b in SHADOWS.items():
        s = s.replace(a, b)
    for a, b in COLORS.items():
        s = re.sub(re.escape(a), b, s, flags=re.I)
    s = RADIAL.sub(f'background: {GROUND};', s)
    if s != before:
        f.write_text(s)
        print('restyled', f.name)
