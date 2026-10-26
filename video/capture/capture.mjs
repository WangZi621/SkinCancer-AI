// Records real footage of the SkinScan AI web app for the demo video.
//
//   node capture/capture.mjs [--url http://127.0.0.1:8765/] [--only 1,3]
//
// Every recording runs signed in to one profile, "Jason Xiao", protected with a passcode and
// loaded with the app's demo patients (their scores come from the model on the device).
//
// Output goes to video/capture/out/:
//   rec1_scan, rec2_heatmap, rec7_track, rec9_report, rec8_clinic, rec10_lock  one continuous session
//   rec3_form, rec6_offline, rec5_mobile, rec4_how                            separate sessions
//   shots/*.png       full-resolution stills for zoom shots
//   timings.json      when each action happened inside each recording (seconds), and element boxes
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
const URL_BASE = arg('url', 'http://127.0.0.1:8765/');
const ONLY = arg('only', '1,3,4,5,6').split(',').map(Number);

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
async function typeInto(page, locator, text, label, delay = 140) {
  await clickOn(page, locator, { label });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await sleep(150);
  await page.keyboard.type(text, { delay });
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

// ---------------------------------------------------------------- the profile
const PASSCODE = '2468';
const PROFILE = { name: 'Jason Xiao', role: 'Medical student', org: 'Westlake clinic' };
let BACKUP = null; // the seeded profile, exported once and restored into each new browser
let IDS = null;

// Hash changes only: a reload would forget the unlocked profile's key.
async function go(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await sleep(250);
}

/** Open the app signed in to the demo profile, with the model loaded. */
async function seed(page) {
  console.log('  loading the app, signing in and waiting for the model…');
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.skinscan?.store, null, { timeout: 30_000 });
  if (!BACKUP) {
    await page.evaluate((p) => window.skinscan.store.createProfile(p), { ...PROFILE, passcode: PASSCODE });
    await go(page, '#/home');
    await page.waitForSelector('#h-demo');
    await page.click('#h-demo');
    await page.waitForSelector('#view-home:not([hidden]) .home-grid', { timeout: 300_000 });
    BACKUP = await page.evaluate(() => window.skinscan.store.exportBackup());
  } else {
    await page.evaluate(async ([text, pass]) => {
      const p = await window.skinscan.store.importBackup(text);
      await window.skinscan.store.unlock(p.id, pass);
    }, [BACKUP, PASSCODE]);
    await go(page, '#/home');
  }
  await waitModelReady(page);
  IDS = await page.evaluate(() => {
    const s = window.skinscan.store;
    const pt = (n) => s.patients().find((p) => p.name === n);
    const a = pt('Demo patient A');
    return { a: a.id, cheek: s.lesionsOf(a.id).find((l) => l.label === 'Left cheek').id };
  });
  await sleep(3600); // let the welcome toast leave
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
  quality: '#quality',
  age: '#age',
  sex: '.field-row .seg',
  bodymap: '#bodymap',
  fitz: '.fitz',
  diameter: '#diameter',
  abcde: '#abcde',
  analyze: '#analyze-btn',
  workbench: '#workbench',
};
const RESULT_PARTS = { ...SCAN_PARTS, verdict: '#verdict', scores: '#scores', heat: '#heat-btn', result: '#result', save: '#save-btn', actions: '.result-actions' };

