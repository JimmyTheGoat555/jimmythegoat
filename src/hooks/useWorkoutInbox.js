import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Things other people have sent you that are waiting on an answer —
// today, a friend's workout recommendation (functions/recommendWorkout.js
// is the only writer; firestore.rules makes this collection read/delete
// only from a client, so nothing here can forge an item).
//
// Deliberately NOT part of useNotifications, even though both are "stuff
// that arrived". A notification is finished the moment you have read it;
// an inbox item is a decision you have not made yet, which is why that
// list can safely cap itself at 12 rows and let a stray ✕ delete anything,
// and this one cannot.
//
// Accepting COPIES the routine into your own templates collection and then
// removes the item — the copy is the point, so a sender deleting their
// original (or their whole account) can never take back a routine you
// already saved.
export function useWorkoutInbox(uid, saveTemplate) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    const q = query(collection(db, 'users', uid, 'inbox'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      // A listener error here (rules still propagating after a deploy, an
      // offline start) must not take the Social page down with it — an
      // empty inbox is the right thing to render when we cannot read one.
      () => setItems([]),
    );
  }, [uid]);

  // Ids currently being resolved. A ref, not state: the guard has to be
  // true for the SECOND tap in the same tick, before any re-render could
  // have delivered a new value — the same reason the workout-finish latch
  // in App.jsx is a ref.
  const inFlight = useRef(new Set());

  // Removes the item and the bell row that announced it, together. The
  // notification is a separate doc on purpose (it is what makes the arrival
  // a real OS push — see functions/index.js), so clearing only one of the
  // two would leave "accept it from your inbox" sitting there pointing at
  // nothing.
  const clear = useCallback(
    async (item) => {
      const deletions = [deleteDoc(doc(db, 'users', uid, 'inbox', item.id))];
      if (item.notificationId) {
        // Best-effort: the recipient may well have dismissed the bell row
        // by hand already, and a missing doc must not fail the accept.
        deletions.push(deleteDoc(doc(db, 'users', uid, 'notifications', item.notificationId)).catch(() => {}));
      }
      await Promise.all(deletions);
    },
    [uid],
  );

  const accept = useCallback(
    async (item) => {
      if (!uid || inFlight.current.has(item.id)) return;
      inFlight.current.add(item.id);
      try {
        const routine = item.templateData ?? {};
        await saveTemplate(
          // Attributed in the title, the same convention copying a routine
          // off a friend's profile already uses (PublicFriendProfile) — a
          // library of anonymous "Push Day"s is useless a month later.
          `${item.senderName ?? 'A friend'}'s ${routine.title ?? 'Workout'}`,
          Array.isArray(routine.exercises) ? routine.exercises : [],
        );
        // Only after the copy has landed. Deleting first and failing the
        // save would lose the routine outright, with nothing to retry.
        await clear(item);
      } finally {
        inFlight.current.delete(item.id);
      }
    },
    [uid, saveTemplate, clear],
  );

  const decline = useCallback(
    async (item) => {
      if (!uid || inFlight.current.has(item.id)) return;
      inFlight.current.add(item.id);
      try {
        await clear(item);
      } finally {
        inFlight.current.delete(item.id);
      }
    },
    [uid, clear],
  );

  return { items, accept, decline };
}
