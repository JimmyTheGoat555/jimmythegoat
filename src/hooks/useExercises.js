import { useCallback, useMemo } from 'react';
import { EXERCISES, MUSCLE_GROUPS } from '../data/exercises';
import { useLocalStorage } from './useLocalStorage';

// Combines the built-in exercise database with exercises the user added
// themselves. Custom exercises are stored separately so the seed list in
// data/exercises.js can keep changing without touching user data.
// Keyed by `uid` — see useActiveWorkout for why (two accounts, one browser).
export function useExercises(uid) {
  const [customExercises, setCustomExercises] = useLocalStorage(`custom-exercises:${uid ?? 'anon'}`, []);

  const allExercises = useMemo(() => [...EXERCISES, ...customExercises], [customExercises]);

  const exercisesByGroup = useCallback(
    (groupId) => allExercises.filter((exercise) => exercise.muscleGroup === groupId),
    [allExercises],
  );

  const getExercise = useCallback(
    (id) => allExercises.find((exercise) => exercise.id === id),
    [allExercises],
  );

  const addCustomExercise = useCallback(
    (name, muscleGroup) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const id = `custom-${trimmed.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString(36)}`;
      const exercise = { id, name: trimmed, muscleGroup, custom: true };
      setCustomExercises((prev) => [...prev, exercise]);
      return exercise;
    },
    [setCustomExercises],
  );

  const removeCustomExercise = useCallback(
    (id) => {
      setCustomExercises((prev) => prev.filter((exercise) => exercise.id !== id));
    },
    [setCustomExercises],
  );

  return {
    muscleGroups: MUSCLE_GROUPS,
    exercisesByGroup,
    getExercise,
    addCustomExercise,
    removeCustomExercise,
  };
}
