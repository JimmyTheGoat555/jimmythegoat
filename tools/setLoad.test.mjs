// The weight-entry contract, checked in plain Node:
//
//   node --test tools/setLoad.test.mjs
//
// Loads the client's utils/setLoad.js (ESM) next to the server's
// functions/exercises.js (CommonJS) because the two are twins by contract:
// the catalog decides which question the set row asks, and the server's id
// sets decide how the number that arrives is scored. The one thing worth
// testing is that they agree — and that a set typed as a TOTAL (the
// override) is stored in exactly the shape the per-hand path would have
// produced, so the server's own re-derivation lands on the same number.
// Nothing here touches Firebase.
//
// The plate calculator is gone (see components/workout/SetRow.jsx), so
// there is no per-side ladder and no bar to test any more. What replaced
// it is the rule these tests now lean hardest on: every patch blanks the
// context fields it does not use, because the SERVER still prefers a
// bar/side pair over `weight` when one is present — it has to, for old
// clients in the field — and a stale pair left on a set would silently
// overrule a freshly typed number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const server = require('../functions/exercises.js');
const client = await import('../src/utils/setLoad.js');
const { EXERCISES } = await import('../src/data/exercises.js');
const { WEIGHT_MAX_KG, WORKING_WEIGHTS_KG } = await import('../src/utils/units.js');

const {
  ENTRY_KIND,
  ENTRY_MODE_SMART,
  ENTRY_MODE_TOTAL,
  entryKindFor,
  entryTotalOf,
  hasSmartCalculator,
  smartEntryKind,
  perHandPatchFor,
  totalPatchFor,
  isBarbellExercise,
  isDumbbellExercise,
  isPerHandExercise,
  droppedLoadFrom,
  blankLoadPatch,
  DROP_SET_FACTOR,
} = client;

const { numberSets, applySetPatch } = await import('../src/utils/setCascade.js');

const round1 = (n) => Math.round(n * 10) / 10;

// A faithful copy of functions/economy.js's deriveWeight — the server's
// reading of a submitted set. It is module-private there, so it is
// restated here from the same three rules; if that function changes,
// this is the twin to change with it.
function serverDeriveWeight(rawSet, exerciseId) {
  if (server.BARBELL_EXERCISE_IDS.has(exerciseId)) {
    const bar = Number(rawSet.barWeight);
    const side = Number(rawSet.weightPerSide);
    if (server.ALLOWED_BAR_WEIGHTS.has(bar) && Number.isFinite(side) && side >= 0) return bar + side * 2;
  }
  if (server.DUMBBELL_EXERCISE_IDS.has(exerciseId)) {
    const perHand = rawSet.isPerHand === true ? Number(rawSet.perHandWeight) : Number(rawSet.weight);
    if (Number.isFinite(perHand) && perHand > 0) return perHand * 2;
  }
  return rawSet.weight;
}

// A set as it arrives at the server: a JSON round trip, because that is
// what an undefined key actually survives as on the way through
// localStorage and the callable payload.
const asSubmitted = (patch) => JSON.parse(JSON.stringify(patch));

const barbellIds = EXERCISES.filter((e) => e.equipment === 'barbell').map((e) => e.id);
// PER HAND, not "is a dumbbell": cable-crossover carries `perHand: true`
// with `equipment: 'cable'`, and it is the per-hand question the server's
// doubling is keyed to. See src/data/exercises.js.
const perHandIds = EXERCISES.filter((e) => e.equipment === 'dumbbell' || e.perHand === true).map((e) => e.id);
const plainIds = EXERCISES.filter((e) => !e.isBodyweight && !perHandIds.includes(e.id)).map((e) => e.id);
const bodyweightIds = EXERCISES.filter((e) => e.isBodyweight === true).map((e) => e.id);

