import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Cheers on a friend's personal record.
//
// Same shape as usePostLikes (hooks/useFeed.js) on purpose, and for the same
// reasons: one tiny doc per liker with their uid AS the doc id, no counter
// field anywhere, the count derived from the subcollection's size. Nothing
// to keep in sync, nothing to tamper with, and two people cheering at the
// same instant write different documents so they cannot collide.
//
// It cannot literally reuse usePostLikes because a PR is not a document —
// PRs are an array field inside users/{uid}/public/summary, which only
// Cloud Functions write. There is no per-PR doc to hang a subcollection
// off, and cheers live in a parallel `cheers` collection keyed by owner
// and item. See firestore.rules.
//
// A target id, not a path: '/' is the one character a Firestore document id
// may not contain, and an exerciseId is catalog data that could one day
// carry one.
export function cheerTargetId(ownerUid, itemId) {
  if (!ownerUid || !itemId) return null;
  return `${ownerUid}__${String(itemId).replace(/\//g, '_')}`;
}

export function useCheers(targetId, myUid) {
  const [server, setServer] = useState({ count: 0, likedByMe: false });
  // What the UI shows before the server has caught up. null means "no
  // optimistic override, trust the snapshot".
  const [pending, setPending] = useState(null);
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!targetId) return undefined;
    return onSnapshot(
      collection(db, 'cheers', targetId, 'likes'),
      (snap) => {
        const next = { count: snap.size, likedByMe: snap.docs.some((d) => d.id === myUid) };
        setServer(next);
        // Drop the optimistic value only once the server actually agrees.
        // Clearing it on any snapshot would flicker: an unrelated liker's
        // doc arriving mid-write would briefly undo your own tap.
        if (pendingRef.current != null && pendingRef.current === next.likedByMe) {
          pendingRef.current = null;
          setPending(null);
        }
      },
      () => {},
    );
  }, [targetId, myUid]);

  const toggleLike = useCallback(async () => {
    if (!targetId || !myUid) return;
    const likeRef = doc(db, 'cheers', targetId, 'likes', myUid);

    // Optimistic: flip locally first so the heart responds to the finger,
    // not to the round trip.
    const optimistic = !(pendingRef.current ?? server.likedByMe);
    pendingRef.current = optimistic;
    setPending(optimistic);

    try {
      // Read-then-write rather than trusting the local flag — a second tab
      // or device may have toggled this since the last render, and
      // create-on-existing / delete-on-missing both throw for no visible
      // reason. Same reasoning as usePostLikes.
      const existing = await getDoc(likeRef);
      if (existing.exists()) {
        await deleteDoc(likeRef);
      } else {
        // likerUid duplicates the doc id deliberately: account deletion has
        // to find every cheer this person left across other people's
        // records, and a collection-group query cannot match on document
        // id — only on a field. See functions/account.js.
        await setDoc(likeRef, { likedAt: new Date().toISOString(), likerUid: myUid });
      }
    } catch {
      // Put it back. An optimistic update that silently keeps a like which
      // was never stored is worse than no optimism at all.
      pendingRef.current = null;
      setPending(null);
    }
  }, [targetId, myUid, server.likedByMe]);

  // Add-only, for double-tap. Instagram's rule, and it is the right one: a
  // double tap that silently REMOVED a cheer you already left would be a
  // gesture that does opposite things depending on state you cannot see at
  // a glance. Already liked means there is simply nothing to write; the
  // caller still plays the burst, because swallowing the gesture entirely
  // feels broken.
  const like = useCallback(async () => {
    if (!targetId || !myUid) return;
    if (pendingRef.current ?? server.likedByMe) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const likeRef = doc(db, 'cheers', targetId, 'likes', myUid);
      // Note this is only ever reached when we believe no cheer exists: the
      // guard above is what makes repeated double taps safe, NOT the write
      // being idempotent. It is not — `allow update: if false` in the rules
      // means re-writing an existing cheer is denied, not ignored. If a
      // second device liked it in the split second since the last snapshot,
      // this throws, the catch rolls the optimistic flip back, and the
      // snapshot then reports it as liked anyway. Right end state either way.
      await setDoc(likeRef, { likedAt: new Date().toISOString(), likerUid: myUid });
    } catch {
      pendingRef.current = null;
      setPending(null);
    }
  }, [targetId, myUid, server.likedByMe]);

  const likedByMe = pending ?? server.likedByMe;
  // Adjust the count by the difference the pending flip implies, so the
  // number moves with the heart instead of lagging a round trip behind it.
  const drift = pending == null || pending === server.likedByMe ? 0 : pending ? 1 : -1;

  return { count: Math.max(0, server.count + drift), likedByMe, toggleLike, like };
}
