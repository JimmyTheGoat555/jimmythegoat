import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useWakeLock } from './useWakeLock';
import { isBodyweightExercise } from '../data/exercises';
import { applySetPatch } from '../utils/setCascade';

// Finished workout history — the source of truth for Dashboard/Progress.
export function useWorkoutHistory() {
  const [workouts, setWorkouts] = useLocalStorage('workouts', []);

  const addWorkout = useCallback(
    (workout) => {
      setWorkouts((prev) => [workout, ...prev]);
    },
    [setWorkouts],
  );

  const deleteWorkout = useCallback(
    (id) => {
      setWorkouts((prev) => prev.filter((w) => w.id !== id));
    },
    [setWorkouts],
  );

  // Full replace of a finished workout — used by the history edit screen
  // after the user tweaks weights/reps or removes a set/exercise.
  const updateWorkout = useCallback(
    (id, updater) => {
      setWorkouts((prev) => prev.map((w) => (w.id === id ? { ...w, ...updater(w) } : w)));
    },
    [setWorkouts],
  );

  return { workouts, addWorkout, deleteWorkout, updateWorkout };
}

// Nearly every hypertrophy/strength exercise is programmed as 3 working
// sets, so starting at 1 meant almost everyone tapped "+ Add Set" twice
// per exercise, every exercise, every session. Starting at 3 costs the
// minority who wanted fewer a single "✕" instead.
//
// Safe to leave blank rows lying around: an un-checked set is skipped by
// both client stat functions (workoutStats.js filters on `completed`
// before summing) and by the server (economy.js's validateAndScoreWorkout
// `continue`s past anything not completed, and drops an exercise whose
// sets are all incomplete), so extras never reach history, volume, or the
// feed post. The "log at least one completed set" gate is unchanged.
export const DEFAULT_SETS_PER_EXERCISE = 3;

function emptySets() {
  return Array.from({ length: DEFAULT_SETS_PER_EXERCISE }, () => ({
    id: crypto.randomUUID(),
    weight: '',
    reps: '',
    completed: false,
  }));
}

function emptyWorkout(
  presetExercises,
  { assignedWorkoutId = null, templateId = null, programId = null, programTitle = null } = {},
) {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    // A trainer-assigned routine or saved template arrives as
    // {exerciseId, name, muscleGroup} per exercise — same shape
    // addExercise() builds from, just pre-seeded all at once. Neither
    // carries a set count today, so they get the same default 3 as a
    // hand-added exercise rather than a different number for no reason.
    exercises: (presetExercises ?? []).map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      // Seed list decides this — an assigned routine only carries ids.
      isBodyweight: isBodyweightExercise(exercise.exerciseId),
      // Pre-filled from history by the caller when it has it (App.jsx's
      // withSeededSets); blanks otherwise.
      sets: exercise.seedSets?.length ? exercise.seedSets : emptySets(),
    })),
    assignedWorkoutId: assignedWorkoutId ?? null,
    // Which saved routine this came from. Carried all the way to
    // logWorkout, where it is the ONLY thing that can trigger a
    // recommendation bounty for the friend who sent it — the server looks
    // the sender up from this id rather than being told who to pay. See
    // functions/acceptRecommendation.js.
    templateId: templateId ?? null,
    // One of Jimmy's Workouts (data/jimmyWorkouts.js): "jimmy:<split>:<session>"
    // and the session's name. Client-side only — never in the logWorkout
    // payload (hooks/useEconomy.js names its fields) — and deliberately
    // NOT a templateId: that would tell the finish flow this is already
    // the lifter's own routine, and the point is to offer to make it one.
    programId: programId ?? null,
    programTitle: programTitle ?? null,
    // Gym locker, asked once at the top of the session and handed back at
    // the end ("don't forget your stuff"). Lives on the workout rather than
    // on the account because it is true for exactly this session — the
    // whole point is that it changes every visit. Never sent to the
    // server: logWorkout's payload is rebuilt from an allowlist
    // (functions/economy.js), so this stays on the device.
    //
    // `lockerAsked` is what stops the prompt reappearing on every render
    // and after a mid-workout refresh; it is set whichever way the
    // question is answered, including "I don't have a locker".
    lockerNumber: null,
    lockerAsked: false,
  };
}