test('the catalog and the server agree on which exercises are scored per hand', () => {
  assert.deepEqual(new Set(barbellIds), server.BARBELL_EXERCISE_IDS);
  assert.deepEqual(new Set(perHandIds), server.DUMBBELL_EXERCISE_IDS);
  for (const id of plainIds) {
    assert.equal(server.DUMBBELL_EXERCISE_IDS.has(id), false, `${id} must not be doubled`);
  }
  assert.ok(barbellIds.length > 5 && perHandIds.length > 5 && plainIds.length > 5);
});

test('cable-crossover is per hand on both sides of the wire', () => {
  assert.equal(isPerHandExercise('cable-crossover'), true);
  assert.equal(isDumbbellExercise('cable-crossover'), false, 'it is a cable, and says so');
  assert.equal(server.DUMBBELL_EXERCISE_IDS.has('cable-crossover'), true);
  assert.equal(smartEntryKind('cable-crossover'), ENTRY_KIND.PER_HAND);
  // 12 a side is 24 kg of load, and the server reads back the same 24.
  const patch = perHandPatchFor(12);
  assert.equal(patch.weight, 24);
  assert.equal(serverDeriveWeight(asSubmitted(patch), 'cable-crossover'), 24);
});

test('the smart kind follows the equipment; the override only exists where there is a per-hand question', () => {
  // A barbell takes a plain total now — the plate calculator is gone, so
  // there is nothing left for it to switch to.
  for (const id of barbellIds) {
    assert.equal(smartEntryKind(id), ENTRY_KIND.TOTAL);
    assert.equal(hasSmartCalculator(id), false);
  }
  for (const id of perHandIds) {
    assert.equal(smartEntryKind(id), ENTRY_KIND.PER_HAND);
    assert.equal(entryKindFor(id, { mode: ENTRY_MODE_TOTAL }), ENTRY_KIND.TOTAL);
    assert.equal(hasSmartCalculator(id), true);
  }
  for (const id of plainIds) {
    assert.equal(entryKindFor(id, { mode: ENTRY_MODE_SMART }), ENTRY_KIND.TOTAL);
    assert.equal(entryKindFor(id, { mode: ENTRY_MODE_TOTAL }), ENTRY_KIND.TOTAL);
    assert.equal(hasSmartCalculator(id), false);
  }
  // Body weight wins over everything, and cannot be overridden.
  assert.equal(entryKindFor('bench-press', { isBodyweight: true, mode: ENTRY_MODE_TOTAL }), ENTRY_KIND.BODYWEIGHT);
  assert.equal(hasSmartCalculator('bench-press', true), false);
  // A custom exercise has no catalog entry at all.
  assert.equal(entryKindFor('custom-abc'), ENTRY_KIND.TOTAL);
  assert.equal(hasSmartCalculator('custom-abc'), false);
  // PLATES is not a kind any component can be handed any more.
  assert.equal(ENTRY_KIND.PLATES, undefined);
});

test('a per-hand set stores the pair marked, and the server doubles it back to the same number', () => {
  for (const id of perHandIds) {
    for (const perHand of WORKING_WEIGHTS_KG) {
      const total = round1(perHand * 2);
      if (total > WEIGHT_MAX_KG) continue;
      const patch = perHandPatchFor(perHand);
      assert.equal(patch.weight, total);
      assert.equal(patch.isPerHand, true);
      assert.equal(round1(serverDeriveWeight(asSubmitted(patch), id)), total, `${id} @ ${perHand} per hand`);
    }
  }
});

test('a per-hand total is stored marked, and the server doubles it back to the same number', () => {
  const id = perHandIds[0];
  for (const total of WORKING_WEIGHTS_KG) {
    const patch = totalPatchFor(id, total);
    assert.equal(patch.weight, total);
    assert.equal(patch.isPerHand, true);
    assert.equal(round1(patch.perHandWeight * 2), total, `per hand for ${total}`);
    assert.equal(round1(serverDeriveWeight(asSubmitted(patch), id)), total, `server reading of ${total}`);
  }
  // Without the marker the server would score a bare total twice over —
  // the whole reason the marker is kept in TOTAL mode.
  assert.equal(serverDeriveWeight({ weight: 50 }, id), 100);
});

