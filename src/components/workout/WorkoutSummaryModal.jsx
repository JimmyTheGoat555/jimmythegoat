import { useState } from 'react';
import { workoutVolume, workoutSetCount } from '../../utils/workoutStats';

function defaultTemplateName(workout) {
  const names = workout.exercises.map((e) => e.name);
  if (names.length === 0) return 'My Workout';
  if (names.length <= 2) return names.join(' + ');
  return `${names[0]} + ${names.length - 1} more`;
}

// Shown the instant "Finish Workout" is tapped — a quick stats recap plus
// an optional "save this exact exercise lineup as a reusable template"
// step, before the workout is actually committed to history and the
// screen navigates away. Deliberately one screen, one primary action: no
// extra "are you sure" on top of this, since finishing was already the
// explicit thing the user just tapped — "Save as Template" is an add-on
// toggle, not a fork in the flow.
export default function WorkoutSummaryModal({
  workout,
  personalRecords = [],
  bodyWeightKg = 0,
  onSaveTemplate,
  onDone,
  onBack,
}) {
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  // Defaults to on: a workout already becomes a feed post either way, so
  // this is "shout about the PR on it", not "reveal the workout". Still an
  // explicit, visible choice rather than something that happens silently.
  const [sharePRs, setSharePRs] = useState(true);
  const [templateName, setTemplateName] = useState(() => defaultTemplateName(workout));
  // onDone now round-trips through logWorkout() on the server (see
  // App.jsx's handleFinishWorkout) — validation, the cooldown, and the
  // daily cap all live there, so this can genuinely reject (a set out of
  // bounds, logging too soon, today's limit hit). On rejection the workout
  // stays active and open right here rather than silently discarding it,
  // so nothing logged gets lost to a rule the person couldn't see coming.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sets = workoutSetCount(workout);
  // Approximate — the server recomputes it authoritatively (and re-scores
  // bodyweight sets from the latest logged body weight).
  const volume = workoutVolume(workout, bodyWeightKg);

  const handleFinish = async () => {
    setError(null);
    setBusy(true);
    try {
      await onDone({ sharePersonalRecords: personalRecords.length > 0 && sharePRs });
      // onSaveTemplate fires only once onDone has actually succeeded —
      // saving a template for a workout that got rejected would be
      // confusing (the routine exists, but nothing was logged/rewarded).
      if (saveAsTemplate) onSaveTemplate(templateName);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
      <div className="w-full max-w-xs card p-6 flex flex-col gap-5 text-center">
        <div>
          <p className="text-4xl">🔥</p>
          <h2 className="text-2xl text-neutral-50 mt-1">Workout Complete!</h2>
        </div>

        {personalRecords.length > 0 && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 flex flex-col gap-2 text-left">
            <p className="text-sm font-bold text-amber-300 text-center">
              🏆 {personalRecords.length === 1 ? 'New personal record!' : `${personalRecords.length} new personal records!`}
            </p>
            <ul className="flex flex-col gap-0.5">
              {personalRecords.map((pr) => (
                <li key={pr.exerciseId} className="text-xs text-amber-100/90">
                  <span className="font-semibold">{pr.name}</span> — {pr.weight} kg × {pr.reps}
                  <span className="text-amber-100/60"> (was {pr.previousWeight} kg)</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setSharePRs((v) => !v)}
              className="flex items-center gap-2 mt-1"
              role="switch"
              aria-checked={sharePRs}
            >
              <span
                className={`w-9 h-5 shrink-0 rounded-full flex items-center px-0.5 transition-colors ${
                  sharePRs ? 'bg-amber-400' : 'bg-white/15'
                }`}
              >
                <span className={`w-4 h-4 rounded-full bg-white transition-transform ${sharePRs ? 'translate-x-4' : ''}`} />
              </span>
              <span className="text-xs text-amber-100/90">Share to my feed</span>
            </button>
          </div>
        )}

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

        <div className="text-left">
          <button
            type="button"
            onClick={() => setSaveAsTemplate((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/5 border border-white/10"
          >
            <span className="text-sm font-semibold text-neutral-200">📋 Save as Template</span>
            <span
              className="w-11 h-6 shrink-0 rounded-full flex items-center px-0.5 transition-colors"
              style={{ background: saveAsTemplate ? 'var(--tier-accent)' : 'rgba(255,255,255,0.15)' }}
            >
              <span
                className={`w-5 h-5 rounded-full bg-white transition-transform ${saveAsTemplate ? 'translate-x-5' : ''}`}
              />
            </span>
          </button>

          {saveAsTemplate && (
            <input
              autoFocus
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              maxLength={40}
              className="w-full mt-2 bg-neutral-900 rounded-xl px-3.5 py-3 text-base text-neutral-100 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--tier-accent)' }}
            />
          )}
        </div>

        {error && <p className="text-sm text-[var(--danger)] -mb-1">{error}</p>}

        <button
          type="button"
          onClick={handleFinish}
          disabled={busy}
          className="btn-arcade w-full py-4 text-lg disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Done'}
        </button>
        <button type="button" onClick={onBack} disabled={busy} className="text-sm text-neutral-500 -mt-2 disabled:opacity-50">
          ← Back to workout
        </button>
      </div>
    </div>
  );
}
