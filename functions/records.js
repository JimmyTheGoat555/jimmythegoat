// Server-side personal-record + aggregate-stats logic.
//
// Deliberately a duplicate of src/utils/personalRecords.js rather than a
// shared module — same reason headline() is duplicated in economy.js: the
// app is ESM and functions/ is CommonJS, and wiring a build step for ~40
// lines costs more than it saves. The two must agree; if you change the
// definition of a PR, change both.
//
// Pure functions only, no Firestore access — economy.js owns reading/
// writing users/{uid}/meta/records; this file just knows how to compute
// its contents from a workout history (buildRecordsSnapshot, used exactly
// ONCE per account to bootstrap the doc) or fold one new workout onto an
// existing snapshot (applyWorkoutToRecords, used on every logWorkout
// after that). Splitting it this way is what killed the old design's
// O(N) reads-per-log: logWorkout used to re-read + re-scan the account's
// ENTIRE workout history on every single call just to answer "is this a
// new PR" and "how many workouts / what's the streak" — fine at a handful
// of workouts, a real billing + latency risk once real users have
// hundreds. Now that full scan happens once, ever, per account.

const { LEGACY_BODYWEIGHT_KG } = require('./storeCatalog');
const { BODYWEIGHT_EXERCISE_IDS, LOWER_BODY_EXERCISE_IDS, CORE_EXERCISE_IDS } = require('./exercises');

const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(iso) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null;
}

function bestSetOf(exercise) {
  let best = null;
  for (const set of exercise?.sets ?? []) {
    if (set.completed === false) continue;
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (!Number.isFinite(reps) || reps <= 0) continue;
    // `weight` on a bodyweight set is bodyWeight + belt (economy.js folds
    // the lifter's own mass in), so it is BOTH the right number to rank
    // on and a direct readout of what that person weighs. Both flags ride
    // along so the publishing step can keep the ranking and drop the
    // number — see publishableRecord in economy.js.
    if (!best || weight > best.weight) {
      best = {
        weight,
        reps,
        ...(set.isBodyweight === true ? { isBodyweight: true, addedWeight: Number(set.addedWeight) || 0 } : {}),
      };
    }
  }
  return best;
}

function bestWeightPerExercise(workouts) {
  const best = new Map();
  for (const workout of workouts ?? []) {
    // A recovery workout (logged after >= NEGLECT_RECOVERY_DAYS away — see
    // economy.js) is un-rewarded: it can't set a record and its lifts
    // don't raise the bar for future ones either.
    if (workout?.recoveryWorkout) continue;
    for (const exercise of workout?.exercises ?? []) {
      const top = bestSetOf(exercise);
      if (!top || !exercise.exerciseId) continue;
      const current = best.get(exercise.exerciseId);
      // `name` rides along here only for publicProfile.js's benefit (the
      // full all-time-best list shown on a friend's profile needs a label
      // per exercise) — the PR comparisons below never read it, only
      // .weight, so adding the field doesn't touch the actual PR definition.
      if (!current || top.weight > current.weight) {
        best.set(exercise.exerciseId, { ...top, name: exercise.name ?? exercise.exerciseId });
      }
    }
  }
  return best;
}

// Relative Strength Volume for one workout. Prefers the stored `score`
// (new workouts), falls back to summing per-set `relativeVolume` (an
// edited new workout), and last-resorts to mapping raw kg onto the new
// scale against an average lifter (workouts logged before relative
// scoring existed).
function workoutRelativeScore(workout) {
  // Only server-written workouts count toward the lifetime total / tier.
  // `verified` and `score` are both stamped by logWorkout()'s Admin path
  // and can never appear on a doc a client wrote directly (firestore.rules
  // blocks them) — nor can a client add per-set `relativeVolume` to a
  // trusted total this way, since a workout without one of these two
  // top-level markers scores 0 regardless of what its sets claim. A
  // hand-written "history correction" stays visible in the log but earns
  // nothing.
  if (workout?.verified !== true && typeof workout?.score !== 'number') return 0;
  if (typeof workout?.score === 'number' && Number.isFinite(workout.score)) return workout.score;
  let total = 0;
  let sawRelative = false;
  let legacy = 0;
  for (const exercise of workout?.exercises ?? []) {
    for (const set of exercise?.sets ?? []) {
      if (set.completed === false) continue;
      const reps = Number(set.reps);
      const weight = Number(set.weight);
      if (!Number.isFinite(reps) || !Number.isFinite(weight)) continue;
      if (Number.isFinite(Number(set.relativeVolume))) {
        sawRelative = true;
        total += Number(set.relativeVolume);
      }
      legacy += (weight / LEGACY_BODYWEIGHT_KG) * reps;
    }
  }
  return sawRelative ? total : legacy;
}

