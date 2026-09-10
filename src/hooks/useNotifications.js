import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Live in-app notification inbox at users/{uid}/notifications — trainer
// weigh-in updates (written by a connected trainee's own client, see
// pushNotification below) and weekly weigh-in reminders (written by the
// scheduled Cloud Function, functions/index.js). Either way this hook just
// reads whatever's in the collection; a separate Cloud Function
// (sendPushOnNotificationCreate) watches this SAME collection and turns
// each new doc into an actual OS push, so writing here is the one action
// that drives both the in-app inbox and the push — no notification type
// ever needs its own server code.
export function useNotifications(uid) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!uid) {
      setNotifications([]);
      return;
    }
    const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setNotifications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  const markRead = useCallback(
    (id) => {
      if (!uid) return;
      updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true });
    },
    [uid],
  );

  const dismiss = useCallback(
    (id) => {
      if (!uid) return;
      deleteDoc(doc(db, 'users', uid, 'notifications', id));
    },
    [uid],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markRead, dismiss };
}

// Writes a notification into someone ELSE's inbox — used when a trainee
// logs a weigh-in and their connected trainer should see it. Only valid
// per firestore.rules when the signed-in caller's own trainerId equals
// `targetUid` (a trainee writing to their own trainer's inbox); writing to
// anyone else's fails closed.
export function pushNotification(targetUid, { type, title, body, data }) {
  if (!targetUid) return;
  const id = crypto.randomUUID();
  return setDoc(doc(db, 'users', targetUid, 'notifications', id), {
    type,
    title,
    body,
    data: data ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  });
}
