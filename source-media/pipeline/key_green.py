"""Turn a solid green-screen background into a real alpha channel.

Gena's dance clips were generated from green-screen stills (see
tools/pad-for-video.mjs), so unlike Jimmy's (key.py: a flattened
checkerboard inside a black letterbox) the background is one flat colour.
Measured across the delivered MP4s the border ring never drops below a
green dominance (G - max(R,B)) of ~208, and the only pixels in the 20-60
band are the antialiased silhouette edge -- so a single dominance cut
separates her cleanly. She has no green on her at all (the sprites were
checked before choosing the key colour), which is what makes the despill
below safe to apply to every foreground pixel rather than just the rim.

Everything after the mask -- border connectivity, closing, pinhole fill,
island rejection, 1px erosion, feathered alpha -- is key.py's chain,
kept identical so the two characters' edges look the same on the app's
dark backdrop.
"""
import numpy as np
from scipy import ndimage

BG_DOMINANCE = 45   # G - max(R,B) above this is background; the edge band
                    # (20-60) is split so blended pixels lean background,
                    # and the erosion below takes the rest


def background_mask(rgb):
    """True where the pixel is green background and connects to the frame
    border (or forms a pocket too big to be a glint)."""
    a = rgb.astype(np.int16)
    dom = a[:, :, 1] - np.maximum(a[:, :, 0], a[:, :, 2])
    cand = dom > BG_DOMINANCE

    lab, n = ndimage.label(cand)
    if n == 0:
        return cand
    border = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])
    keep = set(np.unique(border).tolist()) - {0}
    # Green trapped between an arm and the torso never touches the border
    # but is far too big to be anything but background.
    sizes = np.bincount(lab.ravel())
    min_pocket = max(150, int(0.0015 * lab.size))
    keep.update(int(i) for i in np.nonzero(sizes >= min_pocket)[0] if i != 0)
    if not keep:
        return np.zeros_like(cand)
    return np.isin(lab, np.fromiter(keep, dtype=lab.dtype)) & cand


def fill_speckles(fg):
    """Close pinholes the key punched in the character, but only pinholes
    (see key.py for why a blanket hole-fill is wrong)."""
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
    """Drop foreground islands that are not her -- a generator watermark,
    a stray fleck -- without losing a hoof the key momentarily pinched off."""
    lab, n = ndimage.label(fg)
    if n <= 1:
        return fg
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    keep = np.nonzero(sizes >= 0.02 * sizes.max())[0]
    return np.isin(lab, keep)


def despill(rgb, fg):
    """Pull the green cast out of the rim. H.264 stores chroma at half
    resolution, so the encoder smears background green a pixel or two into
    the character; on the app's dark backdrop that reads as a lime outline.
    Clamping G to max(R,B) removes exactly the excess and nothing else --
    a pixel with no green cast is untouched."""
    out = rgb.copy()
    g = out[:, :, 1]
    cap = np.maximum(out[:, :, 0], out[:, :, 2])
    over = fg & (g > cap)
    g[over] = cap[over]
    return out


def key_frame(rgb):
    """RGB uint8 HxWx3 -> RGBA uint8 with the green removed."""
    fg = ~background_mask(rgb)
    fg = ndimage.binary_closing(fg, structure=np.ones((3, 3), bool))
    fg = fill_speckles(fg)
    fg = keep_character(fg)
    fg = ndimage.binary_erosion(fg, structure=np.ones((3, 3), bool), border_value=0)

    alpha = ndimage.gaussian_filter(fg.astype(np.float32), sigma=0.8)
    alpha = np.clip((alpha - 0.35) / 0.45, 0, 1)

    out = np.empty(rgb.shape[:2] + (4,), dtype=np.uint8)
    out[:, :, :3] = despill(rgb, alpha > 0)
    out[:, :, 3] = (alpha * 255).astype(np.uint8)
    return out
