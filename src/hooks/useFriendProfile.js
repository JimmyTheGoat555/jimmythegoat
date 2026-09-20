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
    equippedAccessories: summary?.equippedAccessories ?? latestPost?.equippedAccessories ?? null,
    // The dance emotes they own, for the showcase a visitor can play from
    // their profile (FriendDancesModal.jsx). Server-written only — see
    // economy.js's logWorkout/purchaseItem — so unlike the equipped
    // fields there is no client mirror and no feedPosts fallback: posts
    // snapshot what someone is WEARING, never what they own.
    //
    // Null, not [], for an account whose summary predates this field.
    // "Never published" and "owns nothing" want different copy in the UI,
    // and only the absent case can be repaired by logging a workout.
    unlockedDances: summary?.unlockedDances ?? null,
    // Streak. The feed-post fallback is real here, unlike for
    // unlockedDances: logWorkout stamps currentStreak onto every post,
    // so a friend whose summary predates this field still shows fire
    // from their latest post.
    currentStreak: summary?.currentStreak ?? latestPost?.currentStreak ?? 0,
    // The routines they chose to show. Summary only — a feed post carries
    // what they LIFTED, never their library — and absent for anyone who
    // has published none, which sanitizeFriendData turns into an empty
    // list and PublicFriendProfile renders as no section at all.
    //
    // Without this line the whole publish→copy loop is invisible: the
    // document has the field, the sanitiser looks for it, and the hook in
    // between never passed it on.
    savedWorkouts: summary?.savedWorkouts ?? null,
    // Trophies, published by logWorkout as the same { id, at } shape the
    // private doc holds.
    badges: summary?.badges ?? null,
    // Which three they chose to show; null falls back to their best three.
    featuredBadges: summary?.featuredBadges ?? null,
    // Coaching accounts start at buff — see TRAINER_MIN_STAGE.
    minStage: summary?.minStage ?? latestPost?.minStage ?? 1,
    // And the threshold scale their tier was decided with, from the same
    // two sources; absent before the female-scale deploy, when the
    // sanitiser falls back to their mascot.
    progressionScale: summary?.progressionScale ?? latestPost?.progressionScale ?? null,
    // Which character to draw them as. logWorkout and setSharePRs publish
    // it on the summary and every post snapshots it, so either source
    // will do; both are absent for an account that has never trained,
    // which resolveMascotId (inside sanitizeFriendData) lands on Jimmy.
    // Before this line neither source reached the sanitiser at all, and
    // every friend was drawn as Jimmy whatever they had chosen.
    mascot: summary?.mascot ?? latestPost?.mascot ?? null,
    // The post itself, for the profile's Activity section. Raw here on
    // purpose — the allowlist in sanitizeFriendData decides which of its
    // fields reach the screen.
    latestPost,
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
