import { useEffect, useState } from 'react';
import ExerciseLogCard from './ExerciseLogCard';
import ExercisePicker from './ExercisePicker';
import WorkoutTimer from './WorkoutTimer';
import FullScreenTimer from './FullScreenTimer';
import ReorderableList from './ReorderableList';
import WorkoutSummaryModal from './WorkoutSummaryModal';
import LockerPromptModal from './LockerPromptModal';
import ConfirmDialog from '../shared/ConfirmDialog';
import { DEFAULT_SETS_PER_EXERCISE } from '../../hooks/useWorkouts';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useRestBoost } from '../../hooks/useRestBoost';
import { useRewardedAd } from '../../hooks/useRewardedAd';
import { REST_BOOST_SSV_CUSTOM_DATA } from '../../config/ads';
import AdPlayingOverlay from '../shared/AdPlayingOverlay';
import { lastPerformance, seedSetsFromHistory } from '../../utils/lastPerformance';
import { sortExercisesByPriority, isPrioritySorted } from '../../utils/exerciseSorting';
import { randomGymQuote } from '../../data/gymQuotes';

// Up/down arrows. Inline SVG rather than an emoji for the same reason
// ExerciseLogCard's chain is: it inherits currentColor and keeps its
// weight across platforms.
function UpDownArrows() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M7 4v16M7 4 4 7M7 4l3 3" />
      <path d="M17 20V4m0 16 3-3m-3 3-3-3" />
    </svg>
  );
}

