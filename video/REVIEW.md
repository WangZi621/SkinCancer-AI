# Review notes

## What changed in this pass, and why

The first cut was a set of separate clips: a small browser window in the middle of a flat ground,
pill captions sliding up at the bottom, every scene fading in the same way, and hard cuts between
them. That is the generated-film look the HyperFrames skill bans by name. This pass follows the
skill's whole work loop, which the first cut skipped: `story.md` (STORYLINES.md), `spec.md`
(SPEC.md), the registry (`/hyperframes-registry`), `/media-use`, and `snapshot --review`.

- **One storyline.** One real lesion travels the film: picked out of eight, read by the app, then the
  hand-typed example flows into the model. The lens circle is the shape every scene holds.
- **The real UI, punched in.** A spring camera adapted from the registry's `cursor-zoom-follow`
  follows each click on the 4K recordings at 1.45-2.6x, holds still while the app acts, and pulls
  back to the whole window once per scene. A bigger cursor was recorded so it reads at that size.
- **Labels on the part they name** (dot, leader, card) instead of bottom captions.
- **Transitions with a cause:** match cuts on the circle (01 to 02, 10 to 03, adapted from
  `match-cut`), one continuous take across 02 to 04, a whip (04 to 10), a container morph (05 to 09),
  colour floods, and dip cuts at three seams. Render-time motion blur on the camera scenes.
- **Explained, not listed:** 03 grows one diagram from the hand-typed values; 11 draws one cell per
  training image; 12 circles the real 78.6% on the app's own page.
- **$300 removed.** The kiosk clip is now "06 small model": the 21 MB file in a browser, then on a
  $15 Raspberry Pi Zero 2 W.

## What was rebuilt on top of the footage

The page runs the model on its main thread, so the screencast receives no frames while a scan or
the heat map runs. In those stretches the recordings are frozen. Two pieces of the app's UI are
redrawn over them, from `docs/app.css`, at the exact page position:
- the scanning ring (22 % arc, 1.1 s a turn, brand teal) and the "Analyzing" pill (02, 05, 10);
- the mapping ring and "Mapping n of 16" pill (04).
Everything else on the app is the recording. The heat-map wipe in 04 uses two real full-resolution
stills of the same frame.

## What was measured

- `npx hyperframes check`: passes. Warnings kept on purpose: `film_silent` (silent by request),
  `nested_media_start_basis_ambiguous` (04 plays one recording in three speeds; local times are
  intended), `duplicate_media_discovery_risk` (03 shows the same photo as four network stages).
- `snapshot --review`: every scene's start and middle, a strip across all 11 seams, and the phone
  sheet. Found and fixed: the flood still in 03 painting over the lens, blank first frames in 06 and 11,
  a low-contrast ring on the Pi, a label covering the scores in 02.
- Every render's `ffprobe` length matches its composition.
- Facts on screen are from SPEC.md's list. The app itself also shows its own scores (82%, 89%, ...)
  and writes the cutoff as "27.8%". "$15 Raspberry Pi Zero 2 W" is the author's statement; the
  README and the kiosk page in `docs/` still describe the kiosk as a Raspberry Pi 5.

## What nobody checked

- Sound: there is none. No music source was reachable (no HeyGen sign-in, no local model).
- The live site was blocked from this environment, so the footage is the same `docs/` app served
  locally. The browser bar shows the real URL.

## Weakest shot

06: the Pi Zero 2 W is a drawing, not a photo. A real photo (or a short clip of the board running the
model) would be stronger and would also prove the claim on screen.
