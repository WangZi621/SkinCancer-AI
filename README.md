# SkinScan AI

Skin cancer triage that reads a dermoscopic photo and the patient's details together, and runs on hardware a small clinic already has.

**Try it:** https://wangzi621.github.io/SkinCancer-AI/

SkinScan AI sorts a skin lesion into one of three groups (melanoma, other skin cancer, or benign) and suggests how soon the patient should see a dermatologist: refer urgently, refer for review, or routine follow-up. It is built to help a clinician decide who to send first. It does not diagnose.

It comes in two forms that run the same INT8 model:

| | Web app | Kiosk |
|---|---|---|
| Where it runs | Any modern browser, phone or laptop | Raspberry Pi 5 in a 3D printed case |
| Code | [`docs/`](docs) (HTML, CSS, JavaScript) | [`kiosk/`](kiosk) (Python, Flask, pygame) |
| Inference | LiteRT.js in WebAssembly, on the device | LiteRT on the Pi |
| Internet | Only for the first load, then works offline | Never |
| Cost | Free | About $300 in parts |

## What the web app does

- Takes a photo from a file, the camera, drag and drop, or one of eight sample images.
- Asks for optional patient details: age, sex, body site (tap a body map), Fitzpatrick skin type, lesion diameter, and whether the lesion looks melanocytic.
- Shows the three model scores, the triage suggestion, and the reason for it.
- Reruns the model with the details blanked out to show how much the patient information changed the result.
- Draws a heat map of the image areas the model relied on (occlusion sensitivity, 25 extra passes).
- Saves scans to a local history, exports them as CSV, and prints a one-page referral note.
- Never uploads the photo. Everything runs in the browser, and saved scans stay in the browser.

## The model

The model is an ImageNet-pretrained EfficientNet-B4 fine-tuned with a patient-data branch in [the training notebook](training/), on an RTX 5070 Ti over about 11.5 hours.

- **Data:** 45,400 biopsy-confirmed images from the [ISIC Archive](https://www.isic-archive.com). The pipeline started from 48,882 histopathology-confirmed records, then dropped 3,439 with an unknown label and 43 with missing image files. The classes are benign (20,344: nevi, benign keratoses, dermatofibromas), other skin cancer (14,210: basal and squamous cell carcinoma), and melanoma (10,846). A stratified 80:20 split gave 36,320 training and 9,080 validation images.
- **Image branch:** EfficientNet-B4 at 380 x 380 with frozen batch normalization, CBAM-style channel attention, and generalized mean (GeM) pooling.
- **Patient branch:** 17 features (sex, age as a z-score plus four age bands, eight body-site one-hots, lesion size, skin type, melanocytic flag) through dense layers of 256, 128, and 64 units.
- **Head:** concatenation, then 768, 384, and 128 units to a 3-class softmax. 19.9 million parameters.
- **Training:** six progressive fine-tuning phases over 218 epochs, AdamW, warmup cosine schedule, asymmetric loss with label smoothing, class weights, MixUp and CutMix, and stochastic weight averaging in the last phases. The best checkpoint by validation AUC came from epoch 149.
- **Export:** full INT8 quantization to a 22.5 MB TFLite file.

### Validation results (9,080 images, single pass)

| Metric | Result |
|---|---|
| AUC, all three classes | 93.2% |
| Melanoma AUC | 0.940 |
| Melanoma sensitivity at the 0.278 cutoff | 90.0% |
| Melanoma specificity at the 0.278 cutoff | 81.5% |
| Overall accuracy | 78.6% |

The melanoma cutoff is 0.278 instead of 0.5 because a missed melanoma costs much more than an extra referral.

### Limitations

- Only 10 of the 3,219 training records that list a Fitzpatrick type are type V or VI, so performance on darker skin is unknown.
- The same validation set chose the best epoch and the cutoff, so these numbers are likely a little optimistic. There is no separate test set yet and no prospective clinical testing.
- The model expects a dermoscopic close-up of one lesion.
- SkinScan AI is a research prototype, not a medical device, and it is not FDA-cleared.

## Repository layout

```
docs/                 the web app (served by GitHub Pages)
  js/model.js         preprocessing, metadata encoding, LiteRT.js inference, triage rule
  js/app.js           interface: scope, form, results, heat map, history, printing
  js/bodymap.js       front and back body map for the eight ISIC body sites
  js/heatmap.js       occlusion sensitivity map
  model/              skinscan-v3.tflite (INT8)
  samples/            held-out ISIC sample images and their metadata
  vendor/             LiteRT.js runtime (Apache 2.0)
kiosk/                Raspberry Pi kiosk: Flask inference service, pygame touchscreen UI, systemd unit
tools/                make_static_batch.py and parity checks
training/             model definition and training code
```

## Running the web app locally

Any static file server works:

```bash
cd docs
python3 -m http.server 8000
# open http://localhost:8000
```

`docs/model/skinscan-v3.tflite` is the kiosk's `skin_cancer_v3.tflite` with the dynamic batch dimension fixed to 1, because LiteRT.js needs static input shapes. Weights and operators are unchanged:

```bash
python3 tools/make_static_batch.py skin_cancer_v3.tflite docs/model/skinscan-v3.tflite
```

## Sample images

The eight samples are dermoscopic images from the ISIC Archive that are not in the training data, each with a biopsy-confirmed diagnosis. Attribution and license for each image are in [`docs/samples/samples.json`](docs/samples/samples.json).

## Credits

- Images: [ISIC Archive](https://www.isic-archive.com). Training data is under CC0, CC BY, and CC BY-NC. The sample images are CC BY (attribution in `samples.json`), and the lesion on the cover and preview image is ISIC_0011437 (CC0).
- Browser runtime: [LiteRT.js](https://ai.google.dev/edge/litert/web) by Google, Apache 2.0.
- Typeface: Atkinson Hyperlegible Next by the Braille Institute, SIL Open Font License.

## License

Code is MIT licensed. The model weights were trained on ISIC data that is partly CC BY-NC, so the model is for research and education, not commercial use.

Built by Jason Xiao.
