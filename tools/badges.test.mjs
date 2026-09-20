// The badge trees and the coin rate, checked in plain Node:
//
//   node --test tools/badges.test.mjs      (npm run test:badges)
//
// Pure server modules only — records.js (the aggregates the trees read),
// badges.js (the trees) and evolution.js (the coin multiplier) — and the
// client's data/badges.js for the one thing the two sides must agree on:
// every id the server can award has a card the app can draw. Nothing
// here touches Firebase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const records = require('../functions/records.js');
const badges = require('../functions/badges.js');
const evolution = require('../functions/evolution.js');
const client = await import('../src/data/badges.js');

// A finished, rewardable workout in the shape logWorkout stores.
let seq = 0;
function workout(exercises, { totalVolumeKg } = {}) {
  seq += 1;
  const finishedAt = new Date(Date.UTC(2026, 0, 1 + seq)).toISOString();
  return { finishedAt, verified: true, exercises, totalVolumeKg };
}
const ex = (exerciseId, sets, extra = {}) => ({
  exerciseId,
  name: exerciseId,
  sets: sets.map(([weight, reps]) => ({ weight, reps, completed: true, relativeVolume: 0 })),
  ...extra,
});
const fold = (list) =>
  list.reduce(
    (acc, w) =>
      records.applyWorkoutToRecords(acc, {
        cleanExercises: w.exercises,
        finishedAtIso: w.finishedAt,
        totalScore: 0,
        totalVolumeKg: w.totalVolumeKg,
        isRecovery: false,
      }),
    records.buildRecordsSnapshot([]),
  );

test('the coin rate is the inverse of the ladder scale, and 1 for everyone else', () => {
  assert.equal(evolution.FEMALE_COIN_MULTIPLIER, 1 / 0.65);
  assert.ok(Math.abs(evolution.coinMultiplierFor({ mascot: 'gena' }) - 1.538) < 0.001);
  assert.equal(evolution.coinMultiplierFor({ gender: 'female' }), 1 / 0.65);
  assert.equal(evolution.coinMultiplierFor({ mascot: 'jimmy' }), 1);
  assert.equal(evolution.coinMultiplierFor({}), 1);
  // 10 coins' worth of relative effort pays ~10 either way: a female
  // session at 0.65 of the points, times the multiplier, is the male one.
  assert.ok(Math.abs(6.5 * evolution.coinMultiplierFor({ mascot: 'gena' }) - 10) < 1e-9);
});

test('every id either tree can award has a card in the client registry', () => {
  const ids = new Set();
  for (const ladder of Object.values(badges.LADDERS)) for (const [, id] of ladder) ids.add(id);
  for (const ladder of Object.values(badges.GENA_LADDERS)) for (const [, id] of ladder) ids.add(id);
  ids.add(badges.FIRST_PULLUP_BADGE);
  for (const id of ['workouts-50', 'streak-7', 'relative-titan']) ids.add(id);
  for (const id of ids) assert.ok(client.getBadge(id), `no card for ${id}`);
  // And the trees are the trees: Gena's has no bench ladder, Jimmy's no peach.
  const flat = (tree) => tree.flatMap((c) => c.tiers.map((t) => t.id));
  assert.ok(flat(client.achievementsFor('gena')).includes('peach-builder-10'));
  assert.ok(!flat(client.achievementsFor('gena')).includes('bench-60kg'));
  assert.ok(flat(client.achievementsFor('jimmy')).includes('bench-60kg'));
  assert.ok(!flat(client.achievementsFor('jimmy')).includes('peach-builder-10'));
  for (const tree of ['jimmy', 'gena']) assert.ok(flat(client.achievementsFor(tree)).includes('streak-7'));
  // Volume Queen is Volume King at 0.65.
  assert.deepEqual(
    badges.GENA_LADDERS.lifetimeVolume.map(([kg]) => kg),
    badges.LADDERS.lifetimeVolume.map(([kg]) => kg * 0.65),
  );
});

