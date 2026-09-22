// The rest-timer boost's arithmetic:
//
//   node --test tools/restBoost.test.mjs
//
// An ad buys ONE exercise, doubled, for REST_BOOST_MAX_SETS of its sets.
// Both halves of that sentence are load-bearing and neither is obvious
// from reading coinsFor, so both are pinned here against the real server
// function (loaded through createRequire, same trick as the other two
// cross-boundary suites).
//
// Why the set cap exists at all: without it, the way to get the most out
// of one ad view is to pile every set of the session into a single
// exercise. That is the highest payout AND the worst training advice,
// which is precisely the wrong thing for a game about lifting to reward.
//
// What the cap must NOT do is cost anybody a set. A fourth set is not
// refused, not dropped and not worth less than it would have been without
// the ad — it simply pays its normal rate. The `no set is worth less` test
// is the one that would catch an off-by-one that made the boost subtract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { coinsFor } = require('../functions/economy.js');
const { REST_BOOST_MULTIPLIER, REST_BOOST_MAX_SETS, MAX_COINS_PER_WORKOUT } = require('../functions/storeCatalog.js');

// relativeVolume is what coinsFor sums; 1.0 a set keeps the arithmetic
// readable, so a payout is "points × the coin rate" by inspection.
const exercise = (n, relativeVolume = 1) => ({
  exerciseId: 'bench-press',
  sets: Array.from({ length: n }, () => ({ relativeVolume })),
});

const plain = (exercises) => coinsFor(exercises, new Set());
const boosted = (exercises, index = 0) => coinsFor(exercises, new Set([index]));

test('an unboosted workout pays exactly what it always paid', () => {
  const w = [exercise(5)];
  assert.equal(boosted(w, 99), plain(w), 'a boost on an index that is not there must change nothing');
});

test('a boost doubles up to REST_BOOST_MAX_SETS sets, and no more', () => {
  for (let n = 1; n <= REST_BOOST_MAX_SETS; n += 1) {
    // Every set doubles while the exercise is inside the cap.
    assert.equal(boosted([exercise(n)]), plain([exercise(n)]) * REST_BOOST_MULTIPLIER, `${n} sets`);
  }
  // …and past it, the extra sets pay their normal rate. 5 sets at the cap
  // of 3 is worth 3 doubled + 2 plain = 8 points, not 10.
  const five = [exercise(5)];
  const expectedPoints = REST_BOOST_MAX_SETS * REST_BOOST_MULTIPLIER + (5 - REST_BOOST_MAX_SETS);
  assert.equal(boosted(five), plain([exercise(expectedPoints)]));
});

test('the fourth set is never worth LESS for having been boosted', () => {
  // The failure an off-by-one would produce, and the one that would be
  // hardest to notice from a coin total: the cap must stop DOUBLING, not
  // start subtracting.
  for (let n = 1; n <= 12; n += 1) {
    const w = [exercise(n)];
    assert.ok(boosted(w) >= plain(w), `${n} sets: boosted ${boosted(w)} < unboosted ${plain(w)}`);
  }
});

test('the cap is per exercise, not per workout', () => {
  // Two boosted exercises of 5 sets each get REST_BOOST_MAX_SETS doubled
  // EACH. The limit follows the ad, and each ad bought one exercise.
  const w = [exercise(5), exercise(5)];
  const one = coinsFor(w, new Set([0]));
  const both = coinsFor(w, new Set([0, 1]));
  assert.equal(both - plain(w), (one - plain(w)) * 2);
});

test('only the boosted exercise is affected', () => {
  const w = [exercise(5), exercise(5)];
  assert.equal(coinsFor(w, new Set([0])), coinsFor(w, new Set([1])), 'symmetric exercises, symmetric payout');
  assert.ok(coinsFor(w, new Set([0])) > plain(w));
});

test('sets are counted in logged order — the first three, not the biggest', () => {
  // A descending scheme: the heavy sets come first, so the cap lands on
  // them. Worth pinning because "the best three" is a plausible reading of
  // the rule that this deliberately is NOT — predictable beats generous
  // when a lifter has to understand it mid-rest.
  const descending = { exerciseId: 'squat', sets: [3, 3, 3, 1, 1].map((relativeVolume) => ({ relativeVolume })) };
  const ascending = { exerciseId: 'squat', sets: [1, 1, 3, 3, 3].map((relativeVolume) => ({ relativeVolume })) };
  assert.ok(
    coinsFor([descending], new Set([0])) > coinsFor([ascending], new Set([0])),
    'the first three sets are the ones that double',
  );
});

test('a boost still cannot outrun the per-workout coin cap', () => {
  // 40 exercises of 3 big sets, all boosted — the most a payload can carry.
  const huge = Array.from({ length: 40 }, () => exercise(3, 50));
  const all = new Set(huge.map((_, i) => i));
  assert.equal(coinsFor(huge, all), MAX_COINS_PER_WORKOUT);
});

test('an empty exercise contributes nothing either way', () => {
  assert.equal(boosted([exercise(0)]), 0);
  assert.equal(plain([exercise(0)]), 0);
});
