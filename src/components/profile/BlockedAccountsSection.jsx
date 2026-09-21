import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useModerationActions } from '../../context/Moderation';

// Settings → Blocked accounts: the only place a block can be undone.
//
// It has to exist, and not only because an app that can block without
// unblocking is a bad app. Every OTHER surface that shows somebody's name
// filters blocked accounts out, which is the whole point — so once you
// have blocked someone they are, by construction, nowhere you could tap a
// ⋯ next to them. Their profile URL still works if you kept the link, but
// nobody keeps the link. This list is the way back.
//
// Firestore's `in` operator caps at 30, the same ceiling useFriendsGraph
// and useFeed work around; the block list is capped at 500 (MAX_BLOCKED),
// so it chunks.
const FIRESTORE_IN_LIMIT = 30;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

export default function BlockedAccountsSection() {
  const { blockedUids, unblockUser } = useModerationActions();
  // uid → displayName, resolved through `friendCodes` — the same public
  // lookup table the friends list uses to turn bare uids into names, and
  // the only one a client may read for an account that is not its own.
  // A blocked account is very often NOT a friend (a stranger's request,
  // somebody from the leaderboard), so nothing else would resolve it.
  const [names, setNames] = useState({});
  const [busyUid, setBusyUid] = useState(null);
  const [error, setError] = useState(null);
  // Joined rather than the array itself: `blockedUids` is derived from a
  // Firestore snapshot, so its identity changes far more often than its
  // contents.
  const blockedKey = blockedUids.join(',');

  useEffect(() => {
    const uids = blockedKey ? blockedKey.split(',') : [];
    if (uids.length === 0) {
      setNames({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(
      chunk(uids, FIRESTORE_IN_LIMIT).map((ids) => getDocs(query(collection(db, 'friendCodes'), where('uid', 'in', ids)))),
    )
      .then((snaps) => {
        if (cancelled) return;
        const next = {};
        for (const snap of snaps) {
          for (const d of snap.docs) {
            const data = d.data();
            if (data?.uid) next[data.uid] = data.displayName;
          }
        }
        setNames(next);
      })
      // A name we cannot resolve is not a reason to hide the row — the
      // whole job of this list is to let you undo a block, and that works
      // on the uid. It just falls back to "Blocked account" below.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [blockedKey]);

  const handleUnblock = async (uid) => {
    setBusyUid(uid);
    setError(null);
    try {
      await unblockUser(uid);
    } catch {
      setError("Couldn't unblock — check your connection and try again.");
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <section className="py-4 flex flex-col gap-1">
      <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-1">Blocked Accounts</p>
      {blockedUids.length === 0 ? (
        <p className="text-xs text-neutral-500">
          You haven't blocked anyone. Use the ⋯ beside someone's name to block or report them.
        </p>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            They cannot reach you and you will not see anything they post. Unblocking does not tell them.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {blockedUids.map((uid) => (
              <li
                key={uid}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">
                  {names[uid] ?? 'Blocked account'}
                </span>
                <button
                  type="button"
                  disabled={busyUid === uid}
                  onClick={() => handleUnblock(uid)}
                  className="shrink-0 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-[var(--ember)] transition active:scale-[0.97] disabled:opacity-50"
                >
                  {busyUid === uid ? 'Unblocking…' : 'Unblock'}
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
        </>
      )}
    </section>
  );
}
