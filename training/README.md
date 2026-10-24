# Training

`SkinScanAI_training.ipynb` is the notebook that trained the SkinScan model, with outputs cleared. Run the cells in order on a machine with a GPU, the ISIC images in `ISIC-images/`, and `preprocessed_validated_data.csv`.

| Cells | What they do |
|---|---|
| Imports, config | TensorFlow setup, 380 x 380 input, batch size 24 |
| Load CSV, label mapping | 48,882 biopsy-confirmed records mapped to melanoma, benign, and other malignant; unknown labels dropped |
| Feature engineering | builds the 17 patient features used by the model |
| Split, augmentation, tf.data | stratified 80:20 split, dermoscopy augmentations, MixUp and CutMix |
| Model | EfficientNet-B4 with frozen batch norm, CBAM-style channel attention, GeM pooling, metadata MLP, fusion head |
| Loss and helpers | asymmetric loss, stochastic weight averaging, warmup cosine schedule, class weights |
| Training loop | six progressive fine-tuning phases |
| Evaluation, export | threshold search and full INT8 TFLite export for the Raspberry Pi |
| Batch test, single-image predictor | spot checks on validation images |

The web app reproduces the notebook's preprocessing in `docs/js/model.js`: the same 17 features in the same order, the same age z-score constants, and the same bilinear resize.
