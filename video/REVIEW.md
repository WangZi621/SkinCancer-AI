# Review notes

## Creative calls

- Every clip is built around the round lesion viewer: the opener's ring sweep, the photo node in the
  branch diagram, the zoomed scope in the heat map, the marker rings on the kiosk photo, the ring
  gauge behind the numbers, the ring around the logo and the ring behind the phone. Wherever a
  result lands, the ring closes in that result's triage colour (red for Sample 1, orange for Sample 3).
- The clips with the app in them (02, 04, 05, 09) play the real Playwright recordings; nothing in
  the app UI is redrawn. The URL in the browser toolbar is drawn on; the footage itself was recorded
  from `docs/` served on localhost (see "What nobody checked").
- 04 wipes from the plain photo to the heat map across the zoomed scope, because the app's heat map
  is a soft orange wash that is easy to miss when it simply fades in.
- 07 reveals each number whole instead of counting up, so no frame ever shows a figure that is not
  on the facts list. The ring does the counting motion instead.
- No storyline options were drafted: the brief fixed every clip's content, length and captions.

## What was measured

- `npx hyperframes check`: passes. Warnings kept on purpose:
  - `film_silent`: the clips are silent by request.
  - `first_frame_empty`: each clip is cut into a narrated edit, so its entrance is the point.
  - `dead_stretch` at the end of 03: the closing line holds for reading (`data-hold`).
- Every render's `ffprobe` duration matches its composition length.
- Six frames per clip were pulled into `out/frames/` and reviewed on `out/contact_sheet.png`:
  no clipped text, no overlaps on the key text, and all copy is at least 28 px on a 1080 frame
  except the decorative URL in the browser toolbar.
- On-screen numbers were checked against the facts list: 45,400; 93.2% AUC; 90% at a 0.278 cutoff;
  9,080; EfficientNet-B4; 17 features; About $300. The app's own UI, as recorded, also shows its live
  scores (for example "82%") and writes the cutoff as "27.8%"; those are the real app on screen.

## What nobody checked

- The live site (`wangzi621.github.io`) and GitHub were blocked from this build environment, so the
  footage was recorded from the same `docs/` folder served locally. Re-run
  `node capture/capture.mjs` from a normal connection to record the live site, then copy
  `capture/out/*` into `assets/capture/` and re-render. Timings in the scenes come from
  `capture/out/timings.json`; a new recording may shift actions by a few tenths of a second.
- Nothing was heard (there is no sound).

## Weakest shot

04: during the 16 occlusion passes the page is busy running the model, so the recording has few
frames and the mapping ring barely moves. The clip plays that stretch at 4x under the camera push.
With more time: record the mapping progress from a faster machine, or let `capture.mjs` throttle
the occlusion passes so the ring visibly fills.
