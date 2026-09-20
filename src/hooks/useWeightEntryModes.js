import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { ENTRY_MODE_SMART, ENTRY_MODE_TOTAL } from '../utils/setLoad';

// Which exercises the lifter has switched to "just give me the total".
//
// A device preference, not workout data: it lives in localStorage under
// ONE key holding `{ [exerciseId]: 'total' }`, and only overrides are
// stored — the smart mode is the absence of an entry, so the map stays
// the size of the lifter's habits rather than the catalog. Owned by the
// SCREEN (the logger, the History editor) and handed down to each card,
// never called per card: two hook instances on the same key would each
// hold their own copy of the map and the second toggle would overwrite
// the first (useLocalStorage only syncs across tabs, not within one).
//
// Not namespaced by uid, like the other UI habits here (`chill-mode-for`,
// `jimmys-priority-sort`): it describes how a person reads a rack, and
// says nothing about any account's data.
const STORAGE_KEY = 'weight-entry-modes';

export function useWeightEntryModes() {
  const [modes, setModes] = useLocalStorage(STORAGE_KEY, {});

  const modeFor = useCallback(
    (exerciseId) => (modes?.[exerciseId] === ENTRY_MODE_TOTAL ? ENTRY_MODE_TOTAL : ENTRY_MODE_SMART),
    [modes],
  );

  const setModeFor = useCallback(
    (exerciseId, mode) => {
      if (!exerciseId) return;
      setModes((prev) => {
        const next = { ...(prev && typeof prev === 'object' ? prev : {}) };
        if (mode === ENTRY_MODE_TOTAL) next[exerciseId] = ENTRY_MODE_TOTAL;
        else delete next[exerciseId];
        return next;
      });
    },
    [setModes],
  );

  return { modeFor, setModeFor };
}
