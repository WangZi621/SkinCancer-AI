// Records real footage of the SkinScan AI web app for the demo video.
//
//   node capture/capture.mjs [--url https://wangzi621.github.io/SkinCancer-AI/] [--only 1,2]
//
// Output goes to video/capture/out/:
//   rec1_scan.mp4, rec2_heatmap.mp4, rec3_form.mp4, rec4_how.mp4, rec5_mobile.mp4, rec6_offline.mp4
//   shots/*.png       full-resolution stills for zoom shots
//   timings.json      when each action happened inside each recording (seconds)
//
// Video is recorded with the Chrome DevTools screencast (JPEG frames with timestamps),
// then rebuilt at a constant 30 fps with FFmpeg, which keeps UI text sharp. A small
// arrow cursor is drawn on the page so clicks read on camera; everything else is the
// app itself, unmodified.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const SHOTS = path.join(OUT, 'shots');
const FRAMES = path.join(OUT, '.frames');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const URL_BASE = arg('url', 'https://wangzi621.github.io/SkinCancer-AI/');
const ONLY = arg('only', '1,2,3,4,5,6').split(',').map(Number);

fs.mkdirSync(SHOTS, { recursive: true });
const timings = fs.existsSync(path.join(OUT, 'timings.json'))
  ? JSON.parse(fs.readFileSync(path.join(OUT, 'timings.json'), 'utf8'))
  : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- cursor overlay
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.9-1.3-2.9-6.5h6.3z" fill="#0f1b24" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, {
      position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none',
      transform: 'translate(-100px,-100px)', transition: 'scale 0.12s ease', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.25))',
    });
    document.body.appendChild(c);
    window.addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    window.addEventListener('mousedown', () => { c.style.scale = '0.86'; }, true);
    window.addEventListener('mouseup', () => { c.style.scale = '1'; }, true);
  });
`;

// ---------------------------------------------------------------- screencast recorder
async function startRecording(page, name, { maxWidth, maxHeight }) {
  const dir = path.join(FRAMES, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let t0 = null;
  let n = 0;
  const writes = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (t0 === null) t0 = metadata.timestamp;
    const file = path.join(dir, `${String(n++).padStart(6, '0')}.jpg`);
    frames.push({ file, t: metadata.timestamp - t0 });
    writes.push(fs.promises.writeFile(file, Buffer.from(data, 'base64')));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth, maxHeight, everyNthFrame: 1 });
  const wall0 = Date.now();
  const marks = {};
  const boxes = {};
  const rec = {
    mark(label) {
      marks[label] = +((Date.now() - wall0) / 1000).toFixed(2);
      console.log(`  [${name}] ${marks[label].toFixed(2)}s  ${label}`);
    },
    // Viewport-space boxes (CSS px) of elements at this moment; the edit points its camera at them.
    async boxes(label, selectors) {
      const out = await page.evaluate((sels) => {
        const r = {};
        for (const [k, sel] of Object.entries(sels)) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const b = el.getBoundingClientRect();
          r[k] = { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
        }
        return r;
      }, selectors);
      boxes[label] = { t: +((Date.now() - wall0) / 1000).toFixed(2), ...out };
    },
    async stop(outFile, size) {
      const wallEnd = (Date.now() - wall0) / 1000;
      await cdp.send('Page.stopScreencast');
      await Promise.all(writes);
      await cdp.detach().catch(() => {});
      if (!frames.length) throw new Error(`no frames for ${name}`);
      // concat list: each frame lasts until the next one; the last holds to the end
      const lines = [];
      frames.forEach((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(wallEnd, f.t + 0.1);
        lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
      });
      lines.push(`file '${frames.at(-1).file}'`);
      const list = path.join(dir, 'list.txt');
      fs.writeFileSync(list, lines.join('\n'));
      const [w, h] = size;
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
        '-vf', `scale=${w}:${h}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0xf5f7f8,fps=30,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', w > 2000 ? '17' : '14', '-movflags', '+faststart', outFile,
      ]);
      fs.rmSync(dir, { recursive: true, force: true });
      timings[name] = { file: path.basename(outFile), frames: frames.length, seconds: +wallEnd.toFixed(2), marks, boxes };
      CURRENT = null;
      fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(timings, null, 2));
      console.log(`  [${name}] ${frames.length} frames, ${wallEnd.toFixed(1)} s -> ${path.relative(HERE, outFile)}`);
    },
  };
  CURRENT = rec;
  return rec;
}
let CURRENT = null; // the recording in progress, so clicks can mark the moment they land

