"""Rebuild the 16 dance clips as transparent, size-normalised animated WebP.

Two problems with the source MP4s, both baked into the pixels:

  1. No transparency. Some clips carry a flattened checkerboard as their
     background; the stage3/stage4 clips are letterboxed in black with the
     checkerboard confined to an inner panel (plus a generator watermark out
     in the black margin). MP4/H.264 cannot store alpha at all, so this has
     to be undone offline -- see key.py for how the checkerboard is unpicked.

  2. No consistent scale. The clips were rendered at anything from 960x960 to
     1056x1984, so Jimmy changed size against his pedestal every time the
     equipped dance or evolution stage changed. Every clip is re-anchored
     here onto one canvas: same character height, feet on the same baseline,
     centred horizontally -- so the app can render all 16 in a fixed box.

Output is animated WebP rather than another video: it is the only format that
carries real alpha everywhere the app runs (iOS Safari included), it needs no
<video> autoplay handling, and at the size Jimmy is actually displayed it is
far smaller than the 58MB of source MP4.
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from key import key_frame, content_bbox
from scipy import ndimage

EXTRACT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'extract')

TARGET_CHAR_H = 500   # Jimmy's reference height, in output pixels
SIDE_PAD = 14         # breathing room so a wide pose never touches the edge
TOP_PAD = 10
BOTTOM_PAD = 6        # keeps the feet off the very last row of pixels
ANALYZE_DIM = 760

# Some source clips are only partly usable, and the salvage has to be part
# of the pipeline rather than a one-off edit, so a re-run reproduces it.
#
# dance3/stage4: the generation pulls the camera back partway through and
# reveals the whole panel as a framed picture hanging on a wall (frames
# 61-110). Frames 0-60 and 111-150 are clean. We take the first clean run
# and play it forward then back again: it restores the length lost to the
# cut, and — because these clips play once and hold on their last frame —
# it guarantees the clip ends on exactly the pose it began in, which a
# straight trim at frame 60 would not (he is mid-spin, facing away).
FRAME_PLANS = {
    '3/4': list(range(0, 61)) + list(range(59, -1, -1)),
}
OUT_FPS = 20          # dances read fine at 20fps and it nearly halves the bytes


def stream_clip(path, max_dim):
    """Yield (fps, frame) with frames decoded one at a time, so a 2000px clip
    never has to sit in memory all at once."""
    proc = subprocess.Popen([EXTRACT, path, str(max_dim)],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            bufsize=1024 * 1024)
    header = b''
    while not header.endswith(b'\n'):
        ch = proc.stdout.read(1)
        if not ch:   # extractor died (bad path, unreadable file) -- don't spin
            proc.wait()
            raise RuntimeError(f'extract produced no output for {path}')
        header += ch
    W, H, fps = header.decode().split()
    W, H, fps = int(W), int(H), float(fps)
    nbytes = W * H * 4
    while True:
        buf = proc.stdout.read(nbytes)
        if not buf or len(buf) < nbytes:
            break
        yield W, H, fps, np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 4)[:, :, :3]
    proc.stdout.close()
    proc.wait()


def find_panel(frames_avg):
    """The content rectangle inside any black letterbox.

    Uses row/column occupancy rather than a plain bounding box so the
    generator watermark sitting out in the black margin -- bright, but only a
    few pixels tall -- cannot drag the rectangle open.
    """
    # Averaged over the clip rather than maxed: the black margin carries
    # enough compression noise that a per-pixel max lights the whole margin
    # up and swallows the panel into it.
    bright = frames_avg.max(axis=2) > 50
    if not bright.any():
        return 0, 0, frames_avg.shape[1], frames_avg.shape[0]

    # The panel is one solid non-black rectangle; the watermark is a separate
    # island out in the margin. Taking the biggest island keeps the watermark
    # from dragging the rectangle open, without assuming the character never
    # fills a row (which truncated the panel on the taller clips).
    lab, n = ndimage.label(bright)
    if n > 1:
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        bright = lab == int(np.argmax(sizes))

    ys, xs = np.nonzero(bright)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

    # The component's bounding box can still clip a corner of letterbox (the
    # panel edge is soft, and stray bright specks pull the box outwards).
    # Any letterbox left in the crop poisons checker-tone detection, so pull
    # the rectangle in until its own border ring is clean.
    lum = frames_avg.max(axis=2)

    def dark_ring(a, b, c, d):
        ring = np.concatenate([lum[b, a:c], lum[d - 1, a:c],
                               lum[b:d, a], lum[b:d, c - 1]])
        return float((ring < 50).mean())

    for _ in range(64):
        if x1 - x0 < 24 or y1 - y0 < 24 or dark_ring(x0, y0, x1, y1) <= 0.02:
            break
        x0, y0, x1, y1 = x0 + 1, y0 + 1, x1 - 1, y1 - 1
    return x0, y0, x1, y1


def analyze(path, plan=None):
    """Panel rect + where Jimmy sits inside it, all as fractions."""
    frames = []
    for W, H, fps, f in stream_clip(path, ANALYZE_DIM):
        frames.append(f)
    if plan:
        frames = [frames[i] for i in plan if i < len(frames)]
    frames = np.array(frames)
    panel = find_panel(frames.mean(axis=0))
    x0, y0, x1, y1 = panel
    sub = frames[:, y0:y1, x0:x1]
    pw, ph = x1 - x0, y1 - y0

    boxes = []
    for f in sub[::2]:
        bb = content_bbox(key_frame(f)[:, :, 3])
        if bb:
            boxes.append(bb)
    b = np.array(boxes, dtype=float)
    ground = b[:, 3].max()
    head = float(np.median(b[:, 1]))
    return {
        'fps': fps, 'frames': len(frames),
        'panel': [x0 / W, y0 / H, x1 / W, y1 / H],
        'aspect': pw / ph,   # lets width fractions be converted into height units
        'ground': ground / ph,
        'char_h': (ground - head) / ph,
        'center_x': float(np.median((b[:, 0] + b[:, 2]) / 2)) / pw,
        'left': b[:, 0].min() / pw,
        'right': b[:, 2].max() / pw,
        'top': b[:, 1].min() / ph,
    }


def render(path, geo, canvas_w, canvas_h, out_path, quality=74, plan=None):
    """Key every frame and paste it onto the shared canvas, anchored so the
    ground line lands on the canvas bottom and the body is centred."""
    # Decode at whatever resolution makes Jimmy come out ~TARGET_CHAR_H tall,
    # so we neither upscale a small clip nor waste time on a huge one.
    panel_h_frac = geo['panel'][3] - geo['panel'][1]
    char_frac_of_frame = geo['char_h'] * panel_h_frac
    max_dim = int(min(2200, max(500, TARGET_CHAR_H / char_frac_of_frame * 1.05)))

    px0 = py0 = px1 = py1 = None

    # A plan reorders/repeats source frames, so they have to be gathered
    # before the fps resample rather than streamed straight through.
    source = None
    if plan:
        wanted = set(plan)
        grabbed = {}
        for i, (W, H, fps_, f) in enumerate(stream_clip(path, max_dim)):
            if i in wanted:
                grabbed[i] = f
        source = [(grabbed[i], fps_) for i in plan if i in grabbed]

    out_frames = []
    kept = 0
    stream = (
        ((0, 0, fps_i, fi) for fi, fps_i in source)
        if source is not None
        else stream_clip(path, max_dim)
    )
    for i, (W, H, fps, f) in enumerate(stream):
        # resample down to OUT_FPS without drifting: keep a frame only when
        # the output clock has advanced past the previous one
        if int(i * OUT_FPS / fps) < kept:
            continue
        kept += 1
        if px0 is None:
            # From the frame itself, not the stream header: a frame plan
            # replays already-decoded frames and has no header to carry.
            fh, fw = f.shape[:2]
            px0, py0 = int(geo['panel'][0] * fw), int(geo['panel'][1] * fh)
            px1, py1 = int(geo['panel'][2] * fw), int(geo['panel'][3] * fh)
        sub = f[py0:py1, px0:px1]
        ph, pw = sub.shape[:2]
        rgba = key_frame(sub)

        scale = TARGET_CHAR_H / (geo['char_h'] * ph)
        new_w, new_h = max(1, round(pw * scale)), max(1, round(ph * scale))
        arr = np.asarray(Image.fromarray(rgba).resize((new_w, new_h), Image.LANCZOS))

        # anchor: ground line -> canvas baseline, body centre -> canvas centre
        x = round(canvas_w / 2 - geo['center_x'] * pw * scale)
        y = round(canvas_h - BOTTOM_PAD - geo['ground'] * ph * scale)
        canvas = np.zeros((canvas_h, canvas_w, 4), np.uint8)
        sx, sy = max(0, -x), max(0, -y)
        dx, dy = max(0, x), max(0, y)
        w = min(new_w - sx, canvas_w - dx)
        h = min(new_h - sy, canvas_h - dy)
        if w > 0 and h > 0:
            canvas[dy:dy + h, dx:dx + w] = arr[sy:sy + h, sx:sx + w]
        out_frames.append(Image.fromarray(canvas))

    duration = round(1000.0 / OUT_FPS)
    # loop=1 -> plays through once and holds on its last frame. The dances
    # are seamless loops, so that last frame is essentially the neutral
    # opening pose; Jimmy replays on tap rather than jigging forever. See
    # JimmyAnimation for how the replay is triggered.
    out_frames[0].save(out_path, save_all=True, append_images=out_frames[1:],
                       duration=duration, loop=1, quality=quality, method=4,
                       minimize_size=True)
    return len(out_frames), os.path.getsize(out_path)


if __name__ == '__main__':
    root = 'public/animations/dances'
    out_root = 'public/animations/dances'
    clips = [(d, s) for d in range(1, 5) for s in range(1, 5)]

    geo_path = sys.argv[1] if len(sys.argv) > 1 else 'geo2.json'
    if os.path.exists(geo_path):
        geos = json.load(open(geo_path))
    else:
        geos = {}
        for d, s in clips:
            k = f'{d}/{s}'
            geos[k] = analyze(f'{root}/dance{d}/stage{s}.mp4')
            g = geos[k]
            print(f'analyze dance{d}/stage{s}: panel={[round(v,3) for v in g["panel"]]} '
                  f'charH={g["char_h"]:.3f} ground={g["ground"]:.3f} cx={g["center_x"]:.3f} '
                  f'span=[{g["left"]:.3f},{g["right"]:.3f}] top={g["top"]:.3f}', flush=True)
        json.dump(geos, open(geo_path, 'w'), indent=1)

    # One canvas that fits every pose of every clip.
    ups, sides = [], []
    for k, g in geos.items():
        sc = TARGET_CHAR_H / g['char_h']
        ups.append((g['ground'] - g['top']) * sc)
        # width fractions are of the panel width, so convert into the same
        # units the vertical scale is expressed in before applying it
        sides.append(max(g['center_x'] - g['left'], g['right'] - g['center_x'])
                     * g['aspect'] * sc)
    canvas_h = int(np.ceil(max(ups))) + TOP_PAD + BOTTOM_PAD
    canvas_w = 2 * int(np.ceil(max(sides))) + SIDE_PAD
    print(f'\ncanvas {canvas_w}x{canvas_h} (char height {TARGET_CHAR_H})\n')

    total = 0
    for d, s in clips:
        k = f'{d}/{s}'
        out = f'{out_root}/dance{d}/stage{s}.webp'
        n, size = render(f'{root}/dance{d}/stage{s}.mp4', geos[k], canvas_w, canvas_h, out)
        total += size
        print(f'dance{d}/stage{s}.webp  {n:3d} frames  {size/1024:7.1f} KB', flush=True)
    print(f'\ntotal {total/1024/1024:.1f} MB')
    json.dump({'canvas': [canvas_w, canvas_h], 'charH': TARGET_CHAR_H},
              open('webp_canvas.json', 'w'))
