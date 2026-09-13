import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';

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
// Two kinds of item land here now: a workout a friend sent
// (`workout_recommendation`, answered with accept or dismiss) and the
// receipt when one of yours was completed and paid you a bounty
// (`reward_bounty`, only ever dismissed).
//
// Accepting is a CALLABLE, not the three client writes it started as. It
// copies the routine into your own templates — the copy is the point, so a
// sender deleting their original can never take a routine back — but it
// also records, server-side and out of the client's reach, who sent it, so
// finishing that workout can pay them (functions/acceptRecommendation.js).
// The moment coins hang off provenance, the copy cannot be made by the
// party who benefits from lying about it.
export function useWorkoutInbox(uid) {
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
        // One call does all of it — write the template, record the
        // provenance, delete this item and the bell row that announced it
        // — in a single batch, so a half-accepted state (a routine saved
        // with the card still sitting there, or the reverse) is not
        // reachable. The snapshot above removes the card when it lands.
        await httpsCallable(functions, 'acceptRecommendation')({ itemId: item.id });
      } finally {
        inFlight.current.delete(item.id);
      }
    },
    [uid],
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
