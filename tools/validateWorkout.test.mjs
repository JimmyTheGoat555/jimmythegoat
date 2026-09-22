// The finish gate, checked in plain Node:
//
//   node --test tools/validateWorkout.test.mjs
//
// Two things are worth testing here and they are different jobs.
//
// The first is the obvious one: does the gate catch what it is supposed to
// catch, and does it stay quiet on a workout that is fine — because a gate
// with a false positive is strictly worse than no gate at all. It would
// block a finish the server would have accepted, which is the exact thing
// this feature exists to prevent.
//
// The second is the one that actually matters over time: the gate is a
// MIRROR of functions/economy.js's validateAndScoreWorkout, and a mirror
// drifts. So the last block runs the real server validator (loaded through
// createRequire, same trick as deriveWeight.test.mjs) beside the client's
// and asserts they reach the same verdict on every case — not the same
// wording, which is deliberately different, but the same accept/reject.
// If somebody widens a bound on one side only, that block fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { firstWorkoutProblem } = await import('../src/utils/validateWorkout.js');
const { reconcileWorkoutLoads } = await import('../src/utils/setLoad.js');

const set = (over = {}) => ({ id: crypto.randomUUID(), weight: 60, reps: 8, completed: true, ...over });
// 'bench-press' is a barbell lift, 'db-curl' a per-hand one and
// 'pull-up' bodyweight — asserted against the server's own id sets in the
// parity block below rather than assumed here.
const ex = (exerciseId, sets, over = {}) => ({ exerciseId, name: exerciseId, sets, ...over });
const ok = (exercises) => assert.equal(firstWorkoutProblem(exercises), null);
const fails = (exercises, re) => {
  const problem = firstWorkoutProblem(exercises);
  assert.ok(problem, 'expected a problem, got none');
  assert.match(problem.message, re);
  return problem.message;
};

test('a normal workout passes', () => {
  ok([ex('bench-press', [set(), set({ weight: 80, reps: 5 })])]);
});

test('un-ticked rows are not errors — only completed sets are checked', () => {
  // The half-typed set left at the bottom of every exercise. The server
  // skips it, so the gate has to skip it too, or every workout ever
  // finished would be refused.
  ok([ex('bench-press', [set(), set({ weight: '', reps: '', completed: false })])]);
});

test('an empty workout, and one with nothing ticked off', () => {
  fails([], /at least one exercise/);
  fails([ex('bench-press', [set({ completed: false })])], /at least one completed set/);
});

test('a ticked set with no weight or no reps names the row', () => {
  fails([ex('bench-press', [set(), set({ weight: '' })])], /^bench-press, set 2 is ticked off but has no weight\.$/);
  fails([ex('bench-press', [set({ reps: '' })])], /^bench-press, set 1 is ticked off but has no reps\.$/);
});

test('out-of-range reps and weights', () => {
  fails([ex('bench-press', [set({ reps: 40 })])], /whole number between 1 and 30 — that one says 40/);
  fails([ex('bench-press', [set({ reps: 8.5 })])], /whole number/);
  fails([ex('bench-press', [set({ weight: 400 })])], /between 1 and 250 kg — that set works out to 400 kg/);
});

test('a dumbbell set is judged on the PAIR, and says so', () => {
  // 130 in each hand is 260 on the bar-equivalent, which is over the cap —
  // the case that used to produce "got 130" for a set that was refused for
  // being 260. Both numbers, or the message is unactionable.
  const msg = fails([ex('db-curl', [set({ weight: 130 })])], /works out to 260 kg \(130 kg per hand, doubled\)/);
  assert.ok(msg.includes('260') && msg.includes('130'));
  // …and the same lift at a sane load is fine.
  ok([ex('db-curl', [set({ weight: 30 })])]);
});

test('the stale-context case the reconciler repairs is NOT reported', () => {
  // {weight: 40, perHandWeight: 130, isPerHand: true} — a localStorage
  // draft from an older build. App.jsx hands the gate the reconciled
  // payload, so by the time it is checked the marker has been repaired to
  // 20 and the set is worth the 40 that was typed. A gate that judged the
  // raw set would refuse a workout the server now accepts.
  const raw = [ex('db-curl', [set({ weight: 40, perHandWeight: 130, isPerHand: true })])];
  ok(reconcileWorkoutLoads(raw));
});

