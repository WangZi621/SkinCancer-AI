# SkinScan AI

Skin cancer triage that reads a dermoscopic photo and the patient's details together, and runs on hardware a small clinic already has.

**Try it:** https://wangzi621.github.io/SkinCancer-AI/

SkinScan AI sorts a skin lesion into one of three groups (melanoma, other skin cancer, or benign) and suggests how soon the patient should see a dermatologist: refer urgently, refer for review, or routine follow-up. It is built to help a clinician decide who to send first. It does not diagnose.

It comes in two forms built on the same trained model:

| | Web app | Kiosk |
|---|---|---|
| Where it runs | Any modern browser, phone or laptop | Raspberry Pi 5 in a 3D printed case |
| Code | [`docs/`](docs) (HTML, CSS, JavaScript) | Python, Flask, pygame (on the device) |
| Inference | ONNX Runtime Web in WebAssembly, on the device | LiteRT on the Pi |
| Internet | Only for the first load, then works offline | Never |
| Cost | Free | About $300 in parts |

## What the web app does

- Takes a photo from a file, the camera, drag and drop, or one of eight sample images.
- Asks for optional patient details: age, sex, body site (tap a body map), Fitzpatrick skin type, lesion diameter, and whether the lesion looks melanocytic.
- Shows the three model scores, the triage suggestion, and the reason for it.
- Reruns the model with the details blanked out to show how much the patient information changed the result.
- Draws a heat map of the image areas the model relied on (occlusion sensitivity, 16 extra passes).
- Saves scans to a local history, exports them as CSV, and prints a one-page referral note.
- Never uploads the photo. Everything runs in the browser, and saved scans stay in the browser.

## The model

The model is an ImageNet-pretrained EfficientNet-B4 fine-tuned with a patient-data branch in [the training notebook](training/), on an RTX 5070 Ti over about 11.5 hours.

- **Data:** 45,400 biopsy-confirmed images from the [ISIC Archive](https://www.isic-archive.com). The pipeline started from 48,882 histopathology-confirmed records, then dropped 3,439 with an unknown label and 43 with missing image files. The classes are benign (20,344: nevi, benign keratoses, dermatofibromas), other skin cancer (14,210: basal and squamous cell carcinoma), and melanoma (10,846). A stratified 80:20 split gave 36,320 training and 9,080 validation images.
- **Image branch:** EfficientNet-B4 at 380 x 380 with frozen batch normalization, CBAM-style channel attention, and generalized mean (GeM) pooling.
- **Patient branch:** 17 features (sex, age as a z-score plus four age bands, eight body-site one-hots, lesion size, skin type, melanocytic flag) through dense layers of 256, 128, and 64 units.
- **Head:** concatenation, then 768, 384, and 128 units to a 3-class softmax. 19.9 million parameters.
- **Training:** six progressive fine-tuning phases over 218 epochs, AdamW, warmup cosine schedule, asymmetric loss with label smoothing, class weights, MixUp and CutMix, and stochastic weight averaging in the last phases. The best checkpoint by validation AUC came from epoch 149.
- **Export:** full INT8 quantization to a 22.5 MB TFLite file for the Pi.

### The INT8 export bug, and the web model

Testing the INT8 file showed that the photo barely changed its output: a black square, random noise, and real lesions all scored about the same. The cause is the GeM pooling step. The full-INT8 converter quantized x³ to int8 with a step of about 485 before the spatial mean, so almost every one of the 1,792 image features rounded to zero, and the model fell back on the patient details.

The web app runs a fixed version instead. `tf2onnx --tflite --dequantize` turns the INT8 file back into a float graph using the same trained weights, and [`tools/make_weight_only_onnx.py`](tools/make_weight_only_onnx.py) stores the weights as per-channel int8 while every activation stays float32. The result, `docs/model/skinscan-v3.onnx`, is 20.8 MB, stays within 0.007 of the float graph, and responds to the image again. [`tools/fix_gem_quantization.py`](tools/fix_gem_quantization.py) is a smaller patch for the TFLite file that moves just the GeM mean to float. It restores some of the image signal, but the remaining INT8 rounding still moves scores by up to 0.38, so the kiosk should switch to the ONNX model or a re-export from the Keras checkpoint.

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
- The melanocytic input carries a lot of weight. In the training data, lesions marked melanocytic were never basal or squamous cell carcinoma, lesions marked not melanocytic were almost never melanoma, and 72% of lesions with no answer were basal or squamous cell carcinoma.
- On 78 newer ISIC images that are not in the training data, the web model flagged 1 of 5 melanoma in situ images (from two lesions), flagged all 3 images of one benign mole as possible melanoma, referred 23 of 40 basal cell carcinomas, and called 17 of 30 seborrheic keratoses routine. The set is small and skewed, but it shows that real-world results are weaker than the validation numbers.
- The model expects a dermoscopic close-up of one lesion.
- SkinScan AI is a research prototype, not a medical device, and it is not FDA-cleared.

## Repository layout

```
docs/                 the web app (served by GitHub Pages)
  js/model.js         preprocessing, metadata encoding, ONNX Runtime Web inference, triage rule
  js/app.js           interface: scope, form, results, heat map, history, printing
  js/bodymap.js       front and back body map for the eight ISIC body sites
  js/heatmap.js       occlusion sensitivity map
  model/              skinscan-v3.onnx (float activations, int8 weights)
  samples/            held-out ISIC sample images and their metadata
  vendor/             ONNX Runtime Web 1.30.0 (MIT)
tools/                model conversion scripts and Python/browser parity checks
training/             model definition and training code
```

## Running the web app locally

Any static file server works:

```bash
cd docs
python3 -m http.server 8000
# open http://localhost:8000
```

To rebuild the web model from the kiosk file:

```bash
python3 -m tf2onnx.convert --tflite skin_cancer_v3.tflite --output deq.onnx --dequantize --opset 17
python3 tools/make_weight_only_onnx.py deq.onnx docs/model/skinscan-v3.onnx
```

`tools/predict_python.py` and `tools/predict_browser.py` run the same images through Python and through the browser app; on all 78 held-out images the scores agree within 0.011.

## Sample images

The eight samples are dermoscopic images from the ISIC Archive that are not in the training data, each with a biopsy-confirmed diagnosis. Attribution and license for each image are in [`docs/samples/samples.json`](docs/samples/samples.json).

## Credits

- Images: [ISIC Archive](https://www.isic-archive.com). Training data is under CC0, CC BY, and CC BY-NC. The sample images are CC BY (attribution in `samples.json`), and the lesion on the cover and preview image is ISIC_0011437 (CC0).
- Browser runtime: [ONNX Runtime Web](https://onnxruntime.ai) by Microsoft, MIT License.
- Typeface: Geist by Vercel, SIL Open Font License.

## License

Code is MIT licensed. The model weights were trained on ISIC data that is partly CC BY-NC, so the model is for research and education, not commercial use.

Built by Jason Xiao.
