import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ActiveWorkoutLogger from '../src/components/workout/ActiveWorkoutLogger';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { useExercises } from '../src/hooks/useExercises';
import { useActiveWorkout } from '../src/hooks/useWorkouts';
import { useRestTimer } from '../src/hooks/useRestTimer';
import { getExercise } from '../src/data/exercises';
import { tierCssVars } from '../src/utils/tierTheme';

// The whole active-workout screen on a throwaway local workout (uid
// 'dev', so nothing touches a real account), with the rest timer owned
// here the way App.jsx owns it. For watching Chill Mode: the snowflake
// in the header, what checking a set does with it on and off, and the
// stopwatch that starts a rest by hand.
//
//   ?seconds=5      rest length (default 90)
//   ?tier=legend    which tier palette (goat | buff | titan | legend)
//   ?lock=1         show the wake-lock padlock, the header at its widest
//
// window.__rest is the timer, window.__workout the session (and
// window.__session its mutators, for seeding sets from the console), and
// window.__reset() throws the session away and starts a fresh one.

const params = new URLSearchParams(location.search);
const SECONDS = Number(params.get('seconds')) || 90;
const TIER = params.get('tier') || 'legend';
const LOCK = params.get('lock') === '1';
const PRESET = ['bench-press', 'squat']
  .map((id) => getExercise(id))
  .filter(Boolean)
  .map((exercise) => ({ exerciseId: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup }));

function Harness() {
  const exercises = useExercises('dev');
  const session = useActiveWorkout('dev');
  const rest = useRestTimer(SECONDS);
  const { activeWorkout, startWorkout, discardWorkout } = session;

  useEffect(() => {
    if (!activeWorkout) startWorkout(PRESET);
  }, [activeWorkout, startWorkout]);

  window.__rest = rest;
  window.__workout = activeWorkout;
  window.__session = session;
  window.__reset = () => {
    rest.dismiss();
    discardWorkout();
  };

  if (!activeWorkout) return null;
  return (
    <JimmyLookProvider evolutionStage={3} account={{ mascot: 'jimmy', equippedAccessories: [] }}>
      <div className="mx-auto min-h-screen max-w-md px-4" style={tierCssVars(TIER)}>
        <ActiveWorkoutLogger
          workout={activeWorkout}
          exercises={exercises}
          screenLockActive={LOCK}
          onAddExercise={session.addExercise}
          onRemoveExercise={session.removeExercise}
          onAddSet={session.addSet}
          onUpdateSet={session.updateSet}
          onRemoveSet={session.removeSet}
          onReorderExercises={session.reorderExercises}
          onLinkSuperset={session.linkSuperset}
          onUnlinkSuperset={session.unlinkSuperset}
          onFinish={window.__reset}
          onMinimize={() => {}}
          onDiscard={window.__reset}
          askForLocker={false}
          onAnswerLocker={session.answerLocker}
          onDisableLockerPrompt={() => {}}
          rest={rest}
          onBindRestBoost={session.bindRestBoost}
        />
      </div>
    </JimmyLookProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
