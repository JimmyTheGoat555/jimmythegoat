#!/usr/bin/env python3
"""Pull wearable accessory layers out of a folder of Canva composites.

Each folder holds one export per accessory of the SAME Jimmy — goat plus
garment, flattened, with the transparency checkerboard baked into the JPEG.
They share a base render, so:

  * the bare goat is the per-pixel MEDIAN of the set (at any pixel at most a
    couple of the images carry an accessory), and
  * each accessory is simply what differs from that.

Two things make it harder than it sounds, both handled below:

  * The baked checkerboard cannot be removed by colour (a white tank is
    checker-coloured too) or by flooding in from the border (the tank meets
    the background at the armholes, so the flood pours straight into it).
    What separates them: the checkerboard is TWO values alternating, cloth
    is one. Require both present nearby, then grow into neighbouring
    background by a bounded number of steps.
  * Low-contrast garments (a grey hoodie on brown fur) come out with bites
    taken from the shoulders. Those notches are open at the TOP, so
    fill_holes can never reach them; a tall vertical closing can, but only
    over the outer thirds — run it across the middle and it bridges the hood
    down to the body and plasters over the neck.

Usage:  python3 tools/extract_accessories.py <folder> <out-dir>
"""
import sys, json, unicodedata
from pathlib import Path
import numpy as np
from scipy import ndimage
from PIL import Image

# Hebrew filename fragment -> the catalog-ish name we save under.
NAMES = {
    'אוזניות': 'headphones', 'גופייה': 'tank', 'גופיה': 'tank', 'גינס': 'jeans',
    'כובע': 'cap', 'נעליים': 'shoes', 'קפוצון': 'hoodie', 'משקפי': 'shades',
}

def classify(path):
    stem = unicodedata.normalize('NFKC', path.stem)
    for frag, name in NAMES.items():
        if frag in stem:
            return name
    return None

def background_of(img, lo, hi, grow=20):
    v = img.mean(2); ch = img.max(2) - img.min(2)
    near_lo = (np.abs(v - lo) < 14) & (ch <= 20)
    near_hi = (np.abs(v - hi) < 14) & (ch <= 20)
    checkerish = near_lo | near_hi
    k = np.ones((31, 31)) / 961
    fl = ndimage.convolve(near_lo.astype(np.float32), k, mode='nearest')
    fh = ndimage.convolve(near_hi.astype(np.float32), k, mode='nearest')
    out = checkerish & (fl > 0.22) & (fh > 0.22)
    for _ in range(grow):
        out = ndimage.binary_dilation(out, np.ones((3, 3))) & checkerish
    return out

def diffuse_fill(rgb, known, target):
    out = rgb.copy(); k = known.astype(np.float32); fill = target & ~known
    for _ in range(140):
        if not fill.any(): break
        num = sum(np.roll(out * k[..., None], s, axis=a) for a, s in ((0,1),(0,-1),(1,1),(1,-1)))
        den = sum(np.roll(k, s, axis=a) for a, s in ((0,1),(0,-1),(1,1),(1,-1)))
        upd = (den > 0) & fill
        out[upd] = num[upd] / den[upd][:, None]; k[upd] = 1.0; fill = fill & ~upd
    return out

def main(folder, outdir):
    folder, outdir = Path(folder), Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    files = [(classify(p), p) for p in sorted(folder.iterdir()) if p.suffix.lower() in ('.jpg', '.jpeg', '.png')]
    files = [(n, p) for n, p in files if n]
    if len(files) < 3:
        sys.exit(f'need at least 3 recognised images, found {len(files)}')
    stack = np.stack([np.asarray(Image.open(p).convert('RGB')).astype(np.float32) for _, p in files])
    base = np.median(stack, axis=0)
    corner = stack[0][0:150, 0:100].mean(2)
    LO, HI = np.percentile(corner, 10), np.percentile(corner, 90)

    bg_base = background_of(base, LO, HI)
    goat = ~bg_base
    goat = ndimage.binary_fill_holes(ndimage.binary_closing(ndimage.binary_opening(goat, np.ones((3,3))), np.ones((7,7))))
    lab, n = ndimage.label(goat); sizes = ndimage.sum(goat, lab, range(1, n+1))
    goat = lab == (int(np.argmax(sizes)) + 1)
    gy, gx = np.where(goat)
    meta = {'goat': dict(x0=int(gx.min()), y0=int(gy.min()), x1=int(gx.max()), y1=int(gy.max())), 'items': {}}
    Image.fromarray(base.astype(np.uint8)).save(outdir / '_base.png')

    for i, (name, path) in enumerate(files):
        img = stack[i]
        d = np.sqrt(((img - base) ** 2).sum(2))
        bg_here = background_of(img, LO, HI)
        core = ndimage.binary_opening((d > 45) & ~(bg_base & (d < 26)) & ~bg_here, np.ones((3,3)))
        lab, n = ndimage.label(core, structure=np.ones((3,3)))
        if n:
            s = ndimage.sum(core, lab, range(1, n+1))
            core = np.isin(lab, [j+1 for j, x in enumerate(s) if x >= max(150, 0.03*s.max())])
        solid = ndimage.binary_fill_holes(ndimage.binary_closing(core, np.ones((11,11))))
        edge = ndimage.binary_dilation(solid, np.ones((3,3)), iterations=2) & (d > 18) & ~bg_here
        mask = ndimage.binary_fill_holes(ndimage.binary_closing(solid|edge, np.ones((5,5)))) & ~bg_here
        rgb = img.copy()

        if name == 'cap':
            # navy against brown fur separates outright
            mask &= ~((rgb[:,:,0] - rgb[:,:,2]) > 12)
            mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, np.ones((5,5)))) & ~bg_here
            lab, n = ndimage.label(mask); s = ndimage.sum(mask, lab, range(1, n+1))
            mask = lab == (int(np.argmax(s)) + 1)

        if name in ('hoodie', 'tank'):
            before = mask.copy()
            ys, xs = np.where(mask); x0, x1 = xs.min(), xs.max()
            cols = np.zeros(mask.shape, bool)
            cols[:, x0:int(x0 + 0.34*(x1-x0))] = True
            cols[:, int(x0 + 0.66*(x1-x0)):x1+1] = True
            healed = (mask | (ndimage.binary_closing(mask, np.ones((71,5), bool)) & cols)) & ~bg_here
            healed = ndimage.binary_fill_holes(healed)
            rgb = diffuse_fill(rgb, before, healed); mask = healed

        lab, n = ndimage.label(mask, structure=np.ones((3,3)))
        if n:
            s = ndimage.sum(mask, lab, range(1, n+1))
            mask = np.isin(lab, [j+1 for j, x in enumerate(s) if x >= max(400, 0.02*s.max())])
        alpha = np.clip(ndimage.gaussian_filter(mask.astype(np.float32), 0.7) * 1.2, 0, 1)
        ys, xs = np.where(alpha > 0.4)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1
        rgba = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), (alpha*255).astype(np.uint8)]).astype(np.uint8)
        Image.fromarray(rgba).crop((x0, y0, x1, y1)).save(outdir / f'{name}.png')
        meta['items'][name] = dict(x0=x0, y0=y0, x1=x1, y1=y1, aspect=round((x1-x0)/(y1-y0), 3))
        print(f'  {name:11s} {x1-x0}x{y1-y0}  aspect={(x1-x0)/(y1-y0):.3f}')
    json.dump(meta, open(outdir / 'meta.json', 'w'), indent=1)
    print(f'  goat bbox {meta["goat"]}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
