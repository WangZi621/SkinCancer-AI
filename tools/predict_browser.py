"""Run the web app's own preprocessing + LiteRT.js model in headless Chromium on
every sample and write the scores, for comparison with predict_python.py.
Usage: python3 tools/predict_browser.py http://127.0.0.1:8766/index.html docs/samples/samples.json OUT.json"""
import asyncio, json, sys
from playwright.async_api import async_playwright

JS = """async ({items}) => {
  const ss = window.skinscan;
  await ss.model.load(() => {});
  const out = {};
  for (const s of items) {
    const blob = await (await fetch(s.image)).blob();
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const t = ss.resizeToInput(ss.readPixels(bmp), ss.model.inputSize);
    const a = await ss.model.predict(t, ss.encodeMetadata(s.patient));
    const b = await ss.model.predict(t, ss.encodeMetadata({ sex: 'unknown', melanocytic: 'unsure' }));
    out[s.id] = { with: Array.from(a.probs), photo_only: Array.from(b.probs), ms: a.ms };
  }
  return out;
}"""

async def main(url, samples_json, out):
    data = json.load(open(samples_json))
    items = data['samples'] if isinstance(data, dict) else data
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        await pg.goto(url)
        await pg.wait_for_function('window.skinscan !== undefined')
        res = await pg.evaluate(JS, {'items': items})
        await b.close()
    json.dump(res, open(out, 'w'), indent=1)
    print('wrote', len(res))

asyncio.run(main(*sys.argv[1:4]))
