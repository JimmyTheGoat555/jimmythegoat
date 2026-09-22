// The server's weight derivation, checked in plain Node:
//
//   node --test tools/deriveWeight.test.mjs
//
// This is the one piece of scoring that can log a DIFFERENT number from
// the one the lifter typed. `weight` is the absolute load and the context
// fields beside it (barWeight/weightPerSide, perHandWeight/isPerHand) are
// meant to agree with it — the contract at the top of src/utils/setLoad.js.
// deriveWeight used to prefer the context unconditionally, so a set
// carrying stale context had its real weight silently replaced, and when
// the replacement fell outside 1–250 kg the rejection quoted `rawSet.weight`
// — a number that had passed the check it was being blamed for.
//
// Loads the REAL functions/economy.js, so this cannot drift from what the
// server does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../functions/', import.meta.url));
const { deriveWeight } = require('./economy.js');
const round1 = (n) => Math.round(Number(n) * 10) / 10;

// Real ids, from functions/exercises.js's own sets.
const DUMBBELL = 'incline-db-press';
const BARBELL = 'bench-press';
const MACHINE = 'lat-pulldown';

test('a plain weighted set is believed as typed', () => {
  assert.equal(round1(deriveWeight({ weight: 40 }, MACHINE)), 40);
  // Strings arrive from the input field; they must not survive as strings.
  assert.equal(round1(deriveWeight({ weight: '40' }, MACHINE)), 40);
  assert.equal(typeof deriveWeight({ weight: '40' }, MACHINE), 'number');
});

test('a barbell set adds its plates up when they agree with the weight', () => {
  assert.equal(round1(deriveWeight({ weight: 100, barWeight: 20, weightPerSide: 40 }, BARBELL)), 100);
});

test('STALE plate context loses to the weight that was actually typed', () => {
  // The regression. 40 typed over a set still carrying last month's
  // plates: the old code returned 20 + 110*2 = 240 and scored that.
  assert.equal(round1(deriveWeight({ weight: 40, barWeight: 20, weightPerSide: 110 }, BARBELL)), 40);
  // And the case that produced the unreadable error: 260 is out of range,
  // so the lifter was told "must be between 1 and 250 — got 40".
  assert.equal(round1(deriveWeight({ weight: 40, perHandWeight: 130, isPerHand: true }, DUMBBELL)), 40);
});

test('a marked per-hand set is still the pair when it agrees', () => {
  assert.equal(round1(deriveWeight({ weight: 80, perHandWeight: 40, isPerHand: true }, DUMBBELL)), 80);
});

test('an UNMARKED dumbbell number is still per hand, and still doubles', () => {
  // Load-bearing legacy convention — a set seeded from old history and
  // ticked without opening the sheet carries no marker and means 40 in
  // each hand. Changing this would halve every such set.
  assert.equal(round1(deriveWeight({ weight: 40 }, DUMBBELL)), 80);
  assert.equal(round1(deriveWeight({ weight: '40' }, DUMBBELL)), 80);
});

test('a marked set with no per-hand number falls back to the weight', () => {
  assert.equal(round1(deriveWeight({ weight: 80, isPerHand: true }, DUMBBELL)), 80);
});

test('rounding noise still counts as agreement', () => {
  // 0.1 is the wheel's step; half of it is rounding, not disagreement.
  assert.equal(round1(deriveWeight({ weight: 100.04, barWeight: 20, weightPerSide: 40 }, BARBELL)), 100);
});

test('junk weight comes back as NaN so the range check rejects it', () => {
  assert.ok(Number.isNaN(Number(deriveWeight({ weight: 'heavy' }, MACHINE))));
  assert.ok(Number.isNaN(Number(deriveWeight({}, MACHINE))));
});
