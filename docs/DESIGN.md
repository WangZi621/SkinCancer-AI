# SkinScan AI: visual system

What it is: a skin-lesion triage tool for clinicians and medical students, used in a clinic,
often offline. Its job: scan a spot, say how soon to refer, keep each lesion's history.

## Color

| Name | Hex | Use |
| --- | --- | --- |
| slide | `#ECECEF` | Page ground, with a faint 12 px dot grid (a millimetre ruler, the scale lesions are measured on) |
| sheet | `#FFFFFF` | Every surface that holds content. Separated from the ground by fill alone. |
| well | `#F4F4F6` | Panels inside a sheet (the scope's side of the workbench, form groups) |
| marker | `#5A2CB0` | Brand. Gentian violet, the ink of the surgical skin marker that circles a lesion before a biopsy (Sample 1 still has the dots). Primary buttons, links, the selected body site. |
| marker-soft | `#ECE5F8` | Selected rows, the avatar, the hovered body site |
| ink | `#201A3D` | Text and lines. A violet-black, from the same marker ink. |
| muted | `#5D5970` | Secondary text (6.6:1 on white) |
| rule | `#D7D5DF` | Hairlines and input borders |
| urgent / review / routine | `#B42318` / `#9A4A06` / `#1A7247` | Triage results only, always with their words |

## Logo

Contours: a skin spot's outline at three visits, growing toward the lower right. Violet symbol, ink
wordmark. Masters, icons and rules are in `brand/logo/` (`GUIDELINES.md`, rebuilt by `kit.py`).

## Type

Mona Sans (variable, self-hosted, SIL OFL) for everything. Headlines 800 weight at width 118,
tight tracking, sentence case. Body 400 at normal width, 16 px on 1.55. Numbers tabular.

## Shape and depth

- No soft shadows and no gradients anywhere.
- Sheets: radius 24. Panels inside them: 14. Controls: 10-12.
- Buttons are the one raised thing: a 2 px ink outline and a hard 3 px ink offset shadow. They
  lift 1 px on hover and press in on click.

## Layout

Left-aligned. Wide page heads with the action on the right. One visual per section. The lesion
photo in its ring is the memorable object; everything around it stays quiet.

## Not used

All-caps labels, eyebrows above headings, middle-dot meta strings, stat strips, pill chips with
shadows, gradient washes, dark mode, emoji, arrows appended to links.
