# SPEC: SkinScan AI demo film (storyline A, "One lesion, start to finish")

GOAL: a judge who has never seen the app understands, without the narration, that it reads a
spot and the patient together, says how soon to refer, keeps every patient's lesions and reports
encrypted on the device, and is small enough to run offline on a browser or a $15 board.

OUTPUT: HyperFrames, 1920 x 1080, 30 fps, silent (the narrator records over it). Sixteen scenes,
each also rendered on its own.

TIME: 168.3 s = 5,049 frames, in four acts: one lesion start to finish (01, 02, 04, 13, 14, 54.7 s),
what the model does (10, 03, 11, 07, 46 s), the rest of the app (15, 16, 05, 09, 39.6 s), small and
honest (06, 12, 08, 28 s). No music clock; cuts follow the motion.

LOOK (the app's own system, which follows the Stryde design system; see docs/DESIGN.md)
- One world, the app's. Ground: off-white #ececec under the fixed lattice (a triangular grid of
  rgba(20,33,61,.2) dots and 5% struts, 30 x 52 px tile, the app's own page ground at the same
  scale, so a full-frame recording and the scenes around it share it). It never moves with the
  camera. White sheets carry content. No teal world, no radial or linear gradients.
- Brand cobalt #1b4fd8: the lens arc while something is computed, label leaders and dots, links.
  Dress blue #14213d: display type and the app's deep panels. Ink #0b0e14: text and outlines.
  Muted ink #4c525d. Triage colours appear only where a real result is: urgent #b42318, review
  #9a4a06, routine #1a7247.
- Type: Archivo only. Display 850 at width 112-115 (font-stretch), 96-230 px, dress blue,
  tracking -2 to -3%. Lines 56-64 px, 750 at width 108. Labels 34-40 px, 600. Nothing read under
  30 px.
- The one object: the lens. A photo in a circle, white rim 7-10 px with a 2 px ink line outside it,
  a 5-6 px ring outside that with a gap of 6-8% of the diameter. It sweeps (22 % arc, cobalt)
  while something is computed and closes in the triage colour when a result exists.
- Depth: no soft shadows. Windows, devices and label cards carry the app's button line: a 2 px
  ink outline and a hard ink offset (12 px on windows, 5 px on labels). No glow, no glass.
- The logo is Contours (brand/logo): the outline of one spot at three visits. The outro builds it
  out of the lens.

OBJECTS
- The real app: Playwright recordings at 3840 x 2160 (desktop) and 1290 x 2796 (phone). Never
  redrawn. The cursor is drawn by the capture at 34 CSS px so it reads at 4-6 % of the frame
  after a 1.6-2.2x punch-in. Every recording is signed in to one profile, "Jason Xiao", locked
  with a passcode and holding the app's four demo patients (their scores come from the model).
- A real ciphertext: the first 90 base64 characters of a saved scan as IndexedDB stores it while
  the profile is locked (16).
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
- Labels: attach to the part they name with a 2 px cobalt leader; leader draws (0.3 s), then the
  label blurs in (0.25 s). Labels never slide up.

