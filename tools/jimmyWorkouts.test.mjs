// Jimmy's Workouts (src/data/jimmyWorkouts.js), checked in plain Node:
//
//   node --test tools/jimmyWorkouts.test.mjs
//
// The programs are hand-written ids-and-numbers, so the things that can
// silently rot are exactly the things to pin: every exercise id still
// exists in the catalog, every prescription is one the logger's wheels
// can hold, the five promised splits are all there, and a started
// session resolves to the same shape a saved template starts with.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { JIMMY_SPLITS, getJimmySplit, programWorkoutTemplate, programWorkoutSummary, programId } =
  await import('../src/data/jimmyWorkouts.js');
const { EXERCISES } = await import('../src/data/exercises.js');
const { REPS_MIN, REPS_MAX } = await import('../src/utils/units.js');

const catalog = new Set(EXERCISES.map((e) => e.id));

test('the five promised splits are there, each with named sessions', () => {
  const names = JIMMY_SPLITS.map((s) => s.name);
  for (const expected of ['Push / Pull / Legs', 'Upper / Lower', 'Arnold Split', 'Full Body', "Gena's Sculpt"]) {
    assert.ok(names.includes(expected), `${expected} is missing`);
  }
  assert.ok(JIMMY_SPLITS.length >= 5);
  for (const split of JIMMY_SPLITS) {
    assert.ok(split.id && split.name && split.tagline && split.icon, `${split.id} is missing a field`);
    assert.ok(split.workouts.length >= 3, `${split.name} has fewer than three sessions`);
    const ids = new Set(split.workouts.map((w) => w.id));
    assert.equal(ids.size, split.workouts.length, `${split.name} has a duplicate session id`);
  }
  assert.equal(
    getJimmySplit('ppl')
      .workouts.map((w) => w.name)
      .join(', '),
    'Push Day, Pull Day, Leg Day',
  );
  assert.equal(getJimmySplit('nope'), null);
});

test('every prescribed exercise is a catalog exercise with a rep target the wheel can hold', () => {
  for (const split of JIMMY_SPLITS) {
    for (const workout of split.workouts) {
      assert.ok(workout.exercises.length >= 4, `${split.name} / ${workout.name} is too short`);
      const seen = new Set();
      for (const row of workout.exercises) {
        assert.ok(catalog.has(row.exerciseId), `${split.name} / ${workout.name}: unknown exercise ${row.exerciseId}`);
        assert.ok(!seen.has(row.exerciseId), `${workout.name} lists ${row.exerciseId} twice`);
        seen.add(row.exerciseId);
        assert.ok(Number.isInteger(row.sets) && row.sets >= 1 && row.sets <= 6, `${row.exerciseId} sets`);
        assert.ok(Number.isInteger(row.reps) && row.reps >= REPS_MIN && row.reps <= REPS_MAX, `${row.exerciseId} reps`);
      }
    }
  }
});

test('a session resolves to the shape a template start takes, with the prescription on each row', () => {
  const split = getJimmySplit('ppl');
  const push = split.workouts[0];
  const program = programWorkoutTemplate(split, push);
  assert.equal(program.id, 'jimmy:ppl:push');
  assert.equal(programId(split, push), program.id);
  assert.equal(program.title, 'Push Day');
  assert.equal(program.splitName, 'Push / Pull / Legs');
  assert.equal(program.exercises.length, push.exercises.length);
  const first = program.exercises[0];
  assert.deepEqual(Object.keys(first).sort(), ['exerciseId', 'muscleGroup', 'name', 'reps', 'sets']);
  assert.equal(first.exerciseId, 'bench-press');
  assert.equal(first.name, 'Barbell Bench Press');
  assert.equal(first.muscleGroup, 'chest');
  assert.equal(first.sets, 4);
  assert.equal(first.reps, 8);
  assert.equal(programWorkoutSummary(push), '6 exercises · 19 sets');
});