test('the badge aggregates fold the same whether seeded from history or logged one by one', () => {
  const history = [
    workout(
      [
        ex('hip-thrust', [
          [60, 10],
          [60, 10],
          [60, 8],
        ]),
        ex('plank', [[1, 30]]),
      ],
      { totalVolumeKg: 1830 },
    ),
    workout([ex('squat', [[80, 5]]), ex('leg-curl', [[30, 12]]), ex('bench-press', [[40, 8]])], {
      totalVolumeKg: 1080,
    }),
    workout([ex('push-up', [[70, 14]]), ex('ab-wheel', [[70, 12]])], { totalVolumeKg: 1820 }),
    workout([
      ex('glute-bridge', [
        [70, 15],
        [70, 15],
      ]),
      ex('cable-crunch', [[20, 15]]),
    ]),
  ];
  const seeded = records.buildRecordsSnapshot(history);
  const folded = fold(history);
  for (const key of [
    'lifetimeVolumeKg',
    'setCountByExercise',
    'bestRepsByExercise',
    'maxLowerBodyShare',
    'coreWorkoutRun',
    'maxCoreWorkoutRun',
  ]) {
    assert.deepEqual(folded[key], seeded[key], key);
  }
  assert.equal(seeded.setCountByExercise['hip-thrust'], 3);
  assert.equal(seeded.setCountByExercise['glute-bridge'], 2);
  assert.equal(seeded.bestRepsByExercise['push-up'], 14);
  // Session 1: 1,680 kg of hip thrusts against 30 kg of plank → 98.2%, the
  // most lower-body-heavy of the four (session 2 is 70.4%).
  assert.equal(seeded.maxLowerBodyShare, 0.982);
  // Core in sessions 1, 3, 4 — session 2 broke the run.
  assert.equal(seeded.maxCoreWorkoutRun, 2);
  assert.equal(seeded.coreWorkoutRun, 2);
  // Stored totals preferred, the per-set sum where a workout has none.
  assert.equal(seeded.lifetimeVolumeKg, 1830 + 1080 + 1820 + (70 * 30 + 20 * 15));
  assert.equal(seeded.badgeAggregatesVersion, records.BADGE_AGGREGATES_VERSION);
});

test('seeding adds the aggregates to an old doc and leaves the rest of it alone', () => {
  const old = {
    bestPerExercise: { 'incline-db-press': { weight: 50, reps: 8 } },
    lifetimeVolume: 123.45,
    dumbbellRecordsVersion: 2,
  };
  const seeded = records.seedBadgeAggregates(old, [workout([ex('hip-thrust', [[60, 10]])], { totalVolumeKg: 600 })]);
  assert.equal(seeded.bestPerExercise['incline-db-press'].weight, 50);
  assert.equal(seeded.lifetimeVolume, 123.45);
  assert.equal(seeded.dumbbellRecordsVersion, 2);
  assert.equal(seeded.lifetimeVolumeKg, 600);
  assert.equal(seeded.setCountByExercise['hip-thrust'], 1);
  assert.equal(seeded.badgeAggregatesVersion, records.BADGE_AGGREGATES_VERSION);
  // And a later log carries every one of them forward.
  const next = records.applyWorkoutToRecords(seeded, {
    cleanExercises: [ex('glute-bridge', [[70, 12]])],
    finishedAtIso: '2026-02-01T10:00:00.000Z',
    totalScore: 0,
    totalVolumeKg: 840,
    isRecovery: false,
  });
  assert.equal(next.lifetimeVolumeKg, 1440);
  assert.equal(next.setCountByExercise['hip-thrust'], 1);
  assert.equal(next.setCountByExercise['glute-bridge'], 1);
  assert.equal(next.badgeAggregatesVersion, records.BADGE_AGGREGATES_VERSION);
  // A recovery workout changes nothing, and drops nothing.
  const rec = records.applyWorkoutToRecords(next, {
    cleanExercises: [ex('squat', [[100, 5]])],
    finishedAtIso: '2026-03-01T10:00:00.000Z',
    totalScore: 0,
    totalVolumeKg: 500,
    isRecovery: true,
  });
  assert.deepEqual(rec.setCountByExercise, next.setCountByExercise);
  assert.equal(rec.lifetimeVolumeKg, next.lifetimeVolumeKg);
});

