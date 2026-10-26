# Voiceover script

Read over `out/skinscan_demo.mp4` (2:48). Times are where each line starts in the film. Each line
fits its scene at a calm pace (about 2.5 words a second). If you finish early, just pause; the edit
will line it up.

## Face-cam intro (record on camera, about 8 s, goes before the film)

> Hi, I'm Jason Xiao, and this is SkinScan AI: an app that helps clinics decide which skin spots
> should see a dermatologist first.

## Over the film

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Eight skin spots, the question | Every day, clinics have to decide which skin spots need a dermatologist first. I built SkinScan AI to help. |
| 0:08 | The real app: pick a photo, Analyze | Here's the real app. I pick a photo, and it first checks that it's sharp and well lit. The patient's details fill in from their record. I hit Analyze, and in about a second it says: refer urgently. |
| 0:24 | Heat map | I can also see where the model looked. The bright areas mattered most to its answer. |
| 0:32 | Save, the lesion's chart | I save the scan to this patient's lesion, add a note, and set a recheck for one month. Every scan of this lesion lands on one chart, so it can be followed over time. |
| 0:46 | Referral report | One click makes a referral report, with the photo, the scores, my notes and the lesion's history, ready to print. |
| 0:55 | Second spot, typed by hand | A second example, typed in by hand: age, sex, where it is on the body, skin type and size. The model uses all of it, because a dermatologist never judges a spot from the picture alone. |
| 1:09 | Inside the model | Inside, an EfficientNet-B4 network reads the photo, a second branch reads 17 patient features, and they combine into three scores: melanoma, another skin cancer, or benign. |
| 1:21 | Training data | I trained it on 45,400 biopsy-confirmed images, and held back 9,080 it never trained on. Training ran for 218 epochs. |
| 1:31 | Results | On those held-back images it scored 93.2 percent AUC, and at a cutoff of 0.278 it catches 90 percent of melanomas. |
| 1:41 | Home screen, body map | Back in the app, the home screen puts the most urgent lesions first and flags overdue rechecks, and every patient gets a body map of their lesions. |
| 1:52 | Lock and passcode | Patient data stays private. With a passcode, everything is encrypted on the device, and only that passcode opens it. |
| 2:03 | Offline scan | Nothing is ever uploaded. Even with the internet off, a scan still works. |
| 2:11 | Phone | It works on a phone too: the same app, right in the browser. |
| 2:20 | 21 MB, Raspberry Pi | The whole model is just 21 megabytes, small enough to run in a browser, or even on a fifteen-dollar Raspberry Pi Zero 2 W. |
| 2:30 | How it works page, limits | It has limits. Overall accuracy is 78.6 percent, darker skin is under-represented in the training data, and it does not diagnose. It suggests how soon to refer; a biopsy decides. |
| 2:43 | Logo | SkinScan AI. A research prototype, not a medical device. Thanks for watching. |

## Face-cam outro (optional, about 5 s)

> Thanks for watching. The app is free at wangzi621.github.io/SkinCancer-AI.

With the intro the video runs about 2:56. If the competition limit is 3:00, skip the outro or
ask for the film to be trimmed.

## Recording tips

- Record the "Over the film" part as one take, top to bottom, while the film plays on another
  screen, so your pace follows the pictures. Small mistakes are fine; pause and say the line again.
- Quiet room, phone 20-30 cm from your mouth, no music in the background.
- Phone voice memo or video both work. Upload the file(s) and the edit puts them together.
- Never say "diagnoses"; say "flags", "suggests how soon to refer" or "triages".
