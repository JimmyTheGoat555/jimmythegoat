import { useEffect, useState } from 'react';
import ExerciseLogCard from './ExerciseLogCard';
import ExercisePicker from './ExercisePicker';
import WorkoutTimer from './WorkoutTimer';
import FullScreenTimer from './FullScreenTimer';
import ReorderableList from './ReorderableList';
import WorkoutSummaryModal from './WorkoutSummaryModal';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useRestTimer } from '../../hooks/useRestTimer';
import { DEFAULT_SETS_PER_EXERCISE } from '../../hooks/useWorkouts';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { lastPerformance, seedSetsFromHistory } from '../../utils/lastPerformance';
import { sortExercisesByPriority, isPrioritySorted } from '../../utils/exerciseSorting';
import { randomGymQuote } from '../../data/gymQuotes';

// Jimmy's Priority: on, the list is kept in coach order (compound before
// isolation, big muscles first — see utils/exerciseSorting.js) and dragging
// is off, because a hand-drag and an automatic sort fighting over the same
// list is a guaranteed bad time. Off, the order is entirely the lifter's
// and the drag handles appear. One switch, two clearly separate modes.
function PrioritySortToggle({ enabled, onChange, alreadyOptimal }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900/60 px-4 py-3">
      <span className="text-lg leading-none" aria-hidden="true">
        🐐
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-neutral-100">Jimmy&rsquo;s Priority</p>
        <p className="text-xs text-neutral-500">
          {enabled
            ? alreadyOptimal
              ? 'Already in the optimal order'
              : 'Big lifts first, arms and core last'
            : 'Off — drag the handles to set your own order'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Jimmy's Priority sorting"
        onClick={() => onChange(!enabled)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          enabled ? 'bg-[var(--tier-accent)]' : 'bg-neutral-700'
        }`}
      >
        <span
          className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: enabled ? '1.75rem' : '0.25rem' }}
        />
      </button>
    </div>
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
  personalRecords = [],
  history = [],
  bodyWeightKg = 0,
  onDiscard,
  onSaveTemplate,
  onReorderExercises,
  onLinkSuperset,
  onUnlinkSuperset,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showCoreRoast, setShowCoreRoast] = useState(false);
  // Fresh gym-bro line each time a workout starts (this component mounts);
  // tapping it rolls another, never the same one twice running.
  const [quote, setQuote] = useState(() => randomGymQuote());
  const rest = useRestTimer();
  const [timerMinimized, setTimerMinimized] = useState(false);
  // Remembered across workouts — someone who lifts to Jimmy's order wants
  // it every session, and someone who arranges their own does too.
  const [priorityOn, setPriorityOn] = useLocalStorage('jimmys-priority-sort', false);

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
    if (patch.completed === true && shouldRestAfter(exerciseId, setId)) {
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
    <div className={`flex flex-col gap-4 pt-6 ${rest.isVisible && timerMinimized ? 'pb-40' : 'pb-28'}`}>
      <header className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
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
            onClick={() => setPickerOpen(true)}
            className="bg-[var(--ember)] text-white font-semibold text-base px-6 py-3.5 rounded-2xl active:scale-[0.97] transition"
          >
            Pick First Exercise
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <PrioritySortToggle
            enabled={priorityOn}
            onChange={handlePriorityToggle}
            alreadyOptimal={priorityOn && isPrioritySorted(workout.exercises)}
          />

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
                  onAddSet={() => onAddSet(exercise.exerciseId)}
                  onUpdateSet={(setId, patch) => handleUpdateSet(exercise.exerciseId, setId, patch)}
                  onRemoveSet={(setId) => onRemoveSet(exercise.exerciseId, setId)}
                  onRemoveExercise={() => onRemoveExercise(exercise.exerciseId)}
                />
              );
            }}
          />

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full py-4 text-base font-medium text-neutral-300 bg-neutral-900 rounded-2xl"
          >
            + Add Another Exercise
          </button>
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 z-30 bg-neutral-950/92 border-t border-white/10 p-4">
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
        />
      )}

      {showCoreRoast && (
        <JimmyRoastModal
          onDoAbs={() => setShowCoreRoast(false)}
          onSkip={() => {
            setShowCoreRoast(false);
            setShowSummary(true);
          }}
        />
      )}

      {showSummary && (
        <WorkoutSummaryModal
          workout={workout}
          onSaveTemplate={onSaveTemplate}
          personalRecords={personalRecords}
          bodyWeightKg={bodyWeightKg}
          onDone={onFinish}
          onBack={() => setShowSummary(false)}
        />
      )}

      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          addedExerciseIds={workout.exercises.map((e) => e.exerciseId)}
          onAdd={handleAdd}
          onClose={() => setPickerOpen(false)}
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
