import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Every friend's users/{uid}/public/summary, for the leaderboard — the
// tier, streak, gear and name of friends who have NOT posted this week,
// which the feed (the board's other source) cannot supply. Readable by
// anyone signed in, like the feed; see firestore.rules' public/summary.
//
// One getDoc per friend, in parallel, and read ONCE per session: a
// summary only changes when its owner trains or equips something, and
// the board is a glance, not a live ticker — the feed already keeps this
// week's points live. Cached by uid in a ref, so switching tabs or
// gaining a friend costs only the reads for uids not seen yet. A read
// that FAILS is not cached, so a blip retries on the next look.
//
// `enabled` lets the caller hold the reads back until the board is
// actually on screen: the Social tab opens on the feed, and thirty reads
// for a list nobody scrolled to is thirty reads wasted.
export function useFriendSummaries(friendUids, enabled = true) {
  const cache = useRef(new Map());
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(false);
  // Keyed on the joined string, not the array: a profile snapshot hands
  // back a new `friends` identity on every update (same reason as
  // useFeed / useFriendsGraph).
  const friendUidsKey = (friendUids ?? []).join(',');

  useEffect(() => {
    if (!enabled) return;
    const uids = friendUidsKey ? friendUidsKey.split(',').filter(Boolean) : [];
    const publish = () => {
      const next = {};
      for (const uid of uids) if (cache.current.has(uid)) next[uid] = cache.current.get(uid);
      setSummaries(next);
    };
    const missing = uids.filter((uid) => !cache.current.has(uid));
    if (missing.length === 0) {
      publish();
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      missing.map((uid) =>
        getDoc(doc(db, 'users', uid, 'public', 'summary'))
          .then((snap) => (snap.exists() ? snap.data() : null))
          // undefined, distinct from null: "no summary" is a fact worth
          // caching, "could not read it" is not.
          .catch(() => undefined),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        missing.forEach((uid, i) => {
          if (results[i] !== undefined) cache.current.set(uid, results[i]);
        });
        publish();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [friendUidsKey, enabled]);

  return { summaries, loading };
}
