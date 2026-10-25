// The clip list, plus the root (index.html) that plays the clips back to back as the full film.
//   node scripts/build-roots.mjs        rewrites index.html
// scripts/render.mjs uses the same list to write a one-clip root for each render.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLIPS = [
  { n: '01', id: 'open', dur: 7.5 },
  { n: '02', id: 'scan', dur: 18 },
  { n: '03', id: 'branches', file: '03_two_branches', dur: 11.5 },
  { n: '04', id: 'heatmap', dur: 8.5 },
  { n: '05', id: 'private', dur: 8 },
  { n: '06', id: 'kiosk', dur: 9 },
  { n: '07', id: 'results', dur: 10 },
  { n: '08', id: 'outro', dur: 5 },
  { n: '09', id: 'mobile', dur: 8 },
  { n: '10', id: 'form', dur: 13 },
  { n: '11', id: 'training', dur: 12 },
  { n: '12', id: 'limits', dur: 16 },
].map((c) => ({ ...c, file: c.file || `${c.n}_${c.id}` }));

// The order the clips play in the assembled film (index.html, rendered to out/skinscan_demo.mp4).
export const FILM = ['open', 'scan', 'form', 'branches', 'heatmap', 'mobile', 'private', 'kiosk', 'training', 'results', 'limits', 'outro'];

const host = (c, start) => `      <div
        id="${c.id}"
        data-composition-id="${c.id}"
        data-composition-src="compositions/${c.file}.html"
        data-start="${start}"
        data-duration="${c.dur}"
        data-track-index="1"
        data-track-kind="graphics"
        data-width="1920"
        data-height="1080"
      ></div>`;

export const page = (rootId, dur, hosts, title) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>${title}</title>
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #f5f7f8; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${rootId}" data-start="0" data-duration="${dur}" data-width="1920" data-height="1080">
${hosts}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["${rootId}"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;

export const clipRoot = (c) => page(`clip${c.n}`, c.dur, host(c, 0), c.file);

export function reelStarts() {
  let t = 0;
  return FILM.map((id) => CLIPS.find((c) => c.id === id)).map((c) => {
    const s = +t.toFixed(2);
    t += c.dur;
    return { ...c, start: s };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const clips = reelStarts();
  const total = clips.at(-1).start + clips.at(-1).dur;
  fs.writeFileSync(path.join(ROOT, 'index.html'), page('film', +total.toFixed(2), clips.map((c) => host(c, c.start)).join('\n'), 'SkinScan AI demo'));
  console.log(`index.html written: ${CLIPS.length} clips, ${total.toFixed(1)} s`);
  for (const c of clips) console.log(`  ${c.file.padEnd(16)} starts at ${c.start}s`);
}