test("Gena's tree awards what the brief describes", () => {
  const agg = {
    bestPerExercise: {
      squat: { weight: 60, reps: 5 },
      'pull-up': { weight: 60, reps: 3, isBodyweight: true, addedWeight: 0 },
    },
    setCountByExercise: { 'hip-thrust': 6, 'glute-bridge': 4, 'pull-up': 2 },
    bestRepsByExercise: { 'push-up': 12 },
    maxLowerBodyShare: 0.78,
    maxCoreWorkoutRun: 3,
    lifetimeVolumeKg: 7000,
    workoutCount: 12,
    streakDays: 2,
    maxSetScore: 1.1,
  };
  const earned = badges.evaluateBadges(agg, { bodyWeightKg: 60, mascot: 'gena' });
  for (const id of [
    'peach-builder-10',
    'squat-queen-bw',
    'squat-queen-075-bw',
    'squat-queen-half-bw',
    'leg-day-75',
    'core-steel-3',
    'first-pullup',
    'pushup-10',
    'volume-queen-6t',
  ]) {
    assert.ok(earned.has(id), `expected ${id}`);
  }
  for (const id of [
    'peach-builder-50',
    'leg-day-85',
    'core-steel-7',
    'pushup-20',
    'volume-queen-32t',
    'bench-60kg',
    'volume-king-10t',
    'workouts-50',
  ]) {
    assert.ok(!earned.has(id), `did not expect ${id}`);
  }
  // No weigh-in, no ratio badge — same rule as the relative ladders.
  assert.ok(!badges.evaluateBadges(agg, { mascot: 'gena' }).has('squat-queen-bw'));
  // The same aggregate on Jimmy's tree earns from Jimmy's ladders only.
  const jimmy = badges.evaluateBadges(agg, { bodyWeightKg: 60, mascot: 'jimmy' });
  assert.ok(!jimmy.has('peach-builder-10'));
  assert.ok(!jimmy.has('first-pullup'));
  assert.ok(!jimmy.has('volume-queen-6t'));
  assert.ok(!jimmy.has('volume-king-10t'));
  // Volume King at 10,000 kg on Jimmy's; Volume Queen's gold at 65,000.
  assert.ok(badges.evaluateBadges({ lifetimeVolumeKg: 10000 }, { mascot: 'jimmy' }).has('volume-king-10t'));
  assert.ok(badges.evaluateBadges({ lifetimeVolumeKg: 65000 }, { mascot: 'gena' }).has('volume-queen-65t'));
});

test("Jimmy's tree is unchanged for what it already awarded", () => {
  const agg = {
    bestPerExercise: {
      'bench-press': { weight: 100, reps: 1 },
      squat: { weight: 140, reps: 1 },
      deadlift: { weight: 260, reps: 1 },
    },
    maxWorkoutVolumeKg: 10000,
    workoutCount: 50,
    streakDays: 7,
    maxSetScore: 2,
  };
  const earned = badges.evaluateBadges(agg, { bodyWeightKg: 100 });
  for (const id of [
    'bench-60kg',
    'bench-80kg',
    'bench-100kg',
    'bench-bodyweight',
    'squat-140kg',
    'deadlift-200kg',
    'deadlift-2x-bw',
    'total-500kg',
    'ten-ton-titan',
    'workouts-50',
    'streak-7',
    'relative-titan',
  ]) {
    assert.ok(earned.has(id), `expected ${id}`);
  }
  // Shared three on Gena's tree too.
  const gena = badges.evaluateBadges(agg, { bodyWeightKg: 100, mascot: 'gena' });
  for (const id of ['workouts-50', 'streak-7', 'relative-titan']) assert.ok(gena.has(id), id);
});
