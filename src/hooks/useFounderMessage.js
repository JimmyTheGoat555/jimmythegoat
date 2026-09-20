import { useCallback, useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

// A direct message from the founder — users/{uid}/messages, written only
// by the Founder Console (functions/adminUserActions.js's adminMessageUser)
// and readable by its recipient alone (firestore.rules). Listened to live,
// so a message sent while the app is open arrives as it is sent; the
// oldest unread one is what the sheet shows, so two messages arrive in
// the order they were written rather than the newest hiding the rest.
//
// "Read" is a write of `readAt` on the message itself — the one field the
// rules let the recipient touch — so it stays read on every device, and
// the console can see it landed. Closing also hides it locally at once:
// if the write fails (offline, or the rule not yet deployed) the sheet
// does not spring back on the next snapshot.
export function useFounderMessage() {
  const uid = auth?.currentUser?.uid ?? null;
  const [unread, setUnread] = useState([]);
  const [hidden, setHidden] = useState(() => new Set());

  useEffect(() => {
    if (!db || !uid) return undefined;
    // An equality filter alone needs no composite index; the order is put
    // right here, on at most ten rows.
    const q = query(collection(db, 'users', uid, 'messages'), where('readAt', '==', null), limit(10));
    return onSnapshot(
      q,
      (snap) =>
        setUnread(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))),
        ),
      // Silence, never an error: the message is the one thing this hook
      // must not turn into a problem for the person reading it.
      () => setUnread([]),
    );
  }, [uid]);

  const message = unread.find((m) => !hidden.has(m.id)) ?? null;

  const markRead = useCallback(async () => {
    if (!message) return;
    setHidden((prev) => new Set(prev).add(message.id));
    if (!db || !uid) return;
    try {
      await updateDoc(doc(db, 'users', uid, 'messages', message.id), { readAt: new Date().toISOString() });
    } catch {
      // Hidden for this session regardless; the next load shows it again,
      // which is the right outcome for a write that did not land.
    }
  }, [uid, message]);

  return { message, markRead, pending: unread.filter((m) => !hidden.has(m.id)).length };
}