// The ONLY server-computed lifetime total (published to friends — see
// publicProfile.js). Must agree with the owner's own app, which derives
// the same number the same way (utils/workoutStats.js's lifetimeVolume).
// This is now the cumulative Relative Strength Volume, not raw kg.
function lifetimeVolumeOf(workouts) {
  let total = 0;
  for (const workout of workouts ?? []) {
    // Recovery workouts refresh the training clock but never count toward
    // the lifetime total — see economy.js and src/utils/workoutStats.js.
    if (workout?.recoveryWorkout) continue;
    total += workoutRelativeScore(workout);
  }
  return total;
}

// PR detection against the AGGREGATE best-per-exercise map (the shape
// users/{uid}/meta/records.bestPerExercise is stored in — a plain object,
// not the Map bestWeightPerExercise returns), so logWorkout never needs a
// fresh full-history scan just to answer "did this beat my old best".
function findNewPersonalRecordsFromBest(currentExercises, bestPerExercise) {
  const best = bestPerExercise ?? {};
  const records = [];
  for (const exercise of currentExercises ?? []) {
    const top = bestSetOf(exercise);
    if (!top || !exercise.exerciseId) continue;
    const previous = best[exercise.exerciseId];
    if (!previous || top.weight <= previous.weight) continue;
    records.push({
      exerciseId: exercise.exerciseId,
      name: exercise.name ?? exercise.exerciseId,
      weight: top.weight,
      reps: top.reps,
      previousWeight: previous.weight,
      // The belt they beat, for bodyweight lifts. `previousWeight` is an
      // absolute load there — body weight plus belt — so it is exactly as
      // disclosing as the new record was, and publishableRecord swaps in
      // this one instead.
      ...(top.isBodyweight === true ? { previousAddedWeight: Number(previous.addedWeight) || 0 } : {}),
      // Carried so publishableRecord (economy.js) can strip the absolute
      // load before this reaches a feed post. The unstripped copy is what
      // the OWNER gets back from logWorkout for their own summary screen.
      ...(top.isBodyweight === true ? { isBodyweight: true, addedWeight: top.addedWeight } : {}),
    });
  }
  return records;
}

// A personal record as OTHER PEOPLE may see it — the feed card and a
// friend's profile.
//
// For a weighted lift the record is its weight and there is nothing to
// hide. For a bodyweight lift the stored `weight` is the lifter's body
// weight plus any belt, so publishing it publishes what they weigh:
// a friend reading "Pull-Up 94 kg" on the feed has just been told a
// number nobody chose to share, and subtracting a visible belt figure
// gives it exactly.
//
// So the number does not leave the server. `weight` is omitted entirely
// rather than zeroed or nulled — a reader has nothing to accidentally
// render — and `addedWeight` goes in its place, which is the part that
// is actually the lifter's achievement. The client formats it as
// "BW" or "BW +20 kg" (utils/personalRecords.js's formatRecordLoad).
//
// Doing this here rather than in the UI is the whole point: a client-side
// format would still ship the real figure in the payload, where it sits
// in the network tab regardless of what React draws.
function publishableRecord(exerciseId, r) {
  const base = { exerciseId, name: r.name, reps: r.reps };
  if (r.isBodyweight === true || BODYWEIGHT_EXERCISE_IDS.has(exerciseId)) {
    return {
      ...base,
      isBodyweight: true,
      addedWeight: Number(r.addedWeight) || 0,
      // Only the belt comparison survives. Undefined on the profile list
      // (an all-time best has nothing to have beaten) and on a plain
      // bodyweight PR with no belt either side — the card omits the
      // "(was …)" clause entirely rather than printing a bare unit.
      ...(r.previousAddedWeight !== undefined ? { previousAddedWeight: Number(r.previousAddedWeight) || 0 } : {}),
    };
  }
  return {
    ...base,
    weight: r.weight,
    ...(r.previousWeight !== undefined ? { previousWeight: r.previousWeight } : {}),
  };
}

