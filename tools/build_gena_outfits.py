"""Normalise Gena's outfit-set renders onto her sprite canvas.

The sets arrive as full-body renders of Gena in the outfit (768x1376, one
file per set per evolution stage) rather than as garment cut-outs, so in
the app they are SPRITE SWAPS: equip the Pink Set and the renderer draws
gena-pink-<tier>.png in place of gena-<tier>.png (data/mascots.js
`outfits`). That only works if every outfit sprite sits on the same canvas
contract as the base sprite it replaces -- 285x1024, ground line at 84% of
canvas height, body filling 75.5% -- because everything drawn on top of
her (the accessory coordinates in JimmyAvatar's GENA_ACCESSORY_LAYOUT, the
head crop, the pedestal on WorkoutHome) is a percentage of that box.

So, per set and stage: measure the alpha bounding box of the render and of
the base sprite for that stage, scale the render so the two boxes are the
same height, and paste it so the box's bottom edge and horizontal centre
land where the base sprite's do. The renders were posed identically to the
base sprites (their box aspects match to within 1%), which is what lets a
height-only fit place the whole body rather than just the feet.

Sources live OUTSIDE public/ (source-media/outfits-gena, untracked like
the dance footage); only the built 285x1024 files ship.

Run from the project root:

    python3 tools/build_gena_outfits.py
"""
import os
import sys

import numpy as np
from PIL import Image

SRC_DIR = 'source-media/outfits-gena'
OUT_DIR = 'public/assets/outfits'
BASE_DIR = 'public/assets'

# Stage number -> tier id, matching src/utils/evolutionTiers.js and the
# base sprite names (gena-goat.png ... gena-legend.png).
TIERS = {1: 'goat', 2: 'buff', 3: 'titan', 4: 'legend'}
SETS = ['pink', 'blue', 'yellow']
CANVAS = (285, 1024)
ALPHA_MIN = 8  # same floor the base sprites were measured with


def alpha_bbox(im):
    a = np.asarray(im.convert('RGBA'))[:, :, 3]
    ys, xs = np.where(a > ALPHA_MIN)
    if len(xs) == 0:
        raise SystemExit('empty image')
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def build(set_name, stage):
    src_path = os.path.join(SRC_DIR, f'gena{stage}set{set_name}.png')
    base_path = os.path.join(BASE_DIR, f'gena-{TIERS[stage]}.png')
    out_path = os.path.join(OUT_DIR, f'gena-{set_name}-{TIERS[stage]}.png')

    src = Image.open(src_path).convert('RGBA')
    base = Image.open(base_path).convert('RGBA')
    if base.size != CANVAS:
        raise SystemExit(f'{base_path}: expected {CANVAS}, got {base.size}')

    sx0, sy0, sx1, sy1 = alpha_bbox(src)
    bx0, by0, bx1, by1 = alpha_bbox(base)

    scale = (by1 - by0) / (sy1 - sy0)
    # Crop to the body first so the resample only touches real pixels,
    # then scale that crop to the base sprite's body height.
    body = src.crop((sx0, sy0, sx1, sy1))
    new_w = max(1, round((sx1 - sx0) * scale))
    new_h = by1 - by0
    body = body.resize((new_w, new_h), Image.LANCZOS)

    # Bottom edge on the base's ground line, centred on the base's midline.
    base_cx = (bx0 + bx1) / 2
    left = round(base_cx - new_w / 2)
    top = by1 - new_h
    if left < 0 or left + new_w > CANVAS[0]:
        raise SystemExit(f'{src_path}: body {new_w}px wide does not fit the {CANVAS[0]}px canvas')

    out = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    out.paste(body, (left, top), body)
    out.save(out_path, optimize=True)

    ox0, oy0, ox1, oy1 = alpha_bbox(out)
    print(
        f'{os.path.basename(out_path):24s} scale {scale:.4f}  '
        f'body {ox0:3d}..{ox1:3d} x {oy0:3d}..{oy1:4d}  '
        f'(base {bx0:3d}..{bx1:3d} x {by0:3d}..{by1:4d})  '
        f'{os.path.getsize(out_path) // 1024:4d} KB'
    )


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    only = sys.argv[1:] or SETS
    for set_name in only:
        for stage in TIERS:
            build(set_name, stage)
