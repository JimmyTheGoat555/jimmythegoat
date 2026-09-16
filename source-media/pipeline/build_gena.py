"""Build Gena's 16 dance clips as transparent animated WebP, plus the
store-card previews -- her counterpart to build.py + make_previews.py.

Same shape as Jimmy's pipeline with two deliberate differences:

  1. The keyer is key_green.py (flat green screen) rather than key.py
     (checkerboard in a letterbox). Nothing else about the frames differs.

  2. The canvas is PINNED to canvas.json rather than computed from the
     clips. Jimmy's 16 files ship at 376x660 with his ground line at
     554/660 and his height at 491/660 -- that is what JimmyAnimation's
     object-contain/object-bottom layering assumes, and it matches the
     static sprites (Jimmy 0.840, Gena 0.840). Gena is built to the
     identical numbers so the same component swaps her sprite for her
     dance without a resize or a hop, for the same reason it works for
     him. The width is widened only if one of her poses will not fit,
     and that is printed, because a wider canvas is still height-bound
     in the hero box and so still aligns.

Run from the project root, after compiling the extractor once:

    swiftc -O source-media/pipeline/extract.swift -o source-media/pipeline/extract
    python3 source-media/pipeline/build_gena.py            # all 16 + previews
    python3 source-media/pipeline/build_gena.py --only 1/1 # one clip, no previews

geo_gena.json caches the per-clip measurements (delete it to re-measure).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build import stream_clip           # AVFoundation frame stream (no ffmpeg)
from key import content_bbox
from key_green import key_frame

SRC_ROOT = 'source-media/dances-gena'
OUT_ROOT = 'public/animations/dances/gena'
CANVAS = json.load(open(os.path.join(HERE, 'canvas.json')))
CANVAS_W, CANVAS_H = CANVAS['canvas']
TARGET_CHAR_H = CANVAS['charH']
BOTTOM_PAD = CANVAS['bottomPad']
SIDE_PAD = 7            # per side; build.py's 14 total
ANALYZE_DIM = 760
OUT_FPS = 20            # matches Jimmy's: 50ms a frame
QUALITY = 74

# Store-card previews -- make_previews.py's numbers, unchanged.
PREVIEW_H = 200
PREVIEW_STEP = 2
PREVIEW_QUALITY = 52
PREVIEW_MARGIN = 6


def analyze(path):
    """Where she sits in the frame, as fractions of it."""
    frames = [f for _, _, fps, f in stream_clip(path, ANALYZE_DIM)]
    fps = next(iter(stream_clip(path, 64)))[2]
    H, W = frames[0].shape[:2]
    boxes = []
    for f in frames[::2]:
        bb = content_bbox(key_frame(f)[:, :, 3])
        if bb:
            boxes.append(bb)
    b = np.array(boxes, dtype=float)
    ground = b[:, 3].max()
    head = float(np.median(b[:, 1]))
    return {
        'fps': float(fps), 'frames': len(frames), 'aspect': W / H,
        'ground': ground / H,
        'char_h': (ground - head) / H,
        'center_x': float(np.median((b[:, 0] + b[:, 2]) / 2)) / W,
        'left': b[:, 0].min() / W,
        'right': b[:, 2].max() / W,
        'top': b[:, 1].min() / H,
    }


def half_width_px(g):
    """Widest reach from body centre, in output pixels at the pinned height."""
    sc = TARGET_CHAR_H / g['char_h']
    return max(g['center_x'] - g['left'], g['right'] - g['center_x']) * g['aspect'] * sc


def render(path, geo, canvas_w, out_path):
    max_dim = int(min(2200, max(500, TARGET_CHAR_H / geo['char_h'] * 1.05)))
    scaled = []
    kept = 0
    for i, (W, H, fps, f) in enumerate(stream_clip(path, max_dim)):
        if int(i * OUT_FPS / fps) < kept:
            continue
        kept += 1
        fh, fw = f.shape[:2]
        rgba = key_frame(f)
        # Under every transparent pixel the source still holds its green.
        # Zeroed here, and the resize below is done PREMULTIPLIED ('RGBa'),
        # because an unpremultiplied Lanczos mixes each edge pixel with the
        # colour of its transparent neighbours -- measured: ~9 green-tinted
        # rim pixels a frame that the despill in key_green had already
        # removed once. Premultiplied, a transparent neighbour contributes
        # nothing, whatever colour sits under it.
        rgba[rgba[:, :, 3] == 0, :3] = 0
        scale = TARGET_CHAR_H / (geo['char_h'] * fh)
        new_w, new_h = max(1, round(fw * scale)), max(1, round(fh * scale))
        arr = np.asarray(Image.fromarray(rgba).convert('RGBa')
                         .resize((new_w, new_h), Image.LANCZOS).convert('RGBA'))

        x = round(canvas_w / 2 - geo['center_x'] * fw * scale)
        scaled.append((arr, x))

    # The vertical anchor comes from the rendered frames, not from analyze().
    # That pass samples every other frame at 760px, and the lowest hoof of
    # a clip can sit on a frame it skipped -- or land a pixel differently
    # once the feathered edge is resampled at render size. Both put
    # dance3's feet 3-5px under the line. Measured here, the contract is
    # true by construction: the lowest point of the whole clip sits on
    # CANVAS_H - BOTTOM_PAD exactly, every time. One shift for the clip;
    # per-frame would flatten her jumps.
    bottoms = [int(np.nonzero(a[:, :, 3] > 40)[0].max()) + 1 for a, _ in scaled if (a[:, :, 3] > 40).any()]
    y = CANVAS_H - BOTTOM_PAD - max(bottoms)
    out_frames = []
    for arr, x in scaled:
        new_h, new_w = arr.shape[:2]
        canvas = np.zeros((CANVAS_H, canvas_w, 4), np.uint8)
        sx, sy = max(0, -x), max(0, -y)
        dx, dy = max(0, x), max(0, y)
        w = min(new_w - sx, canvas_w - dx)
        h = min(new_h - sy, CANVAS_H - dy)
        if w > 0 and h > 0:
            canvas[dy:dy + h, dx:dx + w] = arr[sy:sy + h, sx:sx + w]
        out_frames.append(Image.fromarray(canvas))

    # loop=1: play once, hold the last frame -- see JimmyAnimation.
    out_frames[0].save(out_path, save_all=True, append_images=out_frames[1:],
                       duration=round(1000.0 / OUT_FPS), loop=1, quality=QUALITY,
                       method=4, minimize_size=True)
    return out_frames


def seam_score(frames):
    """How far the held final pose is from the opening one (0 = identical),
    as mean RGB distance over pixels either frame draws. Reported, not
    enforced: it says whether she settles or freezes mid-move."""
    a, b = np.asarray(frames[0]).astype(int), np.asarray(frames[-1]).astype(int)
    m = (a[:, :, 3] > 40) | (b[:, :, 3] > 40)
    if not m.any():
        return 0.0
    return float(np.abs(a[:, :, :3] - b[:, :, :3])[m].mean())


def make_preview(src, dst):
    im = Image.open(src)
    box = None
    for i in range(im.n_frames):
        im.seek(i)
        b = im.convert('RGBA').getbbox()
        if b:
            box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]),
                                         max(box[2], b[2]), max(box[3], b[3]))
    box = (max(0, box[0] - PREVIEW_MARGIN), max(0, box[1] - PREVIEW_MARGIN),
           min(im.width, box[2] + PREVIEW_MARGIN), min(im.height, box[3] + PREVIEW_MARGIN))
    cw, ch = box[2] - box[0], box[3] - box[1]
    w, h = max(1, round(cw * PREVIEW_H / ch)), PREVIEW_H
    frames, durations = [], []
    for i in range(im.n_frames):
        im.seek(i)
        if i % PREVIEW_STEP:
            continue
        frames.append(im.convert('RGBA').crop(box).resize((w, h), Image.LANCZOS))
        durations.append(im.info.get('duration', 50) * PREVIEW_STEP)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    frames[0].save(dst, save_all=True, append_images=frames[1:], duration=durations,
                   loop=1, quality=PREVIEW_QUALITY, method=4, minimize_size=True)
    return w, h, len(frames)


if __name__ == '__main__':
    only = None
    if '--only' in sys.argv:
        only = sys.argv[sys.argv.index('--only') + 1]
    clips = [(d, s) for d in range(1, 5) for s in range(1, 5)]
    if only:
        d, s = only.split('/')
        clips = [(int(d), int(s))]

    geo_path = os.path.join(HERE, 'geo_gena.json')
    geos = json.load(open(geo_path)) if os.path.exists(geo_path) else {}
    for d, s in clips:
        k = f'{d}/{s}'
        if k in geos:
            continue
        geos[k] = g = analyze(f'{SRC_ROOT}/dance{d}/stage{s}.mp4')
        print(f'analyze dance{d}/stage{s}: {g["frames"]}f@{g["fps"]:.0f}  charH={g["char_h"]:.3f} '
              f'ground={g["ground"]:.3f} cx={g["center_x"]:.3f} span=[{g["left"]:.3f},{g["right"]:.3f}] '
              f'top={g["top"]:.3f}', flush=True)
        json.dump(geos, open(geo_path, 'w'), indent=1)

    # Does every pose fit the pinned width? Widen if not, and say so.
    reach = max(half_width_px(geos[f'{d}/{s}']) for d, s in clips)
    need_w = 2 * int(np.ceil(reach)) + 2 * SIDE_PAD
    canvas_w = CANVAS_W
    if need_w > CANVAS_W:
        canvas_w = need_w + (need_w % 2)
        print(f'\nWARNING: widest pose needs {need_w}px; widening canvas {CANVAS_W} -> {canvas_w}')
    print(f'\ncanvas {canvas_w}x{CANVAS_H}  charH={TARGET_CHAR_H}  bottomPad={BOTTOM_PAD}  '
          f'(widest reach {reach:.0f}px of {CANVAS_W // 2 - SIDE_PAD} available)\n')

    total = 0
    for d, s in clips:
        out = f'{OUT_ROOT}/dance{d}/stage{s}.webp'
        os.makedirs(os.path.dirname(out), exist_ok=True)
        frames = render(f'{SRC_ROOT}/dance{d}/stage{s}.mp4', geos[f'{d}/{s}'], canvas_w, out)
        size = os.path.getsize(out)
        total += size
        print(f'dance{d}/stage{s}.webp  {len(frames):3d} frames  {size / 1024:7.1f} KB  seam={seam_score(frames):5.1f}',
              flush=True)
    print(f'\nhero total {total / 1024 / 1024:.1f} MB')

    if not only:
        ptotal = 0
        for d, s in clips:
            src = f'{OUT_ROOT}/dance{d}/stage{s}.webp'
            dst = f'{OUT_ROOT}/preview/dance{d}/stage{s}.webp'
            w, h, n = make_preview(src, dst)
            ptotal += os.path.getsize(dst)
            print(f'preview/dance{d}/stage{s}.webp  {w}x{h}  {n} frames  {os.path.getsize(dst) / 1024:5.0f} KB')
        print(f'preview total {ptotal / 1024 / 1024:.1f} MB')
        json.dump({'canvas': [canvas_w, CANVAS_H], 'charH': TARGET_CHAR_H, 'bottomPad': BOTTOM_PAD},
                  open(os.path.join(HERE, 'webp_canvas_gena.json'), 'w'))