// ── Badge aggregates ────────────────────────────────────────────────────
//
// What the Gena badge tree (badges.js) reads that nothing else on the
// doc answered: how many sets of each exercise were ever logged, the most
// reps in one set of each, lifetime tonnage in kg (lifetimeVolume above is
// relative points), the most lower-body-heavy session ever, and the
// longest run of consecutive sessions with core work in them. Folded on
// every log like the rest; seeded from full history once, either when the
// doc is first built (buildRecordsSnapshot) or, for a doc that predates
// them, by seedBadgeAggregates on the first log after this shipped —
// economy.js checks `badgeAggregatesVersion` and pays the one history read
// the way the dumbbell rebasing paid its own. Only these fields are
// seeded from history: the stored bests are on a scale the raw history is
// not (see normalizeDumbbellRecords), so a full rebuild would corrupt them.
const BADGE_AGGREGATES_VERSION = 1;
// The per-exercise maps grow one key per distinct exercise ever logged,
// custom ones included. Capped so a doc a client can read cannot be grown
// without bound by inventing exercises; nothing a badge reads is anywhere
// near the cap.
const MAX_TRACKED_EXERCISES = 200;
const CORE_GROUPS = new Set(['core', 'abs', 'abdominals']);

function groupOf(exercise) {
  return String(exercise?.muscleGroup ?? '').toLowerCase();
}
function isLowerBody(exercise) {
  return LOWER_BODY_EXERCISE_IDS.has(exercise?.exerciseId) || groupOf(exercise) === 'legs';
}
function isCore(exercise) {
  return CORE_EXERCISE_IDS.has(exercise?.exerciseId) || CORE_GROUPS.has(groupOf(exercise));
}

function emptyBadgeAggregates() {
  return {
    lifetimeVolumeKg: 0,
    setCountByExercise: {},
    bestRepsByExercise: {},
    maxLowerBodyShare: 0,
    coreWorkoutRun: 0,
    maxCoreWorkoutRun: 0,
  };
}

// The stored aggregates, copied so folding never mutates the snapshot the
// caller still holds (economy.js compares before and after).
function carryBadgeAggregates(records) {
  return {
    lifetimeVolumeKg: Number(records?.lifetimeVolumeKg) || 0,
    setCountByExercise: { ...(records?.setCountByExercise ?? {}) },
    bestRepsByExercise: { ...(records?.bestRepsByExercise ?? {}) },
    maxLowerBodyShare: Number(records?.maxLowerBodyShare) || 0,
    coreWorkoutRun: Number(records?.coreWorkoutRun) || 0,
    maxCoreWorkoutRun: Number(records?.maxCoreWorkoutRun) || 0,
  };
}

// Folds one rewardable workout onto the aggregates, in place. Tonnage per
// set is weight × reps — for a bodyweight set `weight` already carries the
// lifter's mass (economy.js). `totalVolumeKg` is the workout's own stored
// figure and is preferred for the lifetime sum so it matches the feed;
// the per-set sum is what the lower-body SHARE is taken over, since that
// needs the split, not the total.
function foldBadgeAggregates(next, exercises, totalVolumeKg) {
  let total = 0;
  let lower = 0;
  let coreWork = false;
  for (const exercise of exercises ?? []) {
    const id = typeof exercise?.exerciseId === 'string' ? exercise.exerciseId : null;
    const lowerBody = isLowerBody(exercise);
    let completedSets = 0;
    let mostReps = 0;
    for (const set of exercise?.sets ?? []) {
      if (set?.completed === false) continue;
      const reps = Number(set?.reps);
      if (!Number.isFinite(reps) || reps <= 0) continue;
      completedSets += 1;
      if (reps > mostReps) mostReps = reps;
      const weight = Number(set?.weight);
      const kg = Number.isFinite(weight) && weight > 0 ? weight * reps : 0;
      total += kg;
      if (lowerBody) lower += kg;
    }
    if (completedSets === 0) continue;
    if (isCore(exercise)) coreWork = true;
    if (!id) continue;
    const tracked = (map) => id in map || Object.keys(map).length < MAX_TRACKED_EXERCISES;
    if (tracked(next.setCountByExercise)) {
      next.setCountByExercise[id] = (Number(next.setCountByExercise[id]) || 0) + completedSets;
    }
    if (tracked(next.bestRepsByExercise) && mostReps > (Number(next.bestRepsByExercise[id]) || 0)) {
      next.bestRepsByExercise[id] = mostReps;
    }
  }
  const stored = Number(totalVolumeKg);
  const sessionKg = Number.isFinite(stored) && stored > 0 ? stored : total;
  next.lifetimeVolumeKg = Math.round((next.lifetimeVolumeKg + sessionKg) * 100) / 100;
  if (total > 0) {
    next.maxLowerBodyShare = Math.max(next.maxLowerBodyShare, Math.round((lower / total) * 1000) / 1000);
  }
  // Consecutive SESSIONS, not days: three workouts in a row with core work,
  // however they fall on the calendar. A session with none resets the run.
  next.coreWorkoutRun = coreWork ? next.coreWorkoutRun + 1 : 0;
  next.maxCoreWorkoutRun = Math.max(next.maxCoreWorkoutRun, next.coreWorkoutRun);
  return next;
}

