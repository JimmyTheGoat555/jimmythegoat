import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { useWakeLock } from './useWakeLock';
import { isBodyweightExercise } from '../data/exercises';

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
      setWorkouts((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updater(w) } : w)),
      );
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

function emptyWorkout(presetExercises, { assignedWorkoutId = null, templateId = null } = {}) {
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
          exercises: kept.map((e) =>
            e.supersetId && counts.get(e.supersetId) === 1 ? { ...e, supersetId: null } : e,
          ),
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
          exercises: prev.exercises.map((e, idx) =>
            idx === i || idx === i + 1 ? { ...e, supersetId: groupId } : e,
          ),
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
          exercises: prev.exercises.map((e) =>
            e.supersetId === groupId ? { ...e, supersetId: null } : e,
          ),
        };
      });
    },
    [setActiveWorkout],
  );

  const addSet = useCallback(
    (exerciseId) => {
      setActiveWorkout((prev) => ({
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.exerciseId === exerciseId
            ? {
                ...e,
                sets: [
                  ...e.sets,
                  {
                    id: crypto.randomUUID(),
                    weight: e.sets.at(-1)?.weight ?? '',
                    reps: e.sets.at(-1)?.reps ?? '',
                    completed: false,
                  },
                ],
              }
            : e,
        ),
      }));
    },
    [setActiveWorkout],
  );

  const updateSet = useCallback(
    (exerciseId, setId, patch) => {
      setActiveWorkout((prev) => ({
        ...prev,
        exercises: prev.exercises.map((e) =>
          e.exerciseId === exerciseId
            ? {
                ...e,
                sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
              }
            : e,
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

  return {
    activeWorkout,
    startWorkout,
    discardWorkout,
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
