import { createContext, useContext, useMemo } from 'react';
import { readEquippedAccessories } from '../data/storeItems';

// What the SIGNED-IN user's Jimmy looks like: his evolution stage and the
// gear he has equipped. The two values always travel together (they are
// the complete input to JimmyAvatar) and always come from one source, so
// they are published once here instead of being threaded through every
// screen that happens to draw him.
//
// Scoped on purpose. This is YOUR goat, and only yours — a leaderboard
// row, a feed post and a friend's profile all draw somebody ELSE's, from
// data that arrives with that row. Those call sites pass explicit props
// and must never read this context; if they did, the bug would be
// invisible (everyone would quietly be wearing your hat) rather than
// loud. That is also why JimmyAvatar itself is NOT context-aware: a
// component that silently falls back to "the current user" turns a
// forgotten prop into wrong data instead of an obvious blank.
const EMPTY = [];
const JimmyLookContext = createContext({ evolutionStage: 1, equippedAccessories: EMPTY });

export function JimmyLookProvider({ evolutionStage, account, children }) {
  // readEquippedAccessories also folds in the pre-multi-slot
  // `equippedAccessory` string, so accounts that predate slots still wear
  // their one item.
  const equipped = readEquippedAccessories(account);
  // Keyed on the joined ids rather than the array identity: the account doc
  // is re-created on every Firestore snapshot, so the array is a new object
  // many times a session while its contents almost never change. Without
  // this every avatar on screen re-renders on every snapshot.
  const key = equipped.join(',');
  const value = useMemo(
    () => ({ evolutionStage, equippedAccessories: key ? key.split(',') : EMPTY }),
    [evolutionStage, key],
  );

  return <JimmyLookContext.Provider value={value}>{children}</JimmyLookContext.Provider>;
}

// Spread straight into the avatar at the call site —
// `<JimmyAvatar {...useJimmyLook()} size="lg" />` — so it stays visible in
// the JSX that this is the current user's goat and not an arbitrary one.
export function useJimmyLook() {
  return useContext(JimmyLookContext);
}