// The long desktop session: one lesion from scan to report, then the clinic and the lock.
async function sessionA(browser) {
  const { context, page } = await newDesktop(browser);
  await seed(page);

  console.log('rec1: Sample 1 scanned for Demo patient A, Left cheek');
  await go(page, `#/scan?patient=${IDS.a}&lesion=${IDS.cheek}`);
  await page.waitForSelector('#view-scan:not([hidden]) .ctx');
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
  await sleep(150);
  await r.boxes('photo', SCAN_PARTS);
  await page.screenshot({ path: path.join(SHOTS, '02_photo_loaded.png') });
  await sleep(2300);
  await moveTo(page, page.locator('#analyze-btn'));
  await sleep(900);
  await clickOn(page, page.locator('#analyze-btn'), { label: 'analyze' });
  await waitResult(page);
  r.mark('result shown');
  await sleep(1400); // the app scrolls the result into view on its own when it needs to
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
  mouse = { x: 1880, y: 1000 };
  await sleep(3000);
  r2.mark('end');
  await r2.stop(path.join(OUT, 'rec2_heatmap.mp4'), DESKTOP_OUT_2X);
  await page.screenshot({ path: path.join(SHOTS, '04_heatmap_on.png') });

  // Recording 7: save the scan to the patient's lesion, then open the lesion's history.
  console.log('rec7: save and lesion history');
  const r7 = await startRecording(page, 'rec7_track', DESKTOP_REC);
  await r7.boxes('start', RESULT_PARTS);
  await sleep(900);
  await clickOn(page, page.locator('#save-btn'), { label: 'save' });
  await page.waitForSelector('#dlg[open]');
  r7.mark('dialog open');
  await sleep(350);
  const DLG = { dlg: '#dlg', summary: '#dlg .save-summary', patient: '#sv-patient', lesion: '#sv-lesion', notes: '#dlg textarea[name=notes]', recheck: '#dlg select[name=recheck]', ok: '#dlg button[value=ok]' };
  await r7.boxes('dialog', DLG);
  await sleep(1100);
  await typeInto(page, page.locator('#dlg textarea[name=notes]'), 'Refer this week.', 'notes', 95);
  await sleep(500);
  await moveTo(page, page.locator('#dlg select[name=recheck]'));
  await sleep(350);
  await page.selectOption('#dlg select[name=recheck]', '30');
  r7.mark('recheck set');
  await sleep(800);
  await clickOn(page, page.locator('#dlg button[value=ok]'), { label: 'save scan' });
  await page.waitForSelector('#saved-to:not([hidden])');
  r7.mark('saved');
  await sleep(150);
  await r7.boxes('saved', { savedTo: '#saved-to', link: '#saved-to a', result: '#result', actions: '.result-actions' });
  await sleep(1600);
  await clickOn(page, page.locator('#saved-to a'), { label: 'open lesion' });
  await page.waitForSelector('#view-lesion:not([hidden]) .ch-svg');
  r7.mark('lesion page');
  await sleep(200);
  const LESION = { crumbs: '#view-lesion .crumbs', head: '#view-lesion .page-head', number: '#view-lesion .lc-n-lg', verdict: '#view-lesion .ls-top .verdict', recheck: '#ls-recheck', chartCard: '#ls-chart', chart: '#ls-chart .ch-svg', delta: '#view-lesion .delta', report: '#view-lesion .head-actions a[href^="#/report"]' };
  await r7.boxes('lesion', LESION);
  timings.rec7_chart_points = await page.evaluate(() =>
    [...document.querySelectorAll('#ls-chart .ch-dot.ch-mel:not(.ch-key)')].map((d) => {
      const b = d.getBoundingClientRect();
      return { x: +(b.x + b.width / 2).toFixed(1), y: +(b.y + b.height / 2).toFixed(1) };
    }),
  );
  await sleep(1700);
  for (const [i, p] of timings.rec7_chart_points.entries()) {
    await page.mouse.move(p.x, p.y + 30, { steps: 26 });
    mouse = { x: p.x, y: p.y + 30 };
    r7.mark(`hover scan ${i + 1}`);
    await sleep(900);
  }
  await page.mouse.move(1880, 1000, { steps: 20 });
  mouse = { x: 1880, y: 1000 };
  await sleep(1200);
  r7.mark('end');
  await r7.stop(path.join(OUT, 'rec7_track.mp4'), DESKTOP_OUT_2X);
  await page.screenshot({ path: path.join(SHOTS, '09_lesion_page.png') });

  // Recording 9: the referral report for that scan.
  console.log('rec9: referral report');
  const r9 = await startRecording(page, 'rec9_report', DESKTOP_REC);
  await sleep(800);
  await clickOn(page, page.locator('#view-lesion .head-actions a[href^="#/report"]'), { label: 'report' });
  await page.waitForSelector('#view-report:not([hidden]) .report-doc');
  r9.mark('report shown');
  await sleep(200);
  const REPORT = { doc: '#report-doc', head: '.rd-head', by: '.rd-by', photo: '.rd-scope', facts: '.rd-facts', verdict: '#report-doc .verdict', scores: '#report-doc .scores', print: '#rp-print', cols: '.rd-cols', hist: '.rd-hist', foot: '.rd-foot' };
  await r9.boxes('report', REPORT);
  await sleep(1600);
  await moveTo(page, page.locator('#rp-print'));
  r9.mark('hover print');
  await sleep(1000);
  const histY = await page.evaluate(() => document.querySelector('.rd-hist').getBoundingClientRect().top + window.scrollY - 420);
  r9.mark('scroll start');
  await smoothScrollTo(page, histY, 1500);
  r9.mark('scroll end');
  await r9.boxes('scrolled', REPORT);
  await page.mouse.move(1880, 1000, { steps: 10 });
  mouse = { x: 1880, y: 1000 };
  await sleep(1800);
  r9.mark('end');
  await r9.stop(path.join(OUT, 'rec9_report.mp4'), DESKTOP_OUT_2X);
  await smoothScrollTo(page, 0, 10);
  await page.screenshot({ path: path.join(SHOTS, '10_report.png'), fullPage: true });

  // Recording 8: the clinic view. Home, then the patient's body map.
  console.log('rec8: home and body map');
  await go(page, '#/home');
  await page.waitForSelector('#view-home:not([hidden]) .home-grid');
  await page.mouse.move(1500, 700);
  mouse = { x: 1500, y: 700 };
  await sleep(600);
  const HOME = { head: '#view-home .page-head', stats: '#view-home .stats', queue: '#view-home .queue', firstRow: '#view-home .q-row', rechecks: '#view-home .home-side .card:first-child', overdue: '#view-home .due-late', recent: '#view-home .home-side .card:last-child', navPatients: '.nav a[data-route=patients]' };
  const r8 = await startRecording(page, 'rec8_clinic', DESKTOP_REC);
  await r8.boxes('home', HOME);
  await page.screenshot({ path: path.join(SHOTS, '11_home.png') });
  await sleep(1200);
  await moveTo(page, page.locator('#view-home .q-row').first(), { dx: 0.3 });
  r8.mark('hover first');
  await sleep(1300);
  await moveTo(page, page.locator('#view-home .due-late').first());
  r8.mark('hover overdue');
  await sleep(1300);
  await clickOn(page, page.locator('.nav a[data-route=patients]'), { label: 'patients' });
  await page.waitForSelector('#view-patients:not([hidden]) .rows');
  r8.mark('patients');
  await r8.boxes('patients', { rows: '#view-patients .rows', rowA: '#view-patients .row' });
  await sleep(900);
  await clickOn(page, page.locator('#view-patients .row').first(), { dx: 0.3, label: 'patient A' });
  await page.waitForSelector('#view-patient:not([hidden]) .lesion-cards');
  r8.mark('patient');
  await sleep(200);
  await r8.boxes('patient', { head: '#view-patient .page-head', map: '#pt-map', mapCard: '#view-patient .pt-map', lesions: '#view-patient .lesion-cards', mark1: '#pt-map .mark:nth-child(1) circle', mark2: '#pt-map .mark:nth-child(2) circle' });
  await sleep(1000);
  await moveTo(page, page.locator('#pt-map .mark').first(), { steps: 24 });
  r8.mark('hover mark 1');
  await sleep(1600);
  r8.mark('end');
  await r8.stop(path.join(OUT, 'rec8_clinic.mp4'), DESKTOP_OUT_2X);

  // Recording 10: lock the profile, then unlock it with the passcode.
  console.log('rec10: lock and unlock');
  const LOCK = { account: '#account-btn', menu: '#account-menu', lock: '#menu-lock', card: '.profile-card', unlock: '.unlock:not([hidden])', input: '.unlock:not([hidden]) input', unlockBtn: '.unlock:not([hidden]) button' };
  const r10 = await startRecording(page, 'rec10_lock', DESKTOP_REC);
  await r10.boxes('start', LOCK);
  await sleep(900);
  await clickOn(page, page.locator('#account-btn'), { label: 'account' });
  await sleep(150);
  await r10.boxes('menu', LOCK);
  await sleep(900);
  await clickOn(page, page.locator('#menu-lock'), { label: 'lock' });
  await page.waitForSelector('#view-signin:not([hidden]) .profile-card');
  r10.mark('locked');
  await sleep(150);
  await r10.boxes('signin', LOCK);
  timings.cipher_sample = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open('skinscan');
    req.onsuccess = () => {
      const g = req.result.transaction('records').objectStore('records').getAll();
      g.onsuccess = () => {
        const row = g.result.find((x) => x.kind === 'scan' && x.box);
        let s = '';
        for (const b of row.box.ct.subarray(0, 96)) s += String.fromCharCode(b);
        res({ kind: row.kind, bytes: row.box.ct.length, base64: btoa(s) });
      };
    };
  }));
  await sleep(1500);
  await clickOn(page, page.locator('.profile-card').first(), { label: 'profile' });
  await page.waitForSelector('.unlock:not([hidden]) input');
  await sleep(150);
  await r10.boxes('unlock', LOCK);
  await sleep(500);
  await typeInto(page, page.locator('.unlock:not([hidden]) input'), PASSCODE, 'passcode', 230);
  await sleep(500);
  await clickOn(page, page.locator('.unlock:not([hidden]) button'), { label: 'unlock' });
  await page.waitForSelector('#view-patient:not([hidden]) .lesion-cards', { timeout: 30_000 });
  r10.mark('unlocked');
  await page.mouse.move(1880, 1000, { steps: 10 });
  mouse = { x: 1880, y: 1000 };
  await sleep(1800);
  r10.mark('end');
  await r10.stop(path.join(OUT, 'rec10_lock.mp4'), DESKTOP_OUT_2X);
  await context.close();
}

