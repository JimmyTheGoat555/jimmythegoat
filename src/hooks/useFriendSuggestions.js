import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// Friends of your friends, from the suggestFriends callable.
//
// A one-shot fetch rather than an onSnapshot like the rest of this app's
// hooks, because there is no document to listen to: the list is computed
// across other people's private docs by the Admin SDK and never persisted
// anywhere the client could subscribe to. Refetched when your own friend
// count changes — accepting or sending a request is exactly what makes
// the previous answer stale.
//
// `dismiss` only edits the local copy. There is no server-side "not
// interested" record, so a dismissed suggestion comes back on the next
// fetch; storing that properly means a new collection and a new write
// path, which this does not pretend to have.
export function useFriendSuggestions({ enabled = true, friendCount = 0 } = {}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Guards against a slow response from a previous friendCount landing
  // after a newer one and overwriting it — the classic out-of-order fetch,
  // which is easy to hit here because accepting a request fires a refetch
  // while the first one may still be in the air.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setSuggestions([]);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await httpsCallable(functions, 'suggestFriends')();
      if (id !== requestId.current) return;
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (err) {
      if (id !== requestId.current) return;
      // Suggestions are a nicety — a failure here should cost the user a
      // carousel, never an error banner over the whole Social tab.
      setError(err?.message ?? 'Could not load suggestions.');
      setSuggestions([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
    // friendCount, not the friends array: the array is a fresh object on
    // every snapshot, and refetching on identity would hammer a callable.
  }, [load, friendCount]);

  const dismiss = useCallback((uid) => {
    setSuggestions((prev) => prev.filter((s) => s.uid !== uid));
  }, []);

  return { suggestions, loading, error, dismiss, refresh: load };
}
