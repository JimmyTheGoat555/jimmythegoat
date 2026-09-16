import { useEffect, useRef, useState } from 'react';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { formatRecordLoad } from '../../utils/personalRecords';
import { useJimmyLook } from '../../context/JimmyLook';

// Phase 1 of the finish flow: the victory lap, and nothing else.
//
// It replaces WorkoutSummaryChecklist, which ticked off a list of exercise
// NAMES and was over in about two seconds. This walks the session properly
// — each exercise's name lands, then its sets roll in underneath it one at
// a time ("Set 1 · 10 × 80 kg"), so what you watch is the work you
// actually did rather than a list of labels.
//
// Nothing on this screen asks for anything. Every prompt — save this
// routine, share these records — waits until onDone fires. That is the
// entire point of the redesign: the moment you finish is for looking at
// what you lifted, not for answering questions about it.
//
// STILL no framer-motion. It has been asked for three times now and it has
// never been a dependency of this project; every animation here is a CSS
// transition or keyframe driven by a chained timeout. The chain is not a
// workaround either — it is what lets each beat fire its own haptic, which
// a bare animation-delay cannot do.

// Per-beat timing. Deliberately slower than the old screen: the brief was
// "give it enough time to be digested", and the old 260ms-per-line rhythm
// was a tick-list, not a replay.
const LEAD_IN_MS = 500; // a beat before anything moves
const EXERCISE_IN_MS = 620; // name lands, then its first set follows
const SET_STAGGER_MS = 260;
const GAP_BETWEEN_EXERCISES_MS = 420;
const HOLD_AFTER_LAST_MS = 1700;
const PR_EXTRA_HOLD_MS = 1500;
const FILL_DELAY_MS = 100;
// The headline count-up. Lands just before the first exercise does, so
// the two never animate over each other.
const DURATION_COUNT_MS = 900;

