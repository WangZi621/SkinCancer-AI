"""Rewrite the site regions in docs/js/body-figures.js from tools/body/regions*.json.

The body outlines and bounding boxes in the module stay as they are (outlines from
react-native-body-highlighter 3.2.0, MIT; bboxes measured with SVG getBBox in Chrome).
Edit the polygons in tools/body/regions.json (male) or regions_f.json (female), then run:

    python3 tools/build_body_figures.py
"""
import json
import pathlib

root = pathlib.Path(__file__).resolve().parent
module = root.parent / 'docs' / 'js' / 'body-figures.js'
marker = 'export const FIGURES = '

text = module.read_text()
head, body = text.split(marker, 1)
figures = json.loads(body.strip().rstrip(';'))

for fig, name in (('m', 'regions.json'), ('f', 'regions_f.json')):
    regions = json.loads((root / 'body' / name).read_text())
    for view in ('front', 'back'):
        dx = 724 if (fig == 'm' and view == 'back') else 0  # the male back view sits beside the front
        figures[fig][view]['regions'] = {
            site: [' '.join(f'{x + dx:g},{y:g}' for x, y in poly) for poly in polys]
            for site, polys in regions[view].items()
        }

module.write_text(head + marker + json.dumps(figures, separators=(',', ':')) + ';\n')
print(f'wrote {module} ({module.stat().st_size // 1024} KB)')
