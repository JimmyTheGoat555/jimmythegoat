import { useEffect, useRef, useState } from 'react';
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
import { useWeightEntryModes } from '../../hooks/useWeightEntryModes';
import { useRestBoost } from '../../hooks/useRestBoost';
import { useRewardedAd } from '../../hooks/useRewardedAd';
import { REST_BOOST_SSV_CUSTOM_DATA } from '../../config/ads';
import AdPlayingOverlay from '../shared/AdPlayingOverlay';
import { lastPerformance, seedSetsFromHistory } from '../../utils/lastPerformance';
import { sortExercisesByPriority, isPrioritySorted } from '../../utils/exerciseSorting';
import { randomGymQuote } from '../../data/gymQuotes';
import { useJimmyLook } from '../../context/JimmyLook';
import JimmyAvatar from '../evolution/JimmyAvatar';

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

// A six-arm snowflake — the Chill Mode mark. Drawn, not the ❄️ emoji,
// so it takes the button's colour: the whole toggle is the tint, and an
// emoji would stay bright white no matter what the mode was.
function SnowflakeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      <path d="M12 21.5 12 2.5M3.77 16.75 20.23 7.25M3.77 7.25l16.46 9.5" />
      <path d="m12 5.6-2.08-1.2M12 5.6l2.08-1.2M17.54 8.8V6.4m0 2.4 2.08 1.2m-2.08 5.2 2.08-1.2m-2.08 1.2v2.4M12 18.4l2.08 1.2M12 18.4l-2.08 1.2M6.46 15.2v2.4m0-2.4-2.08-1.2m2.08-5.2-2.08 1.2m2.08-1.2V6.4" />
    </svg>
  );
}

// A stopwatch — the manual way into a rest. Same treatment as the
// snowflake: currentColor, so it can go tier-accent while a rest is
// counting.
function StopwatchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden="true"
    >
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 6V3m-2.5 0h5M12 13.5V9.75m6.75-3 1.25-1.25" />
    </svg>
  );
}

// One switch row — icon, name, a line of explanation, and the pill.
// Jimmy's Priority is the one setting on this screen that still wants
// this shape (the rest-timer switch that used to sit beside it became
// the snowflake in the header — see ChillToggle); the row stays as a
// component so the next setting that needs one is 1px-for-1px the same.
//
// ON is the tier accent, OFF is neutral-700. Green on this screen already
// means "completed" (a checked set, the Finish button), and a switch
// whose ON colour differs from the accent reads as though the colour
// means something. It does not — it means on.
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

// Chill Mode. On, checking a set off does NOT start a rest — the lifter
// logs at their own pace, and a rest is something they ask for (the
// stopwatch next to this) rather than something that takes the screen.
//
// A tinted icon, not a switch: it sits in the header beside Cancel and
// has to read as a mode you are in rather than a setting you are
// changing. Off is a grey ghost, on is an ice-blue fill — a colour that
// belongs to nothing else on this screen (green is "done", the accent is
// the tier), so the tint can only mean one thing. The transition is on
// colour alone; nothing moves or resizes, so the header never shifts
// under a tap.
//
// Icon only, no "Chill" label: the header already carries the title, the
// elapsed clock and (with the wake lock held) the padlock on the left,
// and this, the stopwatch and Cancel on the right. With a label the row
// overflowed a 375px phone by a dozen pixels and a 390px one whenever the
// padlock showed. The name lives in the accessible label and the title.
function ChillToggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label="Chill Mode: no automatic rest timer"
      title={
        on
          ? 'Chill Mode on — rests only when you start one'
          : 'Chill Mode — log at your own pace, no automatic rest timer'
      }
      // Named when it is ON. A tinted icon was enough to say "you changed
      // something" at the moment of the tap, and not enough afterwards:
      // Chill Mode's whole effect is that a thing which normally happens
      // (the rest timer) does not, and a silent timer with no visible
      // cause is indistinguishable from a broken one. The label costs
      // ~34px and only while the mode is on, which is exactly when the
      // header has one fewer thing to explain.
      className={`flex h-9 items-center justify-center gap-1 rounded-full transition-colors duration-300 active:scale-95 ${
        on ? 'bg-sky-400/15 px-2.5 text-sky-300 ring-1 ring-sky-300/30' : 'w-9 text-neutral-500'
      }`}
    >
      <SnowflakeIcon />
      {on && <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Chill</span>}
    </button>
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

