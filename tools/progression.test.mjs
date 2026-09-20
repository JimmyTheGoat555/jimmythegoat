// The math behind the evolution ladder, checked in plain Node:
//
//   node --test tools/progression.test.mjs      (npm run test:progression)
//
// Loads the client's utils/evolutionTiers.js (ESM) and the server's
// functions/evolution.js (CommonJS) side by side, because the two are
// twins by contract and the one thing worth testing is that they agree —
// and that the female scale does what it was added for: an average
// female session fills 20–25% of the bar, so buff arrives on the fourth
// or fifth workout, the same as it does for a male lifter on the base
// ladder. Nothing here touches Firebase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const server = require('../functions/evolution.js');
const client = await import('../src/utils/evolutionTiers.js');

const { EVOLUTION_TIERS, FEMALE_PROGRESSION_SCALE, getEvolutionProgress, progressionScale, pointsToDisplayKg } = client;

// Per the tier table's own comment, a typical (male) session is worth
// ~100 points; a female lifter of the same body weight moves ~60–65% of
// that tonnage, so her session lands at 60–65 points.
const MALE_SESSION = 100;
const FEMALE_SESSIONS = [60, 65];

test('the two tables and the two scales are twins', () => {
  assert.equal(server.FEMALE_PROGRESSION_SCALE, FEMALE_PROGRESSION_SCALE);
  assert.equal(FEMALE_PROGRESSION_SCALE, 0.65);
  assert.deepEqual(
    server.EVOLUTION_TIERS.map((t) => [t.id, t.threshold, t.stage]),
    EVOLUTION_TIERS.map((t) => [t.id, t.threshold, t.stage]),
  );
});

test('who is on the female ladder: whoever resolves to Gena (explicit mascot, else gender)', () => {
  const female = [
    { mascot: 'gena' },
    { gender: 'female' },
    { mascot: 'gena', gender: 'other' },
    { mascot: 'gena', gender: 'male' },
  ];
  const base = [
    {},
    null,
    undefined,
    { mascot: 'jimmy' },
    { gender: 'other' },
    { gender: 'male' },
    { mascot: 'jimmy', gender: 'male' },
    // An explicit choice beats the gender default, both ways.
    { mascot: 'jimmy', gender: 'female' },
    { mascot: 'nonsense', gender: 'male' },
  ];
  for (const doc of female) {
    assert.equal(progressionScale(doc), 0.65, `client: ${JSON.stringify(doc)}`);
    assert.equal(server.progressionScaleFor(doc), 0.65, `server: ${JSON.stringify(doc)}`);
  }
  for (const doc of base) {
    assert.equal(progressionScale(doc), 1, `client: ${JSON.stringify(doc)}`);
    assert.equal(server.progressionScaleFor(doc), 1, `server: ${JSON.stringify(doc)}`);
  }
  // A number the server published wins over anything else on the object,
  // and a bad one is ignored rather than trusted.
  assert.equal(progressionScale({ progressionScale: 0.65, mascot: 'jimmy' }), 0.65);
  assert.equal(progressionScale({ progressionScale: 1, mascot: 'gena' }), 1);
  assert.equal(progressionScale({ progressionScale: 0, mascot: 'gena' }), 0.65);
  assert.equal(progressionScale({ progressionScale: 7 }), 1);
  assert.equal(progressionScale(0.65), 0.65);
  assert.equal(progressionScale(NaN), 1);
});

test('the female ladder is the same four tiers at 0.65 of every threshold', () => {
  const goals = EVOLUTION_TIERS.map((t) => t.threshold * 0.65);
  assert.deepEqual(goals, [0, 260, 1300, 3250]);
  for (let i = 1; i < EVOLUTION_TIERS.length; i += 1) {
    const goal = goals[i];
    assert.equal(getEvolutionProgress(goal - 0.01, { scale: 0.65 }).current.stage, i, `just under ${goal}`);
    assert.equal(getEvolutionProgress(goal, { scale: 0.65 }).current.stage, i + 1, `at ${goal}`);
    assert.equal(server.tierForVolume(goal - 0.01, { scale: 0.65 }).stage, i);
    assert.equal(server.tierForVolume(goal, { scale: 0.65 }).stage, i + 1);
  }
  // The goal printed on the bar is the scaled one.
  assert.equal(getEvolutionProgress(0, { scale: 0.65 }).next.threshold, 260);
  assert.equal(getEvolutionProgress(0).next.threshold, 400);
});