test('anything else stores the number as the load, untouched', () => {
  for (const id of plainIds) {
    const patch = totalPatchFor(id, 42.5);
    assert.equal(patch.weight, 42.5);
    assert.deepEqual(asSubmitted(patch), { weight: 42.5 }, `${id} submits a bare weight`);
    assert.equal(serverDeriveWeight(asSubmitted(patch), id), 42.5);
  }
});

// The bug this exists to stop: the server still prefers a bar/side pair
// over `weight`, so a set carrying one from an older session would have
// its freshly typed number ignored — silently, because the stale pair
// still adds up to the stale total.
test('every patch blanks the plate-calculator context it inherited', () => {
  const stale = { weight: 100, barWeight: 20, weightPerSide: 40 };
  for (const id of [...barbellIds, ...plainIds, ...perHandIds]) {
    const patch = id === perHandIds[0] ? perHandPatchFor(55) : totalPatchFor(id, 110);
    const merged = asSubmitted({ ...stale, ...patch });
    assert.equal('barWeight' in merged, false, `${id} carried a stale bar`);
    assert.equal('weightPerSide' in merged, false, `${id} carried stale plates`);
    assert.equal(serverDeriveWeight(merged, id), 110, `${id} scored its stale total`);
  }
});

test('a total on a non-per-hand exercise also clears an inherited per-hand marker', () => {
  const stale = { weight: 50, perHandWeight: 25, isPerHand: true };
  const id = plainIds[0];
  const merged = asSubmitted({ ...stale, ...totalPatchFor(id, 42.5) });
  assert.equal('isPerHand' in merged, false);
  assert.equal('perHandWeight' in merged, false);
  assert.equal(serverDeriveWeight(merged, id), 42.5);
});

test('the total shown for a set is the pair for a per-hand exercise, marker or not, and the weight for everything else', () => {
  const db = perHandIds[0];
  assert.equal(entryTotalOf({ weight: 25 }, db), 50, 'legacy: one dumbbell stored');
  assert.equal(entryTotalOf({ weight: 50, isPerHand: true, perHandWeight: 25 }, db), 50);
  assert.equal(entryTotalOf({ weight: 100, barWeight: 20, weightPerSide: 40 }, barbellIds[0]), 100);
  assert.equal(entryTotalOf({ weight: 60 }, plainIds[0]), 60);
  assert.equal(entryTotalOf(null, db), 0);
});

test('the equipment predicates are the same question the kinds answer', () => {
  for (const id of barbellIds) assert.equal(isBarbellExercise(id), true);
  for (const id of perHandIds) assert.equal(isPerHandExercise(id), true);
  for (const id of plainIds) assert.equal(isPerHandExercise(id), false);
});

// Half a kilo is SetRow's step (WEIGHT_STEP). Restated here rather than
// exported from a .jsx file.
test('every value the half-kilo stepper can land on survives a round trip', () => {
  const id = perHandIds[0];
  for (let perHand = 0.5; perHand <= WEIGHT_MAX_KG / 2; perHand += 0.5) {
    const patch = perHandPatchFor(Math.round(perHand * 10) / 10);
    assert.equal(round1(serverDeriveWeight(asSubmitted(patch), id)), round1(perHand * 2));
  }
  for (let total = 1; total <= WEIGHT_MAX_KG; total += 0.5) {
    const patch = totalPatchFor(plainIds[0], total);
    assert.equal(patch.weight, round1(total), `${total} kg survived rounding`);
  }
});

// ── Drop sets ──────────────────────────────────────────────────────────
//
// A drop set is a real set inserted below the one it hangs off, with a
// reduced load pre-filled. It scores like any other completed set, so
// everything the contract above guarantees has to hold for it too — which
// is the whole reason droppedLoadFrom goes through the same two patch
// builders instead of scaling `weight` by hand.