// ── Progressive-overload coaching ─────────────────────────────────────
//
// Two completed sets past twelve reps on the same exercise, in one
// session, and the weight is too light for the goal this app is built
// around: for hypertrophy the set should end near failure inside the
// 6–12 range, and a second set cruising past twelve says it did not.
// So the moment the second such set is checked off, a coaching toast
// suggests going up next time — once per exercise per session
// (`notifiedExercises`), so a 15-rep exercise is told once and not on
// every set after; and never a modal, because a set was just logged and
// the rest timer is about to take the screen. It is advice about NEXT
// time, deliberately: changing the load mid-session is the lifter's
// call, and the sets already logged are already logged.
const OVERLOAD_REPS = 12;
const OVERLOAD_SETS = 2;
const OVERLOAD_TOAST_MS = 7000;
const OVERLOAD_COPY =
  'Cruising past 12 reps? 🐐 It might be time to up the weight next time to hit failure and maximize growth!';

// The toast itself: the lifter's own goat, head-cropped, beside the
// line. Reads the look from context because this is YOUR coach — the
// same reason the celebration and the Profile do. Tapping dismisses;
// left alone it goes on its own (the parent's timer). Fixed at the top,
// above the rest timer's overlay, so it survives the full-screen
// countdown that the same tap usually starts.
function OverloadToast({ exerciseName, onDismiss }) {
  const look = useJimmyLook();
  return (
    <button
      type="button"
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="fixed left-1/2 z-[80] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-neutral-950/95 px-3.5 py-3 text-left shadow-xl shadow-black/60 backdrop-blur transition active:scale-[0.98]"
      style={{ top: 'calc(var(--safe-t) + 12px)' }}
    >
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-800">
        <JimmyAvatar {...look} crop="head" className="h-full w-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Coaching · {exerciseName}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-neutral-100">{OVERLOAD_COPY}</span>
      </span>
    </button>
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
  return (muscleGroups ?? []).find((group) => CORE_GROUPS.has(String(group.id ?? '').toLowerCase()))?.id ?? null;
}

// mm:ss for the minimised rest chip — two-digit minutes so the chip
// never changes width mid-rest.
function mmss(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
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
  // The locker question, opened from the header and from nowhere else —
  // see the button below and LockerPromptModal.jsx.
  const [lockerOpen, setLockerOpen] = useState(false);
  // Which exercises have had the overload toast this session, keyed to
  // the session so a new workout on the same mount starts clean; and the
  // toast on screen, if any (`key` restarts the dismiss timer).
  const [notifiedExercises, setNotifiedExercises] = useState(() => ({ startedAt: workout.startedAt, ids: new Set() }));
  const [overloadToast, setOverloadToast] = useState(null);
  useEffect(() => {
    if (!overloadToast) return undefined;
    const t = setTimeout(() => setOverloadToast(null), OVERLOAD_TOAST_MS);
    return () => clearTimeout(t);
  }, [overloadToast]);
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
  // Chill Mode: whether checking a set starts a rest countdown at all.
  //
  // OFF IS THE DEFAULT, EVERY SESSION. What is stored is not a preference
  // but the id of the ONE workout Chill Mode was switched on for — a new
  // workout has a different id, does not match, and rests normally.
  //
  // This started (as the old "auto-rest timer" switch) as a plain
  // persisted boolean, and that was wrong. It made "off" permanent: one
  // retroactive log, or one stray tap, and every session after it was
  // silent, the only evidence a switch at the bottom of a list nobody
  // scrolls to. A rest timer that has quietly stopped working is worse
  // than one you switch off again on the days you want it off, which is
  // the trade this makes.
  //
  // Still persisted rather than component state, for the reason it always
  // was: an active workout survives a refresh (useWorkouts keeps it in
  // localStorage), and plain state would resurrect a timer somebody
  // silenced two sets ago. Scoping it to the workout id keeps that and
  // drops the part that outstayed its welcome. One key holding at most one
  // id, so nothing accumulates.
  const [chillModeFor, setChillModeFor] = useLocalStorage('chill-mode-for', null);
  // Which exercises are entered as a plain total rather than per hand.
  // (There used to be a plate calculator behind this too; it is gone —
  // see SetRow.) One owner for the whole screen; the cards only read and
  // flip it. See hooks/useWeightEntryModes.js.
  const entryModes = useWeightEntryModes();
  const isChillMode = Boolean(workout.id) && chillModeFor === workout.id;
  // Reorder mode collapses every card to a draggable row. Deliberately NOT
  // persisted, unlike the two switches above: this is a thing you are
  // doing for the next ten seconds, not a preference. Coming back to a
  // workout to find every set hidden would read as data loss.
  const [isReordering, setIsReordering] = useState(false);

  // ── The accordion ───────────────────────────────────────────────────
  //
  // Exactly one exercise is open at a time (see ExerciseLogCard). This
  // holds the lifter's own choice, and null means "no choice made yet" —
  // in which case the open one is derived: the first exercise that still
  // has a set to tick.
  //
  // Derived rather than seeded into state, because the answer has to stay
  // right as the workout changes underneath it: an exercise removed, a
  // session restored from localStorage three exercises in, a trainer's
  // assignment loaded with the first two already logged. A pinned id that
  // is no longer in the list simply stops matching and the derivation
  // takes over again.
  const [openExerciseId, setOpenExerciseId] = useState(null);
  const isExerciseFinished = (e) => e.sets.length > 0 && e.sets.every((set) => set.completed);
  const firstUnfinished = workout.exercises.find((e) => !isExerciseFinished(e));
  const pinnedExists = workout.exercises.some((e) => e.exerciseId === openExerciseId);
  const expandedExerciseId = pinnedExists
    ? openExerciseId
    : (firstUnfinished?.exerciseId ?? workout.exercises.at(-1)?.exerciseId ?? null);

  // Tapping the open card's chevron folds it away; tapping a closed one
  // opens it. Both go through here so "which is open" has one writer.
  const toggleExercise = (exerciseId) => {
    navigator.vibrate?.([12]);
    setOpenExerciseId((current) => {
      const openNow = workout.exercises.some((e) => e.exerciseId === current)
        ? current
        : (firstUnfinished?.exerciseId ?? null);
      // Closing the open one means "nothing pinned" rather than "nothing
      // open": the derivation below picks up the first unfinished again,
      // which is where somebody folding a card away wants to be.
      return openNow === exerciseId ? null : exerciseId;
    });
  };

  // Where the accordion goes when an exercise is finished off: the next
  // one in the list that still has work in it, wrapping to the start,
  // and null when the whole session is ticked (in which case the card
  // that was just completed stays open — collapsing everything at the end
  // of a workout would leave an empty-looking screen over a finished
  // session).
  const nextUnfinishedAfter = (exerciseId, exercisesNow) => {
    const list = exercisesNow ?? workout.exercises;
    const from = list.findIndex((e) => e.exerciseId === exerciseId);
    for (let step = 1; step <= list.length; step += 1) {
      const candidate = list[(from + step) % list.length];
      if (candidate && candidate.exerciseId !== exerciseId && !isExerciseFinished(candidate))
        return candidate.exerciseId;
    }
    return null;
  };

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
  // The offer is made for THIS exercise. A rest carries the id of the
  // exercise whose set started it (rest.exerciseId — handleUpdateSet
  // below hands it to rest.start), and a token claimed during that rest
  // is pinned to it the moment the ad pays out: the whole exercise, sets
  // already logged included, pays double. Every later rest the same
  // exercise starts then shows "active" in the offer's place — there is
  // no second ad to take for it — and the next exercise gets an offer of
  // its own, within today's budget.
  //
  // "Armed" is the leftover case: a live token no exercise has claimed
  // yet and no running rest to pin it to — one that outlived the workout
  // it was claimed in, say. It lands on the next set checked off, in
  // handleUpdateSet. The server is not told any of this; it sees one
  // token id on one exercise and checks it against its own list.
  const restBoost = useRestBoost(uid, { bypass: isAdmin });
  const liveTokenIds = new Set(restBoost.pendingTokens.map((token) => token.id));
  const boundTokenIds = new Set(workout.exercises.map((e) => e.boostTokenId).filter(Boolean));
  const unboundBoosts = restBoost.pendingTokens.filter((token) => !boundTokenIds.has(token.id));
  // A token is only worth drawing as "2×" on its card while the server
  // would still honour it — an expired one is a plain exercise again.
  const isBoosted = (exercise) => Boolean(exercise.boostTokenId) && liveTokenIds.has(exercise.boostTokenId);
  // The exercise the running rest belongs to, if it is still in the
  // workout, and whether it is already doubled.
  const restExercise = rest.exerciseId
    ? (workout.exercises.find((e) => e.exerciseId === rest.exerciseId) ?? null)
    : null;
  const restExerciseId = restExercise?.exerciseId ?? null;
  const restExerciseBoosted = Boolean(restExercise) && isBoosted(restExercise);
  const boostAd = useRewardedAd(null, {
    bypass: isAdmin,
    callable: 'claimRestBoost',
    customData: REST_BOOST_SSV_CUSTOM_DATA,
    unavailableReason: restBoost.remainingToday <= 0 ? "Today's 2× boosts are used up." : null,
    // Pinned to the rest's exercise in the same breath as it is folded
    // into the local list, so the timer goes straight from "watching" to
    // "active" — never through a frame of "armed" first.
    onClaimed: (data) => {
      restBoost.addLocalToken(data);
      if (restExerciseId && typeof data?.tokenId === 'string') onBindRestBoost?.(restExerciseId, data.tokenId);
    },
  });
  // Real ads pay out of band (AdMob → the server → the snapshot), with no
  // response for onClaimed to pin. Same pinning for that path: a token
  // that turns up unbound while a rest is running lands on the rest's
  // exercise — unless that exercise is already doubled, in which case it
  // stays armed for the next set checked off, as any leftover would.
  const firstUnboundId = unboundBoosts[0]?.id ?? null;
  useEffect(() => {
    if (!firstUnboundId || !restExerciseId || restExerciseBoosted) return;
    onBindRestBoost?.(restExerciseId, firstUnboundId);
  }, [firstUnboundId, restExerciseId, restExerciseBoosted, onBindRestBoost]);
  const boostOffer = {
    // This exercise already pays double: for every rest it starts, the
    // offer's spot says so instead of offering a second ad.
    active: restExerciseBoosted,
    armed: unboundBoosts.length > 0,
    // Hidden, not disabled, for every reason it could not pay: this
    // exercise is already boosted, today's budget is spent, the server
    // has not answered yet, no ad is loaded, one is already playing. The
    // window on the clock is the one thing decided by FullScreenTimer
    // instead, since it is drawing the clock.
    available:
      !restExerciseBoosted &&
      unboundBoosts.length === 0 &&
      !restBoost.loading &&
      !boostAd.limitReached &&
      boostAd.isAdLoaded &&
      !boostAd.busy,
    busy: boostAd.busy,
    error: boostAd.error,
    onWatch: boostAd.watchAd,
  };

  const handleChillToggle = (next) => {
    setChillModeFor(next ? (workout.id ?? null) : null);
    navigator.vibrate?.([30]);
    // Switching it on mid-rest kills the running countdown. Leaving it to
    // finish would make the toggle look broken for the next 90 seconds —
    // and the one moment somebody reaches for this control is while an
    // alarm they did not want is counting down at them.
    if (next) rest.dismiss();
  };

  // The exercise whose set was checked off most recently — what a rest
  // started by hand (the header's stopwatch) is pinned to, so the 2× offer
  // it shows is for the exercise the lifter just did, exactly as it would
  // be had the set started the rest itself. A ref, not state: nothing
  // renders from it. null until a set is checked off this mount, and a
  // rest started before that simply carries no exercise (no offer).
  const lastCompletedExerciseRef = useRef(null);

  // The stopwatch in the header. While a rest is counting it is the way
  // back to the full-screen timer; otherwise it STARTS one — the manual
  // override Chill Mode promises, and just as usable with Chill Mode off
  // (a rest after a set that was never checked, say, or a second rest).
  const handleRestTap = () => {
    if (rest.isVisible) {
      setTimerMinimized(false);
      return;
    }
    rest.start({ exerciseId: lastCompletedExerciseRef.current });
    setTimerMinimized(false);
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

  // The one colour the minimised rest chip is drawn in. Tailwind's
  // red-500 as a literal for the same reason FullScreenTimer keeps one:
  // the chip's colour is a single style expression across its states.
  const restChipColor = rest.isDone ? '#ef4444' : 'var(--tier-accent)';

  const completedSets = workout.exercises.reduce((sum, e) => sum + e.sets.filter((s) => s.completed).length, 0);
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
        exerciseId: exercise.id,
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

  // The overload check, on the completed set. The patch has not landed in
  // `workout` yet when this runs, so it is applied to the set in hand
  // before counting — otherwise the set that just crossed twelve would be
  // the one set not counted.
  const maybeCoachOverload = (exerciseId, setId, patch) => {
    const ids = notifiedExercises.startedAt === workout.startedAt ? notifiedExercises.ids : new Set();
    if (ids.has(exerciseId)) return;
    const exercise = workout.exercises.find((e) => e.exerciseId === exerciseId);
    if (!exercise) return;
    const sets = exercise.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s));
    // Drop sets are excluded on purpose. Stripping weight and repping out
    // past twelve is exactly what a drop set IS, so counting one here
    // would have the coach telling people to go heavier because their
    // drop sets worked. Same reason shouldRestAfter skips them.
    const cruising = sets.filter((s) => s.completed && !s.isDropSet && Number(s.reps) > OVERLOAD_REPS).length;
    if (cruising < OVERLOAD_SETS) return;
    setNotifiedExercises({ startedAt: workout.startedAt, ids: new Set(ids).add(exerciseId) });
    setOverloadToast({ exerciseId, name: exercise.name, key: Date.now() });
  };

  // Checking a set off pops the rest timer full-screen; un-checking it or
  // editing weight/reps leaves any running rest alone.
  const handleUpdateSet = (exerciseId, setId, patch) => {
    onUpdateSet(exerciseId, setId, patch);
    if (patch.completed === true) maybeCoachOverload(exerciseId, setId, patch);
    // A leftover boost — one with no running rest to land on when it
    // arrived — lands on the exercise this set belongs to, unless that
    // exercise already carries a live token, in which case it rolls on
    // to the next exercise that logs a set, so it is never spent on an
    // exercise that is already doubled.
    if (patch.completed === true && unboundBoosts.length > 0) {
      const current = workout.exercises.find((e) => e.exerciseId === exerciseId);
      if (current && !isBoosted(current)) onBindRestBoost?.(exerciseId, unboundBoosts[0].id);
    }
    if (patch.completed === true) lastCompletedExerciseRef.current = exerciseId;
    // ── Advancing the accordion ───────────────────────────────────────
    //
    // Ticking the LAST set of an exercise moves the open card on to the
    // next one with work left in it. Done here, on the event, rather than
    // derived from "is the open one finished" — because that derivation
    // would also fire when somebody deliberately re-opens a finished
    // exercise to add a fourth set, and bounce them straight back out of
    // it. An event knows the difference; a derivation cannot.
    //
    // `patch` has not landed in `workout` yet, so it is applied to the set
    // in hand first — otherwise the set that just finished the exercise is
    // the one set not counted.
    if (patch.completed === true) {
      const current = workout.exercises.find((e) => e.exerciseId === exerciseId);
      const after = current?.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) ?? [];
      if (after.length > 0 && after.every((s) => s.completed)) {
        const next = nextUnfinishedAfter(exerciseId);
        if (next) setOpenExerciseId(next);
      }
    }
    // The set is marked done either way — the only thing Chill Mode
    // decides is whether a countdown follows it. Nothing else about
    // logging changes, which is what makes it safe to switch on.
    if (!isChillMode && patch.completed === true && shouldRestAfter(exerciseId, setId)) {
      // The rest remembers whose it is: that is what the 2× offer is
      // made for, and what "active" is read against on every later rest
      // the same exercise starts.
      rest.start({ exerciseId });
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
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
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
        {/* The rest controls, then Cancel. Chill Mode and the stopwatch
            are a pair — the one says "no rest unless I ask", the other is
            how you ask — and they sit together, with the stopwatch
            taking the tier accent while a rest is counting so it reads
            as live from the header. Cancel stays the far corner it has
            always been. */}
        <div className="flex shrink-0 items-center gap-0.5">
          {/* The locker. It used to ask on its own, full-screen, the
              moment this screen mounted — a modal standing between a
              lifter and their first warm-up set, every single session.
              It is a button now: the number is still captured and still
              handed back at the end, but only when somebody wants it.
              Reads back the saved number so the header itself answers
              "what did I put it in?" without opening anything. */}
          {askForLocker && (
            <button
              type="button"
              onClick={() => setLockerOpen(true)}
              aria-label={
                workout.lockerNumber ? `Locker ${workout.lockerNumber} — tap to change it` : 'Save your locker number'
              }
              title={workout.lockerNumber ? `Locker ${workout.lockerNumber}` : 'Locker number'}
              className={`flex h-9 min-w-9 items-center justify-center gap-0.5 rounded-full px-1.5 text-sm transition active:scale-95 ${
                workout.lockerNumber ? 'text-[var(--ember)]' : 'text-neutral-400'
              }`}
            >
              <span aria-hidden="true">🔐</span>
              {workout.lockerNumber && (
                <span className="text-[11px] font-bold tabular-nums">{workout.lockerNumber}</span>
              )}
            </button>
          )}
          <ChillToggle on={isChillMode} onChange={handleChillToggle} />
          <button
            type="button"
            onClick={handleRestTap}
            aria-label={rest.isVisible ? 'Show rest timer' : 'Start a rest'}
            title={rest.isVisible ? 'Show rest timer' : 'Start a rest'}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300 active:scale-95 ${
              rest.isVisible ? 'text-[var(--tier-accent)]' : 'text-neutral-400'
            }`}
          >
            <StopwatchIcon />
          </button>
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="py-1 pl-1.5 pr-0.5 text-sm text-neutral-500"
          >
            Cancel
          </button>
        </div>
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
              const supersetPosition = !gid ? null : openedHere ? 'first' : closesHere ? 'last' : 'middle';
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
                  onLinkNext={next && next.supersetId !== gid ? () => onLinkSuperset(exercise.exerciseId) : null}
                  // One break control per group, on its first card, since
                  // unlinking dissolves the whole group anyway.
                  onUnlink={supersetPosition === 'first' ? () => onUnlinkSuperset(exercise.exerciseId) : null}
                  compact={isReordering}
                  boosted={isBoosted(exercise)}
                  guide={exercises.getExercise(exercise.exerciseId) ?? null}
                  onAddSet={() => onAddSet(exercise.exerciseId)}
                  onUpdateSet={(setId, patch) => handleUpdateSet(exercise.exerciseId, setId, patch)}
                  onRemoveSet={(setId) => onRemoveSet(exercise.exerciseId, setId)}
                  onRemoveExercise={() => onRemoveExercise(exercise.exerciseId)}
                  entryMode={entryModes.modeFor(exercise.exerciseId)}
                  onEntryModeChange={(mode) => entryModes.setModeFor(exercise.exerciseId, mode)}
                  bodyWeightKg={bodyWeightKg}
                  // The accordion. Off entirely while reordering — that
                  // mode collapses everything to a drag row anyway, and
                  // two different ideas of "collapsed" on one screen is
                  // one too many.
                  expanded={isReordering || exercise.exerciseId === expandedExerciseId}
                  onExpand={isReordering ? null : () => toggleExercise(exercise.exerciseId)}
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
            // ── The minimised rest ──────────────────────────────────
            //
            // This used to be a grey pill with a 20px clock in it, and it
            // is the single most missable thing on the screen: somebody
            // who minimised the full-screen timer to change a weight is
            // now looking at a workout, and the only thing telling them
            // how long they have left was a line of neutral text under
            // the Finish button.
            //
            // So it takes the state colour outright — the tier accent
            // while it counts, red the moment it is up — at a size meant
            // to be read from a bench two metres away, which is the same
            // brief the full-screen timer was written to. It is still one
            // tap back to that timer; it just no longer needs to be
            // hunted for.
            <button
              type="button"
              onClick={() => setTimerMinimized(false)}
              aria-label={rest.isDone ? 'Rest over — open the timer' : 'Open the rest timer'}
              className={`flex w-full items-center justify-center gap-3 rounded-2xl border-2 bg-neutral-950/80 py-3 transition active:scale-[0.98] ${
                rest.isOverdue ? 'motion-safe:animate-pulse' : ''
              }`}
              style={{
                borderColor: restChipColor,
                boxShadow: `0 0 30px -10px ${restChipColor}`,
              }}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: restChipColor }}>
                {rest.isDone ? 'Over by' : 'Resting'}
              </span>
              <span
                className="text-4xl font-black leading-none tabular-nums"
                style={{ color: restChipColor, textShadow: `0 0 26px ${restChipColor}55` }}
              >
                {rest.isDone ? `+${mmss(rest.overdueSeconds)}` : mmss(rest.secondsLeft)}
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
          overdueSeconds={rest.overdueSeconds}
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

      {overloadToast && (
        <OverloadToast
          key={overloadToast.key}
          exerciseName={overloadToast.name}
          onDismiss={() => setOverloadToast(null)}
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

      {/* Opened from the header's lock button, and only from there.
          Three exits, and the difference between the last two matters —
          see LockerPromptModal.jsx. The answer is persisted on the
          workout itself (useWorkouts' answerLocker), so a mid-session
          refresh keeps the number.

          It is worth being clear about what changed and what did not:
          this used to render itself the instant the screen mounted, with
          the guard `!workout.lockerAsked && nothing logged yet`. The
          feature is unchanged — the number is still captured here and
          still handed back by LockerReminderModal when the workout is
          saved — but a popup nobody asked for, standing in front of the
          first set of every session, is the wrong way to ask. */}
      {lockerOpen && (
        <LockerPromptModal
          onSave={(number) => {
            onAnswerLocker(number);
            setLockerOpen(false);
          }}
          onSkip={() => {
            onAnswerLocker(null);
            setLockerOpen(false);
          }}
          onDisable={() => {
            // Both, and in this order: the account-level flag is an async
            // Firestore write, while marking the session answered is local
            // and instant. Turning it off here hides the header button too,
            // and Settings → "Ask for Locker Number" turns it back on.
            onAnswerLocker(null);
            onDisableLockerPrompt();
            setLockerOpen(false);
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
