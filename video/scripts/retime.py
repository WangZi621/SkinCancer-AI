"""Move every scene's recording clips onto a new take of the same recordings.

Each scene plays its recording in clips (data-media-start, data-playback-rate, data-duration),
tuned so that clicks land at chosen moments in the scene. A new take has the same layout but
its clicks happen a little earlier or later. This maps media time from the old take to the
new one, piecewise-linearly through the marks both takes logged (capture/out/timings.json),
and rewrites each clip's media start and rate so every event stays where the scene expects it.

    python3 scripts/retime.py OLD_TIMINGS.json [NEW_TIMINGS.json]   # default new: capture/out/timings.json

It prints what it changed and warns when a clip would run past the end of its recording.
Camera shots and labels are not touched: they are page positions, which a new take keeps.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
old_t = json.loads(pathlib.Path(sys.argv[1]).read_text())
new_t = json.loads(pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ROOT / 'capture/out/timings.json').read_text())


def mapping(rec):
    o, n = old_t[rec], new_t[rec]
    pts = [(0.0, 0.0)]
    for k, v in o['marks'].items():
        if k in n['marks']:
            pts.append((v, n['marks'][k]))
    pts = sorted(set(pts))
    # keep the map increasing: drop any point that would fold time back
    mono = [pts[0]]
    for a, b in pts[1:]:
        if a > mono[-1][0] and b > mono[-1][1]:
            mono.append((a, b))

    def f(m):
        if m <= mono[0][0]:
            return m
        for (a0, b0), (a1, b1) in zip(mono, mono[1:]):
            if m <= a1:
                return b0 + (m - a0) * (b1 - b0) / (a1 - a0)
        a, b = mono[-1]
        return b + (m - a)

    return f, n['seconds']


VIDEO = re.compile(r'<video\b[^>]*\bsrc="assets/capture/(rec\d+_\w+)\.mp4"[^>]*>')


def attr(tag, name):
    m = re.search(rf'\b{name}="([^"]*)"', tag)
    return float(m.group(1)) if m else None


def set_attr(tag, name, value):
    if re.search(rf'\b{name}="[^"]*"', tag):
        return re.sub(rf'\b{name}="[^"]*"', f'{name}="{value}"', tag)
    return tag.replace(' data-track-index=', f' {name}="{value}" data-track-index=', 1)


for path in sorted((ROOT / 'compositions').glob('*.html')):
    text = path.read_text()
    out = text
    for m in VIDEO.finditer(text):
        tag = m.group(0)
        rec = m.group(1)
        if rec not in old_t or rec not in new_t:
            continue
        f, length = mapping(rec)
        start = attr(tag, 'data-media-start') or 0.0
        rate = attr(tag, 'data-playback-rate') or 1.0
        dur = attr(tag, 'data-duration')
        s_new = f(start)
        e_new = f(start + dur * rate)
        r_new = (e_new - s_new) / dur
        new_tag = set_attr(tag, 'data-media-start', f'{s_new:.2f}')
        if abs(r_new - 1) > 0.015 or rate != 1.0:
            new_tag = set_attr(new_tag, 'data-playback-rate', f'{r_new:.3f}'.rstrip('0').rstrip('.'))
        warn = '  ! runs past the end of the take' if e_new > length + 0.01 else ''
        print(f'{path.name:24s} {rec:14s} media {start:6.2f} x{rate:.3f} -> {s_new:6.2f} x{r_new:.3f}  (ends {e_new:5.2f} of {length:5.2f}){warn}')
        out = out.replace(tag, new_tag, 1)
    if out != text:
        path.write_text(out)
