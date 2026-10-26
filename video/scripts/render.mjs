// Renders every clip to out/NN_name.mp4, pulls 6 frames from each into out/frames/,
// and builds out/contact_sheet.png.
//   node scripts/render.mjs [--quality delivery|looks|draft] [--only 02,04] [--film]
// Each clip gets a temporary one-clip root file while it renders (the project keeps
// a single root, index.html, so `hyperframes check` sees one entry point).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, CLIPS, clipRoot } from './build-roots.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const QUALITY = arg('quality', 'delivery');
const ONLY = arg('only', CLIPS.map((c) => c.n).join(',')).split(',');
const OUT = path.join(ROOT, 'out');
const FRAMES = path.join(OUT, 'frames');
fs.mkdirSync(FRAMES, { recursive: true });

const probe = (f) =>
  +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();

for (const c of CLIPS.filter((c) => ONLY.includes(c.n))) {
  const tmp = path.join(ROOT, `.render-${c.n}.html`);
  const mp4 = path.join(OUT, `${c.file}.mp4`);
  fs.writeFileSync(tmp, clipRoot(c));
  console.log(`rendering ${c.file} (${c.dur} s, ${QUALITY})`);
  try {
    // stdin stays attached: with it closed, the render's FFmpeg encoder exits early
    execFileSync('npx', ['hyperframes', 'render', '-c', path.basename(tmp), '-o', mp4, '--quality', QUALITY], {
      cwd: ROOT,
      stdio: ['inherit', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const d = probe(mp4);
  console.log(`  -> ${path.relative(ROOT, mp4)}  ${d.toFixed(2)} s`);
  for (let k = 0; k < 6; k++) {
    const t = ((k + 0.5) / 6) * d;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', mp4, '-frames:v', '1', path.join(FRAMES, `${c.file}_${k + 1}.png`)]);
  }
}

execFileSync('python3', [path.join(ROOT, 'scripts', 'contact_sheet.py'), OUT], { stdio: 'inherit' });

// --film also renders index.html, every clip back to back, to out/skinscan_demo.mp4
if (args.includes('--film')) {
  const film = path.join(OUT, 'skinscan_demo.mp4');
  console.log(`rendering the full film (${QUALITY})`);
  execFileSync('npx', ['hyperframes', 'render', '-o', film, '--quality', QUALITY], {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  });
  console.log(`  -> ${path.relative(ROOT, film)}  ${probe(film).toFixed(2)} s`);
}
