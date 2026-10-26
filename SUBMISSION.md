# Stryde: Congressional App Challenge answers

**What is your app called?** Stryde

**Programming languages:** Python, JavaScript (also check Other: HTML/CSS)

**Platforms:** Web, Mobile (iOS), Mobile (Android), Other (Raspberry Pi kiosk)

**Project link:** https://wangzi621.github.io/SkinCancer-AI/ (code: https://github.com/WangZi621/SkinCancer-AI)

**Where did you code?** At Home

**School project?** No

---

## What inspired you to create this app?

Skin cancer is the most common cancer in the US, and melanoma is one of the few cancers where timing changes everything. Caught early, it's almost always curable. Caught late, it's often deadly. But there aren't enough dermatologists, and in a lot of places patients wait months for an appointment. That means a nurse or family doctor has to decide which spots get sent first, often without any specialist training.

I started wondering if a small AI model could help with that one decision. It wouldn't diagnose anything. It would just say "this one should be seen soon." I also wanted it to work in places that don't have much: no expensive equipment, no internet, and no sending patient photos to some company's server. That's why Stryde runs entirely on the device, in a browser or on a $15 Raspberry Pi.

My family was part of it too. I tested the first kiosk version on my mom's arm (she's fine), and seeing how scary even a pretend result felt made me take the "suggest, don't diagnose" part seriously.

## What technical difficulties did you face programming your app?

The biggest problem was making the model small without breaking it. My trained model was too big for a browser, so I compressed it. The compressed version looked fine at first, but when I tested it, it gave almost the same score for every photo. The compression had destroyed most of what the model learned from the image. I had to figure out which layers were losing information. Then I rebuilt the export so the stored weights stay small (21 MB) while the calculations stay precise. After that, its scores matched the full model to within 0.007.

The second challenge was the patient details. Doctors never judge a spot from a picture alone; age, body location and skin type all matter. So I built a model with two branches, one for the photo (EfficientNet-B4) and one for 17 patient features, and trained them together on 45,400 images. Getting the two to work together, and then encoding the same features exactly the same way in JavaScript as in Python, took a lot of debugging.

Privacy was the third. I didn't want any patient data on a server, so everything is stored in the browser and encrypted with a passcode (AES-GCM 256). Building the lock and unlock flow, plus backups that stay encrypted, was harder than I expected.

## What improvements would you make in a 2.0 version?

First, fairer data. The public dataset I trained on has very few images of darker skin; only 10 of 3,219 records that list a skin type are type V or VI. That means the model may be less reliable for those patients. Version 2.0 needs more diverse training images and separate accuracy testing for each skin type.

Second, real clinical testing. I'd like to work with doctors and clinics to see how Stryde performs on real patients and whether it actually helps them decide faster.

Third, the hardware. I want to finish a low-cost Raspberry Pi kiosk with a cheap dermoscope attachment, so a clinic without computers could still use it. I'd also add support for normal phone photos, since right now it works best with close-up dermoscope images.

## Did you use AI? (Yes) How?

Yes. The app itself uses AI: Stryde's core is a neural network I trained (EfficientNet-B4 in TensorFlow/Keras) on 45,400 public ISIC skin images.

I also used AI coding assistants, mainly Claude (Claude Code), to help build the web app. It helped me write and debug JavaScript for the interface, patient records, encryption and charts. It also helped convert the model to run in the browser with ONNX Runtime Web, and helped edit the demo video.

What I did myself:

- Came up with the idea and decided what the app should and shouldn't do (suggest how soon to refer, never diagnose).
- Built and trained the model.
- Chose the training data and the cutoff that catches 90% of melanomas.
- Built and tested the Raspberry Pi kiosk.
- Tested every feature, found the compressed-model bug, and decided on the fixes.
- Made the final design decisions, including the name and look.

I checked and changed the AI's code instead of just accepting it.

## What did you learn or take away from participating?

I learned that building something that works is very different from building something people can trust. Getting a high accuracy number was only the start. Then I had to ask who the model fails on, what happens when it's wrong, and whether a doctor would believe it. That's why Stryde shows where it looked in the photo, shows its limits openly, and never claims to diagnose.

I also learned a lot technically: training neural networks, compressing them, running them in a browser, and encrypting data. Most of all, I learned how to debug when something silently goes wrong.

Finally, I learned that a lot of good tech can be simple and cheap. A free web app and a $15 computer could someday help a clinic decide who needs to be seen first, and that's the kind of problem I want to keep working on.
