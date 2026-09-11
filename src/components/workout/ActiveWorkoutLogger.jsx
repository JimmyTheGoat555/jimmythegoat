import { useEffect, useState } from 'react';
import ExerciseLogCard from './ExerciseLogCard';
import ExercisePicker from './ExercisePicker';
import WorkoutTimer from './WorkoutTimer';
import FullScreenTimer from './FullScreenTimer';
import ReorderableList from './ReorderableList';
import WorkoutSummaryModal from './WorkoutSummaryModal';
import ConfirmDialog from '../shared/ConfirmDialog';
import { useRestTimer } from '../../hooks/useRestTimer';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { lastPerformance } from '../../utils/lastPerformance';
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
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
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
  const handleAdd = (exercise) => {
    onAddExercise(exercise);
  };

  // Checking a set off pops the rest timer full-screen; un-checking it or
  // editing weight/reps leaves any running rest alone.
  const handleUpdateSet = (exerciseId, setId, patch) => {
    onUpdateSet(exerciseId, setId, patch);
    if (patch.completed === true) {
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
            renderItem={(exercise, { dragHandleProps, isDragging }) => (
              <ExerciseLogCard
                exercise={exercise}
                lastTime={lastPerformance(exercise.exerciseId, history)}
                dragHandleProps={dragHandleProps}
                isDragging={isDragging}
                onAddSet={() => onAddSet(exercise.exerciseId)}
                onUpdateSet={(setId, patch) => handleUpdateSet(exercise.exerciseId, setId, patch)}
                onRemoveSet={(setId) => onRemoveSet(exercise.exerciseId, setId)}
                onRemoveExercise={() => onRemoveExercise(exercise.exerciseId)}
              />
            )}
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
            onClick={() => setShowSummary(true)}
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
