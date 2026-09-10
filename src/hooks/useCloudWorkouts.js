import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// Cloud replacement for the old localStorage-backed useWorkoutHistory.
// Deliberately keeps the exact same external shape ({ workouts, addWorkout,
// deleteWorkout, updateWorkout }) so every screen built against it —
// Progress, History, Leaderboard, JimmyEvolution's lifetimeVolume() — needs
// zero changes. Returns a no-op stub until `uid` is known so it's safe to
// call unconditionally before sign-in resolves.
export function useCloudWorkoutHistory(uid) {
  const [workouts, setWorkouts] = useState([]);

  useEffect(() => {
    if (!uid) {
      setWorkouts([]);
      return;
    }
    const q = query(collection(db, 'users', uid, 'workouts'), orderBy('finishedAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setWorkouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  const addWorkout = useCallback(
    (workout) => {
      if (!uid) return;
      setDoc(doc(db, 'users', uid, 'workouts', workout.id), workout);
    },
    [uid],
  );

  const deleteWorkout = useCallback(
    (id) => {
      if (!uid) return;
      deleteDoc(doc(db, 'users', uid, 'workouts', id));
    },
    [uid],
  );

  // Full replace of a finished workout, same contract as the local version:
  // `updater` receives the current workout and returns the fields to merge.
  const updateWorkout = useCallback(
    (id, updater) => {
      if (!uid) return;
      const current = workouts.find((w) => w.id === id);
      if (!current) return;
      setDoc(doc(db, 'users', uid, 'workouts', id), { ...current, ...updater(current) });
    },
    [uid, workouts],
  );

  return { workouts, addWorkout, deleteWorkout, updateWorkout };
}

// Read-only variant for a Trainer looking at one Trainee's history —
// same live subscription, no mutation methods (a trainer can view, never
// edit a trainee's logged workouts).
export function useReadOnlyWorkouts(uid) {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid) {
      setWorkouts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(db, 'users', uid, 'workouts'), orderBy('finishedAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setWorkouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [uid]);

  return { workouts, loading };
}