// The in-progress workout. Persisted so a refresh or tab close mid-session
// doesn't lose logged sets — this is the "smart data management" piece.
// Keyed by `uid` so two different accounts signed in on the same browser
// (a trainer and trainee testing on one device, say) never see each
// other's in-progress session — a real bug this app hit as soon as a
// second account existed on the same machine.
// Pulls every member of a superset back together, in first-appearance
// order of the groups themselves.
//
// A superset is defined by ADJACENCY plus a shared id, and two things in
// this app reorder the exercise array behind the feature's back: dragging,
// and Jimmy's Priority sort (ActiveWorkoutLogger rewrites the real order
// whenever it is on). Either can leave two linked exercises with something
// else wedged between them, at which point the pair silently stops being a
// superset — no error, just a group that quietly evaporated.
//
// Rather than teach both callers about groups, the invariant is restored
// here, in the single function that changes order at all. Anything that
// reorders is therefore free to ignore supersets entirely.
function cohereSupersets(exercises) {
  const out = [];
  const placed = new Set();
  for (const exercise of exercises) {
    if (placed.has(exercise)) continue;
    out.push(exercise);
    placed.add(exercise);
    if (!exercise.supersetId) continue;
    for (const other of exercises) {
      if (placed.has(other) || other.supersetId !== exercise.supersetId) continue;
      out.push(other);
      placed.add(other);
    }
  }
  return out;
}

