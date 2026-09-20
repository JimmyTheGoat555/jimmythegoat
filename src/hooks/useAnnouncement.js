import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useLocalStorage } from './useLocalStorage';

// The global announcement — one document, config/announcement, written
// only by the Founder Console (functions/adminOps.js's
// adminSetAnnouncement) and readable by every signed-in account
// (firestore.rules). Listened to live, so a banner switched on reaches an
// app that is already open, not only the next load.
//
// A dismissal is remembered per announcement ID, on this device: closing
// today's banner does not close next month's, and switching the same
// banner off and on again does not bring it back for someone who already
// closed it (the server keeps the id across a toggle — see adminOps.js).
export function useAnnouncement() {
  const uid = auth?.currentUser?.uid ?? null;
  const [announcement, setAnnouncement] = useState(null);
  const [dismissedId, setDismissedId] = useLocalStorage(`announcement-dismissed:${uid ?? 'anon'}`, null);

  useEffect(() => {
    if (!db || !uid) return undefined;
    return onSnapshot(
      doc(db, 'config', 'announcement'),
      (snap) => setAnnouncement(snap.exists() ? snap.data() : null),
      // A missing rule or a missing doc is silence, not an error banner:
      // the announcement is the one thing this hook must never turn into
      // a problem for the person reading it.
      () => setAnnouncement(null),
    );
  }, [uid]);

  const visible =
    announcement && announcement.active === true && announcement.id && announcement.id !== dismissedId
      ? announcement
      : null;

  return {
    announcement: visible,
    dismiss: () => setDismissedId(announcement?.id ?? null),
  };
}
