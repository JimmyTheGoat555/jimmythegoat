import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// Firestore's own ceiling on an `in` filter. Not a choice — the query is
// rejected above this — which is why the feed is assembled from several
// queries rather than one.
const FIRESTORE_IN_LIMIT = 30;

// Newest posts fetched PER CHUNK of 30 friends. Merging the chunks and
// taking the newest N overall is exact as long as each chunk offers at
// least N candidates, so this doubles as the cap on the whole feed.
//
// It is also the ceiling on what the weekly leaderboard can see, since
// that aggregates the same array (see Leaderboard.tsx): at ~2 workouts a
// day per person, 150 covers a week of thirty very busy friends. If this
// app ever outgrows that, the honest fix is a `timestamp >=` window
// rather than a bigger number.
const POSTS_PER_CHUNK = 150;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

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
      return undefined;
    }
    setLoading(true);
    setError(null);

    // ONE LISTENER PER 30 FRIENDS, merged.
    //
    // This used to be a single query over `friendUids.slice(0, 30)`, which
    // did not fail, warn, or degrade — it just silently stopped showing
    // anyone past the thirtieth, permanently, in whatever order the
    // friends array happened to be in. Harmless while everybody had two
    // friends; a guaranteed bug the moment one account is friends with
    // every user, which is now the design (see functions/welcomeFriend.js).
    //
    // Same chunking useFriendsGraph already does to resolve names, just
    // live: each chunk keeps its own latest snapshot and the merge runs
    // whenever any of them changes.
    const groups = chunk(friendUids, FIRESTORE_IN_LIMIT);
    const byChunk = new Array(groups.length).fill(null);

    const publish = () => {
      // A chunk that has not reported yet is null rather than empty, so
      // the first snapshot of a two-chunk feed does not render as "these
      // are all the posts" for a frame.
      if (byChunk.some((c) => c === null)) return;
      const merged = byChunk.flat();
      // Dedupe by id before sorting. Chunks are disjoint by construction
      // (a uid appears in exactly one), so this only matters if `friends`
      // ever contains a duplicate — cheap insurance against a feed showing
      // the same workout twice.
      const unique = [...new Map(merged.map((post) => [post.id, post])).values()];
      unique.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      setPosts(unique.slice(0, POSTS_PER_CHUNK));
      setLoading(false);
    };

    const unsubscribes = groups.map((group, i) =>
      onSnapshot(
        query(
          collection(db, 'feedPosts'),
          where('userId', 'in', group),
          orderBy('timestamp', 'desc'),
          limit(POSTS_PER_CHUNK),
        ),
        (snap) => {
          byChunk[i] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          publish();
        },
        (err) => {
          // One failing chunk should not blank the whole feed: report it,
          // and let the chunks that did arrive render. Treating the failed
          // one as empty is what lets publish() proceed.
          byChunk[i] = [];
          setError(err.message);
          publish();
        },
      ),
    );

    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
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
