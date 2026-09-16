import { mascotSpriteAspect } from './mascots';

// Where the character's body IS, per sprite — so that gear can be placed
// against the body rather than against the canvas.
//
// ── WHY ANCHORS ────────────────────────────────────────────────────────
//
// The accessory layer used to carry a table of (top, left, width) per
// ITEM per TIER, measured off Jimmy's sprites, plus a second table for
// Gena. Adding a character, a tier or an outfit meant re-measuring every
// piece of gear against it, and a piece that was never re-measured drew
// in the old place on the new body — which is exactly what an outfit set
// with a slightly different pose would have done. Now each sprite
// carries a handful of LANDMARKS, each item says how it sits relative to
// one landmark (accessoryArt.jsx `fit`), and AccessoryLayer multiplies
// the two. A new sprite needs its landmarks measured once; every item
// then lands on it.
//
// ── THE CONTRACT ─────────────────────────────────────────────────────────
//
// All numbers are FRACTIONS OF THE SPRITE CANVAS: `x` of its width, `y`
// of its height, and every width (`span`, `width`) of its WIDTH. That is
// the coordinate system AccessoryLayer rebuilds around the drawn sprite,
// so one set of numbers serves a 40px feed row and a 208px lobby hero.
//
// Because x-units and y-units differ (a canvas is taller than wide), a
// vertical offset expressed in a width unit — "half a pupil span above
// the eyes" — is converted with the canvas aspect: dy × unit × (W/H).
// Doing that here, once, is what lets Jimmy (0.36:1 canvases) and Gena
// (0.28:1) share the same item fits.
//
// Every sprite also honours GROUND_LINE: feet at 84% of canvas height,
// enforced by tools/normalize-sprites.mjs. That is what keeps the
// pedestal under the feet on every tier, every outfit and every dance
// clip's settled frame.
//
// ── THE LANDMARKS ─────────────────────────────────────────────────────
//
//   eyes  x: face midline · y: the eye line · span: pupil-to-pupil
//         distance. The one unambiguous landmark on a goat — the ears
//         merge into the cheeks in the alpha channel, so "face width"
//         read off the silhouette is noisy, and the pupils are not.
//         Shades hang off this.
//   head  x: midline · y: the crown, the top of the skull between the
//         horns, where a hat's band sits · width: the head at the ear
//         roots, ears excluded — what a pair of headphones has to
//         straddle. Hats and headphones hang off this.
//   neck  x: midline · y: the neck base, the narrowest row before the
//         shoulders flare · width: shoulder width. Garments with a
//         collar hang off this.
//   hips  x: midline of the legs · y: the hip line · width: the span of
//         the legs at 62% of canvas height, where the hands are clear of
//         the thighs. Trousers hang off this.
//
// ── WHERE THE NUMBERS CAME FROM ───────────────────────────────────────
//
// Measured off the sprites' alpha channels (dev/avatar-gallery.html with
// `?anchors=1` draws them, which is how to check a new one), then
// corrected against the render — a landmark that reads correctly by eye
// beats one that is arithmetically pure. Jimmy's four tiers are four
// different bodies on four different canvases, so each has its own set;
// Gena's four were normalised onto one canvas and differ only in
// definition, so hers vary only where the body genuinely does (the
// Buff's wider stance). Her outfit sets are renders of the same body in
// the same pose, registered to the base sprites within a pixel
// (tools/build_gena_outfits.py prints the match), so they inherit —
// `outfits` below is where a set that DOES differ would get its own
// numbers, per tier, merged over the base.
export const GROUND_LINE = 0.84;

