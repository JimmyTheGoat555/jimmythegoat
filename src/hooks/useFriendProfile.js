import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

// A friend's read-only profile view. Two live sources, neither of them
// their actual private `users/{friendUid}` doc — that stays owner/trainer
// only (see firestore.rules), so this is deliberately built from the same
// kind of PUBLIC surface the rest of the app already exposes:
//
//   * users/{friendUid}/public/summary — displayName, lifetimeVolume (for
//     their evolution stage), personalRecords when they've opted in, and
//     equippedDance/equippedAccessory. The stat fields are server-
//     maintained only (functions/publicProfile.js, functions/economy.js);
//     the equipped fields also get a live client mirror the instant
//     someone equips something — see useEconomy.js's equipItem.
//   * their most recent feedPosts entry, used ONLY as a fallback for the
//     equipped fields — covers the sliver of time before anyone has ever
//     equipped anything post-launch of this feature, where public/summary
//     might exist (from a logged workout) but not yet carry those two
//     fields. feedPosts already snapshots them per post (see
//     functions/economy.js) and is globally readable, the same precedent
//     Leaderboard.tsx already relies on for a friend's weekly tonnage.
export function useFriendProfile(friendUid) {
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(Boolean(friendUid));
  const [latestPost, setLatestPost] = useState(null);
  const [postLoading, setPostLoading] = useState(Boolean(friendUid));

  useEffect(() => {
    if (!friendUid) {
      setSummary(null);
      setSummaryLoading(false);
      return;
    }
    setSummaryLoading(true);
    return onSnapshot(
      doc(db, 'users', friendUid, 'public', 'summary'),
      (snap) => {
        setSummary(snap.exists() ? snap.data() : null);
        setSummaryLoading(false);
      },
      () => setSummaryLoading(false),
    );
  }, [friendUid]);

  useEffect(() => {
    if (!friendUid) {
      setLatestPost(null);
      setPostLoading(false);
      return;
    }
    setPostLoading(true);
    // Same composite index Leaderboard/useFeed already need
    // (userId ASC, timestamp DESC) — see firestore.indexes.json.
    const q = query(
      collection(db, 'feedPosts'),
      where('userId', '==', friendUid),
      orderBy('timestamp', 'desc'),
      limit(1),
    );
    return onSnapshot(
      q,
      (snap) => {
        setLatestPost(snap.empty ? null : snap.docs[0].data());
        setPostLoading(false);
      },
      () => setPostLoading(false),
    );
  }, [friendUid]);

  return {
    displayName: summary?.displayName ?? null,
    lifetimeVolume: summary?.lifetimeVolume ?? 0,
    sharePRs: summary?.sharePRs === true,
    // Absent whenever sharePRs is false — see publicProfile.js, which
    // deletes the field outright rather than leaving it around unchecked.
    personalRecords: summary?.personalRecords ?? null,
    // public/summary first: kept live by equipItem (see above), whereas
    // the feed post is only ever as fresh as their last logged workout.
    equippedDance: summary?.equippedDance ?? latestPost?.equippedDance ?? null,
    equippedAccessory: summary?.equippedAccessory ?? latestPost?.equippedAccessory ?? null,
    // Multi-slot loadout, preferring the summary then the newest feed
    // post; readEquippedAccessories at the render site folds in the legacy
    // single field for accounts that predate this.
    equippedAccessories:
      summary?.equippedAccessories ?? latestPost?.equippedAccessories ?? null,
    loading: summaryLoading || postLoading,
    // A profile that truly doesn't exist (bad uid, or they've deleted their
    // account) vs. one that's just never logged a workout yet — the latter
    // still has no public/summary doc (nothing has ever written one), so
    // this can't tell the two apart from data alone. FriendProfile passes
    // the name it already had from the friends list as a fallback for
    // exactly that reason.
    hasSummary: summary !== null,
  };
}