// One switch row — icon, name, a line of explanation, and the pill. Two
// settings on this screen wanted exactly this shape, and a second
// hand-rolled switch is how two switches end up 1px apart in size and
// sliding at different speeds.
//
// ON is the tier accent, OFF is neutral-700, for both. The rest-timer
// brief asked for green/zinc; green on this screen already means
// "completed" (a checked set, the Finish button), and a second switch
// whose ON colour differs from the one above it reads as though the
// colour means something. It does not — it means on.
function ToggleRow({ icon, title, subtitle, checked, onChange, label }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/60 px-4 py-3">
      <span className="text-lg leading-none" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-500">{subtitle}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-[var(--tier-accent)]' : 'bg-neutral-700'
        }`}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: checked ? '1.75rem' : '0.25rem' }}
        />
      </button>
    </div>
  );
}

// Jimmy's Priority: on, the list is kept in coach order (compound before
// isolation, big muscles first — see utils/exerciseSorting.js) and dragging
// is off, because a hand-drag and an automatic sort fighting over the same
// list is a guaranteed bad time. Off, the order is entirely the lifter's
// and the drag handles appear. One switch, two clearly separate modes.
function PrioritySortToggle({ enabled, onChange, alreadyOptimal }) {
  return (
    <ToggleRow
      icon="🐐"
      title="Jimmy's Priority"
      subtitle={
        enabled
          ? alreadyOptimal
            ? 'Already in the optimal order'
            : 'Big lifts first, arms and core last'
          : 'Off — drag the handles to set your own order'
      }
      checked={enabled}
      onChange={onChange}
      label="Jimmy's Priority sorting"
    />
  );
}

// Insight 7, the "where are the abs?" interceptor. Fires on Finish when
// the session contains no core work at all.
//
// Deliberately never blocking: "Skip abs" always completes the workout, so
// this can nag but can never trap someone who genuinely didn't plan core
// today. That's also why there's no once-per-workout suppression — the
// escape hatch is right there, and being asked again after you explicitly
// said "you're right, let's do abs" and then didn't is the joke working as
// intended.
function JimmyRoastModal({ onDoAbs, onSkip }) {
  const [spriteBroken, setSpriteBroken] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5">
      <div className="card w-full max-w-xs p-6 text-center">
        <div className="flex justify-center">
          {spriteBroken ? (
            <span className="text-6xl leading-none">🐐</span>
          ) : (
            <img
              src="/assets/jimmy-goat.png"
              alt="Jimmy, unimpressed"
              onError={() => setSpriteBroken(true)}
              className="h-28 w-28 object-contain"
              style={{ filter: 'grayscale(0.55) brightness(0.85)' }}
            />
          )}
        </div>

        <h2 className="mt-2 text-xl text-neutral-50">Where are the abs?</h2>
        <p className="mt-2 text-sm leading-snug text-neutral-300">
          Didn&rsquo;t you say you&rsquo;d do abs at the end? Summer is coming. Don&rsquo;t be a Lazy Goat.
        </p>

        <button type="button" onClick={onDoAbs} className="btn-arcade mt-5 w-full py-3.5 text-base">
          You&rsquo;re right, let&rsquo;s do abs
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mt-1 w-full py-3 text-sm font-medium text-neutral-500 active:scale-[0.98]"
        >
          Skip abs, I accept the belly
        </button>
      </div>
    </div>
  );
}

// Custom exercises can carry any group string, so match loosely rather
// than only on the catalog's own 'core' id.
const CORE_GROUPS = new Set(['core', 'abs', 'abdominals']);

export function hasCoreWork(exercises) {
  return (exercises ?? []).some((e) => CORE_GROUPS.has(String(e.muscleGroup ?? '').toLowerCase()));
}

// Which catalog group the picker should open on when the roast is
// accepted. Derived from the SAME CORE_GROUPS set hasCoreWork tests
// against rather than a hardcoded 'core', so the two can never drift: the
// modal appears because nothing in this set was found, and it opens the
// picker on something from this set. Rename the catalog id and both move
// together.
//
// null when the catalog has no core group at all, which ExercisePicker
// treats as "no preference" and falls back to its first chip — a missing
// group must not open an empty sheet.
export function coreGroupId(muscleGroups) {
  return (
    (muscleGroups ?? []).find((group) => CORE_GROUPS.has(String(group.id ?? '').toLowerCase()))?.id ??
    null
  );
}

export default function ActiveWorkoutLogger({
  workout,
  exercises,
  screenLockActive,
  onAddExercise,
  onRemoveExercise,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onFinish,
  // Hides this screen without touching the session — App navigates away
  // and the floating bar appears. Distinct from onDiscard, which ends it.
  onMinimize,
  history = [],
  bodyWeightKg = 0,
  onDiscard,
  // `personalRecords` and `onSaveTemplate` used to live here, feeding the
  // summary modal's PR switch and "Save as Template" toggle. Both
  // decisions moved to Phase 2 of the finish flow (App.jsx), so this
  // screen no longer needs to know what a record is or how to save a
  // routine — it logs sets and hands off.
  onReorderExercises,
  onLinkSuperset,
  onUnlinkSuperset,
  // The locker question. Mounted HERE rather than beside the /workout
  // route in App.jsx so it is route-scoped for free, and so every way a
  // session can begin — freestyle, a saved routine, a trainer assignment —
  // gets it from one place instead of three start handlers.
  askForLocker = true,
  onAnswerLocker,
  onDisableLockerPrompt,
  // The rest countdown, owned by App and handed down.
  //
  // This screen used to call useRestTimer itself, which tied the rest's
  // lifetime to this component's — and this component is mounted by the
  // /workout route, so tapping any bottom tab mid-rest silently destroyed
  // the countdown and its alarm. It lives above the router now (App.jsx),
  // which is why the floating bar can show it on every other screen. The
  // controls are unchanged: this screen still starts a rest when a set is
  // checked off, and the full-screen timer still adds time and skips.
  rest,
  // For the rest-timer 2× offer: whose boosts to read (useRestBoost), the
  // admin testing exemption, and where a claimed token gets pinned
  // (useWorkouts' bindRestBoost). See the block below the switches.
  uid = null,
  isAdmin = false,
  onBindRestBoost,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Which muscle group the picker should OPEN on, or null for its default.
  // Held next to `pickerOpen` rather than passed at the call site because
  // the sheet has two entrances now — the ordinary "+ Add exercise", which
  // wants no opinion, and the abs interceptor, which wants Core — and the
  // one that opened it has to survive until it renders.
  const [pickerGroup, setPickerGroup] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showCoreRoast, setShowCoreRoast] = useState(false);
  // Fresh gym-bro line each time a workout starts (this component mounts);
  // tapping it rolls another, never the same one twice running.
  const [quote, setQuote] = useState(() => randomGymQuote());
  // Minimised iff a rest was ALREADY running when this screen mounted —
  // which only happens when the lifter left mid-rest and has just come
  // back. The full-screen timer is a takeover, and that is earned by the
  // action that starts a rest (checking a set off, below), not by walking
  // back into the room: arriving from the floating bar to find the workout
  // covered again would undo the navigation they just performed. The
  // countdown is still right there in the finish bar's pill, one tap from
  // full-screen, and a rest that reaches 0:00 re-opens it regardless (see
  // the isDone effect below), so nobody can navigate their way out of the
  // alarm.
  const [timerMinimized, setTimerMinimized] = useState(() => Boolean(rest.isVisible));
  // Remembered across workouts — someone who lifts to Jimmy's order wants
  // it every session, and someone who arranges their own does too.
  const [priorityOn, setPriorityOn] = useLocalStorage('jimmys-priority-sort', false);
  // Whether checking a set starts a rest countdown at all.
  //
  // ON IS THE DEFAULT, EVERY SESSION. What is stored is not a preference
  // but the id of the ONE workout the timer was switched off for — a new
  // workout has a different id, does not match, and rests normally.
  //
  // This started as a plain persisted boolean, and that was wrong. It made
  // "off" permanent: one retroactive log, or one stray tap, and every
  // session after it was silent, the only evidence a switch at the bottom
  // of a list nobody scrolls to. A rest timer that has quietly stopped
  // working is worse than one you switch off again on the days you want it
  // off, which is the trade this makes.
  //
  // Still persisted rather than component state, for the reason it always
  // was: an active workout survives a refresh (useWorkouts keeps it in
  // localStorage), and plain state would resurrect a timer somebody
  // silenced two sets ago. Scoping it to the workout id keeps that and
  // drops the part that outstayed its welcome. One key holding at most one
  // id, so nothing accumulates.
  const [restTimerOffFor, setRestTimerOffFor] = useLocalStorage('rest-timer-off-for', null);
  const restTimerEnabled = !(workout.id && restTimerOffFor === workout.id);
  // Reorder mode collapses every card to a draggable row. Deliberately NOT
  // persisted, unlike the two switches above: this is a thing you are
  // doing for the next ten seconds, not a preference. Coming back to a
  // workout to find every set hidden would read as data loss.
  const [isReordering, setIsReordering] = useState(false);

  // ── The rest-timer 2× offer ─────────────────────────────────────────
  //
  // Three pieces, kept apart on purpose:
  //
  //   * useRestBoost reads what the SERVER says is armed and how much of
  //     today's budget is left, off meta/economy — the very document
  //     logWorkout will redeem from;
  //   * useRewardedAd plays the ad and claims through claimRestBoost —
  //     the Store's coin-ad flow with a different callable;
  //   * the workout itself records WHICH exercise a token is pinned to
  //     (`boostTokenId` on the exercise — useWorkouts' bindRestBoost),
  //     which is what rides to the server in the finish payload.
  //
  // "Armed" means a live token no exercise has claimed yet. Binding
  // happens in handleUpdateSet below, on the next set checked off — the
  // plain reading of "your next exercise": the one you log a set in next.
  // Mid-way through bench, that is bench, and the whole exercise pays
  // double. The server is not told any of this; it sees one token id on
  // one exercise and checks it against its own list.
  const restBoost = useRestBoost(uid, { bypass: isAdmin });
  const liveTokenIds = new Set(restBoost.pendingTokens.map((token) => token.id));
  const boundTokenIds = new Set(workout.exercises.map((e) => e.boostTokenId).filter(Boolean));
  const unboundBoosts = restBoost.pendingTokens.filter((token) => !boundTokenIds.has(token.id));
  const boostAd = useRewardedAd(null, {
    bypass: isAdmin,
    callable: 'claimRestBoost',
    customData: REST_BOOST_SSV_CUSTOM_DATA,
    unavailableReason: restBoost.remainingToday <= 0 ? "Today's 2× boosts are used up." : null,
    onClaimed: restBoost.addLocalToken,
  });
  const boostOffer = {
    armed: unboundBoosts.length > 0,
    // Hidden, not disabled, for every reason it could not pay: today's
    // budget is spent, the server has not answered yet, no ad is loaded,
    // one is already playing. The window on the clock is the one thing
    // decided by FullScreenTimer instead, since it is drawing the clock.
    available:
      unboundBoosts.length === 0 && !restBoost.loading && !boostAd.limitReached && boostAd.isAdLoaded && !boostAd.busy,
    busy: boostAd.busy,
    error: boostAd.error,
    onWatch: boostAd.watchAd,
  };
  // A token is only worth drawing as "2×" on its card while the server
  // would still honour it — an expired one is a plain exercise again.
  const isBoosted = (exercise) => Boolean(exercise.boostTokenId) && liveTokenIds.has(exercise.boostTokenId);

  const handleRestTimerToggle = (next) => {
    setRestTimerOffFor(next ? null : (workout.id ?? null));
    navigator.vibrate?.([30]);
    // Switching it off mid-rest kills the running countdown. Leaving it to
    // finish would make the switch look broken for the next 90 seconds —
    // and the one moment somebody reaches for this control is while an
    // alarm they did not want is counting down at them.
    if (!next) rest.dismiss();
  };

  // Applying the sort is a one-shot rewrite of the real order, not a
  // display-only view: the workout that eventually gets logged should be
  // in the order it was actually performed, and everything downstream
  // (the summary, the feed post, the saved template) reads that array.
  const handlePriorityToggle = (next) => {
    setPriorityOn(next);
    navigator.vibrate?.([30]);
    if (next) onReorderExercises(sortExercisesByPriority(workout.exercises).map((e) => e.exerciseId));
  };

  // Adding an exercise mid-workout while the sort is on should drop it into
  // its proper slot rather than tacking it on the end and quietly leaving
  // the list wrong.
  const exerciseCount = workout.exercises.length;
  useEffect(() => {
    if (priorityOn && !isPrioritySorted(workout.exercises)) {
      onReorderExercises(sortExercisesByPriority(workout.exercises).map((e) => e.exerciseId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorityOn, exerciseCount]);

  // Two ways the mode stops being meaningful while you are in it: the list
  // drops below two exercises (nothing left to reorder), or Jimmy's
  // Priority takes the order over and switches dragging off. Either one
  // would otherwise strand someone in a collapsed list with no visible way
  // back, since the exit button lives in the same block that disappears.
  const canReorder = exerciseCount > 1 && !priorityOn;
  useEffect(() => {
    if (!canReorder) setIsReordering(false);
  }, [canReorder]);

  const completedSets = workout.exercises.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.completed).length,
    0,
  );
  const canFinish = completedSets > 0;

  // Picking an exercise no longer closes the sheet — you stay inside it to
  // keep adding more, same as picking several muscle groups in a row. It
  // only closes via the explicit ✕ or a tap on the backdrop (onClose).
  //
  // The added exercise arrives pre-filled with whatever was done last time
  // (see utils/lastPerformance.js). `history` is the already-cached cloud
  // workout list this component is given for its "Last time ·" line, so
  // this is a scan of data in memory — no extra Firestore read per add.
  // Both entrances go through here so the filter is always set
  // deliberately. The reset on close is the load-bearing half: without it,
  // accepting the roast once would leave every later "+ Add exercise" tap
  // opening on Core.
  const openPicker = (group = null) => {
    setPickerGroup(group);
    setPickerOpen(true);
  };
  const closePicker = () => {
    setPickerOpen(false);
    setPickerGroup(null);
  };

  const handleAdd = (exercise) => {
    const last = lastPerformance(exercise.id, history);
    onAddExercise(
      exercise,
      seedSetsFromHistory(last, {
        count: DEFAULT_SETS_PER_EXERCISE,
        isBodyweight: exercise.isBodyweight === true,
      }),
    );
  };

  // Finish goes through the core check first (see JimmyRoastModal above).
  // Only exercises that are actually part of the session count — a core
  // exercise added but left entirely unchecked isn't core work, it's an
  // intention, which is exactly what the roast is about.
  const handleFinishPressed = () => {
    const performed = workout.exercises.filter((e) => e.sets.some((s) => s.completed));
    if (!hasCoreWork(performed)) {
      navigator.vibrate?.([30]);
      setShowCoreRoast(true);
      return;
    }
    setShowSummary(true);
  };

  // Does finishing THIS set mean it is time to rest?
  //
  // Two ways the answer is no, and both are the whole point of the
  // feature — a rest timer firing mid-technique is worse than no timer,
  // because it starts an alarm the lifter then has to stop while holding
  // a dumbbell:
  //
  //   * a drop set IS the absence of rest — strip weight, go again;
  //   * inside a superset you move to the next exercise, so only the LAST
  //     member's set ends the round. Adjacency is what defines the group
  //     (see useWorkouts' cohereSupersets, which keeps it true), so "last"
  //     is simply "the next exercise is not in my group".
  const shouldRestAfter = (exerciseId, setId) => {
    const i = workout.exercises.findIndex((e) => e.exerciseId === exerciseId);
    const exercise = workout.exercises[i];
    if (!exercise) return true;
    if (exercise.sets.find((s) => s.id === setId)?.isDropSet === true) return false;
    if (!exercise.supersetId) return true;
    return workout.exercises[i + 1]?.supersetId !== exercise.supersetId;
  };

  // Checking a set off pops the rest timer full-screen; un-checking it or
  // editing weight/reps leaves any running rest alone.
  const handleUpdateSet = (exerciseId, setId, patch) => {
    onUpdateSet(exerciseId, setId, patch);
    // An armed boost lands on the exercise this set belongs to — unless
    // that exercise already carries a live token, in which case it rolls
    // on to the next exercise that logs a set, so a second claim in a
    // later rest is never spent on an exercise that is already doubled.
    if (patch.completed === true && unboundBoosts.length > 0) {
      const current = workout.exercises.find((e) => e.exerciseId === exerciseId);
      if (current && !isBoosted(current)) onBindRestBoost?.(exerciseId, unboundBoosts[0].id);
    }
    // The set is marked done either way — the only thing the switch
    // decides is whether a countdown follows it. Nothing else about
    // logging changes, which is what makes it safe to leave off.
    if (restTimerEnabled && patch.completed === true && shouldRestAfter(exerciseId, setId)) {
      rest.start();
      setTimerMinimized(false);
    }
  };

  // Minimising hides the overlay but leaves the clock running (see
  // FullScreenTimer's header comment). This snaps it back to full-screen
  // the instant the rest actually ends, so choosing to go back to the
  // workout mid-rest can never cost someone the alarm — which is the whole
  // failure this redesign exists to fix.
  useEffect(() => {
    if (rest.isDone) setTimerMinimized(false);
  }, [rest.isDone]);

  return (
    // Bottom padding has to clear BOTH fixed layers now — the finish bar
    // and the tab row beneath it — or the last exercise card hides behind
    // them. Expressed against --nav-total rather than re-guessed as a
    // bigger Tailwind step so a change to the nav's height, or a phone
    // with a home indicator under it, carries through here.
    //
    // Top padding carries --safe-t as well: this screen is the only one
    // that renders without TopHud above it (see App.jsx's Layout), so it
    // is its own status-bar clearance.
    <div
      className="flex flex-col gap-4"
      style={{
        paddingTop: 'calc(var(--safe-t) + 1.5rem)',
        paddingBottom: `calc(${rest.isVisible && timerMinimized ? '10rem' : '7rem'} + var(--nav-total))`,
      }}
    >
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          {/* Minimize. Leaves the session running and drops the user back
              on the landing screen, where the floating bar takes over as
              the way back in (see FloatingWorkoutBar.jsx). Deliberately
              NOT next to Cancel: one of these two ends your workout and
              the other does not, and putting them side by side is how a
              mis-tap costs somebody their session. */}
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Minimize workout and keep it running"
            className="-ml-1 mr-0.5 self-center rounded-full p-1.5 text-neutral-400 transition active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-neutral-50">Workout</h1>
          <WorkoutTimer startedAt={workout.startedAt} />
          {screenLockActive && (
            <span className="text-sm" title="Screen will stay on for the workout" aria-label="Screen lock active">
              🔒
            </span>
          )}
        </div>
        <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm text-neutral-500 px-2 py-1">
          Cancel
        </button>
      </header>

      <button
        type="button"
        onClick={() => setQuote((q) => randomGymQuote(q))}
        aria-label="Next quote"
        className="-mt-1 w-full text-center text-sm font-semibold uppercase tracking-wide text-[var(--tier-accent)] px-3 py-1 active:scale-[0.98] transition"
      >
        &ldquo;{quote}&rdquo;
      </button>

      {workout.exercises.length === 0 ? (
        <div className="card p-8 text-center flex flex-col items-center gap-4">
          <p className="text-base text-neutral-400">No exercises yet</p>
          <button
            type="button"
            onClick={() => openPicker()}
            className="bg-[var(--ember)] text-white font-semibold text-base px-6 py-3.5 rounded-2xl active:scale-[0.97] transition"
          >
            Pick First Exercise
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!isReordering && (
            <PrioritySortToggle
              enabled={priorityOn}
              onChange={handlePriorityToggle}
              alreadyOptimal={priorityOn && isPrioritySorted(workout.exercises)}
            />
          )}

          {/* Above the list, because it changes what the list IS. Hidden
              when there is nothing to reorder (one exercise) or when
              Jimmy's Priority owns the order anyway — a button that opens
              a mode where dragging is switched off is just a dead end. */}
          {canReorder && (
            <button
              type="button"
              onClick={() => {
                navigator.vibrate?.([20]);
                setIsReordering((on) => !on);
              }}
              aria-pressed={isReordering}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition active:scale-[0.98] ${
                isReordering
                  ? 'bg-[var(--success)] text-white'
                  : 'border border-white/10 bg-neutral-900/60 text-neutral-300'
              }`}
            >
              {isReordering ? (
                '✓ Done Reordering'
              ) : (
                <>
                  <UpDownArrows /> Reorder Exercises
                </>
              )}
            </button>
          )}

          <ReorderableList
            items={workout.exercises}
            getKey={(e) => e.exerciseId}
            onReorder={onReorderExercises}
            disabled={priorityOn}
            renderItem={(exercise, { dragHandleProps, isDragging }) => {
              const i = workout.exercises.indexOf(exercise);
              const prev = workout.exercises[i - 1];
              const next = workout.exercises[i + 1];
              const gid = exercise.supersetId ?? null;
              // Position within the group, derived from the neighbours
              // rather than stored — storing it would be a second source
              // of truth that every reorder could put out of step.
              const openedHere = gid && prev?.supersetId !== gid;
              const closesHere = gid && next?.supersetId !== gid;
              const supersetPosition = !gid
                ? null
                : openedHere
                  ? 'first'
                  : closesHere
                    ? 'last'
                    : 'middle';
              return (
                <ExerciseLogCard
                  exercise={exercise}
                  lastTime={lastPerformance(exercise.exerciseId, history)}
                  dragHandleProps={dragHandleProps}
                  isDragging={isDragging}
                  supersetPosition={supersetPosition}
                  // Offered only where it can actually do something: there
                  // has to be a next exercise, and it must not already be
                  // in this group.
                  onLinkNext={
                    next && next.supersetId !== gid
                      ? () => onLinkSuperset(exercise.exerciseId)
                      : null
                  }
                  // One break control per group, on its first card, since
                  // unlinking dissolves the whole group anyway.
                  onUnlink={
                    supersetPosition === 'first' ? () => onUnlinkSuperset(exercise.exerciseId) : null
                  }
                  compact={isReordering}
                  boosted={isBoosted(exercise)}
                  onAddSet={() => onAddSet(exercise.exerciseId)}
                  onUpdateSet={(setId, patch) => handleUpdateSet(exercise.exerciseId, setId, patch)}
                  onRemoveSet={(setId) => onRemoveSet(exercise.exerciseId, setId)}
                  onRemoveExercise={() => onRemoveExercise(exercise.exerciseId)}
                />
              );
            }}
          />

          {/* Gone, not disabled, while reordering: a new card appearing
              mid-gesture would invalidate the layout ReorderableList
              measured on pick-up. */}
          {!isReordering && (
            <button
              type="button"
              onClick={() => openPicker()}
              className="w-full py-4 text-base font-medium text-neutral-300 bg-neutral-900 rounded-2xl"
            >
              + Add Another Exercise
            </button>
          )}

          {/* Bottom of the list, not the top: this is a setting, and a
              setting placed above the work reads as a step you have to
              deal with before starting. Down here it is where you go
              looking once a timer has annoyed you — or, for a retroactive
              log, right after you have added the first exercise. */}
          <ToggleRow
            icon="⏱️"
            title="Auto-Rest Timer"
            subtitle={
              restTimerEnabled
                ? 'Turn off for retroactive logging'
                : 'Off for this workout — back on for the next one'
            }
            checked={restTimerEnabled}
            onChange={handleRestTimerToggle}
            label="Auto-rest timer"
          />
        </div>
      )}

      {/* Sits ON TOP of BottomNav, not over it. This was `bottom-0`, which
          was correct while /workout rendered outside <Layout> and had the
          screen to itself — now that the tab row is on this route too,
          bottom-0 would bury it under this bar at the same z-30. Offset by
          the same --nav-total variable BottomNav sets its own min-height
          from, so the two cannot drift apart. */}
      <div className="fixed bottom-[var(--nav-total)] inset-x-0 z-30 bg-neutral-950/92 border-t border-white/10 p-4">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          {/* Only ever shown while the full-screen timer is deliberately
              minimised — a way back to it, not a second timer UI. */}
          {rest.isVisible && timerMinimized && (
            <button
              type="button"
              onClick={() => setTimerMinimized(false)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-neutral-900/90 py-3 active:scale-[0.98]"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Resting</span>
              <span className="text-xl font-bold tabular-nums text-neutral-50">
                {String(Math.floor(rest.secondsLeft / 60)).padStart(2, '0')}:
                {String(rest.secondsLeft % 60).padStart(2, '0')}
              </span>
            </button>
          )}
          <button
            type="button"
            disabled={!canFinish}
            onClick={handleFinishPressed}
            className={`w-full font-semibold text-lg py-4 rounded-2xl transition active:scale-[0.98] ${
              canFinish ? 'bg-[var(--success)] text-white' : 'bg-neutral-800 text-neutral-600'
            }`}
          >
            {canFinish ? `Finish Workout · ${completedSets} sets` : 'Complete a set to finish'}
          </button>
        </div>
      </div>

      {rest.isVisible && !timerMinimized && (
        <FullScreenTimer
          secondsLeft={rest.secondsLeft}
          isDone={rest.isDone}
          isOverdue={rest.isOverdue}
          overdueMessage={rest.overdueMessage}
          onAddTime={rest.addTime}
          onSkip={rest.dismiss}
          onMinimize={() => setTimerMinimized(true)}
          boostOffer={boostOffer}
        />
      )}

      {/* The stand-in ad for the 2× offer, drawn over the full-screen
          timer — which keeps counting underneath; see AdPlayingOverlay.
          Rendered here rather than inside the timer so minimising the
          timer mid-ad cannot unmount the ad. */}
      {boostAd.busy && !boostAd.isNative && (
        <AdPlayingOverlay
          rewarding={boostAd.status === 'rewarding'}
          caption="Your rest timer keeps counting."
          rewardingTitle="Arming your 2×…"
          rewardingCaption="Almost there — the clock is still running."
        />
      )}

      {showCoreRoast && (
        <JimmyRoastModal
          // Straight from "you're right" into the core catalog. The
          // workout is untouched by this — nothing finishes, nothing is
          // logged, the session simply stays open with the picker over it,
          // so the sets they are about to do land in it like any others
          // and Finish re-runs the same check afterwards.
          onDoAbs={() => {
            setShowCoreRoast(false);
            openPicker(coreGroupId(exercises.muscleGroups));
          }}
          onSkip={() => {
            setShowCoreRoast(false);
            setShowSummary(true);
          }}
        />
      )}

      {showSummary && (
        <WorkoutSummaryModal
          workout={workout}
          bodyWeightKg={bodyWeightKg}
          onDone={onFinish}
          onBack={() => setShowSummary(false)}
        />
      )}

      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          addedExerciseIds={workout.exercises.map((e) => e.exerciseId)}
          // Only exercises with nothing logged against them can be taken
          // back out from inside the sheet. Once a set is checked off,
          // that row is work somebody did — removing it stays a
          // deliberate act on the card itself, not a second tap on the
          // same row that added it.
          removableExerciseIds={workout.exercises
            .filter((e) => !e.sets.some((set) => set.completed))
            .map((e) => e.exerciseId)}
          initialGroup={pickerGroup}
          onAdd={handleAdd}
          onRemove={onRemoveExercise}
          onClose={closePicker}
        />
      )}

      {/* Before anything else on the screen can be touched: the answer is
          persisted on the workout itself (useWorkouts' answerLocker), so a
          mid-session refresh doesn't ask twice.

          The "nothing logged yet" clause is for one narrow case — a
          session already in progress on someone's phone when this feature
          shipped has no `lockerAsked` at all, and being asked for a locker
          number three exercises into a workout is worse than not being
          asked. It costs nothing afterwards: the prompt is modal, so a
          brand-new workout cannot have a completed set yet. */}
      {askForLocker && !workout.lockerAsked && !workout.exercises.some((e) => e.sets.some((set) => set.completed)) && (
        <LockerPromptModal
          onSave={(number) => onAnswerLocker(number)}
          onSkip={() => onAnswerLocker(null)}
          onDisable={() => {
            // Both, and in this order: the account-level flag is an async
            // Firestore write, while marking the session answered is local
            // and instant — without it the modal would sit there until the
            // write round-tripped.
            onAnswerLocker(null);
            onDisableLockerPrompt();
          }}
        />
      )}

      {confirmCancel && (
        <ConfirmDialog
          title="Cancel this workout?"
          message="Everything logged will be lost."
          confirmLabel="Discard Workout"
          onConfirm={onDiscard}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}
