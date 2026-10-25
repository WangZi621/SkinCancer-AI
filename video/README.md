# SkinScan AI demo clips

Silent 1920x1080, 30 fps motion clips for the Congressional App Challenge video, built with
[HyperFrames](https://hyperframes.heygen.com). Narration and face-cam are recorded separately.

```
capture/capture.mjs   Playwright script that records the real app (see below)
capture/out/          raw recordings, full-resolution stills, timings.json
compositions/         one HyperFrames scene per clip
assets/               fonts, logo, kiosk photo, and copies of the captures used by the scenes
index.html            all nine clips back to back, for previewing
scripts/              render.mjs (renders every clip), build-roots.mjs, contact_sheet.py
out/                  the rendered clips, frames/ and contact_sheet.png
```

## 1. Capture the app

Needs Node 22+, FFmpeg and Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).

```bash
node capture/capture.mjs                                   # records the live site
node capture/capture.mjs --url http://127.0.0.1:8765/       # or a local copy of docs/
node capture/capture.mjs --only 1,2                         # just some recordings
```

It waits for "Model ready" before each recording and records through the Chrome DevTools
screencast, then rebuilds each recording at a constant 30 fps. A small arrow cursor is drawn on
the page so clicks read on camera. Everything else on screen is the app.

| File | What it shows |
| --- | --- |
| `rec1_scan.mp4` (3840x2160) | Sample 1 (melanoma in situ): photo, details, Analyze, Refer urgently |
| `rec2_heatmap.mp4` (3840x2160) | "Show where it looked" on that result, 16 passes until the heat map shows |
| `rec3_form.mp4` | Sample 2 with the form typed in by hand: age, sex, body map, skin type, diameter |
| `rec4_how.mp4` | The How it works page, slow scroll |
| `rec5_mobile.mp4` (1290x2796) | Sample 3 on a 430x932 phone viewport |
| `rec6_offline.mp4` | Sample 4 analyzed after the browser goes offline (`navigator.onLine` false) |
| `shots/*.png` | 2x stills: empty scope, photo loaded, result card, heat map on, and more |

`timings.json` lists when each action happens inside each recording; the scenes are timed from it.

## 2. Preview and render

```bash
npm install
node scripts/build-roots.mjs            # after changing the clip list or durations
npx hyperframes preview                 # all clips in the Studio
npx hyperframes check                   # lint, layout and contrast checks
node scripts/render.mjs                 # every clip to out/, plus frames and the contact sheet
node scripts/render.mjs --only 04 --quality draft
```

If HyperFrames cannot find Chrome, run `npx hyperframes browser ensure`, or point
`HYPERFRAMES_BROWSER_PATH` at a Chrome Headless Shell binary.

## Style

Light scenes use `#f5f7f8`, white cards, ink `#0f1b24` and muted `#4a5a66`. Dark scenes use a radial
teal gradient from `#16928e` to `#093f46` (radial, because linear gradients band in H.264). Brand
teal `#0e7c7b`; triage red `#d92d20`, orange `#c4560a`, green `#0a8456`. Geist from
`docs/fonts/geist.woff2`, 650 for headlines. Every clip is built around the round lesion viewer and
its ring.
