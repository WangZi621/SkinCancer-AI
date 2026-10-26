# Review notes

## Second pass: the app grew, so the film did

The app went from one page to a product: profiles with an optional passcode that encrypts
everything on the device, a home screen that sorts lesions by urgency, patients with a body map,
a page per lesion with its scans on one chart, referral reports, a photo check before the model
runs. The film now shows those parts on the same lesion it already followed.

- **Re-recorded, signed in.** Every recording now runs inside one profile with the demo patients, so
  the scan in 02 is for Demo patient A's left cheek and her details fill in from her record. The old
  footage showed the one-page app.
- **Four new scenes, one take.** 13 (save, then the lesion's history), 14 (the report), 15 (the home
  screen and body map) and 16 (lock and passcode). 02 -> 04 -> 13 -> 14 is one recording session,
  and 15 -> 16 another, so each scene opens on the previous one's last frame and framing.
- **Speed ramps instead of jump cuts.** In 13 and 16 the cursor's travel between clicks plays at
  2-4.25x and the clicks themselves near real time, as separate segments of the same recording.
- **A third match cut.** 07's gauge lens lands on the same lesion's row at the top of the home
  screen (15), so the clinic view opens on the patient we already met.
- **Proof, not a claim, for encryption.** 16 shows the first 90 base64 characters of a real saved
  scan, read from IndexedDB while the profile was locked.
- **Re-aimed.** The photo check moves the samples down 125 px and the observations panel moves
  Analyze down 112 px, so 02, 05 and 10 got new shots (Analyze is framed at the page's foot instead of
  centred, so the camera never shows past the window), new ring timings and a "Photo check" label.
- **Seams.** `snapshot --review` found three labels and a chart tooltip cut off at a seam (02 -> 04,
  13 -> 14, 15 -> 16); each now leaves 0.2 s before the cut. It also flagged two reveal errors in 07
  (numbers that only became visible in their from-values), fixed.

## First pass

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
- `snapshot --review`: every scene's start and middle, a strip across all 15 seams, and the phone
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
