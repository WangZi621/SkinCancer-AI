# Voiceover script

Read over `out/stryde_demo.mp4` (2:58). The first 11 seconds are your own footage with its own
sound (the kiosk, "Am I gonna die?", you sitting down, "my mom doesn't actually have cancer"), so
the voiceover starts at **0:11**, when the Stryde title comes up.

Times are where each line starts in the film. Each line fits its scene at a calm pace (about 2.5
words a second). If you finish a line early, pause; the edit lines it up.

## Over the film

| Time | On screen | Say |
| --- | --- | --- |
| 0:00 | Your footage (kiosk, hello, mom) | Nothing. Its own sound plays. |
| 0:11 | Eight skin spots, then the Stryde title | Clinics have to decide which skin spots see a dermatologist first. I built Stryde to help them. |
| 0:18 | The real app: pick a photo, Analyze | This is the real app. I pick a photo, and it checks that it's sharp and well lit. The patient's details fill in from their record. I hit Analyze, and in about a second it says: refer urgently. |
| 0:33 | Heat map | I can see where the model looked. The clear areas mattered most to its answer, and the darkened ones mattered least. |
| 0:41 | Save, the lesion's chart | I save the scan to this patient's lesion, add a note, and set a recheck for one month. Every scan of this lesion lands on one chart, so it can be followed over time. |
| 0:55 | Referral report and letter | One click makes a referral report with the photo, the scores, my notes and the lesion's history. It also drafts the referral letter from a few answers, like how the spot has changed. |
| 1:08 | Second spot, typed by hand | A second spot, typed in by hand: age, sex, body site, skin type and size. The model uses all of it, because doctors don't judge a spot from the picture alone. |
| 1:22 | Inside the model | Inside, an EfficientNet-B4 network reads the photo, a second branch reads 17 patient features, and they combine into three scores: melanoma, another skin cancer, or benign. |
| 1:34 | Training data | I trained it in TensorFlow on 45,400 images from the ISIC archive, and held back 9,080 it never trained on. |
| 1:42 | Results | On those held-back images it scored 93.2 percent AUC, and at a cutoff of 0.278 it catches 90 percent of melanomas. |
| 1:52 | Home screen, body map | Back in the app, the home screen puts the most urgent lesions first and flags overdue rechecks. Every patient gets a body map of their lesions. |
| 2:03 | Lock and passcode | Patient data stays private. With a passcode, every patient and scan is encrypted on the device, and only that passcode opens it. |
| 2:14 | Offline scan | Nothing is ever uploaded. Even with the internet off, a scan still works. |
| 2:21 | Phone | It runs on a phone too. It's the same app in the browser, written in JavaScript, with the model running on ONNX Runtime Web. |
| 2:30 | 21 MB, Raspberry Pi | The whole model is 21 megabytes, small enough for a browser, or even a fifteen-dollar Raspberry Pi Zero 2 W. |
| 2:40 | How it works page, limits | It has limits. Overall accuracy is 78.6 percent, and darker skin is under-represented in the training data. Stryde only suggests how soon to refer. A biopsy decides. |
| 2:52 | Logo | Stryde. A research prototype, not a medical device. Thanks for watching. |

That covers what the competition asks for: who you are (your footage), the app's name, what it
does and who it's for (0:11), how it works (0:18 to 2:21), and the tools you used (TensorFlow,
EfficientNet-B4, JavaScript, ONNX Runtime Web, Raspberry Pi).

## Recording tips

- Record the whole table as one take while the film plays on another screen, starting when the
  title comes up at 0:11, so your pace follows the pictures. Small mistakes are fine; pause and
  say the line again.
- Quiet room, phone 20 to 30 cm from your mouth, no music in the background.
- A phone voice memo or video both work. Upload the file and the edit puts it under the film.
- Never say "diagnoses"; say "flags", "suggests how soon to refer" or "triages".
- The app's name is Stryde, said like "stride".