// "1h 15m", "47m", "2h", "0:42". Each unit only appears when it has a
// value: "0h 47m" and "1h 0m" both read like a placeholder somebody forgot
// to fill in. A sub-minute session falls back to m:ss rather than
// rounding down to a proud "0m".
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 1) return `0:${String(Math.floor(totalSeconds % 60)).padStart(2, '0')}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// A set line: "10 × 80 kg", or "10 reps" for bodyweight with no belt.
function formatSet(set) {
  const reps = Number(set?.reps) || 0;
  const weight = Number(set?.weight) || 0;
  if (set?.isBodyweight === true) {
    const added = Number(set?.addedWeight) || 0;
    return added > 0 ? `${reps} × BW +${added} kg` : `${reps} × bodyweight`;
  }
  return weight > 0 ? `${reps} × ${weight} kg` : `${reps} reps`;
}

// Flattens the workout into one ordered list of beats, so the sequencer
// below is a single counter rather than nested exercise/set indices. Every
// timing decision then reduces to "how long until beat N+1", which is the
// only thing that made the old chained-timeout approach readable at all.
function buildBeats(exercises) {
  const beats = [];
  (exercises ?? []).forEach((exercise, exerciseIndex) => {
    beats.push({ kind: 'exercise', exerciseIndex });
    (exercise.sets ?? []).forEach((_, setIndex) => {
      beats.push({ kind: 'set', exerciseIndex, setIndex });
    });
  });
  return beats;
}

export default function WorkoutCelebration({
  // [{ name, sets: [{ reps, weight, isBodyweight, addedWeight }] }] — only
  // completed sets, filtered by the caller.
  exercises = [],
  // Wall-clock length of the session, from the server (logWorkout's
  // return) rather than measured here — see economy.js's durationMs for
  // why the client's own start time is not trustworthy enough to headline.
  durationMs = 0,
  totalVolumeKg = 0,
  // The SERVER's record list (logWorkout's return), keyed to rows by
  // exercise NAME. Safe because both arrays are built from the same
  // workout in the same request.
  personalRecords = [],
  recommendationBounty = null,
  coinsEarned = 0,
  // [{ exerciseId, name, multiplier }] — the rest-timer boosts the SERVER
  // actually applied (logWorkout's return). Named under the coin line so
  // a session that paid more than its lifts suggest says why.
  coinBoosts = [],
  onDone,
}) {
  const jimmyLook = useJimmyLook();
  // Computed once, on mount. Lazy state rather than a ref, because this IS
  // render data — the list every row below is drawn from — and because the
  // workout is finished and frozen by the time this screen exists, so
  // there is nothing to recompute it for.
  const [beats] = useState(() => buildBeats(exercises));
  const [played, setPlayed] = useState(0);
  const [volumeFilled, setVolumeFilled] = useState(false);
  // The headline stat counts up to the real figure instead of simply
  // being there. Held as a fraction so the formatter stays the single
  // place that knows what a duration looks like.
  const [durationProgress, setDurationProgress] = useState(0);

  const prByName = new Map((personalRecords ?? []).map((r) => [r.name, r]));
  const prCount = prByName.size;
  const finished = played >= beats.length;

  // Held in a ref so a changing callback identity can't restart the
  // sequence mid-flight.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => setVolumeFilled(true), FILL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Counts the duration up over the lead-in, so the first thing that
  // happens on this screen is the headline number spinning into place and
  // the replay starts the moment it lands.
  //
  // requestAnimationFrame, not a 60-per-second interval: this is pure
  // decoration on a screen that is already running a chain of timers, and
  // rAF is the one scheduler that yields to them and stops dead when the
  // page is hidden. Eased out so it decelerates into the final figure
  // rather than stopping flat.
  useEffect(() => {
    if (durationMs <= 0) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setDurationProgress(1);
      return undefined;
    }
    let raf = 0;
    const started = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - started) / DURATION_COUNT_MS);
      setDurationProgress(1 - (1 - p) ** 3);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // The backstop, and it is not optional. rAF is throttled hard — or
    // stopped outright — whenever the page is not being painted, and a
    // frame that never arrives leaves the count frozen a minute short of
    // the real figure with nothing to correct it. Caught exactly that way:
    // the headline read "1h 14m" on a 75-minute session while the label
    // underneath it said 1h 15m. A timer is throttled too, but it always
    // eventually fires, and this is the number the whole screen is about.
    const settle = setTimeout(() => setDurationProgress(1), DURATION_COUNT_MS + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [durationMs]);

  // One beat at a time. Each schedules the next, so nothing drifts and a
  // re-run of this effect (StrictMode does it on mount) reschedules a
  // pending timeout rather than firing a duplicate buzz.
  useEffect(() => {
    if (played >= beats.length) return undefined;
    const beat = beats[played];
    const previous = played > 0 ? beats[played - 1] : null;
    let delay;
    if (played === 0) delay = LEAD_IN_MS;
    else if (beat.kind === 'exercise') delay = GAP_BETWEEN_EXERCISES_MS;
    else delay = previous?.kind === 'exercise' ? EXERCISE_IN_MS : SET_STAGGER_MS;

    const t = setTimeout(() => {
      // An exercise landing is the bigger moment, so it gets the bigger
      // buzz — the rhythm is legible through a pocket.
      navigator.vibrate?.(beat.kind === 'exercise' ? [28] : [12]);
      setPlayed((p) => p + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [played, beats]);

  // Sequence over: the success pattern, a beat to enjoy it, then hand off
  // to Phase 2. A record needs longer — its line only appears as its own
  // exercise lands, and the last one can land on the final beat.
  useEffect(() => {
    if (beats.length === 0 || played < beats.length) return undefined;
    navigator.vibrate?.([100, 50, 100]);
    const t = setTimeout(
      () => onDoneRef.current?.(),
      prCount > 0 ? HOLD_AFTER_LAST_MS + PR_EXTRA_HOLD_MS : HOLD_AFTER_LAST_MS,
    );
    return () => clearTimeout(t);
  }, [played, beats.length, prCount]);

  // A workout with nothing completed has no beats to play — hand straight
  // over rather than sitting on an empty screen forever.
  useEffect(() => {
    if (beats.length > 0) return undefined;
    const t = setTimeout(() => onDoneRef.current?.(), LEAD_IN_MS);
    return () => clearTimeout(t);
  }, [beats.length]);

  // How many beats of each exercise have played, for the per-row reveal.
  const shownFor = (exerciseIndex) => {
    let exerciseShown = false;
    let sets = 0;
    for (let i = 0; i < played; i += 1) {
      const b = beats[i];
      if (b.exerciseIndex !== exerciseIndex) continue;
      if (b.kind === 'exercise') exerciseShown = true;
      else sets += 1;
    }
    return { exerciseShown, sets };
  };

  const skip = () => {
    if (finished) onDoneRef.current?.();
    else setPlayed(beats.length);
  };

  return (
    <div className="fixed inset-0 z-[65] overflow-y-auto bg-neutral-950">
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-1000"
        style={{
          opacity: finished ? 0.32 : 0.12,
          background: 'radial-gradient(circle at 50% 28%, var(--success), transparent 62%)',
        }}
      />

      <div className="relative flex min-h-full flex-col items-center gap-5 px-6 py-10">
        <div className="flex flex-col items-center">
          <JimmyAvatar {...jimmyLook} size="lg" className="drop-shadow-[0_10px_24px_rgba(57,255,20,0.35)]" />
          <h2 className="mt-2 text-center text-2xl text-neutral-50">Workout Logged</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {!finished
              ? 'Counting it up…'
              : prCount > 0
                ? `${prCount} personal record${prCount === 1 ? '' : 's'} broken.`
                : 'Every rep counted.'}
          </p>
        </div>

        {/* The headline stat, and the first thing that moves on this
            screen. Deliberately at the TOP rather than saved for the
            finale: the time you spent is the frame the rest of the replay
            hangs off — "you were in there for an hour and a quarter, and
            here is what you did with it" — and putting it last would mean
            the biggest number on screen arrived after the applause.
            It stays visible for the whole sequence either way. */}
        {durationMs > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Total time</span>
            <span
              className="mt-0.5 text-5xl font-black tabular-nums transition-transform duration-700 ease-out motion-reduce:transition-none"
              style={{
                color: 'var(--tier-accent)',
                textShadow: '0 0 28px color-mix(in srgb, var(--tier-accent) 45%, transparent)',
                // Settles from slightly oversized as the count lands, so
                // the number arrives rather than simply being there.
                transform: `scale(${0.82 + 0.18 * durationProgress})`,
              }}
              aria-label={`Total workout time: ${formatDuration(durationMs)}`}
            >
              {formatDuration(durationMs * durationProgress)}
            </span>
          </div>
        )}

        {/* A gauge, not a measurement — it always fills to 100%, because
            the bar is a flourish on a number with no ceiling to be a
            fraction of. (An honest denominator would be their best
            previous session; history is already in App if you want it.) */}
        {totalVolumeKg > 0 && (
          <div className="w-full max-w-sm">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total volume</span>
              <span className="text-lg font-bold tabular-nums text-neutral-50">
                {Math.round(totalVolumeKg).toLocaleString('en-US')} kg
              </span>
            </div>
            <div
              className="h-6 w-full overflow-hidden rounded-full border border-white/10 bg-white/5"
              role="img"
              aria-label={`Total volume lifted: ${Math.round(totalVolumeKg).toLocaleString('en-US')} kilograms`}
            >
              {/* motion-reduce lands it filled instead of sliding — the bar
                  carries the meaning, the slide is only decoration. */}
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out motion-reduce:transition-none ${
                  volumeFilled ? 'w-full' : 'w-0'
                }`}
                style={{
                  background: 'linear-gradient(90deg, var(--tier-accent), var(--success))',
                  boxShadow: '0 0 18px -2px var(--success)',
                }}
              />
            </div>
          </div>
        )}

        <ul className="flex w-full max-w-sm flex-col gap-2.5">
          {exercises.map((exercise, exerciseIndex) => {
            const { exerciseShown, sets: setsShown } = shownFor(exerciseIndex);
            const pr = prByName.get(exercise.name);
            return (
              <li
                key={`${exercise.name}-${exerciseIndex}`}
                className="rounded-2xl border px-4 py-3 transition-all duration-500 motion-reduce:transition-none"
                style={{
                  borderColor: exerciseShown ? 'rgba(57,255,20,0.35)' : 'rgba(255,255,255,0.08)',
                  background: exerciseShown ? 'rgba(57,255,20,0.07)' : 'rgba(255,255,255,0.03)',
                  opacity: exerciseShown ? 1 : 0.25,
                  // The row lifts into place as its name lands. Small on
                  // purpose: eight rows each travelling 20px reads as the
                  // page wobbling, not as a sequence.
                  transform: exerciseShown ? 'none' : 'translateY(6px)',
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black transition-all duration-300"
                    style={{
                      background: exerciseShown ? 'var(--success)' : 'rgba(255,255,255,0.08)',
                      color: exerciseShown ? '#08130a' : 'transparent',
                      transform: exerciseShown ? 'scale(1)' : 'scale(0.6)',
                    }}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-neutral-50">
                    {exercise.name}
                  </span>
                </div>

                {/* The sets, staggered in under their own exercise. This is
                    the part the old screen never showed at all. */}
                <ul className="mt-1.5 flex flex-col gap-1 pl-9">
                  {(exercise.sets ?? []).map((set, setIndex) => {
                    const shown = setIndex < setsShown;
                    return (
                      <li
                        key={setIndex}
                        className="flex items-baseline gap-2 text-xs transition-all duration-300 motion-reduce:transition-none"
                        style={{
                          opacity: shown ? 1 : 0,
                          transform: shown ? 'none' : 'translateX(-6px)',
                        }}
                      >
                        <span className="w-11 shrink-0 font-semibold uppercase tracking-wide text-neutral-600">
                          Set {setIndex + 1}
                        </span>
                        <span className="tabular-nums text-neutral-200">{formatSet(set)}</span>
                      </li>
                    );
                  })}
                </ul>

                {/* Earned at the moment the exercise lands — the row gets
                    its trophy on its own beat, which is the rhythm of the
                    whole screen. */}
                {pr && (
                  <p
                    className="mt-1.5 pl-9 text-xs font-semibold text-amber-300 transition-all duration-500"
                    style={{ opacity: exerciseShown ? 1 : 0, transform: exerciseShown ? 'none' : 'translateY(-2px)' }}
                  >
                    🏆 New PR · {formatRecordLoad(pr)}
                    {pr.reps ? ` × ${pr.reps}` : ''}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {/* Everything below is held back until the replay is over, so
            nothing competes with the beat. */}
        <div
          className="flex w-full max-w-sm flex-col items-center gap-3 transition-opacity duration-700"
          style={{ opacity: finished ? 1 : 0 }}
        >
          {coinsEarned > 0 && (
            <p className="text-center text-base font-bold text-[var(--tier-accent)]">🪙 +{coinsEarned} coins</p>
          )}
          {coinsEarned > 0 && coinBoosts.length > 0 && (
            <p className="text-center text-xs font-semibold text-amber-300">
              ⚡ {coinBoosts.map((boost) => `${boost.multiplier}× on ${boost.name}`).join(' · ')}
            </p>
          )}
          {recommendationBounty && (
            <p className="text-center text-sm text-amber-300">
              🪙 {recommendationBounty.senderName} earned {recommendationBounty.coins} coins for sending you this.
            </p>
          )}
        </div>

        {/* Always tappable, both as the brief's "Continue" and as the
            escape hatch for the fourth workout of the week when the replay
            has stopped being a treat. First tap lands the whole sequence,
            second tap moves on — so a skip still shows you the finished
            board rather than yanking it away. */}
        <button
          type="button"
          onClick={skip}
          className="btn-arcade mt-1 w-full max-w-sm py-3.5 text-base"
        >
          {finished ? 'Continue' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