test('the base ladder is untouched, down to object identity', () => {
  for (const v of [0, 399, 400, 1999, 2000, 4999, 5000]) {
    const before = getEvolutionProgress(v);
    const explicit = getEvolutionProgress(v, { scale: 1 });
    assert.equal(before.current, explicit.current);
    assert.equal(before.current, EVOLUTION_TIERS[before.current.stage - 1]);
    assert.equal(before.percent, explicit.percent);
  }
});

test('an average session fills 20–25% of the bar on either ladder', () => {
  const male = getEvolutionProgress(MALE_SESSION);
  assert.ok(male.percent >= 20 && male.percent <= 25.5, `male: ${male.percent}%`);
  for (const session of FEMALE_SESSIONS) {
    const { percent } = getEvolutionProgress(session, { scale: 0.65 });
    assert.ok(percent >= 20 && percent <= 25.5, `female ${session} pts: ${percent}%`);
  }
  // And what the same session would have been on the base ladder — the
  // gap the scale exists to close.
  assert.ok(getEvolutionProgress(65).percent < 17);
});

test('buff arrives on the fourth or fifth workout for both', () => {
  const stageAfter = (perSession, count, scale) => getEvolutionProgress(perSession * count, { scale }).current.stage;
  assert.equal(stageAfter(MALE_SESSION, 3, 1), 1);
  assert.equal(stageAfter(MALE_SESSION, 4, 1), 2);
  assert.equal(stageAfter(65, 3, 0.65), 1);
  assert.equal(stageAfter(65, 4, 0.65), 2);
  assert.equal(stageAfter(60, 4, 0.65), 1);
  assert.equal(stageAfter(60, 5, 0.65), 2);
  // Without the scale she would still be a goat after five.
  assert.equal(stageAfter(65, 5, 1), 1);
});

test('client and server agree on the stage across both ladders', () => {
  for (const scale of [1, 0.65]) {
    for (const minStage of [1, 2]) {
      for (let v = 0; v <= 6000; v += 5) {
        const c = getEvolutionProgress(v, { scale, minStage }).current.stage;
        const s = server.tierForVolume(v, { scale, minStage }).stage;
        assert.equal(c, s, `volume ${v}, scale ${scale}, minStage ${minStage}`);
      }
    }
  }
});

test('the server announces an evolution at the scaled threshold, once', () => {
  assert.equal(server.evolutionCrossed(200, 259, { scale: 0.65 }), null);
  assert.equal(server.evolutionCrossed(200, 260, { scale: 0.65 })?.to.id, 'buff');
  assert.equal(server.evolutionCrossed(260, 320, { scale: 0.65 }), null);
  assert.equal(server.evolutionCrossed(200, 260, { scale: 1 }), null);
  // A coach is drawn from buff already, so reaching buff is not news.
  assert.equal(server.evolutionCrossed(200, 260, { scale: 0.65, minStage: 2 }), null);
  assert.equal(server.evolutionCrossed(1200, 1300, { scale: 0.65, minStage: 2 })?.to.id, 'titan');
});

test('the percent stays inside the bar and the floor scales with the ladder', () => {
  for (const scale of [1, 0.65]) {
    for (let v = 0; v <= 6000; v += 7) {
      const { percent } = getEvolutionProgress(v, { scale });
      assert.ok(percent >= 0 && percent <= 100, `${v} at ${scale}: ${percent}`);
    }
    const coach = getEvolutionProgress(0, { scale, minStage: 2 });
    assert.equal(coach.current.stage, 2);
    assert.equal(coach.percent, 0);
    assert.equal(coach.next.threshold, 2000 * scale);
  }
});

test('what a session was worth is never scaled', () => {
  // The display transform has no scale input at all: 65 points at 60 kg
  // is 3,900 kg whoever lifted it, and the score itself is what every
  // caller passes in unchanged.
  assert.equal(pointsToDisplayKg(65, 60), 3900);
  assert.equal(pointsToDisplayKg.length, 2);
});
