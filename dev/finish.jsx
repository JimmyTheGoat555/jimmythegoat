import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import WorkoutSummaryModal from '../src/components/workout/WorkoutSummaryModal';
import LockerReminderModal from '../src/components/workout/LockerReminderModal';
import { firstWorkoutProblem } from '../src/utils/validateWorkout';
import { reconcileWorkoutLoads } from '../src/utils/setLoad';
import { tierCssVars } from '../src/utils/tierTheme';

// The order of operations at the end of a workout, made watchable.
//
// The thing under test is not the validator — tools/validateWorkout.test.mjs
// covers that against the real server validator — it is the SEQUENCE
// App.jsx's handleFinishWorkout runs in: validate, and only then
// celebrate. That used to be the other way round, so a workout the server
// refused got a celebration first and an error afterwards, and the lifter
// watched the app congratulate them and then take it back.
//
// Each button below loads a workout with one specific problem and hands it
// to the real WorkoutSummaryModal wired to the same gate App.jsx uses. The
// "CELEBRATION" banner is this page's stand-in for the finish flow: it
// only ever appears if the gate let the workout through.
//
// The valid cases also show the step that now comes BEFORE it — the real
// LockerReminderModal, when the session recorded a locker number. The
// celebration must not be on screen until it is dismissed; that ordering
// is the thing this page makes watchable.
//
// Dev only — this page is never built.

const set = (over = {}) => ({ id: crypto.randomUUID(), weight: 60, reps: 8, completed: true, ...over });

const CASES = [
  {
    label: 'Valid, with a locker',
    hint: 'gate passes → LOCKER → celebration',
    lockerNumber: '42',
    exercises: [
      { exerciseId: 'bench-press', name: 'Bench Press', muscleGroup: 'chest', sets: [set(), set({ weight: 80, reps: 5 })] },
    ],
  },
  {
    label: 'Valid workout',
    hint: 'no locker → straight to celebration',
    exercises: [
      { exerciseId: 'bench-press', name: 'Bench Press', muscleGroup: 'chest', sets: [set(), set({ weight: 80, reps: 5 })] },
      { exerciseId: 'db-curl', name: 'Dumbbell Curl', muscleGroup: 'arms', sets: [set({ weight: 30, reps: 12 })] },
    ],
  },
  {
    label: 'Ticked set, no weight',
    hint: 'the commonest one',
    exercises: [
      { exerciseId: 'bench-press', name: 'Bench Press', muscleGroup: 'chest', sets: [set(), set({ weight: '' })] },
    ],
  },
  {
    label: 'Ticked set, no reps',
    hint: '',
    exercises: [{ exerciseId: 'squat', name: 'Squat', muscleGroup: 'legs', sets: [set({ reps: '' })] }],
  },
  {
    label: 'Dumbbell over the cap',
    hint: '130/hand = 260 kg — names BOTH numbers',
    exercises: [{ exerciseId: 'db-curl', name: 'Dumbbell Curl', muscleGroup: 'arms', sets: [set({ weight: 130 })] }],
  },
  {
    label: 'Stale localStorage draft',
    hint: 'weight 40 + perHandWeight 130 — repaired, NOT refused',
    exercises: [
      {
        exerciseId: 'db-curl',
        name: 'Dumbbell Curl',
        muscleGroup: 'arms',
        sets: [set({ weight: 40, perHandWeight: 130, isPerHand: true })],
      },
    ],
  },
  {
    label: 'Reps out of range',
    hint: '',
    exercises: [{ exerciseId: 'deadlift', name: 'Deadlift', muscleGroup: 'back', sets: [set({ reps: 40 })] }],
  },
  {
    label: 'Nothing ticked off',
    hint: '',
    exercises: [
      { exerciseId: 'bench-press', name: 'Bench Press', muscleGroup: 'chest', sets: [set({ completed: false })] },
    ],
  },
];

function Harness() {
  const [caseIndex, setCaseIndex] = useState(0);
  // The same one-field machine App.jsx runs: null → 'locker' → 'celebration'.
  const [step, setStep] = useState(null);
  const [log, setLog] = useState([]);
  const celebrating = step === 'celebration';

  const active = CASES[caseIndex];
  const workout = {
    id: 'w',
    startedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    exercises: active.exercises,
    lockerNumber: active.lockerNumber ?? null,
  };

  const note = (line) => setLog((prev) => [...prev, line]);

  // The same three steps as App.jsx's handleFinishWorkout, in the same
  // order. Step 3's logWorkout is faked — what this page is showing is
  // that step 2 can stop the sequence before step 3 ever starts.
  const onDone = async () => {
    note('1 · validate');
    const problem = firstWorkoutProblem(reconcileWorkoutLoads(workout.exercises));
    if (problem) {
      note('2 · BLOCKED — no celebration');
      const blocked = new Error(problem.message);
      blocked.finishBlocked = true;
      throw blocked;
    }
    note('2 · passed');
    // App.jsx's `firstStep`: the locker reminder holds the celebration back
    // when the session recorded a number, and is skipped entirely when it
    // did not.
    if (workout.lockerNumber) {
      note(`3 · LOCKER ${workout.lockerNumber} — celebration waits`);
      setStep('locker');
      return;
    }
    note('3 · celebrate + save');
    setStep('celebration');
  };

  return (
    <div className="min-h-dvh p-4 flex flex-col gap-4" style={tierCssVars(3)}>
      <header>
        <h1 className="text-xl text-neutral-50">Finish gate</h1>
        <p className="text-sm text-neutral-400">Validate first. Celebrate only if it passes.</p>
      </header>

      <div className="pointer-events-none relative z-[60] flex flex-wrap gap-2">
        {CASES.map((c, i) => (
          <button
            key={c.label}
            type="button"
            onClick={() => {
              setCaseIndex(i);
              setStep(null);
              setLog([]);
            }}
            className={`pointer-events-auto px-3 py-2 rounded-lg text-sm text-left ${
              i === caseIndex ? 'bg-[var(--tier-accent)] text-black' : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            <span className="block font-semibold">{c.label}</span>
            {c.hint && <span className="block text-[11px] opacity-70">{c.hint}</span>}
          </button>
        ))}
      </div>

      <div className="pointer-events-none relative z-[60] rounded-lg bg-neutral-900/90 p-3 font-mono text-xs text-neutral-400 min-h-20">
        {log.length === 0 ? <p className="opacity-50">Tap “Done” in the card below.</p> : log.map((l, i) => <p key={i}>{l}</p>)}
      </div>

      {celebrating && (
        <div
          data-testid="celebration"
          className="rounded-lg p-6 text-center text-black font-extrabold text-2xl"
          style={{ background: 'var(--tier-accent)' }}
        >
          🎉 CELEBRATION
        </div>
      )}

      {step === 'locker' && (
        <LockerReminderModal
          lockerNumber={workout.lockerNumber}
          onClose={() => {
            note('4 · locker acknowledged → celebrate');
            setStep('celebration');
          }}
        />
      )}

      {step === null && (
        <WorkoutSummaryModal
          key={caseIndex}
          workout={workout}
          bodyWeightKg={80}
          onDone={onDone}
          onBack={() => setLog([])}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