test('bodyweight sets are judged on the belt, never the weight', () => {
  // The client sends 0/blank for `weight` on a pull-up; range-checking it
  // would refuse every bodyweight set in the app.
  ok([ex('pull-up', [set({ weight: 0, addedWeight: 0 })])]);
  ok([ex('pull-up', [set({ weight: '', addedWeight: 20 })])]);
  fails([ex('pull-up', [set({ weight: 0, addedWeight: 500 })])], /added weight must be between 0 and 150/);
});

test('the array bounds', () => {
  const many = Array.from({ length: 41 }, (_, i) => ex(`x${i}`, [set()]));
  fails(many, /more than 40 exercises/);
  fails([ex('bench-press', Array.from({ length: 101 }, () => set()))], /more than 100 sets/);
});

test('one rest-timer boost cannot cover two exercises', () => {
  const token = crypto.randomUUID();
  fails(
    [ex('bench-press', [set()], { boostTokenId: token }), ex('db-curl', [set()], { boostTokenId: token })],
    /sharing a rest-timer boost/,
  );
  // Two different tokens is the normal case.
  ok([
    ex('bench-press', [set()], { boostTokenId: crypto.randomUUID() }),
    ex('db-curl', [set()], { boostTokenId: crypto.randomUUID() }),
  ]);
});

test('the first problem is reported, not a list', () => {
  const msg = fails([ex('bench-press', [set({ reps: 99 }), set({ weight: 999 })])], /reps/);
  assert.ok(!msg.includes('999'));
});

// ── Parity with the server ─────────────────────────────────────────────
//
// The gate is only worth having while it agrees with the authority it is
// standing in for. Same payloads, both validators, same verdict.
test('client and server reach the same verdict', () => {
  const economy = require('../functions/economy.js');
  const exercises = require('../functions/exercises.js');

  // The ids the fixtures above lean on, checked against the server's own
  // sets rather than assumed.
  assert.ok(exercises.BARBELL_EXERCISE_IDS.has('bench-press'));
  assert.ok(exercises.DUMBBELL_EXERCISE_IDS.has('db-curl'));
  assert.ok(exercises.BODYWEIGHT_EXERCISE_IDS.has('pull-up'));

  const serverRejects = (payload) => {
    try {
      economy.validateAndScoreWorkout(payload, 80);
      return false;
    } catch {
      return true;
    }
  };

  const cases = [
    [ex('bench-press', [set()])],
    [ex('bench-press', [set({ weight: 250 }), set({ weight: 1 })])],
    [ex('bench-press', [set({ weight: 251 })])],
    [ex('bench-press', [set({ weight: 0.9 })])],
    [ex('bench-press', [set({ reps: 30 })])],
    [ex('bench-press', [set({ reps: 31 })])],
    [ex('bench-press', [set({ reps: 0 })])],
    [ex('bench-press', [set({ weight: '', reps: '' })])],
    [ex('db-curl', [set({ weight: 30 })])],
    [ex('db-curl', [set({ weight: 125 })])], // 250 — exactly at the cap
    [ex('db-curl', [set({ weight: 126 })])], // 252 — over it
    [ex('db-curl', [set({ weight: 40, perHandWeight: 20, isPerHand: true })])],
    [ex('pull-up', [set({ weight: 0, addedWeight: 0 })])],
    [ex('pull-up', [set({ weight: 0, addedWeight: 150 })])],
    [ex('pull-up', [set({ weight: 0, addedWeight: 151 })])],
    [ex('pull-up', [set({ weight: 0, addedWeight: -1 })])],
    [ex('bench-press', [set({ completed: false })])],
    [],
    [ex('bench-press', [set()]), ex('db-curl', [set({ weight: 200 })])],
  ];

  for (const payload of cases) {
    const client = firstWorkoutProblem(payload) !== null;
    const server = serverRejects(payload);
    assert.equal(
      client,
      server,
      `disagreement on ${JSON.stringify(payload)} — client ${client ? 'rejects' : 'accepts'}, server ${server ? 'rejects' : 'accepts'}`,
    );
  }
});
