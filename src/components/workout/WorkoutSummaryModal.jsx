import { useState } from 'react';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';

// The confirm step, and ONLY the confirm step.
//
// This screen used to carry two decisions as well — a "Save as Template"
// toggle and a "share my PRs" switch — which is precisely what made the
// end of a workout feel like a form. Both have moved to Phase 2 of the
// finish flow, after the celebration (SaveRoutinePrompt and SharePRsModal,
// sequenced by App.jsx). What is left is a glance at what you just did and
// one button.
//
// It is kept rather than deleted because "Finish Workout" is a
// one-way door: the workout is logged and the session cleared the moment
// it commits. A mis-tap with no way back would be a worse regression than
// the clutter this change removes — hence "← Back to workout".
//
// onDone round-trips through logWorkout() on the server (see App.jsx's
// handleFinishWorkout), so it can genuinely reject: a set out of bounds,
// logging inside the cooldown, today's cap. On rejection the workout stays
// active and open right here rather than being silently discarded, so
// nothing logged is lost to a rule the user couldn't see coming. This is
// also why the celebration cannot start until the call comes back —
// celebrating a workout that was rejected would be a lie.
//
// `isSubmitting` is a hard double-submit gate: the button disables the
// instant it is tapped, and handleFinish bails immediately if re-entered
// before React renders the disabled state — a second logWorkout call would
// race the transaction and could double-log.
export default function WorkoutSummaryModal({ workout, bodyWeightKg = 0, onDone, onBack }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const sets = workoutSetCount(workout);
  // Approximate — the server recomputes it authoritatively (and re-scores
  // bodyweight sets from the latest logged body weight).
  const volume = workoutVolume(workout, bodyWeightKg);

  const handleFinish = async () => {
    if (isSubmitting) return; // re-entrancy guard — see above
    setError(null);
    setIsSubmitting(true);
    try {
      await onDone();
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
    // No `finally`: on success this modal is being torn down as the
    // celebration takes the screen, and clearing the flag would flash the
    // button back to "Done" on the way out.
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
      <div className="w-full max-w-xs card p-6 flex flex-col gap-5 text-center">
        <div>
          <p className="text-4xl">🔥</p>
          <h2 className="text-2xl text-neutral-50 mt-1">Finish this workout?</h2>
        </div>

        <div className="flex justify-center gap-6">
          <div>
            <p className="text-2xl font-extrabold text-neutral-50 tabular-nums">{workout.exercises.length}</p>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Exercises</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold text-neutral-50 tabular-nums">{sets}</p>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">Sets</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--tier-accent)' }}>
              {volume.toLocaleString('en-US')}
            </p>
            <p className="text-[11px] uppercase tracking-wide text-neutral-500">kg</p>
          </div>
        </div>

        {error && <p className="text-sm text-[var(--danger)] -mb-1">{error}</p>}

        <button
          type="button"
          onClick={handleFinish}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="btn-arcade w-full py-4 text-lg disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <span
                className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                aria-hidden="true"
              />
              Saving…
            </>
          ) : (
            'Done'
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isSubmitting}
          className="text-sm text-neutral-500 -mt-2 disabled:opacity-50"
        >
          ← Back to workout
        </button>
      </div>
    </div>
  );
}
