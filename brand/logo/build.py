"""Build the three logo concepts as SVG: symbols (256 x 256, black), the wordmark as outlines
from Mona Sans, and horizontal lockups.

    python3 brand/logo/build.py            # needs fonttools and brotli (pip install fonttools brotli)

Writes brand/logo/concepts/*.svg.
"""
import math
import pathlib

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'concepts'
OUT.mkdir(exist_ok=True)
FONT = ROOT.parent.parent / 'docs' / 'fonts' / 'mona-sans.woff2'
INK = '#000'


def f(x):
    return f'{x:.2f}'.rstrip('0').rstrip('.')


def blob(cx, cy, r, radii, rot=0.0):
    """Closed smooth curve through points at even angles with radius r * radii[i]
    (Catmull-Rom converted to cubic Beziers, so the curve has no corners)."""
    n = len(radii)
    pts = []
    for i, k in enumerate(radii):
        a = math.radians(rot + i * 360 / n - 90)
        pts.append((cx + r * k * math.cos(a), cy + r * k * math.sin(a)))
    d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
    return d + 'Z'


def circle(cx, cy, r):
    return f'M{f(cx - r)} {f(cy)}a{f(r)} {f(r)} 0 1 0 {f(2 * r)} 0a{f(r)} {f(r)} 0 1 0 {f(-2 * r)} 0Z'


def svg(paths, view='0 0 256 256', extra=''):
    body = ''.join(f'<path d="{d}"{" " + a if a else ""}/>' for d, a in paths)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" fill="{INK}">{extra}{body}</svg>\n'


# A slightly asymmetric spot: the A in ABCDE, kept smooth so it doesn't look lumpy.
SPOT = [1.0, 0.95, 1.04, 0.97, 0.92, 1.03, 0.97]
# the odd spot in B is a little less regular than the rest, so it differs in shape as well as size
ODD = [1.0, 0.91, 1.06, 0.96, 0.89, 1.05, 0.97]

# ---------------------------------------------------------------- A: circled spot
def concept_a(n=12, R=96, dot=12, spot=50):
    paths = []
    for i in range(n):
        a = math.radians(-90 + i * 360 / n)
        paths.append((circle(128 + R * math.cos(a), 128 + R * math.sin(a), dot), ''))
    paths.append((blob(129, 130, spot, SPOT, rot=8), ''))
    return paths


# ---------------------------------------------------------------- B: odd one out
def concept_b(odd=(1, 2), r=22, big=38):
    xs = (50, 128, 206)
    paths = []
    for row in range(3):
        for col in range(3):
            if (row, col) == odd:
                paths.append((blob(xs[col], xs[row], big, ODD, rot=12), ''))
            else:
                paths.append((circle(xs[col], xs[row], r), ''))
    return paths


# ---------------------------------------------------------------- C: contours
def ring(cx, cy, r, w, radii, rot):
    # the spot's outline as a filled band (outer shape minus inner, drawn with evenodd), not a stroke
    return blob(cx, cy, r + w / 2, radii, rot) + blob(cx, cy, r - w / 2, radii, rot)


def concept_c(w=16, gap_near=10):
    # Outlines of the same spot at three visits. They nearly share the upper-left edge and
    # spread toward the lower right, where the spot grew. Offsets are along the diagonal.
    k = 1 / math.sqrt(2)
    r2, r1, r0 = 100, 54, 24
    c2 = 128
    c1 = c2 - ((r2 - w / 2) - (r1 + w / 2) - gap_near) * k
    c0 = c1 - ((r1 - w / 2) - r0 - gap_near) * k
    return [
        (ring(c2, c2, r2, w, SPOT, 8), 'fill-rule="evenodd"'),
        (ring(c1, c1, r1, w, SPOT, 8), 'fill-rule="evenodd"'),
        (blob(c0, c0, r0, SPOT, 8), ''),
    ]


# ---------------------------------------------------------------- wordmark
def wordmark(text='SkinScan AI', wdth=115, wght=800, track=-0.012):
    font = TTFont(FONT)
    inst = instancer.instantiateVariableFont(font, {'wdth': wdth, 'wght': wght})
    gs = inst.getGlyphSet()
    cmap = inst.getBestCmap()
    upm = inst['head'].unitsPerEm
    hmtx = inst['hmtx']
    cap = inst['OS/2'].sCapHeight
    pen = SVGPathPen(gs)
    x = 0
    for ch in text:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (1, 0, 0, -1, x, cap))  # flip y, baseline at cap height
        gs[g].draw(tp)
        x += hmtx[g][0] + track * upm
    width = x - track * upm
    return pen.getCommands(), width, cap


def lockup(symbol_paths, name):
    d, w, cap = wordmark()
    # symbol 256 tall; cap height of the wordmark = 0.42 of the symbol, centred on it
    s = 256 * 0.42 / cap
    gap = 64
    tx = 256 + gap
    ty = (256 - cap * s) / 2
    total = tx + w * s
    word = f'<path transform="translate({f(tx)} {f(ty)}) scale({s:.5f})" d="{d}"/>'
    sym = ''.join(f'<path d="{p}"{" " + a if a else ""}/>' for p, a in symbol_paths)
    (OUT / f'{name}-lockup.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(total)} 256" fill="{INK}">{sym}{word}</svg>\n'
    )


if __name__ == '__main__':
    for name, paths in (('a', concept_a()), ('b', concept_b()), ('c', concept_c())):
        (OUT / f'{name}-symbol.svg').write_text(svg(paths))
        lockup(paths, name)
    print('wrote', sorted(p.name for p in OUT.iterdir()))