TRANSITIONS (5 kinds, each caused on screen)
1. Match cut on the lens: 01 -> 02 (the chosen lesion lands on its thumbnail in the app),
   10 -> 03 (the scanned spot becomes the model's input), 07 -> 15 (the gauge's lens lands on the
   same lesion's row at the top of the home screen).
2. One continuous take across a cut: 02 -> 04 -> 13 -> 14 and 15 -> 16 (each recording starts on
   the previous one's last frame, and each scene opens on the previous one's last framing).
3. Whip: 14 -> 10 (horizontal smear 0.2 s, the new frame sharpens in 0.13 s).
4. Container morph: 05 -> 09 (the browser window narrows into the phone).
5. Dip cut (outgoing frame darkens 40 % for 3 frames): 16 -> 05, 09 -> 06, 06 -> 12.
Plus colour floods where a scene changes world around a still lens (01 -> 02, 10 -> 03, 07 -> 15).
A label leaves (0.2 s) before any cut it would otherwise be cut off by.

SHOTS
01 open      0-8 s     8 lesions already on screen; the question types per word; the lens ring
                       visits three spots and locks on Sample 1; the rest fall away; it grows to
                       the centre; the ring closes; "SkinScan AI" lands per letter.
02 scan      0-15.6 s  the lattice gives way to the app as the lens lands on thumbnail 1 (Demo patient A's
                       left cheek, details filled in from her record); camera follows: samples ->
                       scope (photo lands, "Add a photo") -> the check under it ("Photo check") ->
                       form ("Patient details") -> Analyze -> scope while the ring sweeps -> pull
                       back to the window -> push into the verdict ("Result on the device").
04 heatmap   0-8.5 s   same frame; camera to "Show where it looked"; click; scope at 2.2x while
                       16 passes run (6.6x); before/after wipe; "Where the model looked".
13 track     0-14 s    same take: Save to patient; the dialog ("Linked to the lesion"); a note and
                       a one-month recheck ("Notes and a recheck"); saved ("Saved on this
                       device"); the lesion's page; the cursor reads its three scans on the chart
                       ("Every scan of this lesion"). The cursor travel between clicks plays at
                       3.3-4.25x, the clicks at 1-2.2x.
14 report    0-8.6 s   same take: Report; the one-page report ("Referral report"); Print or save
                       as PDF; the page scrolls to the lesion's history ("The lesion's history");
                       whip out.
10 form      0-14 s    whip in; Sample 2 typed by hand: age, sex, body map (punch-in 2.3x),
                       skin type, diameter; Analyze; routine result.
03 branches  0-12 s    the green-ringed spot leaves the app for the lattice; the typed values become chips that
                       compress into 17 dots; the photo steps down into EfficientNet-B4; both
                       merge into three bars; "It reads the photo and the patient together."
11 training  0-10 s    45,400 cells draw in; 9,080 of them split off for validation; 218 ticks
                       draw for the epochs.
07 results   0-10 s    the lens as a gauge: 45,400 -> 93.2% AUC -> 90% at a 0.278 cutoff, each
                       number swapped mid-move; "Tested on 9,080 images it never trained on."
15 clinic    0-11.8 s  the lens lands on Demo patient A's row, first in "See first" ("Urgent
                       first"); the overdue recheck ("Overdue rechecks"); Patients; Demo patient
                       A's body map, marker 1 red on the cheek ("Every lesion on a body map").
16 lock      0-10.8 s  same take: the account menu ("Lock when you step away"); Lock; the
                       sign-in screen with the stored ciphertext beside the profile ("Encrypted on
                       this device"); the passcode typed ("Only the passcode opens it"); back on
                       the patient; dip.
05 private   0-8 s     window on its ground; Wi-Fi crosses out ("Works offline"); punch-in to
                       the scope while the scan runs offline; result; "Nothing is uploaded".
09 mobile    0-9 s     the window morphs into the phone; the phone's home screen; the Scan tab;
                       Sample 3; ring turns orange behind it; dip.
06 small     0-10 s    the model file and "21 MB"; it drops into a browser running the app;
                       the camera slides to a Pi Zero 2 W; the file lands on its chip; the ring
                       closes around it; "Even on a $15 Raspberry Pi Zero 2 W"; dip.
12 limits    0-13 s    the real How it works page; camera travels to 78.6 % overall accuracy and
                       circles it; then to "It does not diagnose"; then the disclaimer line.
08 outro     0-5 s     the lens becomes the logo (circle to rounded square, scan corners draw);
                       wordmark, URL, "Built by Jason Xiao", the disclaimer.

FACTS (only these on motion text): 45,400 biopsy-confirmed images (36,320 training, 9,080
validation); 93.2 % AUC (0.940 melanoma); 90.0 % melanoma sensitivity at 81.5 % specificity, cutoff
0.278; 78.6 % overall accuracy (limits scene only); 17 patient features; EfficientNet-B4; 218
epochs; 21 MB model in the browser; photos never leave the device; offline after the first visit;
research prototype, not a medical device; never "diagnoses". Raspberry Pi Zero 2 W at $15: the
author's own statement. No count-ups (they show numbers that are not facts). The app scenes add
labels with no numbers: photo check, linked to the lesion, notes and a recheck, saved on this
device, every scan of this lesion, referral report, the lesion's history, urgent first, overdue
rechecks, every lesion on a body map, lock when you step away, encrypted on this device, only the
passcode opens it.

BANNED: everything fading and sliding up; bottom pill captions on every shot; a small browser
window in the middle of an empty canvas; three cards in a row; the same entrance in every scene;
hard cuts between every scene; titles that drift after landing; a dark void with things floating;
glow, particles, glass; numbers that count through values; "$300"; gradients of any kind;
violet or teal; soft drop shadows; a colour accent on one word of a headline.

QA: 01 at 0.0 (not empty), 3.0 (lock), 7.5 (name); every seam at -0.2/+0.2 s; 02 at each label;
04 mid-wipe; 13 at the dialog and the chart; 14 on the report; 15 when the lens lands and on the
body map; 16 on the ciphertext and the passcode; 03 when the dots merge; 06 on the Pi; 12 on the
circled 78.6 %; 08 last frame.
