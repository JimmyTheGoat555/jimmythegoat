// Where the first-workout tour's spotlight and speech bubble go, given the
// box of the control being pointed at and the bubble's own measured size.
//
// Pure, and in its own file for two reasons: the component that uses it
// should export a component and nothing else (fast refresh), and this is
// the only part of the tour with arithmetic worth testing — the flip from
// below to above, and the two clamps that keep the bubble on screen while
// the caret keeps pointing off it.

// Breathing room around the highlighted control, the bubble's clearance
// from it, and the page edge the bubble never crosses.
export const SPOT_PAD = 8;
export const BUBBLE_GAP = 14;
export const GUTTER = 12;
// How far in from the bubble's corners the caret may sit, so it never
// hangs off a rounded corner when the target is near a screen edge.
export const CARET_INSET = 22;

export function tourLayout(target, bubbleW, bubbleH, viewport) {
  const { width: vw, height: vh } = viewport;
  const spot = {
    top: target.top - SPOT_PAD,
    left: target.left - SPOT_PAD,
    width: target.width + SPOT_PAD * 2,
    height: target.height + SPOT_PAD * 2,
  };
  const below = spot.top + spot.height + BUBBLE_GAP;
  const above = spot.top - BUBBLE_GAP - bubbleH;
  // Below by default — a bubble under the thing it describes does not put
  // the reader's own hand over the thing it describes. Above only when
  // below would run off the bottom AND above actually fits; if neither
  // fits, below wins, because the bottom of this screen is nav and the top
  // is the status bar.
  const placeBelow = below + bubbleH <= vh - GUTTER || above < GUTTER;
  const centre = target.left + target.width / 2;
  const maxLeft = Math.max(GUTTER, vw - GUTTER - bubbleW);
  const left = Math.min(Math.max(centre - bubbleW / 2, GUTTER), maxLeft);
  return {
    spot,
    placeBelow,
    left,
    top: placeBelow ? below : above,
    // Relative to the bubble, so the caret keeps pointing at the control
    // even once the bubble itself has been clamped away from it.
    caretLeft: Math.min(Math.max(centre - left, CARET_INSET), Math.max(CARET_INSET, bubbleW - CARET_INSET)),
  };
}
