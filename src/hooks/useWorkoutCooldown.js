import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

// How long the Workout tab stays locked after a logged session.
//
// MUST MATCH functions/storeCatalog.js's WORKOUT_COOLDOWN_MS. Duplicated
// rather than fetched, the same way evolutionTiers.js duplicates the
// neglect threshold: the server's copy is the authority (it is the one
// that can actually refuse a workout) and this one exists so the UI can
// say no BEFORE someone spends an hour logging sets that get rejected on
// submit. If the two ever drift, the server wins and the user sees the
// old failure — so change them together.
export const WORKOUT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

// H:MM:SS over an hour, MM:SS under it. Padded so the digits do not jump
// width as they count down — with tabular-nums that keeps the clock
// visually still, which is most of what makes it read as a clock.
function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Is this account allowed to start a workout right now, and if not, when?
//
// Reads users/{uid}/meta/economy — the SAME document logWorkout enforces
// against (its `recentWorkoutLogs` trail), not a separate count derived
// from the workouts collection. That matters: a doc the server owns and
// the client can only read (firestore.rules blocks every client write to
// meta/economy) means the countdown on screen and the rule on the server
// cannot disagree about when the next session unlocks. Deriving it from
// `workouts` instead would drift the moment anything edits history.
//
// There used to be two rules to model here — a 1h gap and a cap of 2 per
// rolling 24h — which is why the original brief asked for both an
// `isHourCooldown` and an `isDailyLimitReached`. The cap is gone; there is
// one number now, so there is one state, and a `isDailyLimitReached` that
// can never be true would just be a lie the next reader has to disprove.
export function useWorkoutCooldown(uid) {
  const [lastWorkoutMs, setLastWorkoutMs] = useState(null);
  // Distinct from "not cooling down": until the economy doc has been read
  // once we do not know, and the two must not look the same. Guessing
  // "free to train" during that window is how someone taps into a session
  // they are about to lose.
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!uid) {
      setLastWorkoutMs(null);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return onSnapshot(
      doc(db, 'users', uid, 'meta', 'economy'),
      (snap) => {
        const logs = snap.data()?.recentWorkoutLogs;
        // Newest wins rather than last-in-array: the server writes these
        // sorted, but a countdown is not the place to rely on that.
        const newest = Array.isArray(logs)
          ? logs.map((iso) => Date.parse(iso)).filter(Number.isFinite).sort((a, b) => b - a)[0]
          : undefined;
        setLastWorkoutMs(Number.isFinite(newest) ? newest : null);
        setLoading(false);
      },
      // A read failure must never lock anyone out of training. The server
      // still enforces the real rule, so failing open here costs at worst
      // the old behaviour (a rejection at submit) for the rare account
      // whose listener is broken — failing closed would refuse workouts to
      // someone who is perfectly entitled to one.
      () => {
        setLastWorkoutMs(null);
        setLoading(false);
      },
    );
  }, [uid]);

  const unlocksAt = lastWorkoutMs === null ? null : lastWorkoutMs + WORKOUT_COOLDOWN_MS;
  const remainingMs = unlocksAt === null ? 0 : Math.max(0, unlocksAt - now);
  const isCoolingDown = !loading && remainingMs > 0;

  // Ticks only while it is counting; the moment it reaches zero
  // isCoolingDown flips false and this clears itself. Keyed on the boolean,
  // not on `now`, so the interval is created once per cooldown rather than
  // torn down and rebuilt every second.
  useEffect(() => {
    if (!isCoolingDown) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCoolingDown]);

  return {
    loading,
    isCoolingDown,
    remainingMs,
    remaining: formatRemaining(remainingMs),
    unlocksAt,
  };
}