export const AVATAR_ANCHORS = {
  jimmy: {
    tiers: {
      1: {
        eyes: { x: 0.497, y: 0.168, span: 0.166 },
        head: { x: 0.497, y: 0.095, width: 0.419 },
        neck: { x: 0.497, y: 0.245, width: 0.54 },
        hips: { x: 0.506, y: 0.45, width: 0.631 },
      },
      2: {
        eyes: { x: 0.483, y: 0.179, span: 0.19 },
        head: { x: 0.483, y: 0.11, width: 0.479 },
        neck: { x: 0.483, y: 0.255, width: 0.72 },
        hips: { x: 0.483, y: 0.45, width: 0.587 },
      },
      3: {
        eyes: { x: 0.496, y: 0.152, span: 0.169 },
        head: { x: 0.496, y: 0.074, width: 0.427 },
        neck: { x: 0.496, y: 0.23, width: 0.68 },
        hips: { x: 0.5, y: 0.45, width: 0.538 },
      },
      // The Legend's sprite was 6px low on the ground line and was moved
      // up by tools/normalize-sprites.mjs; these are measured on the
      // normalised file.
      4: {
        eyes: { x: 0.493, y: 0.158, span: 0.15 },
        head: { x: 0.493, y: 0.0735, width: 0.378 },
        neck: { x: 0.493, y: 0.206, width: 0.75 },
        hips: { x: 0.491, y: 0.446, width: 0.505 },
      },
    },
    outfits: {},
  },
  gena: {
    tiers: {
      1: {
        eyes: { x: 0.505, y: 0.153, span: 0.185 },
        head: { x: 0.505, y: 0.093, width: 0.469 },
        neck: { x: 0.505, y: 0.26, width: 0.667 },
        hips: { x: 0.505, y: 0.45, width: 0.505 },
      },
      2: {
        eyes: { x: 0.505, y: 0.153, span: 0.185 },
        head: { x: 0.505, y: 0.095, width: 0.469 },
        neck: { x: 0.505, y: 0.26, width: 0.695 },
        hips: { x: 0.505, y: 0.45, width: 0.565 },
      },
      3: {
        eyes: { x: 0.505, y: 0.153, span: 0.185 },
        head: { x: 0.505, y: 0.093, width: 0.469 },
        neck: { x: 0.505, y: 0.26, width: 0.67 },
        hips: { x: 0.505, y: 0.45, width: 0.474 },
      },
      4: {
        eyes: { x: 0.505, y: 0.153, span: 0.185 },
        head: { x: 0.505, y: 0.094, width: 0.469 },
        neck: { x: 0.505, y: 0.26, width: 0.744 },
        hips: { x: 0.505, y: 0.45, width: 0.498 },
      },
    },
    // Per outfit id, per tier, PARTIAL: only the landmarks that differ
    // from the base sprite's. Empty because the three sets register to
    // the base within a pixel; a set drawn in a different pose lists its
    // own here, e.g. { 'accessory-gena-pink': { 2: { eyes: {...} } } }.
    outfits: {},
  },
};

// The landmarks for one drawn sprite: this mascot, at this tier, in this
// outfit (or none). Falls back the way the sprites themselves fall back
// — an unknown tier draws stage 1, so it gets stage 1's landmarks — and
// carries the canvas aspect the layer needs for the unit conversion.
// Returns null only for a mascot with no anchors at all, which the layer
// treats as "wears nothing" rather than guessing.
export function anchorsFor(mascotId, stage, outfitId = null) {
  const mascot = AVATAR_ANCHORS[mascotId];
  if (!mascot) return null;
  const base = mascot.tiers[stage] ?? mascot.tiers[1];
  if (!base) return null;
  const override = (outfitId && mascot.outfits[outfitId]?.[stage]) || null;
  const merged = override
    ? Object.fromEntries(Object.keys(base).map((k) => [k, { ...base[k], ...(override[k] ?? {}) }]))
    : base;
  return { ...merged, ground: GROUND_LINE, aspect: mascotSpriteAspect(mascotId, stage) };
}

// A `{1,2,3,4}` map resolves to this tier's entry (falling back to 1);
// anything else is used as is. The same shape accessoryArt's artFor uses.
function byStage(value, stage) {
  return value && typeof value === 'object' ? value[stage] ?? value[1] : value;
}

// Turns an item's fit (accessoryArt.jsx) and a sprite's anchors into the
// CSS the layer draws with: percentages of the sprite box, `top`/`left`
// being the CENTRE of the piece (the layer translates -50%,-50%).
//
// A fit says which landmark it hangs off, then its size and offsets in
// that landmark's own unit — `width`/`dx`/`dy` multiply the landmark's
// span (eyes) or width (head, neck, hips), with `dy` converted to a
// height fraction through the canvas aspect. Absolute forms exist for
// the per-stage garments cut from Jimmy's own composites: `widthW` and
// `dxW` are fractions of canvas width, `dyH` of canvas height, and any of
// them may be a {1,2,3,4} map when the four cuts genuinely differ. Both
// forms add, so a fit can mix them.
export function placeOnAnchors(fit, anchors, stage = 1) {
  if (!fit || !anchors) return null;
  const point = anchors[fit.anchor];
  if (!point) return null;
  const unit = point.span ?? point.width ?? 0;
  const n = (v) => Number(byStage(v, stage) ?? 0);
  const left = point.x + n(fit.dx) * unit + n(fit.dxW);
  const top = point.y + n(fit.dy) * unit * anchors.aspect + n(fit.dyH);
  const width = n(fit.width) * unit + n(fit.widthW);
  if (!(width > 0)) return null;
  return { left: `${(left * 100).toFixed(2)}%`, top: `${(top * 100).toFixed(2)}%`, width: `${(width * 100).toFixed(2)}%` };
}
