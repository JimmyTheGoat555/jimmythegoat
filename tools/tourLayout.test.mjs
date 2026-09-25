// Where the first-workout tour's bubble lands:
//
//   node --test tools/tourLayout.test.mjs
//
// The tour itself is a few effects around a querySelector, and the parts
// of it worth a test are all in one pure function: which side of the
// highlighted control the bubble goes on, and the two clamps that keep it
// on a 375px screen while the caret keeps pointing at a control the bubble
// has just been shoved away from.
//
// The failure these guard against is not a crash — it is a bubble half off
// the side of a phone, or a caret floating in space next to one, which is
// the sort of thing that only shows up on the one device you did not open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tourLayout, GUTTER, CARET_INSET, SPOT_PAD, BUBBLE_GAP } from '../src/utils/tourLayout.js';

// A 375×812 phone, the size every other measurement in this app is taken
// against, and a bubble of the width the component actually renders.
const PHONE = { width: 375, height: 812 };
const BUBBLE_W = 320;
const BUBBLE_H = 150;

const box = (left, top, width, height) => ({ left, top, width, height });

test('the hole is the control plus a ring of padding', () => {
  const { spot } = tourLayout(box(100, 200, 36, 36), BUBBLE_W, BUBBLE_H, PHONE);
  assert.equal(spot.left, 100 - SPOT_PAD);
  assert.equal(spot.top, 200 - SPOT_PAD);
  assert.equal(spot.width, 36 + SPOT_PAD * 2);
  assert.equal(spot.height, 36 + SPOT_PAD * 2);
});

test('a control near the top gets its bubble underneath', () => {
  const layout = tourLayout(box(160, 60, 36, 36), BUBBLE_W, BUBBLE_H, PHONE);
  assert.equal(layout.placeBelow, true);
  assert.equal(layout.top, 60 - SPOT_PAD + 36 + SPOT_PAD * 2 + BUBBLE_GAP);
});

test('a control near the bottom gets its bubble above it', () => {
  const layout = tourLayout(box(160, 740, 36, 36), BUBBLE_W, BUBBLE_H, PHONE);
  assert.equal(layout.placeBelow, false);
  // Above means the bubble's BOTTOM edge sits a gap clear of the hole.
  assert.equal(layout.top + BUBBLE_H + BUBBLE_GAP, 740 - SPOT_PAD);
  assert.ok(layout.top >= GUTTER, 'and still on screen');
});

test('when neither side fits, below wins', () => {
  // A tall control on a short screen: there is no room either way. Below
  // is the better of two bad answers — the top of this screen is the
  // status bar and the bottom is scrollable.
  const layout = tourLayout(box(160, 20, 36, 500), BUBBLE_W, BUBBLE_H, { width: 375, height: 560 });
  assert.equal(layout.placeBelow, true);
});

test('the bubble never crosses either page edge', () => {
  for (const left of [0, 4, 40, 180, 300, 339, 375]) {
    const layout = tourLayout(box(left, 300, 36, 36), BUBBLE_W, BUBBLE_H, PHONE);
    assert.ok(layout.left >= GUTTER, `left edge at target x=${left}`);
    assert.ok(layout.left + BUBBLE_W <= PHONE.width - GUTTER, `right edge at target x=${left}`);
  }
});

test('a centred control gets a centred bubble', () => {
  const layout = tourLayout(box(170, 300, 36, 36), BUBBLE_W, BUBBLE_H, PHONE);
  assert.equal(layout.left + BUBBLE_W / 2, 170 + 18);
});

test('the caret keeps pointing at the control after the bubble is clamped', () => {
  // +DS lives hard against the left edge of a set row — the case that made
  // the clamp necessary. The bubble stops at the gutter; the caret has to
  // walk left inside it to stay under the button.
  const layout = tourLayout(box(18, 400, 32, 44), BUBBLE_W, BUBBLE_H, PHONE);
  assert.equal(layout.left, GUTTER, 'bubble is pinned to the gutter');
  const caretOnScreen = layout.left + layout.caretLeft;
  assert.ok(Math.abs(caretOnScreen - (18 + 16)) <= CARET_INSET, 'caret is at or leaning toward the control');
  assert.ok(layout.caretLeft >= CARET_INSET, 'but never onto the rounded corner');
});

test('the caret stays inside the bubble at both extremes', () => {
  for (const left of [-20, 0, 8, 180, 340, 400]) {
    const { caretLeft } = tourLayout(box(left, 400, 32, 44), BUBBLE_W, BUBBLE_H, PHONE);
    assert.ok(caretLeft >= CARET_INSET && caretLeft <= BUBBLE_W - CARET_INSET, `caret at target x=${left}`);
  }
});

test('a bubble wider than the screen still gets a usable caret', () => {
  // Not a layout the component can produce today (it is capped at
  // 100vw-1.5rem), but the clamps must not invert if it ever is.
  const { left, caretLeft } = tourLayout(box(100, 400, 32, 44), 400, BUBBLE_H, PHONE);
  assert.equal(left, GUTTER);
  assert.ok(caretLeft >= CARET_INSET);
});