test('a drop set off a per-hand set drops the number in each hand, and the pair follows', () => {
  const id = perHandIds[0];
  const parent = perHandPatchFor(45); // 45 per hand, 90 on the books
  const drop = droppedLoadFrom(parent, id);
  assert.equal(drop.perHandWeight, 36, '45 per hand dropped 20% is 36');
  assert.equal(drop.weight, 72, 'and the stored load is still the pair');
  assert.equal(drop.isPerHand, true, 'the format marker survives, or the server doubles it again');
  // The number that actually gets scored.
  assert.equal(round1(serverDeriveWeight(asSubmitted(drop), id)), 72);
});

test('a drop set off a legacy per-hand set reads the old format correctly', () => {
  const id = perHandIds[0];
  // No marker: `weight` IS one dumbbell, the pre-per-hand convention.
  const drop = droppedLoadFrom({ weight: 30 }, id);
  assert.equal(drop.perHandWeight, 24, '30 in each hand dropped 20% is 24');
  assert.equal(drop.weight, 48);
});

test('a drop set never inherits the plate context of the set above it', () => {
  // The set it hangs off carries a bar and a plate count, as a set logged
  // by the old calculator (or an un-reloaded client) still can. Carried
  // forward, the server's deriveWeight would prefer 20 + 40x2 = 100 over
  // the 64 that was actually lifted — silently, because the pair still
  // adds up. Every builder in setLoad.js blanks them; this one included.
  const id = plainIds[0];
  const drop = droppedLoadFrom({ weight: 80, barWeight: 20, weightPerSide: 30 }, id);
  assert.equal(drop.weight, 64);
  assert.equal(asSubmitted(drop).barWeight, undefined);
  assert.equal(asSubmitted(drop).weightPerSide, undefined);
  assert.equal(round1(serverDeriveWeight(asSubmitted(drop), id)), 64, 'the reduced weight is what scores');
});

test('a drop set off a bodyweight set drops the belt, not the body', () => {
  const drop = droppedLoadFrom({ addedWeight: 20 }, bodyweightIds[0], { isBodyweight: true });
  assert.equal(drop.addedWeight, 16);
  assert.equal('weight' in drop, false, "body weight is the server's to add, as it is for every bodyweight set");
  // Nothing on the belt is a real state, and it opens empty rather than
  // inventing a number to take 20% off.
  assert.deepEqual(droppedLoadFrom({ addedWeight: 0 }, bodyweightIds[0], { isBodyweight: true }), {
    addedWeight: '',
  });
});

test('a drop set off a set with no weight yet opens empty', () => {
  assert.deepEqual(droppedLoadFrom({ weight: '' }, plainIds[0]), blankLoadPatch());
  assert.deepEqual(droppedLoadFrom(undefined, plainIds[0]), blankLoadPatch());
});

test('every drop lands on the half kilo the stepper and the wheel share', () => {
  for (const id of [plainIds[0], perHandIds[0]]) {
    for (let weight = 1; weight <= WEIGHT_MAX_KG; weight += 0.5) {
      const drop = droppedLoadFrom({ weight }, id);
      const shown = id === perHandIds[0] ? drop.perHandWeight : drop.weight;
      assert.equal(shown * 2, Math.round(shown * 2), `${weight} kg dropped to ${shown}, off the ladder`);
      assert.ok(shown > 0, `${weight} kg dropped to nothing`);
      assert.ok(shown <= weight, `${weight} kg "dropped" up to ${shown}`);
    }
  }
  assert.ok(DROP_SET_FACTOR > 0 && DROP_SET_FACTOR < 1, 'a drop goes down');
});

test('only working sets are numbered, and the drops number within them', () => {
  const drop = { isDropSet: true };
  const work = {};
  const shape = (sets) => numberSets(sets).map(({ setNo, dropNo }) => `${setNo}.${dropNo}`);

  assert.deepEqual(shape([work, work, work]), ['1.0', '2.0', '3.0']);
  // A double drop off set 2, then a third working set — which is still 3,
  // not 5. That is the whole point of counting them separately.
  assert.deepEqual(shape([work, work, drop, drop, work]), ['1.0', '2.0', '2.1', '2.2', '3.0']);
  // A drop whose working set was deleted out from under it.
  assert.deepEqual(shape([drop, work]), ['0.1', '1.0']);
  assert.deepEqual(shape([]), []);
  assert.deepEqual(shape(null), []);
});

