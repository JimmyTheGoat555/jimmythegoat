import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';

// Firestore's `in` operator caps out at 30 values — following more than
// that just means the oldest-added past #30 don't resolve to a name. Fine
// at this app's scale; would need real pagination/denormalization to lift.
const FIRESTORE_IN_LIMIT = 30;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

// Real, Firestore-backed replacement for the old useFriends.js (deleted —
// it managed a purely local, per-device mock friends list with
// deterministically-faked stats; see socialMock.js's history). `friends`
// on users/{uid} is now a MUTUAL relationship that requires the other
// side's approval — see social.js and firestore.rules'
// users/{uid}/friendRequests — so every mutation here is a Cloud Function
// call, never a direct client write to either doc.
export function useFriendsGraph(uid, friendUids) {
  // Resolves each accepted friend's uid to a {uid, displayName} via the
  // SAME friendCodes lookup table used to find someone to request in the
  // first place — querying it by its `uid` field (not by code) works
  // because its read rule is a bare signedIn() check with no
  // resource.data dependency, the one pattern Firestore can always prove
  // holds for a `list` query. See firestore.rules' friendCodes match.
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  // A new profile snapshot hands back a new array identity for `friends`
  // on every single update (even ones that don't touch it at all) — keying
  // the effect below on this joined string instead of `friendUids` itself
  // avoids re-running this query on every unrelated profile change (e.g.
  // coins ticking up from a workout).
  const friendUidsKey = friendUids?.join(',');

  useEffect(() => {
    if (!friendUids || friendUids.length === 0) {
      setFriends([]);
      return;
    }
    let cancelled = false;
    setLoadingFriends(true);
    Promise.all(
      chunk(friendUids, FIRESTORE_IN_LIMIT).map((ids) =>
        getDocs(query(collection(db, 'friendCodes'), where('uid', 'in', ids))),
      ),
    )
      .then((snaps) => {
        if (cancelled) return;
        setFriends(snaps.flatMap((snap) => snap.docs.map((d) => d.data())));
      })
      // Offline, or a rules refusal. The list simply stays as it was —
      // there is no error state on this hook and a friends row that fails
      // to refresh is not worth one. What the catch is FOR is the
      // unhandled rejection: without it this is the one promise in the app
      // that reaches the window with nobody holding it.
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingFriends(false);
      });
    return () => {
      cancelled = true;
    };
  }, [friendUidsKey]);

  // Incoming pending requests — live, so a request landing while the
  // Social page is open shows up without a refresh.
  const [incomingRequests, setIncomingRequests] = useState([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(collection(db, 'users', uid, 'friendRequests'), (snap) => {
      setIncomingRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [uid]);

  const sendFriendRequest = useCallback(async (code) => {
    const { data } = await httpsCallable(functions, 'sendFriendRequest')({ code });
    return data; // { targetName }
  }, []);

  // Same callable, the other way in — for the Add button on a suggestion
  // card, which knows a uid and has no code to type. The server will only
  // accept a uid that is a friend-of-a-friend of the caller (see
  // functions/friendSuggestions.js's isFriendOfFriend and why), so this is
  // not a way to add an arbitrary stranger by id.
  const sendFriendRequestByUid = useCallback(async (targetUid) => {
    const { data } = await httpsCallable(functions, 'sendFriendRequest')({ targetUid });
    return data; // { targetName }
  }, []);

  const respondToFriendRequest = useCallback(async (fromUid, accept) => {
    const { data } = await httpsCallable(functions, 'respondToFriendRequest')({ fromUid, accept });
    return data; // { accepted }
  }, []);

  // No removeFriend wrapper any more — the unfriend ✕ was taken off the
  // friends list, and an exported call with no caller is a trap for the
  // next person who assumes something still uses it. The callable itself
  // is still deployed (functions/social.js); wiring a new entry point to
  // it is a one-liner if unfriending ever comes back.

  // See functions/nudges.js. Only ever writes to the target's inbox —
  // whether it actually pushes is decided server-side by
  // sendPushOnNotificationCreate, not here.
  const sendNudge = useCallback(async (targetUid, messageId) => {
    const { data } = await httpsCallable(functions, 'sendFriendNudge')({ targetUid, messageId });
    return data; // { sent }
  }, []);

  // See functions/recommendWorkout.js. Takes a templateId rather than the
  // routine itself: the server reads it out of the caller's own templates
  // collection, so what lands in a friend's inbox is provably something
  // this account actually saved, not a payload a tampered client typed.
  const recommendWorkout = useCallback(async (friendUid, templateId, message) => {
    const { data } = await httpsCallable(functions, 'recommendWorkout')({ friendUid, templateId, message });
    return data; // { sent, to }
  }, []);

  return {
    friends,
    loadingFriends,
    incomingRequests,
    sendFriendRequest,
    sendFriendRequestByUid,
    respondToFriendRequest,
    sendNudge,
    recommendWorkout,
  };
}