export function useActiveWorkout(uid) {
  const [activeWorkout, setActiveWorkout] = useLocalStorage(`active-workout:${uid ?? 'anon'}`, null);
  const screenLock = useWakeLock();

  // Screen stays awake for the whole session: acquired the moment a workout
  // starts, released the moment it ends — whether by finishing or discarding,
  // since both paths call discardWorkout(). `presetExercises` plus one of
  // `assignedWorkoutId` (a trainer's assignment) or `templateId` (a saved
  // routine); omit all three for a normal freestyle workout. An options
  // object rather than a third positional argument, which would have made
  // the template call site read `startWorkout(ex, undefined, id)`.
  const startWorkout = useCallback(
    (presetExercises, origin) => {
      setActiveWorkout(emptyWorkout(presetExercises, origin));
      screenLock.request();
    },
    [setActiveWorkout, screenLock.request],
  );

  const discardWorkout = useCallback(() => {
    setActiveWorkout(null);
    screenLock.release();
  }, [setActiveWorkout, screenLock.release]);

  // `seedSets` (optional) pre-fills the new exercise from the lifter's last
  // performance of it — built by the caller via
  // utils/lastPerformance.js's seedSetsFromHistory, because THIS hook owns
  // the shape of an in-progress workout and deliberately knows nothing
  // about where history comes from. ActiveWorkoutLogger already holds the
  // cached `history` list for its "Last time ·" line, so the lookup costs
  // no extra read; passing the result in keeps that data dependency at the
  // edge instead of dragging it into workout state.
  const addExercise = useCallback(
    (exercise, seedSets) => {
      setActiveWorkout((prev) => {
        if (!prev) return prev;
        if (prev.exercises.some((e) => e.exerciseId === exercise.id)) return prev;
        return {
          ...prev,
          exercises: [
            ...prev.exercises,
            {
              exerciseId: exercise.id,
              name: exercise.name,
              muscleGroup: exercise.muscleGroup,
              // From the exercise definition (seed list has the flag;
              // custom exercises don't carry it → treated as weighted).
              isBodyweight: exercise.isBodyweight === true,
              sets: seedSets?.length ? seedSets : emptySets(),
            },
          ],
        };
      });
    },
    [setActiveWorkout],
  );

  // Replaces the exercise order wholesale, by id. Takes ids rather than the
  // reordered objects themselves so a stale drag can never resurrect an
  // exercise that was removed, or an old copy of one whose sets have since
  // changed — the objects always come from current state.
  const reorderExercises = useCallback(
    (orderedIds) => {
      setActiveWorkout((prev) => {
        if (!prev) return prev;
        const byId = new Map(prev.exercises.map((e) => [e.exerciseId, e]));
        const next = orderedIds.map((id) => byId.get(id)).filter(Boolean);
        // Anything the caller didn't mention keeps its place at the end,
        // so a partial list can't silently drop work.
        for (const e of prev.exercises) if (!orderedIds.includes(e.exerciseId)) next.push(e);
        // Groups win over the requested order — see cohereSupersets.
        return { ...prev, exercises: cohereSupersets(next) };
      });
    },
    [setActiveWorkout],
  );

  const removeExercise = useCallback(
    (exerciseId) => {
      setActiveWorkout((prev) => {
        const kept = prev.exercises.filter((e) => e.exerciseId !== exerciseId);
        // Deleting the middle of a superset can leave a single exercise
        // still carrying a group id. A group of one is not a superset, and
        // leaving the id on would render a "linked" chrome around nothing,
        // so the survivor is unlinked.
        const counts = new Map();
        for (const e of kept) if (e.supersetId) counts.set(e.supersetId, (counts.get(e.supersetId) ?? 0) + 1);
        return {
          ...prev,
          exercises: kept.map((e) => (e.supersetId && counts.get(e.supersetId) === 1 ? { ...e, supersetId: null } : e)),
        };
      });
    },
    [setActiveWorkout],
  );

  // Links an exercise with the one directly after it. Joining an exercise
  // to a member of an existing group extends that group rather than
  // starting a rival one, so chaining a third exercise onto a pair gives a
  // tri-set instead of two overlapping pairs.
  const linkSuperset = useCallback(
    (exerciseId) => {
      setActiveWorkout((prev) => {
        if (!prev) return prev;
        const i = prev.exercises.findIndex((e) => e.exerciseId === exerciseId);
        const a = prev.exercises[i];
        const b = prev.exercises[i + 1];
        if (!a || !b) return prev;
        const groupId = a.supersetId ?? b.supersetId ?? crypto.randomUUID();
        return {
          ...prev,
          exercises: prev.exercises.map((e, idx) => (idx === i || idx === i + 1 ? { ...e, supersetId: groupId } : e)),
        };
      });
    },
    [setActiveWorkout],
  );

  // Breaks the WHOLE group this exercise belongs to, not just its own
  // link. Unlinking one member of a tri-set has no single obvious meaning
  // — does the chain heal around the gap, or split in two? — and an
  // ambiguous destructive action is worse than a blunt one the lifter can
  // simply redo.
  const unlinkSuperset = useCallback(
    (exerciseId) => {
      setActiveWorkout((prev) => {
        if (!prev) return prev;
        const groupId = prev.exercises.find((e) => e.exerciseId === exerciseId)?.supersetId;
        if (!groupId) return prev;
        return {
          ...prev,
          exercises: prev.exercises.map((e) => (e.supersetId === groupId ? { ...e, supersetId: null } : e)),
        };
      });
    },
    [setActiveWorkout],
  );

  // A new set starts as a copy of the one above it — the same straight-set
  // assumption the cascade makes (utils/setCascade.js), so the load
  // travels with its entry context (bar, plates, per-dumbbell weight) and
  // the set re-opens showing what was typed, not a total to back-solve.
  // Never `completed` or `isDropSet`: those are about the set above.
  const newSetAfter = (last) => {
    const set = { id: crypto.randomUUID(), weight: last?.weight ?? '', reps: last?.reps ?? '', completed: false };
    for (const field of ['addedWeight', 'barWeight', 'weightPerSide', 'perHandWeight', 'isPerHand']) {
      if (last && field in last) set[field] = last[field];
    }
    return set;
  };

  const addSet = useCallback(
    (exerciseId) => {
      setActiveWorkout((prev) => ({
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.exerciseId === exerciseId
            ? {
                ...e,
                sets: [...e.sets, newSetAfter(e.sets.at(-1))],
              }
            : e,
        ),
      }));
    },
    [setActiveWorkout],
  );

  // One set's patch, and — for its load and reps — the same values carried
  // down to every later set in the exercise that is still open: not
  // completed, not a drop set. See utils/setCascade.js for the rules; this
  // is the one place they run, so the sheet, the chips and the summary all
  // read the same numbers. One functional update for the whole cascade,
  // so a fast run of wheel ticks costs one render each, not one per set.
  const updateSet = useCallback(
    (exerciseId, setId, patch) => {
      setActiveWorkout((prev) => ({
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.exerciseId === exerciseId ? { ...e, sets: applySetPatch(e.sets, setId, patch) } : e,
        ),
      }));
    },
    [setActiveWorkout],
  );

  const removeSet = useCallback(
    (exerciseId, setId) => {
      setActiveWorkout((prev) => ({
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.exerciseId === exerciseId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e,
        ),
      }));
    },
    [setActiveWorkout],
  );

  // Answers the locker question, one way or the other. A number parks it
  // on the session; null means "no locker today" — both count as asked, so
  // the prompt is done either way. Guarded on `prev` like every other
  // setter here: the modal can be dismissed in the same tick a workout is
  // discarded from another tab.
  const answerLocker = useCallback(
    (lockerNumber) => {
      setActiveWorkout((prev) => {
        if (!prev) return prev;
        const trimmed = String(lockerNumber ?? '').trim();
        return { ...prev, lockerNumber: trimmed || null, lockerAsked: true };
      });
    },
    [setActiveWorkout],
  );

  // Pins a rest-timer boost token to the exercise that will carry it to
  // the server — see hooks/useRestBoost.js and ActiveWorkoutLogger's set
  // handler for when. Stored ON the exercise rather than beside it so the
  // payload logWorkout receives (`exercises` as-is — useEconomy.js) names
  // the token on the exercise it doubles with no assembly step, and so
  // removing the exercise frees the token again for nothing. A second
  // bind to the same exercise replaces the first: the only way that
  // happens is the earlier token having expired under it.
  const bindRestBoost = useCallback(
    (exerciseId, tokenId) => {
      setActiveWorkout((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exercises: prev.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, boostTokenId: tokenId } : e)),
        };
      });
    },
    [setActiveWorkout],
  );

  return {
    activeWorkout,
    startWorkout,
    discardWorkout,
    answerLocker,
    bindRestBoost,
    screenLockActive: screenLock.isActive,
    addExercise,
    removeExercise,
    reorderExercises,
    addSet,
    updateSet,
    removeSet,
    linkSuperset,
    unlinkSuperset,
  };
}
