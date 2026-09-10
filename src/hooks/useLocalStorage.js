import { useEffect, useRef, useState } from 'react';
import { loadJSON, saveJSON } from '../lib/storage';

// Generic persisted-state hook: behaves like useState but every value is
// mirrored into localStorage under `storageKey`.
//
// `storageKey` can change at runtime — every caller in this app now
// namespaces it by uid (e.g. `active-workout:${uid}`) so a second account
// signed in on the same browser doesn't see the first account's data. But
// `useState`'s lazy initializer only ever runs on first mount, and `App`
// itself never remounts when a different account signs in — it just
// re-renders with a new `uid`. Without the check below, the in-memory
// `value` from account A would sit there unchanged, and the save effect
// would dutifully write it under account B's brand-new key the instant
// they sign in: a subtler version of the exact cross-account leak the
// namespacing was meant to fix. So: when `storageKey` itself changes,
// re-hydrate from the NEW key's own storage instead of persisting the old
// key's leftover value onto it.
export function useLocalStorage(storageKey, initialValue) {
  const [value, setValue] = useState(() => loadJSON(storageKey, initialValue));
  const prevKeyRef = useRef(storageKey);

  useEffect(() => {
    if (prevKeyRef.current !== storageKey) {
      prevKeyRef.current = storageKey;
      setValue(loadJSON(storageKey, initialValue));
      return; // don't also save this render — it holds the OLD key's value
    }
    saveJSON(storageKey, value);
    // initialValue is intentionally not a dependency — it's typically a
    // fresh literal ([]/null/{...}) each render and only matters as a
    // fallback the moment the key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, value]);

  return [value, setValue];
}
