# Brag plan: Stryde

Invocation: `/brag --full --tone "calm, clinical product film for a student science competition"`
Tone preset: `polished` (serious, elegant), kept calm and clinical per the direction. Format: landscape
1920 x 1080. Music and SFX: none (no music source was reachable from this environment; see the end).

Only the brag SKILL.md was available; its `references/` files (inspect, plan, compose, deliver, audio,
tones) and bundled music were not. This plan follows the steps and gates SKILL.md states directly.

## Planning rubric

1. **What is it?** A skin cancer triage tool. A clinician adds a dermoscopic photo and optional patient
   details; the model returns three scores and suggests how soon to refer.
2. **Who is it for?** Clinicians deciding who to send to a dermatologist first; here, judges of a
   student app challenge.
3. **The one thing to show:** it looks at a real spot and says "Refer urgently", on the device.
4. **What makes it this project and no other?** The round lesion viewer with the sweeping ring; real
   biopsy-confirmed ISIC samples; a model small enough to run in a browser or on a $15 board.
5. **Actual copy to use:** "Which skin spots need a dermatologist first?", "Refer urgently",
   "Possible melanoma", the app's own UI text, "Research prototype. Not a medical device."
6. **Real numbers:** 21 MB model; 90% of melanomas caught at a 0.278 cutoff; $15 Raspberry Pi Zero 2 W
   (the author's statement).
7. **Key visual:** the lens: a lesion photo in a white-rimmed circle with a ring that sweeps, then
   closes in the triage colour.
8. **Hook:** eight real lesions already on screen, the question typed over them.
9. **What must never appear:** "diagnoses", invented numbers, generic SaaS lines, "$300".

## Creative angle

One spot, picked out of eight, read by the real app in real time. The lens circle carries the eye
from the hook to the logo. Calm pacing: one move at a time, every line held long enough to read.

## Storyboard (27.5 s)

Rebuilt for the rename: every scene is now the film's own Stryde scene (Archivo, cobalt and dress
blue on the off-white lattice, hard ink outlines, no soft shadows), cut down, and the scan uses the
new signed-in recording.

| Time | Scene | On screen | Text (hold) | Transition out |
| --- | --- | --- | --- | --- |
| 0.0-6.5 | Hook and reveal | 8 lesions; the ring visits three, locks on Sample 1; the rest fall away; it grows to centre | "Which skin spots need a dermatologist first?"; "Stryde" (4.0-5.9) | Match cut: the lens lands on its thumbnail |
| 6.5-14.0 | The scan, real UI | the photo lands in the scope; Analyze; the ring sweeps while the model runs; pull back to the whole app; push into the verdict | "Result on the device" (12.25-13.75) | Hard cut |
| 14.0-18.5 | Small model | a Raspberry Pi Zero 2 W drawn to scale; the 21 MB model file drops onto its chip; the ring closes | "Even on a $15 Raspberry Pi Zero 2 W" (14.2-18.5) | Hard cut on the ring |
| 18.5-22.0 | One number | the lens as a gauge filling to 90 % in red | "90%" / "of melanomas caught at a 0.278 cutoff" (18.8-22.0) | Hard cut |
| 22.0-27.5 | Outro | the lens becomes the Contours mark; the Stryde wordmark wipes in | URL, "Built by Jason Xiao", "Research prototype. Not a medical device." | End |

SFX cues (if sound is added later): a soft click on each real cursor click (7.7 s and 9.2 s), a
low tick per ring sweep, one gentle impact when the verdict lands (10.6 s) and when the logo forms
(23.9 s).

## Music cue guidance

No bundled track or catalog access in this environment, so the cut is delivered silent. If a calm
track is added: enter on a strong bar at 0.0, let the bar after the verdict (about 8.8 s) be the lift,
fade over the last 1.5 s under the outro.