// The aggregates from a full history, oldest session first so the core
// run reads in the order the sessions happened.
function badgeAggregatesFrom(rewardable) {
  const ordered = [...(rewardable ?? [])].sort((a, b) =>
    String(a?.finishedAt ?? '').localeCompare(String(b?.finishedAt ?? '')),
  );
  const agg = emptyBadgeAggregates();
  for (const workout of ordered) foldBadgeAggregates(agg, workout?.exercises, workout?.totalVolumeKg);
  return { ...agg, badgeAggregatesVersion: BADGE_AGGREGATES_VERSION };
}

// Adds the badge aggregates to a records doc written before they existed.
// Everything else on the doc is left exactly as stored — see the section
// comment on why this is not a rebuild.
function seedBadgeAggregates(records, workouts) {
  const rewardable = (workouts ?? []).filter((w) => w && !w.recoveryWorkout);
  return { ...(records ?? {}), ...badgeAggregatesFrom(rewardable) };
}

// Computes the FULL users/{uid}/meta/records aggregate from a complete
// workout history. Called exactly once per account — the first time
// logWorkout finds no records doc yet (see economy.js's loadRecords) — to
// bootstrap it; every later log calls applyWorkoutToRecords instead of
// re-scanning. Because this is a real full scan, everything it produces
// (best lifts, lifetime volume, workout count, current streak, the
// highest single-set relative score ever) is retroactively correct for a
// veteran account the moment its doc is first built — a 60-workout user
// gets credit for all 60, not just workouts logged after this shipped.
function buildRecordsSnapshot(workouts) {
  const rewardable = (workouts ?? []).filter((w) => w && !w.recoveryWorkout);

  const bestMap = bestWeightPerExercise(workouts); // already skips recovery workouts itself
  const bestPerExercise = {};
  for (const [exerciseId, r] of bestMap) {
    bestPerExercise[exerciseId] = { weight: r.weight, reps: r.reps, name: r.name };
  }

  let maxSetScore = 0;
  for (const workout of rewardable) {
    for (const exercise of workout.exercises ?? []) {
      for (const set of exercise.sets ?? []) {
        if (set?.completed === false) continue;
        const rel = Number(set?.relativeVolume);
        if (Number.isFinite(rel) && rel > maxSetScore) maxSetScore = rel;
      }
    }
  }

  const finished = rewardable.filter((w) => typeof w.finishedAt === 'string');
  // Distinct calendar days (UTC), ascending — walking oldest to newest and
  // resetting on any gap leaves `streakDays` holding the run ending at the
  // MOST RECENT day, i.e. the current streak.
  const days = [...new Set(finished.map((w) => dayIndex(w.finishedAt)).filter((d) => d != null))].sort((a, b) => a - b);
  let streakDays = 0;
  let lastWorkoutDay = null;
  for (const d of days) {
    streakDays = lastWorkoutDay != null && d === lastWorkoutDay + 1 ? streakDays + 1 : 1;
    lastWorkoutDay = d;
  }

  return {
    bestPerExercise,
    lifetimeVolume: Math.round(lifetimeVolumeOf(workouts) * 100) / 100,
    workoutCount: finished.length,
    streakDays,
    lastWorkoutDay,
    maxSetScore: Math.round(maxSetScore * 100) / 100,
    // Heaviest single SESSION, in raw kg — the 10-Ton Titan badge. Tracked
    // on the aggregate rather than read off the workout being logged, so
    // it is seeded here from full history the one time this doc is built.
    // Otherwise a veteran who already has a 12-tonne session on record
    // would have to do another one to get credit for it.
    maxWorkoutVolumeKg: rewardable.reduce((m, w) => Math.max(m, Number(w.totalVolumeKg) || 0), 0),
    // What the Gena badge tree reads — see the section above.
    ...badgeAggregatesFrom(rewardable),
  };
}

