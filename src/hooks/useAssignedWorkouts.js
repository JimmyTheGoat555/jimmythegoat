import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Trainee side: the routines their coach has pushed to them. Only 'pending'
// ones are surfaced — once started+finished it becomes a normal workout in
// their own history and this assignment flips to 'completed'.
//
// Sorted client-side rather than with a Firestore `orderBy` — combining an
// equality `where` with `orderBy` on a different field needs a composite
// index Firestore won't create automatically, and a trainee's pending-
// assignment list is small enough that sorting a handful of docs in JS
// costs nothing and skips a manual "create this index" console step.
export function useAssignedWorkouts(uid) {
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    if (!uid) {
      setAssignments([]);
      return;
    }
    const q = query(collection(db, 'users', uid, 'assignedWorkouts'), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setAssignments(docs);
    });
  }, [uid]);

  const completeAssignment = useCallback(
    (assignmentId, workoutId) => {
      if (!uid) return;
      updateDoc(doc(db, 'users', uid, 'assignedWorkouts', assignmentId), {
        status: 'completed',
        completedWorkoutId: workoutId,
        completedAt: new Date().toISOString(),
      });
    },
    [uid],
  );

  return { assignments, completeAssignment };
}

// Trainer side: push a routine to one trainee. `exercises` is the same
// {exerciseId, name, muscleGroup} shape the workout logger already uses,
// just without sets — the trainee fills in weight/reps as they lift.
export function assignWorkout(traineeUid, { title, exercises, trainerUid, trainerName }) {
  return addDoc(collection(db, 'users', traineeUid, 'assignedWorkouts'), {
    title,
    exercises,
    assignedBy: trainerUid,
    assignedByName: trainerName ?? null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}
