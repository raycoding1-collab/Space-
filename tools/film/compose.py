"""Composes the ELYSION film: rendered frames + letterbox + titles + score -> MP4.

    python3 tools/film/compose.py tools/film/elysion.json <frames-dir> <score.wav> <out.mp4> [--crf 17]

Frames are 1920x800 (2.40:1); they are set in a 1920x1080 letterboxed picture. Location captions sit
in the lower bar, the opening line and the ELYSION title card in the picture, with fades from and to
black. Encoded as H.264 (high profile, film tune) with AAC audio.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

film = json.load(open(sys.argv[1]))
frames_dir, score, out = sys.argv[2], sys.argv[3], sys.argv[4]
crf = sys.argv[sys.argv.index("--crf") + 1] if "--crf" in sys.argv else "17"
FPS = film.get("fps", 24)
OW, OH, PW, PH = 1920, 1080, 1920, 800
BAR = (OH - PH) // 2
FONT_DIR = "/usr/share/fonts/opentype/inter/"

starts, t = {}, 0.0
for s in film["shots"]:
    starts[s["name"]] = t
    t += s["dur"]
DUR = t
N = int(round(DUR * FPS))

CAPTIONS = {  # shot -> (kicker, place)
    "harbours": ("The flank", "The Harbours"),
    "spire": ("Civic heart", "The Crown Spire"),
    "crown": ("Four thousand six hundred metres", "The Crystal Crown"),
    "skyline": ("Lantern towers", "The Meridian"),
    "street": ("Street level", "The Boulevards"),
    "canal": ("Under the glass vault", "The Grand Canal"),
    "lake": ("Biome I", "The Lake Dome"),
    "undercity": ("Beneath the keel", "The Undercity"),
    "engines": ("Seven drives", "The Engine Wall"),
}


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def spaced(draw, text, f, tracking):
    """Width of text set with extra letter spacing (tracking in px)."""
    w = 0
    for ch in text:
        w += draw.textlength(ch, font=f) + tracking
    return w - tracking


def draw_spaced(draw, xy, text, f, tracking, fill):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + tracking


def text_layer(items):
    """items: [(text, font, tracking, y_center, alpha)] -> RGBA layer for the 1920x1080 picture, with a soft glow."""
    layer = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for text, f, tr, yc, a, col in items:
        if a <= 0.002:
            continue
        w = spaced(d, text, f, tr)
        asc, desc = f.getmetrics()
        draw_spaced(d, ((OW - w) / 2, yc - (asc + desc) / 2), text, f, tr, (*col, int(255 * a)))
    glow = layer.filter(ImageFilter.GaussianBlur(10))
    ga = np.asarray(glow).astype(np.float32)
    ga[..., 3] *= 0.55
    glow = Image.fromarray(ga.astype(np.uint8), "RGBA")
    base = Image.new("RGBA", (OW, OH), (0, 0, 0, 0))
    base.alpha_composite(glow)
    base.alpha_composite(layer)
    return base


def ramp(x, a, b):
    return float(np.clip((x - a) / (b - a), 0, 1))


def window(x, t0, t1, fin, fout):
    return ramp(x, t0, t0 + fin) * (1 - ramp(x, t1 - fout, t1))


F_KICK = font("Inter-Light.otf", 17)
F_PLACE = font("InterDisplay-Light.otf", 30)
F_LINE = font("InterDisplay-ExtraLight.otf", 34)
F_TITLE = font("InterDisplay-Thin.otf", 150)
F_SUB = font("Inter-Light.otf", 24)
WARM = (255, 226, 186)
WHITE = (236, 240, 246)


def overlay_items(tsec):
    items = []
    # opening line
    a = window(tsec, 1.2, starts["harbours"] - 0.3, 1.4, 1.2)
    items.append(("THE FREE CITY OF THE REACH", F_LINE, 16, BAR + PH * 0.16, a, WHITE))
    # location captions in the lower bar
    for name, (kick, place) in CAPTIONS.items():
        t0 = starts[name] + 0.6
        a = window(tsec, t0, t0 + 3.6, 0.8, 0.9)
        if a > 0:
            items.append((kick.upper(), F_KICK, 7, OH - BAR / 2 - 20, a * 0.85, WARM))
            items.append((place.upper(), F_PLACE, 12, OH - BAR / 2 + 16, a, WHITE))
    # title card
    tt = starts["finale"] + 2.5
    a = window(tsec, tt, DUR + 5, 2.2, 0.1)
    items.append(("ELYSION", F_TITLE, 46, BAR + PH * 0.25, a, WHITE))
    a2 = window(tsec, tt + 1.4, DUR + 5, 1.8, 0.1)
    items.append(("THE FLYING CITY", F_SUB, 18, BAR + PH * 0.25 + 108, a2 * 0.9, WARM))
    return items


ff = subprocess.Popen([
    "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-",
    "-i", score, "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "slow", "-crf", crf, "-tune", "film", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-t", f"{DUR:.3f}", out,
], stdin=subprocess.PIPE)

cache = {}
for i in range(N):
    tsec = i / FPS
    fp = os.path.join(frames_dir, f"f{i:05d}.png")
    pic = Image.open(fp).convert("RGB")
    if pic.size != (PW, PH):
        pic = pic.resize((PW, PH), Image.LANCZOS)
    canvas = Image.new("RGB", (OW, OH), (0, 0, 0))
    canvas.paste(pic, (0, BAR))
    # fades: from black at the start, to black at the end, and a breath at the finale cut
    k = ramp(tsec, 0.0, 1.6) * (1 - ramp(tsec, DUR - 2.2, DUR - 0.05))
    if k < 1:
        canvas = Image.fromarray((np.asarray(canvas).astype(np.float32) * k).astype(np.uint8))
    items = overlay_items(tsec)
    key = tuple((it[0], round(it[4], 3)) for it in items if it[4] > 0.002)
    if key:
        if key not in cache:
            cache.clear()
            cache[key] = text_layer(items)
        c = canvas.convert("RGBA")
        c.alpha_composite(cache[key])
        canvas = c.convert("RGB")
    ff.stdin.write(canvas.tobytes())
    if i % 240 == 0:
        print(f"composed {i}/{N}", flush=True)
ff.stdin.close()
ff.wait()
print("wrote", out)