// Folds ONE new, already-validated-and-scored workout onto a records
// snapshot — the incremental counterpart to buildRecordsSnapshot. A
// recovery workout (isRecovery) touches nothing here and returns the
// snapshot unchanged, matching bestWeightPerExercise/lifetimeVolumeOf's
// existing rule that recovery workouts don't count toward anything.
function applyWorkoutToRecords(records, { cleanExercises, finishedAtIso, totalScore, totalVolumeKg, isRecovery }) {
  const next = {
    bestPerExercise: { ...(records?.bestPerExercise ?? {}) },
    lifetimeVolume: records?.lifetimeVolume ?? 0,
    workoutCount: records?.workoutCount ?? 0,
    streakDays: records?.streakDays ?? 0,
    lastWorkoutDay: records?.lastWorkoutDay ?? null,
    maxSetScore: records?.maxSetScore ?? 0,
    maxWorkoutVolumeKg: records?.maxWorkoutVolumeKg ?? 0,
    // Carried through, and it MUST be. This function rebuilds the snapshot
    // field by field, so anything not named here is dropped on every log —
    // and dropping this marker would make economy.js's
    // normalizeDumbbellRecords re-run against bests it had already
    // doubled, doubling them again every single workout. Caught before it
    // shipped; the test suite now pins it.
    ...(records?.dumbbellRecordsVersion !== undefined
      ? { dumbbellRecordsVersion: records.dumbbellRecordsVersion }
      : {}),
    // Same rule for the badge aggregates and their own marker: named here
    // or dropped on the next log.
    ...carryBadgeAggregates(records),
    ...(records?.badgeAggregatesVersion !== undefined
      ? { badgeAggregatesVersion: records.badgeAggregatesVersion }
      : {}),
  };
  if (isRecovery) return next;

  foldBadgeAggregates(next, cleanExercises, totalVolumeKg);

  for (const exercise of cleanExercises ?? []) {
    const top = bestSetOf(exercise);
    if (top && exercise.exerciseId) {
      const current = next.bestPerExercise[exercise.exerciseId];
      if (!current || top.weight > current.weight) {
        next.bestPerExercise[exercise.exerciseId] = {
          weight: top.weight,
          reps: top.reps,
          name: exercise.name ?? exercise.exerciseId,
        };
      }
    }
    for (const set of exercise.sets ?? []) {
      const rel = Number(set?.relativeVolume);
      if (Number.isFinite(rel) && rel > next.maxSetScore) next.maxSetScore = rel;
    }
  }

  next.lifetimeVolume = Math.round((next.lifetimeVolume + totalScore) * 100) / 100;
  next.workoutCount += 1;
  next.maxWorkoutVolumeKg = Math.max(next.maxWorkoutVolumeKg, Number(totalVolumeKg) || 0);

  const d = dayIndex(finishedAtIso);
  if (d != null) {
    if (next.lastWorkoutDay == null) next.streakDays = 1;
    else if (d === next.lastWorkoutDay) {
      // A second workout the same calendar day doesn't advance OR reset
      // the streak — buildRecordsSnapshot dedupes by day before counting
      // for the same reason.
    } else if (d === next.lastWorkoutDay + 1) next.streakDays += 1;
    else next.streakDays = 1;
    next.lastWorkoutDay = d;
  }

  return next;
}

module.exports = {
  BADGE_AGGREGATES_VERSION,
  seedBadgeAggregates,
  publishableRecord,
  bestWeightPerExercise,
  lifetimeVolumeOf,
  findNewPersonalRecordsFromBest,
  buildRecordsSnapshot,
  applyWorkoutToRecords,
};
