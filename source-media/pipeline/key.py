"""Turn the baked-in background of the dance MP4s back into a real alpha
channel.

The clips have no alpha (H.264 cannot carry it): the transparency was
flattened into a checkerboard, and on the stage3/stage4 clips that panel is
letterboxed in black. What separates background from character is brightness,
but only at the right threshold -- measuring the neutral-grey histogram across
the clips shows a hard valley just below 200: Jimmy's greys (horns included, the part
a naive key always eats) all sit below it, and every background tone -- both
checker tiles, the anti-aliased seams between them, and the extra band partway
up some clips -- sits above it. Earlier attempts to learn the background per
pixel over time were strictly worse: a percentile or mode reads the horns as
background wherever they linger, and the real background around them then
never keys and blooms into a white blob.

So: neutral, and either above that valley (checkerboard) or near black
(letterbox), and reachable from the frame border.
"""
import numpy as np
from scipy import ndimage

NEUTRAL_SPREAD = 30   # max(R,G,B)-min(R,G,B) below this counts as greyscale
BG_FLOOR = 190        # the measured valley between Jimmy's greys and the tiles
BG_DARK = 28          # letterbox padding on the stage3/stage4 clips


def background_mask(rgb):
    """True where the pixel is background and connects to the frame border
    (or forms a pocket too big to be an eye glint)."""
    a = rgb.astype(np.int16)
    mx, mn = a.max(2), a.min(2)
    neutral = (mx - mn) <= NEUTRAL_SPREAD
    cand = neutral & ((mn >= BG_FLOOR) | (mx <= BG_DARK))

    lab, n = ndimage.label(cand)
    if n == 0:
        return cand
    border = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])
    keep = set(np.unique(border).tolist()) - {0}
    # Background pockets fully enclosed by limbs (an arm against the torso)
    # never touch the border, but are far too big to be an eye glint.
    sizes = np.bincount(lab.ravel())
    min_pocket = max(150, int(0.0015 * lab.size))
    keep.update(int(i) for i in np.nonzero(sizes >= min_pocket)[0] if i != 0)
    if not keep:
        return np.zeros_like(cand)
    return np.isin(lab, np.fromiter(keep, dtype=lab.dtype)) & cand


def fill_speckles(fg):
    """Close pinholes the key punched in the character, but only pinholes.

    A blanket binary_fill_holes also fills the real background trapped
    between the horns and the head, which then shows up as opaque white
    blocks stuck to his head -- so only holes too small to be anything but a
    keying artefact get filled.
    """
    lab, n = ndimage.label(~fg)
    if n == 0:
        return fg
    border = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])
    outside = set(np.unique(border).tolist())
    sizes = np.bincount(lab.ravel())
    limit = max(40, int(0.0004 * lab.size))
    fill = [i for i in np.nonzero(sizes < limit)[0] if i != 0 and i not in outside]
    if not fill:
        return fg
    return fg | np.isin(lab, fill)


def keep_character(fg):
    """Drop foreground islands that are not Jimmy.

    Some clips carry the generator's watermark inside the panel itself. It is
    darker than the checkerboard so it survives the key, and being near the
    panel floor it drags the measured ground line down and shrinks him. Any
    island a small fraction of the body's size is not part of him -- the
    fraction, rather than only-the-largest, so a horn tip or a hand that the
    key momentarily pinches off does not vanish with it.
    """
    lab, n = ndimage.label(fg)
    if n <= 1:
        return fg
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    keep = np.nonzero(sizes >= 0.02 * sizes.max())[0]
    return np.isin(lab, keep)


def key_frame(rgb):
    """RGB uint8 HxWx3 -> RGBA uint8 with the background removed.

    Speckles are closed and interior holes filled before the silhouette is
    eroded by a pixel: the outermost ring of the character is blended with
    background by the video encoder, so keeping it leaves a pale halo once
    the sprite sits on the app's dark backdrop.
    """
    fg = ~background_mask(rgb)
    fg = ndimage.binary_closing(fg, structure=np.ones((3, 3), bool))
    fg = fill_speckles(fg)
    fg = keep_character(fg)
    fg = ndimage.binary_erosion(fg, structure=np.ones((3, 3), bool), border_value=0)

    alpha = ndimage.gaussian_filter(fg.astype(np.float32), sigma=0.8)
    alpha = np.clip((alpha - 0.35) / 0.45, 0, 1)

    out = np.empty(rgb.shape[:2] + (4,), dtype=np.uint8)
    out[:, :, :3] = rgb
    out[:, :, 3] = (alpha * 255).astype(np.uint8)
    return out


def content_bbox(alpha, thresh=40):
    """(x0, y0, x1, y1) half-open bbox of visible pixels, or None."""
    ys, xs = np.nonzero(alpha > thresh)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