test('the cascade neither enters a drop set nor leaves one', () => {
  const sets = [
    { id: 'a', weight: 80, reps: 7, completed: true },
    { id: 'b', weight: 80, reps: 5 },
    { id: 'c', weight: 64, reps: '', isDropSet: true },
    { id: 'd', weight: 80, reps: 7 },
  ];

  // Editing a working set fills the open working sets below it and steps
  // over the drop, which keeps the weight it was dropped to.
  const down = applySetPatch(sets, 'b', { weight: 85 });
  assert.equal(down.find((s) => s.id === 'c').weight, 64, 'the drop kept its own load');
  assert.equal(down.find((s) => s.id === 'd').weight, 85, 'the working set below followed');
  assert.equal(down.find((s) => s.id === 'a').weight, 80, 'and nothing above moved');

  // Editing the DROP changes only the drop. This is the half that was
  // missing: with drop sets sitting mid-list, typing the finisher's
  // numbers used to load the next straight set with them.
  const up = applySetPatch(sets, 'c', { weight: 51, reps: 9 });
  assert.equal(up.find((s) => s.id === 'c').weight, 51);
  assert.equal(up.find((s) => s.id === 'c').reps, 9);
  assert.equal(up.find((s) => s.id === 'd').weight, 80, 'set 3 was not dropped to the finisher weight');
  assert.equal(up.find((s) => s.id === 'd').reps, 7, 'nor to the reps failure happened to give');
});

// ── reconcileSetLoad: repairing a set whose context contradicts it ──────
//
// The payload guard added after a real report: "weight must be between 1
// and 250 kg — got 40". The set carried stale per-hand context from an
// older draft, the server read the context instead of the weight, derived
// 260, and then quoted the 40 in the error. These pin the repair, and —
// just as importantly — pin what it must NOT touch.
const { reconcileSetLoad } = await import('../src/utils/setLoad.js');

test('reconcileSetLoad repairs a per-hand marker that lost its number', () => {
  const stale = { weight: 40, perHandWeight: 130, isPerHand: true };
  const fixed = reconcileSetLoad(stale, 'incline-db-press');
  assert.equal(fixed.perHandWeight, 20, 'half the stored pair');
  assert.equal(fixed.isPerHand, true, 'the marker STAYS — dropping it makes the server double the pair');
  assert.equal(fixed.weight, 40, 'the typed load is never changed');
});

test('reconcileSetLoad drops plates that do not add up to the weight', () => {
  const stale = { weight: 40, barWeight: 20, weightPerSide: 110 };
  const fixed = reconcileSetLoad(stale, 'bench-press');
  assert.equal(fixed.barWeight, undefined);
  assert.equal(fixed.weightPerSide, undefined);
  assert.equal(fixed.weight, 40);
});

test('reconcileSetLoad leaves a consistent set completely alone', () => {
  const ok = { weight: 80, perHandWeight: 40, isPerHand: true };
  assert.equal(reconcileSetLoad(ok, 'incline-db-press'), ok, 'same object — no needless re-render');
  const bar = { weight: 100, barWeight: 20, weightPerSide: 40 };
  assert.equal(reconcileSetLoad(bar, 'bench-press'), bar);
});

test('reconcileSetLoad does not touch an UNMARKED per-hand set', () => {
  // "40" here means one dumbbell by convention, and the server doubles it.
  // Repairing this would be guessing, and guessing halves somebody's lift.
  const legacy = { weight: 40 };
  assert.equal(reconcileSetLoad(legacy, 'incline-db-press'), legacy);
});

test('reconcileSetLoad ignores blank and bodyweight sets', () => {
  const blank = { weight: '' };
  assert.equal(reconcileSetLoad(blank, 'incline-db-press'), blank);
  const body = { addedWeight: 20 };
  assert.equal(reconcileSetLoad(body, 'pull-up'), body);
});