// ---------------------------------------------------------------- page helpers
async function waitModelReady(page) {
  await page.waitForFunction(
    () => /Model ready/.test(document.querySelector('#analyze-note')?.textContent || '') || window.skinscan?.state?.modelReady,
    null,
    { timeout: 180_000 },
  );
}

let mouse = { x: 960, y: 540 };
async function moveTo(page, locator, { steps = 28, dx = 0.5, dy = 0.5 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width * dx;
  const y = box.y + box.height * dy;
  // ease-out path
  const from = { ...mouse };
  for (let i = 1; i <= steps; i++) {
    const k = 1 - Math.pow(1 - i / steps, 3);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await sleep(14);
  }
  mouse = { x, y };
}
async function clickOn(page, locator, opts = {}) {
  await moveTo(page, locator, opts);
  await sleep(260);
  await page.mouse.down();
  if (CURRENT && opts.label) CURRENT.mark(`click ${opts.label}`);
  await sleep(90);
  await page.mouse.up();
}
async function typeInto(page, locator, text, label) {
  await clickOn(page, locator, { label });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(150);
  await page.keyboard.type(text, { delay: 140 });
}
async function smoothScrollTo(page, y, ms = 1200) {
  await page.evaluate(
    ([target, dur]) => new Promise((done) => {
      const start = window.scrollY;
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        window.scrollTo(0, start + (target - start) * e);
        if (k < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    }),
    [y, ms],
  );
}
// Puts the workbench just under the sticky top bar.
async function frameWorkbench(page, ms = 1100) {
  const y = await page.evaluate(() => document.querySelector('#workbench').getBoundingClientRect().top + window.scrollY - 84);
  await smoothScrollTo(page, y, ms);
}
async function waitResult(page) {
  await page.waitForSelector('#result:not([hidden])', { timeout: 120_000 });
}
async function waitPhoto(page) {
  await page.waitForFunction(() => document.querySelector('#scope').dataset.state === 'image', null, { timeout: 30_000 });
}

async function newDesktop(browser) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  mouse = { x: 1500, y: 700 };
  return { context, page };
}
const DESKTOP_REC = { maxWidth: 3840, maxHeight: 2160 };
const DESKTOP_OUT = [1920, 1080];
// Recordings 1 and 2 are zoomed into in the edit, so they keep the full 2x resolution.
const DESKTOP_OUT_2X = [3840, 2160];

async function warm(page, hash = '') {
  console.log('  loading the app and waiting for "Model ready"…');
  await page.goto(URL_BASE + hash, { waitUntil: 'load' });
  await waitModelReady(page);
}

// ---------------------------------------------------------------- recordings
// Selectors whose boxes the edit uses to aim its camera.
const SCAN_PARTS = {
  samples: '.sample-list',
  sample1: '.sample-list li:nth-child(1) .sample img',
  sample2: '.sample-list li:nth-child(2) .sample img',
  sample4: '.sample-list li:nth-child(4) .sample img',
  scope: '#scope',
  viewer: '.viewer',
  panel: '.panel',
  form: '#patient-form',
  age: '#age',
  sex: '.field-row .seg',
  bodymap: '#bodymap',
  fitz: '.fitz',
  diameter: '#diameter',
  analyze: '#analyze-btn',
  workbench: '#workbench',
};
const RESULT_PARTS = { ...SCAN_PARTS, verdict: '#verdict', scores: '#scores', heat: '#heat-btn', result: '#result' };

async function rec1(browser) {
  console.log('rec1: Sample 1 scan');
  const { context, page } = await newDesktop(browser);
  await warm(page);
  await frameWorkbench(page, 10);
  await page.mouse.move(mouse.x, mouse.y);
  await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, '01_empty_scope.png') });
  const r = await startRecording(page, 'rec1_scan', DESKTOP_REC);
  await r.boxes('start', SCAN_PARTS);
  await sleep(1400);
  await clickOn(page, page.locator('.sample').nth(0), { label: 'sample 1' });
  await waitPhoto(page);
  r.mark('photo loaded');
  await r.boxes('photo', SCAN_PARTS);
  await sleep(2600);
  await moveTo(page, page.locator('#analyze-btn'));
  await sleep(900);
  await clickOn(page, page.locator('#analyze-btn'), { label: 'analyze' });
  await waitResult(page);
  r.mark('result shown');
  await sleep(1400); // the app scrolls the result into view on its own
  r.mark('app scroll done');
  await r.boxes('result', RESULT_PARTS);
  await page.mouse.move(1880, 1000);
  mouse = { x: 1880, y: 1000 };
  await sleep(4000);
  r.mark('end');
  await r.stop(path.join(OUT, 'rec1_scan.mp4'), DESKTOP_OUT_2X);
  await page.screenshot({ path: path.join(SHOTS, '03_result_card.png') });

  // Recording 2 continues on the same result, from the same frame.
  console.log('rec2: heat map');
  const r2 = await startRecording(page, 'rec2_heatmap', DESKTOP_REC);
  await r2.boxes('start', RESULT_PARTS);
  await sleep(1000);
  await clickOn(page, page.locator('#heat-btn'), { label: 'heat map' });
  await page.waitForFunction(() => document.querySelector('#scope').dataset.heat === 'on', null, { timeout: 180_000 });
  r2.mark('heat map on');
  await page.mouse.move(1880, 1000);
  await sleep(3000);
  r2.mark('end');
  await r2.stop(path.join(OUT, 'rec2_heatmap.mp4'), DESKTOP_OUT_2X);
  await page.screenshot({ path: path.join(SHOTS, '04_heatmap_on.png') });
  await context.close();
}

