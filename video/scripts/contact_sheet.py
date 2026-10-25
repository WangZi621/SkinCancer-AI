"""Builds out/contact_sheet.png: one row per clip, six frames each, labelled with name and length."""
import glob
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

out = sys.argv[1]
frames = os.path.join(out, "frames")
clips = sorted(p for p in glob.glob(os.path.join(out, "[0-9][0-9]_*.mp4")))
TW, TH, PAD, LABEL = 400, 225, 12, 300
font_path = os.path.join(os.path.dirname(__file__), "..", "assets", "fonts", "geist.woff2")
try:
    font = ImageFont.truetype(font_path, 26)
    small = ImageFont.truetype(font_path, 21)
except OSError:
    font = small = ImageFont.load_default()

W = LABEL + 6 * (TW + PAD) + PAD
H = PAD + len(clips) * (TH + PAD)
sheet = Image.new("RGB", (W, H), "#f5f7f8")
draw = ImageDraw.Draw(sheet)
for r, clip in enumerate(clips):
    name = os.path.splitext(os.path.basename(clip))[0]
    dur = float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]).decode().strip())
    y = PAD + r * (TH + PAD)
    draw.text((PAD + 8, y + TH / 2 - 30), name + ".mp4", fill="#0f1b24", font=font)
    draw.text((PAD + 8, y + TH / 2 + 6), f"{dur:.1f} s", fill="#4a5a66", font=small)
    for k in range(6):
        p = os.path.join(frames, f"{name}_{k + 1}.png")
        if os.path.exists(p):
            im = Image.open(p).convert("RGB").resize((TW, TH), Image.LANCZOS)
            sheet.paste(im, (LABEL + PAD + k * (TW + PAD), y))
sheet.save(os.path.join(out, "contact_sheet.png"))
print("contact sheet:", os.path.join(out, "contact_sheet.png"), sheet.size)
