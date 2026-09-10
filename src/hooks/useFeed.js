import { useCallback, useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Same 30-value ceiling as useFriendsGraph.js — see there for why.
const FIRESTORE_IN_LIMIT = 30;

// Live feed of the current user's friends' verified workouts (written by
// logWorkout() — see functions/economy.js and firestore.rules' feedPosts
// match). `friendUids` is the caller's own `users/{uid}.friends` array.
export function useFeed(friendUids) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(Boolean(friendUids?.length));
  // Surfaced rather than left to the console — a listener error (missing
  // index, offline, whatever) used to leave `loading` stuck true forever
  // with nothing on screen explaining why. Found live: the very first
  // deploy of this query was missing its composite index (userId `in` +
  // orderBy(timestamp) needs one Firestore can't create automatically —
  // see firestore.indexes.json), and the feed just sat on "Loading
  // feed…" with the real reason visible only in devtools.
  const [error, setError] = useState(null);
  // A new profile snapshot hands back a new array identity for `friends`
  // on every single update (even ones that don't touch it at all) — keying
  // the effect below on this joined string instead of `friendUids` itself
  // avoids re-subscribing the query on every unrelated profile change
  // (e.g. coins ticking up from a workout).
  const friendUidsKey = friendUids?.join(',');

  useEffect(() => {
    if (!friendUids || friendUids.length === 0) {
      setPosts([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const q = query(
      collection(db, 'feedPosts'),
      where('userId', 'in', friendUids.slice(0, FIRESTORE_IN_LIMIT)),
      orderBy('timestamp', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, [friendUidsKey]);

  return { posts, loading, error };
}

// One feed post's cheer/like state — a tiny live subcollection rather than
// a denormalized counter (see firestore.rules): the count IS the number of
// like docs, so there's nothing to keep in sync and nothing to tamper with.
// Only worth subscribing to for posts actually on screen, so this is its
// own hook (called once per visible FeedPostCard) rather than baked into
// useFeed() itself, which would mean N live listeners the instant the feed
// loads regardless of what's actually visible.
export function usePostLikes(postId, myUid) {
  const [count, setCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);

  useEffect(() => {
    if (!postId) return;
    return onSnapshot(collection(db, 'feedPosts', postId, 'likes'), (snap) => {
      setCount(snap.size);
      setLikedByMe(snap.docs.some((d) => d.id === myUid));
    });
  }, [postId, myUid]);

  const toggleLike = useCallback(async () => {
    const likeRef = doc(db, 'feedPosts', postId, 'likes', myUid);
    // Read-then-write rather than trusting local `likedByMe` — a second
    // tab/device could have already toggled it since this component last
    // rendered, and create-on-an-existing-id / delete-on-a-missing-one
    // both just throw for no visible reason.
    const existing = await getDoc(likeRef);
    if (existing.exists()) {
      await deleteDoc(likeRef);
    } else {
      // likerUid duplicates the doc id on purpose: account deletion has to
      // find every cheer this person left across OTHER people's posts, and
      // a collection-group query cannot match on document id — only on a
      // field. See functions/account.js.
      await setDoc(likeRef, { likedAt: new Date().toISOString(), likerUid: myUid });
    }
  }, [postId, myUid]);

  return { count, likedByMe, toggleLike };
}
