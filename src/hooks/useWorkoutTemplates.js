import { useCallback, useEffect, useRef, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { publishableRoutines } from '../utils/friendPrivacy';

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

  // The latest snapshot, readable from a callback without making every
  // callback depend on `templates` (which is a new array on each snapshot,
  // so depending on it would rebuild saveTemplate/deleteTemplate — and
  // their callers — on every change).
  const latest = useRef([]);

  useEffect(() => {
    if (!uid) {
      setTemplates([]);
      latest.current = [];
      return;
    }
    const q = query(collection(db, 'users', uid, 'templates'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      latest.current = rows;
      setTemplates(rows);
    });
  }, [uid]);

  // Mirrors the library into users/{uid}/public/summary.savedWorkouts, the
  // one document a friend's profile can actually read (their real
  // templates collection is owner-only by rule, which is why this feature
  // rendered nothing at all until now).
  //
  // Republishes the WHOLE array rather than appending one entry, so a
  // delete is expressed, drift between the private collection and the
  // public mirror repairs itself, and templates that existed before this
  // shipped get backfilled the first time their owner saves or deletes
  // anything. publishableRoutines is the allowlist — see friendPrivacy.js.
  //
  // updateDoc, and failures swallowed, exactly like useEconomy's equipItem
  // mirror and for the same reason: firestore.rules forbids CREATING
  // public/summary from a client, so this throws for an account that has
  // never logged a workout — which is an account with no friend-visible
  // profile for a routine to appear on anyway. logWorkout creates the doc
  // the first time they train, and the next save publishes into it.
  const publish = useCallback(
    (rows) => {
      if (!uid) return;
      // OPT-IN, one routine at a time. `isPublic` is set by answering the
      // prompt at save time (App.jsx) and is absent on every template
      // saved before this shipped — so the filter also quietly retracts
      // anything the earlier publish-everything behaviour had already put
      // on a profile without asking. That retraction is the point, not a
      // side effect: nobody consented to those.
      // Deduped by id BEFORE filtering, because saveTemplate composes
      // `[justCreated, ...latest.current]` and Firestore's local-cache
      // snapshot often already contains the new doc by the time that
      // runs — the same routine then lands in the published array twice,
      // which a friend sees as a duplicate card. Dedupe here rather than
      // at the call site so a delete racing a save cannot reintroduce it.
      const byId = new Map();
      for (const t of rows) if (t?.id && !byId.has(t.id)) byId.set(t.id, t);
      const shared = [...byId.values()].filter((t) => t.isPublic === true);
      updateDoc(doc(db, 'users', uid, 'public', 'summary'), {
        savedWorkouts: publishableRoutines(shared),
      }).catch(() => {});
    },
    [uid],
  );

  // `isPublic` defaults to false, and that default is load-bearing: the
  // other caller of this is the copy button on a friend's profile
  // (PublicFriendProfile), and re-publishing somebody else's routine off
  // your own profile the moment you copied it is not something anyone
  // asked for.
  const saveTemplate = useCallback(
    async (title, exercises, { isPublic = false } = {}) => {
      if (!uid) return;
      const cleanExercises = exercises.map(({ exerciseId, name, muscleGroup }) => ({
        exerciseId,
        name,
        muscleGroup,
      }));
      const template = {
        title: title?.trim() || 'My Workout',
        exercises: cleanExercises,
        isPublic: isPublic === true,
        createdAt: new Date().toISOString(),
      };
      const ref = await addDoc(collection(db, 'users', uid, 'templates'), template);
      // Published from the write we just made rather than waiting for the
      // snapshot to come back with it — newest first, matching the
      // collection's own orderBy.
      publish([{ id: ref.id, ...template }, ...latest.current]);
      return ref;
    },
    [uid, publish],
  );

  const deleteTemplate = useCallback(
    async (id) => {
      if (!uid) return;
      await deleteDoc(doc(db, 'users', uid, 'templates', id));
      publish(latest.current.filter((t) => t.id !== id));
    },
    [uid, publish],
  );

  return { templates, saveTemplate, deleteTemplate };
}
