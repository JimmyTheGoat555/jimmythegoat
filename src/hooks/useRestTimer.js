import { useCallback, useEffect, useRef, useState } from 'react';
import { loadJSON } from '../lib/storage';
import { randomRestOverdueMessage } from '../utils/restMessages';
import { playRestAlarm, unlockRestAlarm } from '../utils/restAlarm';
import { DEFAULT_REST_SECONDS } from '../utils/restPresets';
import {
  askRestNotificationPermission,
  cancelRestNotification,
  scheduleRestNotification,
} from '../utils/restNotification';

// Re-exported so nothing that already imports the fallback from here has
// to know it moved; utils/restPresets.js is the single definition, shared
// with the Settings dropdown.
export { DEFAULT_REST_SECONDS };
export const REST_STEP_SECONDS = 30;
// How long the timer can sit at 0:00 before Jimmy's attitude kicks in — the
// grace period the "hit zero" beep/vibrate already covers isn't a nag yet,
// just a heads-up; this is for someone who saw that and kept scrolling.
export const OVERDUE_THRESHOLD_SECONDS = 30;
// How late the in-app alarm may be and still sound. Past this the rest
// ended while the phone was away: the system notification has said so,
// and the red overtime counter now on screen says by how much. A beep
// two minutes after the fact is a startle, not news.
export const MISSED_ALERT_GRACE_SECONDS = 3;
// Same storage key SettingsPanel.jsx's sound-effects switch writes to —
// read directly with loadJSON rather than useLocalStorage: this only
// needs the CURRENT value at the moment the rest period actually ends,
// not a live-updating subscription, and reading it fresh each time (see
// alertRestOver's call site below) means a toggle flipped mid-workout
// takes effect on the very next beep. That mattered more than ever once
// this hook moved up to App: it now only remounts on a full page load, so
// a value captured at mount would be stale for the whole session.
const SOUND_EFFECTS_KEY = 'sound-effects-enabled';

// Vibration always fires — haptic feedback isn't really "sound", and
// muting one shouldn't silently kill the other. Only the beep respects
// the toggle.
//
// The sound itself is utils/restAlarm.js: ONE AudioContext, created and
// unlocked by the tap that started this rest. That replaced a preloaded
// <audio> element, which played reliably and took the phone's media
// session with it — pausing the lifter's music and never resuming it.
// WebAudio mixes instead of claiming the session, so Spotify keeps going
// underneath the beep.
function alertRestOver(soundEnabled) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    // Long-short-long-short-longest: a pattern you feel as deliberate
    // through a pocket or against a bench, not as a stray notification.
    navigator.vibrate([200, 100, 200, 100, 500]);
  }
  if (!soundEnabled) return;
  playRestAlarm();
}