test("Gena's Sculpt is the one split drawn with her head", () => {
  const sculpt = JIMMY_SPLITS.find((s) => s.id === 'gena-sculpt');
  assert.equal(sculpt.mascot, 'gena');
  assert.equal(sculpt.subtitle, 'Glutes & Core');
  for (const other of JIMMY_SPLITS.filter((s) => s.id !== 'gena-sculpt')) assert.equal(other.mascot, undefined);
});

// The seeding a started session gets (App.jsx's handleStartProgram):
// the prescription's reps on every set, the lifter's own weight where
// history has one, blanks where it does not.
const { seedSetsFromHistory } = await import('../src/utils/lastPerformance.js');

test('a prescription seeds its reps on every set and keeps the weight from history', () => {
  const last = {
    finishedAt: '2026-09-18T10:00:00.000Z',
    sets: [
      { weight: 80, reps: 6, barWeight: 20, weightPerSide: 30 },
      { weight: 80, reps: 5, barWeight: 20, weightPerSide: 30 },
    ],
  };
  const sets = seedSetsFromHistory(last, { count: 4, reps: 8, exerciseId: 'bench-press' });
  assert.equal(sets.length, 4);
  assert.deepEqual(
    sets.map((s) => [s.weight, s.reps, s.completed]),
    [
      [80, 8, false],
      [80, 8, false],
      ['', 8, false],
      ['', 8, false],
    ],
  );
  // The bar and plates DO NOT travel with the weight any more. The plate
  // calculator that wrote them is gone (components/workout/SetRow.jsx),
  // nothing can edit them, and functions/economy.js's deriveWeight still
  // prefers them over `weight` — so a seeded pair would pin the new set
  // to last month's total however it was typed over. See
  // utils/lastPerformance.js.
  assert.equal(sets[0].barWeight, undefined);
  assert.equal(sets[0].weightPerSide, undefined);
  // No prescription: history's own reps, blanks stay blank — unchanged
  // behaviour for a saved template or an assignment.
  const plain = seedSetsFromHistory(last, { count: 3, exerciseId: 'bench-press' });
  assert.deepEqual(
    plain.map((s) => [s.weight, s.reps]),
    [
      [80, 6],
      [80, 5],
      ['', ''],
    ],
  );
  // A bodyweight prescription: the belt from history, the reps from the
  // program.
  const bw = seedSetsFromHistory(
    { sets: [{ weight: 82, reps: 10, addedWeight: 5 }] },
    { count: 2, reps: 12, isBodyweight: true },
  );
  assert.deepEqual(
    bw.map((s) => [s.addedWeight, s.reps]),
    [
      [5, 12],
      [undefined, 12],
    ],
  );
});

test('no session lists the same exercise twice', () => {
  // An exercise is a ROW in the logger, and two rows sharing an id are the
  // same row twice. useWorkouts' addExercise has always refused a
  // duplicate by hand; a PROGRAM is the one route into a session that does
  // not go through it, which is why this is checked here rather than
  // trusted.
  //
  // The consequence is out of all proportion to the typo that would cause
  // it. One rest-timer boost token binds to one exercise, and logWorkout
  // refuses the ENTIRE workout when a token turns up on two of them ("One
  // boost cannot cover two exercises") — so a program that listed an
  // exercise twice would cost somebody the session at the finish line,
  // only if they happened to watch a boost ad, and only for that exercise.
  // emptyWorkout dedupes now, so this is belt and braces; but the braces
  // are cheap and the belt is in another file.
  let sessions = 0;
  for (const split of JIMMY_SPLITS) {
    for (const workout of getJimmySplit(split.id).workouts) {
      sessions += 1;
      const ids = programWorkoutTemplate(split, workout).exercises.map((e) => e.exerciseId);
      assert.ok(ids.length > 0, `${split.id} / ${workout.name} has no exercises`);
      assert.equal(new Set(ids).size, ids.length, `${split.id} / ${workout.name} repeats an exercise: ${ids.join(', ')}`);
    }
  }
  assert.ok(sessions >= 15, `walked only ${sessions} sessions — the shape of the data changed`);
});
