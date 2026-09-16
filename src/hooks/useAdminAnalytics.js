import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// The Admin dashboard's data. One callable, one payload — see
// functions/adminAnalytics.js for why none of this can be a client-side
// Firestore query.
//
// `sortBy` is a server argument rather than a client-side re-sort of what
// we already hold, because the table is a TOP N of the whole database:
// re-sorting twenty rows locally would just reorder the twenty people who
// happened to top the other metric, which is a different and quietly wrong
// list. Switching the sort therefore costs a round trip, and that is
// correct.
export function useAdminAnalytics({ enabled = true, limit = 20 } = {}) {
  const [sortBy, setSortBy] = useState('workouts');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  // Bumped to force a refetch without changing any input.
  const [refreshKey, setRefreshKey] = useState(0);
  // Guards against a slow response from an earlier sort landing after a
  // faster later one and overwriting it — the dashboard would then show
  // rows that disagree with the highlighted sort pill.
  const requestId = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = ++requestId.current;
    let cancelled = false;
    setLoading(true);
    setError(null);
    httpsCallable(functions, 'adminAnalytics')({ sortBy, limit })
      .then(({ data: payload }) => {
        if (cancelled || id !== requestId.current) return;
        setData(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled || id !== requestId.current) return;
        // permission-denied is the expected answer for everyone who is not
        // the admin, and it is worth saying plainly rather than as a raw
        // Firebase string — this screen is reachable by typing the URL.
        setError(
          err?.code === 'functions/permission-denied'
            ? 'This account is not an admin.'
            : (err?.message ?? 'Could not load analytics.'),
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, sortBy, limit, refreshKey]);

  const reload = useCallback(() => setRefreshKey((n) => n + 1), []);

  return { data, loading, error, reload, sortBy, setSortBy };
}