async function rec3(browser) {
  console.log('rec3: Sample 2, form filled by hand');
  const { context, page } = await newDesktop(browser);
  await warm(page);
  await frameWorkbench(page, 10);
  await page.mouse.move(mouse.x, mouse.y);
  await sleep(500);
  const r = await startRecording(page, 'rec3_form', DESKTOP_REC);
  await r.boxes('start', SCAN_PARTS);
  await sleep(1200);
  await clickOn(page, page.locator('.sample').nth(1), { label: 'sample 2' });
  await waitPhoto(page);
  // Samples arrive with their details pre-filled; clear them so they can be entered by hand.
  await page.evaluate(() => {
    const f = document.querySelector('#patient-form');
    f.age.value = '';
    f.diameter.value = '';
    for (const n of ['sex', 'fitz', 'melanocytic']) {
      for (const r of f.querySelectorAll(`input[name="${n}"]`)) r.checked = r.value === (n === 'sex' ? 'unknown' : n === 'fitz' ? '' : 'unsure');
    }
    const s = document.querySelector('#site');
    s.value = '';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  r.mark('photo loaded');
  await r.boxes('form', SCAN_PARTS);
  await sleep(1000);
  await typeInto(page, page.locator('#age'), '30', 'age');
  await sleep(500);
  await clickOn(page, page.locator('.seg label', { hasText: 'Female' }).first(), { label: 'sex' });
  await sleep(700);
  await clickOn(page, page.locator('#bodymap .region[data-site="anterior torso"]').first(), { dx: 0.5, dy: 0.45, label: 'body map' });
  await sleep(900);
  await clickOn(page, page.locator('.fitz-2'), { label: 'skin type' });
  await sleep(700);
  await typeInto(page, page.locator('#diameter'), '8', 'diameter');
  await sleep(800);
  await clickOn(page, page.locator('#analyze-btn'), { label: 'analyze' });
  await waitResult(page);
  r.mark('result shown');
  await sleep(1400);
  r.mark('app scroll done');
  await r.boxes('result', RESULT_PARTS);
  await page.mouse.move(1880, 1000);
  await sleep(3500);
  r.mark('end');
  await r.stop(path.join(OUT, 'rec3_form.mp4'), DESKTOP_OUT_2X);
  await page.screenshot({ path: path.join(SHOTS, '05_sample2_result.png') });
  await context.close();
}

async function rec4(browser) {
  console.log('rec4: How it works');
  const { context, page } = await newDesktop(browser);
  await warm(page, '#/how');
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(600);
  // Page-space boxes for the limits scene, which pans across the full-page still.
  const pageBoxes = await page.evaluate(() => {
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(1), y: +(b.y + window.scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    };
    const rows = [...document.querySelectorAll('#view-how .facts tr')];
    const lis = [...document.querySelectorAll('#view-how .plain li')];
    const cards = [...document.querySelectorAll('#view-how .card')];
    const find = (list, text) => list.find((e) => e.textContent.includes(text));
    return {
      pageHeight: document.documentElement.scrollHeight,
      accuracyRow: box(find(rows, 'Overall accuracy')),
      resultsCard: box(find(cards, 'Results on 9,080')),
      limitsCard: box(find(cards, "What it can't do")),
      notDiagnose: box(find(lis, 'It does not diagnose')),
      pipeline: box(document.querySelector('#view-how .pipeline')),
    };
  });
  await page.screenshot({ path: path.join(SHOTS, '06_how_it_works.png'), fullPage: true });
  const r = await startRecording(page, 'rec4_how', DESKTOP_REC);
  await page.mouse.move(1880, 1000);
  await sleep(1500);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  r.mark('scroll start');
  await smoothScrollTo(page, max, 14000);
  r.mark('scroll end');
  await sleep(1500);
  await r.stop(path.join(OUT, 'rec4_how.mp4'), DESKTOP_OUT);
  timings.how_page = pageBoxes;
  fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(timings, null, 2));
  await context.close();
}

async function rec5(browser) {
  console.log('rec5: mobile, Sample 3');
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await warm(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  const r = await startRecording(page, 'rec5_mobile', { maxWidth: 1290, maxHeight: 2796 });
  await sleep(1200);
  const scopeY = await page.evaluate(() => document.querySelector('#workbench').getBoundingClientRect().top + window.scrollY - 12);
  await smoothScrollTo(page, scopeY, 1000);
  await sleep(500);
  const samplesY = await page.evaluate(() => document.querySelector('.samples').getBoundingClientRect().top + window.scrollY - 330);
  await smoothScrollTo(page, samplesY, 900);
  await sleep(500);
  r.mark('tap sample 3');
  await page.locator('.sample').nth(2).tap();
  await waitPhoto(page);
  r.mark('photo loaded');
  await sleep(500);
  await smoothScrollTo(page, scopeY, 800);
  await sleep(1000);
  const btnY = await page.evaluate(() => document.querySelector('#analyze-btn').getBoundingClientRect().top + window.scrollY - 640);
  await smoothScrollTo(page, btnY, 1400);
  await sleep(500);
  r.mark('tap analyze');
  await page.locator('#analyze-btn').tap();
  await waitResult(page);
  r.mark('result shown');
  await sleep(1400);
  const resY = await page.evaluate(() => document.querySelector('#result').getBoundingClientRect().top + window.scrollY - 16);
  await smoothScrollTo(page, resY, 900);
  await sleep(2500);
  r.mark('end');
  await r.stop(path.join(OUT, 'rec5_mobile.mp4'), [1290, 2796]);
  await page.screenshot({ path: path.join(SHOTS, '07_mobile_result.png') });
  await context.close();
}

// The model is loaded, the network is cut, and a scan still completes.
async function rec6(browser) {
  console.log('rec6: offline scan');
  const { context, page } = await newDesktop(browser);
  await warm(page);
  await frameWorkbench(page, 10);
  await page.locator('.sample').nth(3).click();
  await waitPhoto(page);
  await page.mouse.move(1500, 700);
  mouse = { x: 1500, y: 700 };
  await sleep(600);
  const r = await startRecording(page, 'rec6_offline', DESKTOP_REC);
  await r.boxes('start', SCAN_PARTS);
  await sleep(1500);
  await context.setOffline(true);
  const online = await page.evaluate(() => navigator.onLine);
  r.mark('network off');
  timings.rec6_navigator_onLine_after_cut = online;
  await sleep(1300);
  await clickOn(page, page.locator('#analyze-btn'), { label: 'analyze' });
  await waitResult(page);
  r.mark('result shown');
  await sleep(1400);
  r.mark('app scroll done');
  await r.boxes('result', RESULT_PARTS);
  await page.mouse.move(1880, 1000);
  await sleep(3000);
  r.mark('end');
  await r.stop(path.join(OUT, 'rec6_offline.mp4'), DESKTOP_OUT_2X);
  await page.screenshot({ path: path.join(SHOTS, '08_offline_result.png') });
  await context.close();
}

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
try {
  if (ONLY.includes(1) || ONLY.includes(2)) await rec1(browser);
  if (ONLY.includes(3)) await rec3(browser);
  if (ONLY.includes(4)) await rec4(browser);
  if (ONLY.includes(5)) await rec5(browser);
  if (ONLY.includes(6)) await rec6(browser);
} finally {
  await browser.close();
  fs.rmSync(FRAMES, { recursive: true, force: true });
}
console.log('done');
