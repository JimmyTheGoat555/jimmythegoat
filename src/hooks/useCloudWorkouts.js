import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// ── ONE SNAPSHOT, ONLY WHAT CHANGED ─────────────────────────────────────
//
// This listener holds the whole history, unbounded, and every screen that
// reads it — Progress, History, the leaderboard, the evolution tier — is
// downstream of the array it publishes. It used to rebuild that array
// from scratch on every snapshot: a new object per document, hundreds of
// them, for a change to one. Firestore fires it more than it looks —
// every workout logged, every edit, and again on each reconnect after
// the app comes back from the background — and each time the whole tree
// re-rendered against an array in which nothing was the same object as
// before, so no memo anywhere could bail out. On a phone with a long
// history that was one of the freezes on resume and on save.
//
// applyChanges walks snap.docChanges() instead: a document that did not
// change keeps its object, so a screen keyed on identity (React's memo,
// useMemo on the array's items) sees exactly the rows that moved. A
// snapshot with no document changes at all publishes nothing.

// Folds one snapshot into `cache` (id → workout object, reused until the
// document changes) and returns the list in query order, or null when
// the snapshot changed nothing.
export function applyChanges(cache, snap) {
  const changes = snap.docChanges();
  if (changes.length === 0 && cache.size === snap.size && snap.size > 0) return null;
  for (const change of changes) {
    if (change.type === 'removed') cache.delete(change.doc.id);
    else cache.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
  }
  return snap.docs.map((d) => {
    let workout = cache.get(d.id);
    if (!workout) {
      workout = { id: d.id, ...d.data() };
      cache.set(d.id, workout);
    }
    return workout;
  });
}

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
    // Per subscription, so a change of account starts from nothing.
    const cache = new Map();
    return onSnapshot(q, (snap) => {
      const next = applyChanges(cache, snap);
      if (next) setWorkouts(next);
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
    const cache = new Map();
    return onSnapshot(q, (snap) => {
      const next = applyChanges(cache, snap);
      if (next) setWorkouts(next);
      setLoading(false);
    });
  }, [uid]);

  return { workouts, loading };
}
