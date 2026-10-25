# SPEC: SkinScan AI demo film (storyline A, "One lesion, start to finish")

GOAL: a judge who has never seen the app understands, without the narration, that it reads a
spot and the patient together, says how soon to refer, and is small enough to run offline on a
browser or a $15 board.

OUTPUT: HyperFrames, 1920 x 1080, 30 fps, silent (the narrator records over it). Twelve scenes,
each also rendered on its own.

TIME: about 123 s = 3,690 frames. No music clock; cuts follow the motion.

LOOK
- Two worlds and nothing else. App world: ground #f5f7f8, white cards, ink #0f1b24, muted
  #4a5a66, the real app recordings. Model world: radial teal, #16928e at the centre to #093f46
  at the edge (radial, never linear: H.264 bands linear gradients on dark grounds).
- Accent: brand teal #0e7c7b. Triage colours appear only where a real result is: urgent
  #d92d20, review #c4560a, routine #0a8456.
- Type: Geist only. Display 650, 88-110 px (8-10% of the frame height), tracking -3.5%. Lines
  44-64 px, 600-650. Labels 34-40 px, 500-600. Nothing read under 30 px.
- The one object: the lens. A photo in a circle, white rim 9-10 px, a 5-6 px ring outside it
  with a gap of 6-8% of the diameter. It sweeps (22 % arc) while something is computed and closes
  in the triage colour when a result exists. Every scene contains it.
- Depth: one soft shadow, 0 40 90 -30 rgba(15,27,36,.35) on windows and devices. No glow, no
  grain, no glass.

OBJECTS
- The real app: Playwright recordings at 3840 x 2160 (desktop) and 1290 x 2796 (phone). Never
  redrawn. The cursor is drawn by the capture at 34 CSS px so it reads at 4-6 % of the frame
  after a 1.6-2.2x punch-in.
- The eight sample lesions (docs/samples), shown as lenses.
- skinscan-v3.onnx, the model file, as a file card labelled with its real name and 21 MB.
- A Raspberry Pi Zero 2 W drawn to its real 65 x 30 mm board: green PCB, four corner holes,
  2 x 20 header holes along one long edge, the square RP3A0 package, mini HDMI, two micro USB,
  the camera connector. Swappable for a photo (assets/img/pi-zero-2w.*).
- The How it works page as a full-page capture, for the limits scene.

MOTION
- Camera (punch-ins, pans, pull-backs): power2.inOut, 0.55-0.8 s, then holds dead still while
  the UI acts. Never a slow creep.
- Arrivals: expo.out 0.6-0.9 s. Exits: power2.in at 40-50 % of the entrance.
- Titles: per word, blur 6 px to 0 and grey #8fa3ad to ink, 0.08 s apart; per letter for the
  name, 0.075 s apart. A landed title is still.
- Ring sweep: 22 % arc, 1.1 s per turn, power1.inOut; close: 0.6 s power2.inOut.
- Labels: attach to the part they name with a 2 px teal leader; leader draws (0.3 s), then the
  label blurs in (0.25 s). Labels never slide up.

TRANSITIONS (5 kinds, each caused on screen)
1. Match cut on the lens: 01 -> 02 (the chosen lesion lands on its thumbnail in the app),
   10 -> 03 (the scanned spot becomes the model's input).
2. One continuous take across a cut: 02 -> 04 (the next recording starts on the last frame).
3. Whip: 04 -> 10 (horizontal smear 0.2 s, the new frame sharpens in 0.13 s).
4. Container morph: 05 -> 09 (the browser window narrows into the phone).
5. Dip cut (outgoing frame darkens 40 % for 3 frames): 07 -> 06, 09 -> 12.
Plus colour floods where a scene changes world around a still lens (01 -> 02, 10 -> 03).

SHOTS
01 open      0-8 s     8 lesions already on screen; the question types per word; the lens ring
                       visits three spots and locks on Sample 1; the rest fall away; it grows to
                       the centre; the ring closes; "SkinScan AI" lands per letter.
02 scan      0-17.2 s  teal floods to the app as the lens lands on thumbnail 1; camera follows:
                       samples -> scope (photo lands) -> form ("Patient details") -> Analyze ->
                       scope while the ring sweeps -> pull back to the window -> push into the
                       verdict ("Result on the device").
04 heatmap   0-8.5 s   same frame; camera to "Show where it looked"; click; scope at 2.3x while
                       16 passes run (4x); before/after wipe; "Where the model looked".
10 form      0-12 s    whip in; Sample 2 typed by hand: age, sex, body map (punch-in 2.2x),
                       skin type, diameter; Analyze; routine result.
03 branches  0-12 s    the green-ringed spot floods to teal; the typed values become chips that
                       compress into 17 dots; the photo steps down into EfficientNet-B4; both
                       merge into three bars; "It reads the photo and the patient together."
11 training  0-10 s    45,400 cells draw in; 9,080 of them split off for validation; 218 ticks
                       draw for the epochs.
07 results   0-10 s    the lens as a gauge: 45,400 -> 93.2% AUC -> 90% at a 0.278 cutoff, each
                       number swapped mid-move; "Tested on 9,080 images it never trained on."
06 small     0-10 s    the model file and "21 MB"; it drops into a browser running the app;
                       the camera slides to a Pi Zero 2 W; the file lands on its chip; the ring
                       closes around it; "Even on a $15 Raspberry Pi Zero 2 W".
05 private   0-8 s     window on its ground; Wi-Fi crosses out ("Works offline"); punch-in to
                       the scope while the scan runs offline; result; "Nothing is uploaded".
09 mobile    0-8 s     the window morphs into the phone; Sample 3 on the phone; ring turns
                       orange behind it.
12 limits    0-13 s    the real How it works page; camera travels to 78.6 % overall accuracy and
                       circles it; then to "It does not diagnose"; then the disclaimer line.
08 outro     0-5 s     the lens becomes the logo (circle to rounded square, scan corners draw);
                       wordmark, URL, "Built by Jason Xiao", the disclaimer.

FACTS (only these on motion text): 45,400 biopsy-confirmed images (36,320 training, 9,080
validation); 93.2 % AUC (0.940 melanoma); 90.0 % melanoma sensitivity at 81.5 % specificity, cutoff
0.278; 78.6 % overall accuracy (limits scene only); 17 patient features; EfficientNet-B4; 218
epochs; 21 MB model in the browser; photos never leave the device; offline after the first visit;
research prototype, not a medical device; never "diagnoses". Raspberry Pi Zero 2 W at $15: the
author's own statement. No count-ups (they show numbers that are not facts).

BANNED: everything fading and sliding up; bottom pill captions on every shot; a small browser
window in the middle of an empty canvas; three cards in a row; the same entrance in every scene;
hard cuts between every scene; titles that drift after landing; a dark void with things floating;
glow, particles, glass; numbers that count through values; "$300".

QA: 01 at 0.0 (not empty), 3.0 (lock), 7.5 (name); every seam at -0.2/+0.2 s; 02 at each label;
04 mid-wipe; 03 when the dots merge; 06 on the Pi; 12 on the circled 78.6 %; 08 last frame.
