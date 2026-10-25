# SkinScan AI demo film

A silent 1920 x 1080, 30 fps film (about two minutes) for the Congressional App Challenge, built with
[HyperFrames](https://hyperframes.heygen.com). Narration and face-cam are recorded separately.
Each of the twelve scenes also renders as its own clip.

```
STORYLINES.md         the three storylines considered, and why A was built
SPEC.md               the film as numbers: look, motion, transitions, shots, facts allowed on screen
REVIEW.md             what was checked, what was rebuilt, the weakest shot
capture/capture.mjs   Playwright script that records the real app
capture/out/          raw recordings, full-resolution stills, timings.json (click times and element boxes)
compositions/         one HyperFrames scene per clip; components/ holds the registry items they adapt
assets/               fonts, logo, sample photos, and the captures the scenes use
index.html            the full film: the scenes back to back in edit order
scripts/              render.mjs (every clip, frames, contact sheet, the film), build-roots.mjs
out/                  skinscan_demo.mp4, the twelve clips, frames/ and contact_sheet.png
```

## The film, in order

| # | Scene | What happens |
| --- | --- | --- |
| 01 | open | Eight biopsy-confirmed lesions; the question; the lens picks Sample 1; "SkinScan AI" |
| 02 | scan | Match cut onto Sample 1's thumbnail in the real app; the camera follows each click; Refer urgently |
| 04 | heatmap | Same frame continues; "Show where it looked"; 16 passes; before/after wipe |
| 10 | form | Whip to Sample 2, typed in by hand: age, sex, body map, skin type, size; routine result |
| 03 | two_branches | The scanned spot becomes the model's input; the typed values become 17 features; three scores |
| 11 | training | 45,400 cells, one per image; 9,080 split off for validation; 218 ticks for the epochs |
| 07 | results | The lens as a gauge: 45,400, 93.2% AUC, 90% of melanomas caught at a 0.278 cutoff |
| 06 | small_model | The 21 MB model file drops into a browser, then onto a $15 Raspberry Pi Zero 2 W |
| 05 | private | The network is cut and a scan still completes: "Works offline", "Nothing is uploaded" |
| 09 | mobile | The browser window morphs into a phone running Sample 3 |
| 12 | limits | The real How it works page: 78.6% circled, "It does not diagnose", the footer disclaimer |
| 08 | outro | The lens becomes the logo; URL, "Built by Jason Xiao", "Research prototype. Not a medical device." |

The Raspberry Pi Zero 2 W in 06 is a drawing to the board's real 65 x 30 mm layout, because no
photo of it was available here. To use a photo, replace the `<svg>` inside `#sm-pi` with an `<img>`.

## 1. Capture the app

Needs Node 22+, FFmpeg and Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).

```bash
node capture/capture.mjs                                   # records the live site
node capture/capture.mjs --url http://127.0.0.1:8765/       # or a local copy of docs/
node capture/capture.mjs --only 1,2                         # just some recordings
cp capture/out/*.mp4 capture/out/shots/*.png assets/capture/
```

It waits for "Model ready" before each recording, records through the Chrome DevTools screencast
at 2x, and rebuilds each recording at a constant 30 fps. A 34 px arrow cursor is drawn on the page so
clicks read after a punch-in. `timings.json` logs the moment of every click and the on-screen box of
every part the camera aims at; the scenes' camera shots are written from it. A new recording can
shift those times by a few tenths of a second, so check them before re-rendering.

| File | What it shows |
| --- | --- |
| `rec1_scan.mp4` (3840 x 2160) | Sample 1 (melanoma in situ): pick, details, Analyze, Refer urgently |
| `rec2_heatmap.mp4` (3840 x 2160) | "Show where it looked" on that result until the heat map shows |
| `rec3_form.mp4` (3840 x 2160) | Sample 2 with the form typed in by hand |
| `rec4_how.mp4` | The How it works page, slow scroll (raw footage, not in the film) |
| `rec5_mobile.mp4` (1290 x 2796) | Sample 3 on a 430 x 932 phone viewport |
| `rec6_offline.mp4` (3840 x 2160) | Sample 4 analyzed after the browser goes offline (`navigator.onLine` false) |
| `shots/*.png` | 2x stills, including the full How it works page |

## 2. Preview and render

```bash
npm install
node scripts/build-roots.mjs            # after changing the clip list, durations or order
npx hyperframes preview                 # the whole film in the Studio
npx hyperframes check                   # lint, layout and contrast checks
node scripts/render.mjs --film          # every clip, frames, contact sheet, and out/skinscan_demo.mp4
node scripts/render.mjs --only 04 --quality draft
```

If HyperFrames cannot find Chrome, run `npx hyperframes browser ensure`, or point
`HYPERFRAMES_BROWSER_PATH` at a Chrome Headless Shell binary.
