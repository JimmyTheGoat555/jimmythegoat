import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';

// A personal library of reusable routines — "save this exact exercise
// lineup, load it again later." Deliberately structure-only (exerciseId/
// name/muscleGroup per exercise, same shape `assignedWorkouts` already
// uses to seed a fresh workout): no weights/reps are saved, so loading a
// template always starts with clean empty sets, same as starting an
// assigned workout does. Personal, not shared — a trainer's own saved
// templates live in their own account like anyone else's (the
// trainer/trainee unification means they get this feature for free), but
// there's no trainer→trainee template library yet; see WorkoutHome/App.jsx
// comments for that scope note.
export function useWorkoutTemplates(uid) {
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    if (!uid) {
      setTemplates([]);
      return;
    }
    const q = query(collection(db, 'users', uid, 'templates'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  const saveTemplate = useCallback(
    (title, exercises) => {
      if (!uid) return;
      const cleanExercises = exercises.map(({ exerciseId, name, muscleGroup }) => ({
        exerciseId,
        name,
        muscleGroup,
      }));
      return addDoc(collection(db, 'users', uid, 'templates'), {
        title: title?.trim() || 'My Workout',
        exercises: cleanExercises,
        createdAt: new Date().toISOString(),
      });
    },
    [uid],
  );

  const deleteTemplate = useCallback(
    (id) => {
      if (!uid) return;
      deleteDoc(doc(db, 'users', uid, 'templates', id));
    },
    [uid],
  );

  return { templates, saveTemplate, deleteTemplate };
}