// A rest-period countdown driven entirely by one absolute timestamp,
// `endsAt` (epoch ms of when the rest hits 0:00), rather than a
// second-by-second `setSecondsLeft(prev - 1)`. The old decrementing
// version silently lost time whenever the tab was backgrounded or the
// phone screen locked — mobile browsers throttle or outright suspend
// setInterval, so a 90s rest with the phone face-down for a minute would
// come back reading ~0:55. Deriving `secondsLeft` from `endsAt - Date.now()`
// on every render (and re-sampling `now` on visibilitychange) means the
// banner always shows the true remaining time the instant the screen
// comes back, however long the interval was frozen.
//
// `secondsLeft` is null whenever no rest is running (banner hidden); it
// holds at 0 once reached — vibrating/beeping exactly once — and from
// that moment `overdueSeconds` counts UP from the same timestamp, so the
// screens can show how far past the rest the lifter is. Both are
// derived, not counted: two minutes on the lock screen come back as
// `+02:00` on the first frame, never as a clock that stopped. Past
// OVERDUE_THRESHOLD_SECONDS Jimmy escalates — see isOverdue/overdueMessage.
//
// CALLED FROM App, not from the workout screen. That is deliberate and
// load-bearing: ActiveWorkoutLogger is mounted by the /workout route, so
// while this hook lived there, tapping any bottom tab mid-rest unmounted
// it and destroyed the countdown — no clock, no alarm, and no trace that
// either had existed. Above the router it outlives every route change,
// which is also what lets FloatingWorkoutBar show the rest on the screen
// the lifter wandered off to. App ends the rest when the session ends; see
// the activeWorkoutId effect there.
//
// `defaultSeconds` is the length of a rest started with no `seconds`, which
// is every rest the app starts by itself (checking a set off). It comes
// from the signed-in account's `defaultRestTimer` — see App.jsx's call
// site and SettingsPanel's dropdown — and falls back to 90 for accounts
// that have never set one. Changing it mid-workout is safe: `start` closes
// over it, so the NEXT rest uses the new length and a rest already
// counting down is left alone.
//
// `start` also takes the `exerciseId` of the exercise whose set began the
// rest, exposed as `exerciseId` for as long as that rest runs. The rest
// itself does not care; the rest-timer 2× offer does — it is made for
// THIS exercise, and a boost claimed during the rest is pinned to it (see
// ActiveWorkoutLogger). Held here rather than on the workout screen for
// the same reason the clock is: the screen unmounts on every tab change,
// and a rest that forgot whose it was would offer a second ad for an
// exercise that is already doubled.
export function useRestTimer(defaultSeconds = DEFAULT_REST_SECONDS) {
  const [endsAt, setEndsAt] = useState(null);
  const [exerciseId, setExerciseId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const hasAlertedRef = useRef(false);
  const hasNaggedRef = useRef(false);

  const running = endsAt !== null;
  const remainingMs = running ? endsAt - now : null;
  const secondsLeft = running ? Math.max(0, Math.ceil(remainingMs / 1000)) : null;
  const isAtZero = running && remainingMs <= 0;
  const overdueSeconds = isAtZero ? Math.floor(-remainingMs / 1000) : 0;

  const start = useCallback(
    ({ seconds = defaultSeconds, exerciseId: forExerciseId = null } = {}) => {
      hasAlertedRef.current = false;
      hasNaggedRef.current = false;
      const t = Date.now();
      const ends = t + seconds * 1000;
      // Called from the tap that completed a set, which is the only
      // moment a browser will hand out an audio context that still works
      // ninety seconds later. Both of these need that gesture: the
      // permission prompt as much as the unlock.
      unlockRestAlarm();
      askRestNotificationPermission();
      // The background half. A page that gets thrown out of memory takes
      // this timeout with it — see restNotification.js for exactly how
      // much this can and cannot promise.
      scheduleRestNotification(ends);
      setNow(t);
      setEndsAt(ends);
      setExerciseId(typeof forExerciseId === 'string' ? forExerciseId : null);
    },
    [defaultSeconds],
  );

  const dismiss = useCallback(() => {
    // Skipping a rest must take its notification with it, or the alert
    // arrives for a rest that stopped existing two sets ago.
    cancelRestNotification();
    setEndsAt(null);
    setExerciseId(null);
  }, []);

  const addTime = useCallback((delta) => {
    // A tap on the timer is the other moment a permission prompt makes
    // sense next to the thing that needs it (see start).
    askRestNotificationPermission();
    const t = Date.now();
    setNow(t);
    setEndsAt((prev) => {
      if (prev === null) return null;
      // Floor the target at the current moment: subtracting past 0:00 lands
      // you exactly at 0:00 (matching the old Math.max(0, prev + delta)),
      // never at a target in the past that would read as instant overdue.
      const next = Math.max(t, prev + delta * 1000);
      // +30 while resting has to move the notification too, or it fires
      // at the old time and contradicts the clock on screen.
      scheduleRestNotification(next);
      return next;
    });
  }, []);

  // One interval for the whole running session — it just re-samples the
  // wall clock, it doesn't own the count. It keeps running PAST 0:00 too
  // (the old code needed a separate second interval for the overdue tally);
  // now the one `now` update drives both the countdown and overdueSeconds.
  // visibilitychange re-samples immediately so the banner is right on the
  // very first frame after an unlock, not one tick later.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // The clock is derived from an absolute timestamp, so this is the
      // whole catch-up: one re-sample and the display is instantly right,
      // however long the tab was frozen.
      setNow(Date.now());
      // iOS suspends the audio context for a backgrounded page. Resuming
      // here means a rest that ends moments after you look at the phone
      // still makes a sound.
      unlockRestAlarm();
    };
    document.addEventListener('visibilitychange', onVisible);
    // A page restored from the back-forward cache is visible without a
    // visibilitychange — same catch-up.
    window.addEventListener('pageshow', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [running]);

  const isOverdue = isAtZero && overdueSeconds >= OVERDUE_THRESHOLD_SECONDS;

  // Picked once per overdue episode and held steady — re-rolling it every
  // second would make the banner text flicker between lines instead of
  // reading as one deliberate callout. React's own documented pattern for
  // "derive state from a value changing, without an extra effect+render
  // round trip" (same technique App.jsx's Layout uses for tab-transition
  // direction) — comparing against the PREVIOUS render's isOverdue and
  // calling setState conditionally right here bails out and re-renders
  // immediately, before anything paints, rather than writing a ref during
  // render (a real anti-pattern this app hit before — see
  // JimmyEvolution.tsx's history).
  const [prevIsOverdue, setPrevIsOverdue] = useState(false);
  const [overdueMessage, setOverdueMessage] = useState(null);
  if (isOverdue !== prevIsOverdue) {
    setPrevIsOverdue(isOverdue);
    setOverdueMessage(isOverdue ? randomRestOverdueMessage() : null);
  }

  useEffect(() => {
    if (secondsLeft === 0 && !hasAlertedRef.current) {
      hasAlertedRef.current = true;
      // Only an alarm the lifter can hear makes the notification the same
      // news twice. Backgrounded, the audio context is suspended and this
      // beep is silent — leave the notification to do its job.
      const onScreen = typeof document === 'undefined' || document.visibilityState === 'visible';
      if (onScreen) cancelRestNotification();
      if (overdueSeconds > MISSED_ALERT_GRACE_SECONDS) return;
      alertRestOver(loadJSON(SOUND_EFFECTS_KEY, true));
    }
  }, [secondsLeft, overdueSeconds]);

  // The escalation gets its own, more insistent buzz — the whole point of
  // Jimmy's attitude kicking in is that the first alert clearly wasn't
  // enough. Vibration only, same reasoning as alertRestOver: a beep here
  // would just be a second identical chime, not a stronger signal.
  useEffect(() => {
    if (isOverdue && !hasNaggedRef.current) {
      hasNaggedRef.current = true;
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([120, 80, 120, 80, 120, 80, 300]);
      }
    }
  }, [isOverdue]);

  return {
    secondsLeft,
    isDone: secondsLeft === 0,
    isVisible: secondsLeft !== null,
    isOverdue,
    overdueMessage,
    // Seconds past 0:00, counting up; 0 while the rest is still running.
    overdueSeconds,
    // The exercise this rest belongs to, or null when none is running.
    exerciseId: running ? exerciseId : null,
    start,
    dismiss,
    addTime,
    step: REST_STEP_SECONDS,
  };
}
