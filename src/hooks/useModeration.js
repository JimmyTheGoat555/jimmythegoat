import { useCallback, useMemo } from 'react';
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MAX_BLOCKED, readBlockedUids, reportDocId } from '../utils/moderation';

// Blocking and reporting another account — the writes behind the ⋯ menu
// (components/social/UserActionsMenu.jsx). See utils/moderation.js for the
// model and why it is shaped this way; the filtering itself lives in
// App.jsx, which owns every list these results feed.
//
// Both writes are plain client writes, NOT callables, and that is a
// deliberate departure from how the rest of this app's social actions work
// (friending, nudging and recommending all go through Cloud Functions).
// Two reasons:
//
//   * Neither one can be abused into someone else's data. A block only
//     ever edits an array on your OWN doc, and firestore.rules pins a
//     report's `reporterUid` to the caller — there is nothing here a
//     server round trip would be checking that the rules cannot.
//   * It ships independently. The functions deploy for this app is held
//     until the App Store release (see ARCHITECTURE.md §13), and the one
//     feature that exists to GET through review must not be stuck behind
//     it. `firebase deploy --only firestore:rules` is all this needs.
//
// `account` is the live users/{uid} doc from useAuth — `blockedUsers`
// arrives on its existing listener, so this hook opens none of its own.
export function useModeration(uid, account) {
  // Keyed on the joined list rather than the array itself: a profile
  // snapshot hands back a new array identity on every update, even ones
  // that never touch this field (coins ticking up from a workout), and
  // everything downstream of this — the feed's live query included — is
  // memoized on it. Same reason useFeed and useFriendsGraph build their
  // own `friendUidsKey`.
  const blockedKey = Array.isArray(account?.blockedUsers) ? account.blockedUsers.join(',') : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- blockedKey IS the contents of account.blockedUsers
  const blockedUids = useMemo(() => readBlockedUids(account), [blockedKey]);

  const blockUser = useCallback(
    async (targetUid) => {
      if (!uid || !targetUid) return;
      // Blocking yourself would hide your own posts from your own feed.
      // The UI never offers it (the ⋯ is not drawn on your own row), so
      // this is the belt to that braces — and firestore.rules refuses it
      // outright as well.
      if (targetUid === uid) return;
      if (blockedUids.length >= MAX_BLOCKED && !blockedUids.includes(targetUid)) {
        throw new Error(`You can block up to ${MAX_BLOCKED} accounts.`);
      }
      // arrayUnion, not a read-modify-write: blocking the same person from
      // two screens at once is a no-op rather than a lost update, and
      // nothing here needs to know the list's previous contents.
      await updateDoc(doc(db, 'users', uid), { blockedUsers: arrayUnion(targetUid) });
    },
    [uid, blockedUids],
  );

  const unblockUser = useCallback(
    async (targetUid) => {
      if (!uid || !targetUid) return;
      await updateDoc(doc(db, 'users', uid), { blockedUsers: arrayRemove(targetUid) });
    },
    [uid],
  );

  // One document per (reporter, reported) pair — the id is deterministic,
  // which is what stops a tampered client filling the collection. A second
  // report from the same person about the same person UPDATES that row
  // with the newer reason and time rather than adding another: the row
  // records who, about whom, why and when it last happened, and how many
  // times one person pressed the button is not evidence of anything.
  //
  // `reportedName` is a snapshot, on purpose. A name is the single most
  // reported thing in this app, and the account can change it (once) the
  // moment it is reported — without this the record would point at a
  // username nobody can see any more.
  //
  // Timestamps are serverTimestamp(), not new Date(): this is the one kind
  // of document in the app where the writer has a motive to lie about when
  // something happened, and firestore.rules pins it to request.time.
  const reportUser = useCallback(
    async (targetUid, { reason, details = '', reportedName = '', surface = '' } = {}) => {
      if (!uid || !targetUid) return;
      if (targetUid === uid) return;
      await setDoc(
        doc(db, 'reports', reportDocId(uid, targetUid)),
        {
          reporterUid: uid,
          reportedUid: targetUid,
          reason,
          // Trimmed and capped here as well as in the rules — a textarea
          // is the one field on this sheet somebody can paste a novel into.
          details: String(details).trim().slice(0, 300),
          reportedName: String(reportedName).slice(0, 60),
          // Which screen it was reported from. Worth a field: "reported
          // from the inbox" means the 140-character note is the complaint,
          // while "reported from the leaderboard" can only be the name.
          surface,
          reportedAt: serverTimestamp(),
        },
        { merge: true },
      );
    },
    [uid],
  );

  // Memoized as one object because it is published on a context
  // (context/Moderation.jsx) that every ⋯ menu on screen subscribes to. A
  // fresh object here would re-render all of them on every App render —
  // and App re-renders once a second while a rest timer is running.
  return useMemo(
    () => ({ blockedUids, blockUser, unblockUser, reportUser }),
    [blockedUids, blockUser, unblockUser, reportUser],
  );
}
