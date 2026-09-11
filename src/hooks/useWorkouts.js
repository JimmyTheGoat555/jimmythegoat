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

function emptyWorkout(presetExercises, assignedWorkoutId) {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    // A trainer-assigned routine arrives as {exerciseId, name, muscleGroup}
    // per exercise — same shape addExercise() builds from, just pre-seeded
    // with one empty set each instead of added one at a time.
    exercises: (presetExercises ?? []).map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      // Seed list decides this — an assigned routine only carries ids.
      isBodyweight: isBodyweightExercise(exercise.exerciseId),
      sets: [{ id: crypto.randomUUID(), weight: '', reps: '', completed: false }],
    })),
    assignedWorkoutId: assignedWorkoutId ?? null,
  };
}

// The in-progress workout. Persisted so a refresh or tab close mid-session
// doesn't lose logged sets — this is the "smart data management" piece.
// Keyed by `uid` so two different accounts signed in on the same browser
// (a trainer and trainee testing on one device, say) never see each
// other's in-progress session — a real bug this app hit as soon as a
// second account existed on the same machine.
export function useActiveWorkout(uid) {
  const [activeWorkout, setActiveWorkout] = useLocalStorage(`active-workout:${uid ?? 'anon'}`, null);
  const screenLock = useWakeLock();

  // Screen stays awake for the whole session: acquired the moment a workout
  // starts, released the moment it ends — whether by finishing or discarding,
  // since both paths call discardWorkout(). `presetExercises`/`assignedWorkoutId`
  // are set when starting from a trainer-assigned routine (see
  // AssignedWorkoutCard); omit both for a normal freestyle workout.
  const startWorkout = useCallback(
    (presetExercises, assignedWorkoutId) => {
      setActiveWorkout(emptyWorkout(presetExercises, assignedWorkoutId));
      screenLock.request();
    },
    [setActiveWorkout, screenLock.request],
  );

  const discardWorkout = useCallback(() => {
    setActiveWorkout(null);
    screenLock.release();
  }, [setActiveWorkout, screenLock.release]);

  const addExercise = useCallback(
    (exercise) => {
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
              sets: [{ id: crypto.randomUUID(), weight: '', reps: '', completed: false }],
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
        return { ...prev, exercises: next };
      });
    },
    [setActiveWorkout],
  );

  const removeExercise = useCallback(
    (exerciseId) => {
      setActiveWorkout((prev) => ({
        ...prev,
        exercises: prev.exercises.filter((e) => e.exerciseId !== exerciseId),
      }));
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
  };
}
