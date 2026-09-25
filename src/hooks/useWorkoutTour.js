import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { WORKOUT_TOUR_STEPS } from '../data/workoutTour';

// Runs the first-workout tour exactly once, then never again.
//
// ── THE FLAG ────────────────────────────────────────────────────────────
//
// Same shape and same namespacing as the app's other "has this person
// already seen X" flags (`jimmy-welcome-seen:`, `notif-prompt-seen:`):
// localStorage, keyed by uid so two accounts on one phone each get their
// own first workout. It is the `hasSeenWorkoutTutorial` boolean, under the
// naming this codebase already uses.
//
// It is written when the tour OPENS, not when it finishes. "Strictly once"
// is the requirement, and the alternative — write on the last step — means
// a tab closed mid-tour, a crash, or a phone call replays the whole thing
// on the next session. Better to under-show a tutorial than to nag.
const storageKeyFor = (uid) => `workout-tutorial-seen:${uid ?? 'anon'}`;

// How long `eligible` must hold before the tour opens.
//
// The real reason: the workout history behind `eligible` comes from a
// Firestore listener (useCloudWorkoutHistory) that publishes an empty
// array until its first snapshot lands — so for a moment after launch
// EVERY account looks like it has never trained. A session started from a
// saved routine mounts the logger with its exercises already in place, so
// without a pause a returning lifter could catch a beginner's tour inside
// that window. The delay is longer than a snapshot and far shorter than
// any real interaction, and if history arrives during it `eligible` goes
// false and the effect's cleanup cancels the whole thing.
//
// The second reason is cosmetic and would not justify it alone: an
// overlay that appears in the same frame as the exercise you just picked
// reads as a glitch. A beat later, it reads as a response.
const ARM_DELAY_MS = 900;

// Steps whose target is actually on screen right now, in order. The bulb
// only exists for exercises the catalog has tips for; +DS only once a set
// row is rendered. Snapshotting at open time is what lets the counter say
// an honest "2 of 3" instead of numbering against steps nobody will see.
function stepsOnScreen() {
  return WORKOUT_TOUR_STEPS.filter((step) => document.querySelector(step.target));
}

// An escape hatch for looking at the tour after you have already seen it:
// /workout?tour=1 runs it regardless of the flag and of how many workouts
// the account has. It does not write the flag either, so it can be run as
// often as you like. Nothing links to it — it exists so this feature can
// be checked without hand-editing localStorage.
function forcedByUrl() {
  try {
    return new URLSearchParams(window.location.search).get('tour') === '1';
  } catch {
    return false;
  }
}

// `eligible` is the caller's answer to "is this that person's first
// workout, and is there anything on screen to point at yet" — see
// ActiveWorkoutLogger, which is the only place that can see both.
export function useWorkoutTour({ uid, eligible }) {
  const [seen, setSeen] = useLocalStorage(storageKeyFor(uid), false);
  // The run: the steps this particular tour will walk, or null when no
  // tour is open. Held together with the cursor so the two can never
  // disagree about how long the list is.
  const [run, setRun] = useState(null); // { steps, index } | null
  // One tour per mount, latched the moment one opens.
  //
  // `seen` normally does this job, but it cannot do it alone in either of
  // the two cases where it is not the thing being read: ?tour=1 ignores
  // the flag by design, so without this the tour restarts 900ms after its
  // own last step, forever. And a browser with localStorage blocked keeps
  // the flag in memory only, where a remount would lose it. The ref is
  // "has this screen already done it"; the flag is "has this account".
  const opened = useRef(false);

  useEffect(() => {
    const forced = forcedByUrl();
    if (run || opened.current || (!forced && (seen || !eligible))) return undefined;
    const timer = setTimeout(() => {
      const steps = stepsOnScreen();
      // Nothing to point at — leave the flag alone and let a later render
      // arm it instead of burning the one run on an empty screen.
      if (steps.length === 0) return;
      opened.current = true;
      if (!forced) setSeen(true);
      setRun({ steps, index: 0 });
    }, ARM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [run, seen, eligible, setSeen]);

  // Advance, or close on the last step. The cursor only ever moves
  // forward, so this always terminates — which matters because the
  // overlay also calls it when a target has gone missing under it.
  const next = useCallback(() => {
    setRun((current) => {
      if (!current) return current;
      const index = current.index + 1;
      return index >= current.steps.length ? null : { ...current, index };
    });
  }, []);

  const dismiss = useCallback(() => setRun(null), []);

  return {
    step: run ? run.steps[run.index] : null,
    stepNumber: run ? run.index + 1 : 0,
    stepCount: run ? run.steps.length : 0,
    next,
    dismiss,
  };
}
