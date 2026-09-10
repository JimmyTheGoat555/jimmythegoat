"""Small store-card versions of the dance animations.

The hero animations are built for a 208px display at 3x DPR and weigh ~1.6MB
each. The store shows four at once, so shipping the hero files there would
cost ~6MB just to open the Store tab — on a screen where each one renders
about 130px wide. These are downscaled and frame-dropped copies for that
grid, generated from the finished hero files rather than re-keyed from the
MP4s (the keying is the slow part, and its output is already correct).
"""
import pathlib
from PIL import Image

TARGET_H = 200      # the grid cell renders ~110px tall; this covers 2x DPR
                    # and stays soft-but-fine on 3x, which is the right trade
                    # for four of these autoplaying at once
FRAME_STEP = 2      # 20fps -> 10fps; plenty for a thumbnail
QUALITY = 52
MARGIN = 6          # a few px so a fast limb never clips the edge

src_root = pathlib.Path('public/animations/dances')
total_before = total_after = 0

for src in sorted(src_root.glob('dance*/stage*.webp')):
    if 'preview' in src.parts:
        continue
    im = Image.open(src)

    # The hero canvas is padded so every clip shares one ground line and
    # character height — necessary on the pedestal, wasted bytes in a grid
    # cell. Crop to what the clip actually draws, so the pixels we do spend
    # are all Jimmy.
    box = None
    for i in range(im.n_frames):
        im.seek(i)
        b = im.convert('RGBA').getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                         max(box[2], b[2]), max(box[3], b[3]))
    box = (max(0, box[0] - MARGIN), max(0, box[1] - MARGIN),
           min(im.width, box[2] + MARGIN), min(im.height, box[3] + MARGIN))
    cw, ch = box[2] - box[0], box[3] - box[1]
    scale = TARGET_H / ch
    w, h = max(1, round(cw * scale)), TARGET_H

    frames, durations = [], []
    for i in range(im.n_frames):
        im.seek(i)
        if i % FRAME_STEP:
            continue
        frames.append(im.convert('RGBA').crop(box).resize((w, h), Image.LANCZOS))
        durations.append(im.info.get('duration', 50) * FRAME_STEP)

    out = src_root / 'preview' / src.parent.name / src.name
    out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(out, save_all=True, append_images=frames[1:],
                   duration=durations, loop=1, quality=QUALITY, method=4,
                   minimize_size=True)
    total_before += src.stat().st_size
    total_after += out.stat().st_size
    print(f'{src.parent.name}/{src.name}: {src.stat().st_size/1024:6.0f}KB -> '
          f'{out.stat().st_size/1024:5.0f}KB  ({w}x{h}, {len(frames)} frames)')

print(f'\nhero total {total_before/1024/1024:.1f}MB -> preview total {total_after/1024/1024:.1f}MB')
