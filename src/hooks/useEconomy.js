import { useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { reconcileWorkoutLoads } from '../utils/setLoad';

// Thin wrapper around the two server-side economy entry points (see
// functions/economy.js) — this hook holds NO local balance/inventory state
// of its own. `coins`/`unlockedDances`/`unlockedAccessories` already live
// on the user's own Firestore doc and arrive for free through useAuth's
// live `profile` listener the instant the Cloud Function updates them;
// duplicating that into a second piece of state here would just be one
// more thing that could drift out of sync with the source of truth.
export function useEconomy(uid) {
  // A logged-out call is meaningless (there's no uid to credit), but the
  // callable's own `request.auth` check on the server is the real
  // guard — this is just avoiding a doomed network round trip.
  const logWorkout = useCallback(async (workout, { sharePersonalRecords = false, sharedRecordExerciseIds = null } = {}) => {
    const call = httpsCallable(functions, 'logWorkout');
    const { data } = await call({
      // Sent through reconcileSetLoad on the way out — see utils/setLoad.js.
      // The live workout object is handed over as-is otherwise, which is
      // fine for a set this build wrote (the patch builders keep `weight`
      // and its context in agreement) and not fine for a draft restored
      // from localStorage that an older build left behind: its stale
      // barWeight/perHandWeight describe a load the weight no longer has,
      // the server reads the context rather than the weight, and a finish
      // that should have been a 40 kg set is either scored wrong or
      // refused outright for being over 250 kg.
      exercises: reconcileWorkoutLoads(workout.exercises),
      startedAt: workout.startedAt,
      assignedWorkoutId: workout.assignedWorkoutId ?? null,
      // The saved routine this session was loaded from. The server uses it
      // to look up whether a friend recommended it — and to look up WHO,
      // which is why the sender's uid is deliberately not sent from here.
      templateId: workout.templateId ?? null,
      // Whether to call out any personal records on the feed post this
      // workout produces regardless. The server decides WHAT the records
      // are — see functions/records.js — this only answers "announce them?".
      sharePersonalRecords,
      // WHICH of them, by exercise id — the per-record checkboxes on the
      // summary screen. An empty array is a real answer ("share none"),
      // which is why it is only omitted when genuinely absent: sending
      // null instead would read on the server as "no choice made" and fall
      // back to the boolean above. Ids can only narrow the server's own
      // list, never extend it (functions/economy.js's selectedRecords).
      ...(Array.isArray(sharedRecordExerciseIds) ? { sharedRecordExerciseIds } : {}),
    });
    return data; // { workoutId, coinsEarned, personalRecords, recoveryWorkout, neglectPenaltyLifted, newBadges, firstWorkoutReward }
  }, []);

  // Phase 2b of the finish flow. The feed post already exists, written by
  // logWorkout with NO records attached; this adds the ones the lifter
  // ticked. See functions/publishRecords.js for why it has to work in that
  // direction — the answer arrives after the post, and publishing first to
  // retract later would mean a friend's live feed had already shown it.
  const publishWorkoutRecords = useCallback(async (workoutId, exerciseIds) => {
    const call = httpsCallable(functions, 'publishWorkoutRecords');
    const { data } = await call({ workoutId, exerciseIds });
    return data; // { published }
  }, []);

  const purchaseItem = useCallback(async (itemId) => {
    const call = httpsCallable(functions, 'purchaseItem');
    const { data } = await call({ itemId });
    return data; // { newBalance, unlocked }
  }, []);

  // Equipping isn't an economic action (no balance/inventory change) so,
  // unlike the two calls above, this is a plain client write rather than a
  // Cloud Function — firestore.rules' equippedFieldsValid() is the actual
  // guard (you can only ever equip an id already in your own unlocked
  // list), which a normal owner-gated update can enforce on its own.
  const equipItem = useCallback(
    async (field, itemId) => {
      await updateDoc(doc(db, 'users', uid), { [field]: itemId });
      // Best-effort mirror into the public summary a friend's profile
      // reads (see hooks/useFriendProfile.js) — so equipping something
      // shows up there right away instead of waiting for the next logged
      // workout to refresh it. Swallowed on failure the same way the
      // friendCode self-heal elsewhere in this app is: the only way this
      // throws is public/summary not existing yet (nobody has logged a
      // workout, so there's nothing on a friend's profile to update
      // anyway — logWorkout will create it, equipped fields included, the
      // first time they do).
      updateDoc(doc(db, 'users', uid, 'public', 'summary'), { [field]: itemId }).catch(() => {});
    },
    [uid],
  );

  // Accessories are multi-slot (head/eyes/neck — see data/storeItems.js),
  // so unlike a dance this writes a whole array rather than one id. The
  // slot rule itself lives in equipAccessory/unequipAccessory as pure
  // functions over that array, so "a second hat replaces the first" is
  // decided in one testable place rather than inside a click handler.
  //
  // Same plain-client-write model as equipItem above, for the same reason:
  // firestore.rules' equippedFieldsValid() enforces that every id in the
  // array is actually owned, which an owner-gated update can check on its
  // own. Nothing here can mint or spend.
  const setEquippedAccessories = useCallback(
    async (nextIds) => {
      await updateDoc(doc(db, 'users', uid), { equippedAccessories: nextIds });
      // Best-effort mirror so a friend's profile/leaderboard row and the
      // feed reflect the change immediately — same swallow-on-failure
      // reasoning as equipItem's mirror above.
      updateDoc(doc(db, 'users', uid, 'public', 'summary'), { equippedAccessories: nextIds }).catch(() => {});
    },
    [uid],
  );

  // Which three badges the profile shows. Same plain-write + best-effort
  // public mirror as equipItem above: it is a display preference over ids
  // the server awarded, not a claim to have earned anything, so it needs
  // no callable.
  const setFeaturedBadges = useCallback(
    async (ids) => {
      const next = (Array.isArray(ids) ? ids : []).slice(0, 3);
      await updateDoc(doc(db, 'users', uid), { featuredBadges: next });
      updateDoc(doc(db, 'users', uid, 'public', 'summary'), { featuredBadges: next }).catch(() => {});
    },
    [uid],
  );

  return {
    logWorkout,
    publishWorkoutRecords,
    purchaseItem,
    equipItem,
    setEquippedAccessories,
    setFeaturedBadges,
  };
}
