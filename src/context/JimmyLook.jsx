import { createContext, useContext, useMemo } from 'react';
import { readEquippedAccessories } from '../data/storeItems';
import { DEFAULT_MASCOT_ID, resolveMascotId } from '../data/mascots';

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
const JimmyLookContext = createContext({
  evolutionStage: 1,
  equippedAccessories: EMPTY,
  streak: 0,
  mascot: DEFAULT_MASCOT_ID,
});

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
  // Server-written (functions/economy.js's logWorkout), so it arrives on
  // the account doc alongside everything else here and needs no separate
  // listener. Published as the raw NUMBER now rather than a pre-derived
  // boolean: the aura has three tiers (utils/streak.js), so the length is
  // the thing the avatar needs. Still shaped as props, which is what lets
  // `<JimmyAvatar {...useJimmyLook()} />` keep working untouched — that is
  // the whole reason this context hands over a props-shaped object.
  const currentStreak = Number(account?.currentStreak) || 0;
  // Which character this account wears. Resolved here — once, from the one
  // document that holds both the explicit `mascot` field and the `gender`
  // it falls back to — rather than at each of the five screens that draw
  // your own avatar, all of which get it for free through the
  // `{...useJimmyLook()}` spread they already use. Derived to a plain
  // string first so it is a stable dependency: `account` is a new object
  // on every Firestore snapshot, the same reason `key` exists above.
  const mascot = resolveMascotId(account);
  const value = useMemo(
    () => ({
      evolutionStage,
      equippedAccessories: key ? key.split(',') : EMPTY,
      currentStreak,
      streak: currentStreak,
      mascot,
    }),
    [evolutionStage, key, currentStreak, mascot],
  );

  return <JimmyLookContext.Provider value={value}>{children}</JimmyLookContext.Provider>;
}

// Spread straight into the avatar at the call site —
// `<JimmyAvatar {...useJimmyLook()} size="lg" />` — so it stays visible in
// the JSX that this is the current user's goat and not an arbitrary one.
export function useJimmyLook() {
  return useContext(JimmyLookContext);
}