async function rec3(browser) {
  console.log('rec3: Sample 2, form filled by hand (quick scan)');
  const { context, page } = await newDesktop(browser);
  await seed(page);
  await go(page, '#/scan?patient=');
  await page.waitForSelector('#view-scan:not([hidden]) .ctx');
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
    f.abcde_d.checked = false;
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
  await seed(page);
  await go(page, '#/how');
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
      footer: box(document.querySelector('.footer-brand')),
    };
  });
  await page.mouse.move(1880, 1000);
  await page.screenshot({ path: path.join(SHOTS, '06_how_it_works.png'), fullPage: true });
  const r = await startRecording(page, 'rec4_how', DESKTOP_REC);
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
  console.log('rec5: mobile, home then Sample 3');
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await seed(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  const r = await startRecording(page, 'rec5_mobile', { maxWidth: 1290, maxHeight: 2796 });
  await sleep(1600);
  r.mark('tap scan tab');
  await page.locator('.tabbar .tab-scan').tap();
  await page.waitForSelector('#view-scan:not([hidden]) .ctx');
  await sleep(900);
  const samplesY = await page.evaluate(() => document.querySelector('.samples').getBoundingClientRect().top + window.scrollY - 330);
  await smoothScrollTo(page, samplesY, 1000);
  await sleep(450);
  r.mark('tap sample 3');
  await page.locator('.sample').nth(2).tap();
  await waitPhoto(page);
  r.mark('photo loaded');
  await sleep(400);
  const scopeY = await page.evaluate(() => document.querySelector('#workbench').getBoundingClientRect().top + window.scrollY - 70);
  await smoothScrollTo(page, scopeY, 800);
  await sleep(900);
  const btnY = await page.evaluate(() => document.querySelector('#analyze-btn').getBoundingClientRect().top + window.scrollY - 600);
  await smoothScrollTo(page, btnY, 1300);
  await sleep(450);
  r.mark('tap analyze');
  await page.locator('#analyze-btn').tap();
  await waitResult(page);
  r.mark('result shown');
  await sleep(1400);
  const resY = await page.evaluate(() => document.querySelector('#result').getBoundingClientRect().top + window.scrollY - 70);
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
  await seed(page);
  await go(page, '#/scan?patient=');
  await page.waitForSelector('#view-scan:not([hidden]) .ctx');
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
  if (ONLY.some((n) => [1, 2, 7, 8, 9, 10].includes(n))) await sessionA(browser);
  if (ONLY.includes(3)) await rec3(browser);
  if (ONLY.includes(4)) await rec4(browser);
  if (ONLY.includes(5)) await rec5(browser);
  if (ONLY.includes(6)) await rec6(browser);
} finally {
  await browser.close();
  fs.rmSync(FRAMES, { recursive: true, force: true });
}
fs.writeFileSync(path.join(OUT, 'timings.json'), JSON.stringify(timings, null, 2));
console.log('done');
