import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// Username search, backed by the searchUsers callable.
//
// Not a Firestore query, and it cannot be one: `users/{uid}` is readable
// by its owner and a connected trainer only, and Firestore refuses a whole
// collection query unless the rule can be proven from the query's own
// filters alone. A `where('displayName', ...)` range says nothing about
// ownership, so it 403s before reading a row. See functions/userSearch.js
// for the full reasoning and what the server does instead.
//
// The debounce is the reason this hook exists at all rather than a call
// in the component: every keystroke would otherwise be a round trip AND a
// read of every user document.
export const SEARCH_DEBOUNCE_MS = 500;
// Matches MIN_TERM in functions/userSearch.js. Duplicated on purpose — the
// server enforces it (it is the one that pays for the reads), and the
// client knows it only so the UI can stay quiet instead of firing calls
// that are guaranteed to return nothing.
export const MIN_SEARCH_LENGTH = 2;

export function useFriendSearch() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Two separate guards, doing two different jobs:
  //
  //   `timer`   collapses a burst of keystrokes into one call.
  //   `queryId` throws away a response that arrives after a newer one.
  //
  // The second is not covered by the first. Debouncing only spaces calls
  // out; it cannot stop a slow "da" from landing after a fast "dana" and
  // repainting the list with stale results — which is the classic search
  // race, and it looks exactly like the search box being broken.
  const timer = useRef(null);
  const queryId = useRef(0);

  const run = useCallback(async (raw) => {
    const trimmed = raw.trim();
    const id = ++queryId.current;
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await httpsCallable(functions, 'searchUsers')({ term: trimmed });
      if (id !== queryId.current) return;
      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch (err) {
      if (id !== queryId.current) return;
      setError(err?.message ?? 'Search failed — try again.');
      setResults([]);
    } finally {
      if (id === queryId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    const trimmed = term.trim();
    // Clearing the box empties the list immediately rather than half a
    // second later — there is nothing to wait for, and a stale list under
    // an empty input reads as a bug.
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      queryId.current += 1; // cancel anything in flight
      setResults([]);
      setLoading(false);
      return;
    }
    // Shown from the first keystroke, not when the request leaves, so the
    // spinner covers the debounce window too. Otherwise the UI sits
    // completely still for 500ms after typing and feels dead.
    setLoading(true);
    timer.current = setTimeout(() => run(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [term, run]);

  // Marks one row as requested without refetching. The server decides
  // this on the next search; this is just so the button that was pressed
  // stays pressed for the rest of the session.
  const markRequested = useCallback((uid) => {
    setResults((prev) => prev.map((r) => (r.uid === uid ? { ...r, requestSent: true } : r)));
  }, []);

  return { term, setTerm, results, loading, error, markRequested };
}
