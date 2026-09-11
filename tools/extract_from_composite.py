#!/usr/bin/env python3
"""Lift one garment off a Canva composite, using our own sprite as the bare
reference.

The composites are the same character in the same pose as our sprites, just
graded differently by whatever re-rendered them — so a straight subtraction
flags the whole body. Fitting a per-channel linear map on a region that is
BARE in both (the legs) removes the grading, after which the garment is the
only thing left standing well clear of the noise floor.

Usage:  python3 tools/extract_from_composite.py <composite.png> <stage> <out.png>
"""
import sys
import numpy as np
from scipy import ndimage
from PIL import Image

SPRITES = {1: 'jimmy-goat', 2: 'jimmy-buff', 3: 'jimmy-titan', 4: 'jimmy-legend'}

def subject(img):
    a = np.asarray(img.getchannel('A')); ys, xs = np.where(a > 40)
    return img.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))

def main(path, stage, out_path, bare=(0.60, 0.95), thresh=28):
    cv = subject(Image.open(path).convert('RGBA'))
    sp = subject(Image.open(f'public/assets/{SPRITES[int(stage)]}.png').convert('RGBA'))
    ref = sp.resize(cv.size, Image.LANCZOS)
    A = np.asarray(cv).astype(np.float32); B = np.asarray(ref).astype(np.float32)
    both = (A[..., 3] > 60) & (B[..., 3] > 60)
    H = A.shape[0]
    fit = np.zeros_like(both); fit[int(H*bare[0]):int(H*bare[1])] = True; fit &= both
    Bm = B.copy()
    for ch in range(3):
        k, c = np.polyfit(B[..., ch][fit], A[..., ch][fit], 1)
        Bm[..., ch] = B[..., ch]*k + c
    d = np.abs(A[..., :3] - Bm[..., :3]).mean(2)
    print(f'  residual: bare-fit region {d[fit].mean():.2f}  (the garment must sit well above this)')
    added = (A[..., 3] > 60) & (B[..., 3] <= 60)     # garment beyond the goat's silhouette
    core = ndimage.binary_opening((d > thresh) | added, np.ones((3, 3)))
    lab, n = ndimage.label(core, structure=np.ones((3, 3)))
    if n:
        s = ndimage.sum(core, lab, range(1, n+1))
        core = np.isin(lab, [j+1 for j, x in enumerate(s) if x >= max(60, 0.05*s.max())])
    solid = ndimage.binary_fill_holes(ndimage.binary_closing(core, np.ones((7, 7))))
    edge = ndimage.binary_dilation(solid, np.ones((3, 3)), iterations=2) & ((d > thresh*0.5) | added)
    mask = ndimage.binary_fill_holes(ndimage.binary_closing(solid | edge, np.ones((5, 5))))
    mask &= A[..., 3] > 40
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n:
        s = ndimage.sum(mask, lab, range(1, n+1))
        mask = np.isin(lab, [j+1 for j, x in enumerate(s) if x >= max(120, 0.05*s.max())])
    alpha = np.clip(ndimage.gaussian_filter(mask.astype(np.float32), 0.6)*1.25, 0, 1) * (A[..., 3]/255)
    ys, xs = np.where(alpha > 0.4)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1
    rgba = np.dstack([A[..., :3].astype(np.uint8), (alpha*255).astype(np.uint8)]).astype(np.uint8)
    Image.fromarray(rgba).crop((x0, y0, x1, y1)).save(out_path)
    # where it sits on the goat, as the percentages ACCESSORY_LAYOUT wants
    print(f'  saved {out_path}  {x1-x0}x{y1-y0}  aspect={(x1-x0)/(y1-y0):.3f}')
    print(f'  on the sprite: width={100*(x1-x0)/A.shape[1]:.1f}% of subject, '
          f'centre x={100*((x0+x1)/2)/A.shape[1]:.1f}%, y={100*((y0+y1)/2)/H:.1f}%')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])


def extract_by_colour(path, out_path, warm_max=28, sprite=None):
    """Reference-free alternative, for a garment whose colour is clearly not
    fur. Needed because Canva re-renders the whole character per export: on
    the Titan's hoodie the BARE LEGS still differ from our sprite by 28.6
    after colour-matching, while the garment only reaches 32 — no separation
    at all. Warmth (R-B) does separate them: this cloth sits near 15, the
    fur near 41.
    """
    import numpy as np
    from scipy import ndimage
    from PIL import Image
    img = Image.open(path).convert('RGBA')
    a = np.asarray(img.getchannel('A')); ys, xs = np.where(a > 40)
    C = img.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))
    A = np.asarray(C).astype(np.float32)
    op = A[..., 3] > 60
    warmth = A[..., 0] - A[..., 2]
    cloth = op & (warmth < warm_max)
    cloth = ndimage.binary_opening(cloth, np.ones((3, 3)))
    lab, n = ndimage.label(cloth, structure=np.ones((3, 3)))
    s = ndimage.sum(cloth, lab, range(1, n+1))
    cloth = lab == (int(np.argmax(s)) + 1)          # the garment is the big one
    cloth = ndimage.binary_fill_holes(ndimage.binary_closing(cloth, np.ones((9, 9))))
    alpha = np.clip(ndimage.gaussian_filter(cloth.astype(np.float32), 0.6)*1.25, 0, 1) * (A[..., 3]/255)
    ys, xs = np.where(alpha > 0.4)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1
    rgba = np.dstack([A[..., :3].astype(np.uint8), (alpha*255).astype(np.uint8)]).astype(np.uint8)
    Image.fromarray(rgba).crop((x0, y0, x1, y1)).save(out_path)
    H, W = A.shape[:2]
    if sprite:
        sp = Image.open(f'public/assets/{sprite}.png').convert('RGBA')
        sa = np.asarray(sp.getchannel('A')); sy, sx = np.where(sa > 40)
        CW, CH = sp.size; kx = (sx.max()+1-sx.min())/W; ky = (sy.max()+1-sy.min())/H
        print(f'  {out_path}  {x1-x0}x{y1-y0} aspect={(x1-x0)/(y1-y0):.3f}  '
              f'width={(x1-x0)*kx/CW*100:.1f}%  left={(sx.min()+((x0+x1)/2)*kx)/CW*100:.1f}%  '
              f'top={(sy.min()+((y0+y1)/2)*ky)/CH*100:.1f}%')
