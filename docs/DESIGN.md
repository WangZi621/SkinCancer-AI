# SkinScan AI: visual system

What it is: a skin-lesion triage tool for clinicians and medical students, used in a clinic,
often offline. Its job: scan a spot, say how soon to refer, keep each lesion's history.

The system follows the Stryde design system: light first, one navy, a fixed lattice for the ground,
white sheets over it, and hard-offset buttons.

## Color

| Name | Hex | Use |
| --- | --- | --- |
| off-white | `#ECECEC` | Page ground, under the lattice |
| lattice | `rgba(20,33,61,0.2)` dots, 5% struts | A fixed triangular grid of dots and faint struts, 30 px apart, with fine grain |
| white | `#FFFFFF` | Every surface that holds content. Separated from the ground by fill alone. |
| cobalt | `#1B4FD8` | Brand. Primary buttons, links, the logo, the selected body site, the closing section |
| dress blue | `#14213D` | Headlines, the sign-up side panel, the model diagram's fusion block, the footer |
| ink | `#0B0E14` | Text, button outlines and their hard shadows |
| muted ink | `#4C525D` | Secondary text (7.9:1 on white) |
| rule | `#D5D7DC` | Hairlines and input borders |
| urgent / review / routine | `#B42318` / `#9A4A06` / `#1A7247` | Triage results only, always with their words |

## Logo

Contours: a skin spot's outline at three visits, growing toward the lower right. Cobalt symbol,
dress-blue wordmark. Masters, icons and rules are in `brand/logo/` (`GUIDELINES.md`, rebuilt by
`kit.py`).

## Type

Archivo (variable, self-hosted, SIL OFL) for everything. Headlines 800 to 850 weight at width 115,
sentence case, in dress blue. Body 400 at normal width, 16 px on 1.55. Numbers tabular.

## Shape and depth

- No soft shadows and no gradients anywhere.
- Sheets: radius 24 to 28. Panels inside them: 14. Controls: 10 to 12.
- Buttons are the one raised thing: a 2 px ink outline and a hard 4 px ink offset shadow (3 px when
  small). They lift 2 px on hover and press in on click. On cobalt, the button is dress blue.

## Layout

Left-aligned. Wide page heads with the action on the right. One visual per section, with plenty of
empty space. The lesion photo in its ring is the memorable object; everything around it stays quiet.

## Not used

All-caps labels, eyebrows above headings, middle-dot meta strings, stat strips, pill chips with
shadows, gradient washes, dark mode, emoji, arrows appended to links.
