# Brag plan: SkinScan AI

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

## Storyboard (24.5 s)

| Time | Scene | On screen | Text (hold) | Transition out |
| --- | --- | --- | --- | --- |
| 0.0-5.5 | Hook and reveal | 8 lesions; the ring visits two, locks on Sample 1; the rest fall away; it grows to centre | "Which skin spots need a dermatologist first?" (0.1-2.9); "SkinScan AI" (3.6-5.3) | Match cut: the lens accelerates into the cut |
| 5.5-12.5 | The scan, real UI | the lens lands on its thumbnail; camera follows the click; the scope while the model runs; the camera settles on the verdict | "Result on the device" (10.8-12.5) | Dip cut |
| 12.5-17.0 | Small model | "21 MB"; a Raspberry Pi Zero 2 W drawn to scale; the model file drops onto its chip; the ring closes | "Even on a $15 Raspberry Pi Zero 2 W" (13.4-17.0) | Hard cut on the ring |
| 17.0-20.5 | One number | the lens as a gauge filling to 90 % in red | "90%" / "of melanomas caught at a 0.278 cutoff" (17.3-20.5) | Hard cut |
| 20.5-24.5 | Outro | lens becomes the logo; wordmark wipes in | URL, "Built by Jason Xiao", "Research prototype. Not a medical device." (21.7-24.5) | End |

SFX cues (if sound is added later): a soft click on the real cursor click (6.9 s), a low tick per
ring sweep, one gentle impact when the verdict lands (8.8 s) and when the logo forms (21.0 s).

## Music cue guidance

No bundled track or catalog access in this environment, so the cut is delivered silent. If a calm
track is added: enter on a strong bar at 0.0, let the bar after the verdict (about 8.8 s) be the lift,
fade over the last 1.5 s under the outro.
