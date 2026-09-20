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

// The active-workout screen on a throwaway local workout (uid 'dev', so
// nothing touches a real account), with one exercise of every entry kind
// so the set chips, the column-header toggle and the set sheet can be
// seen side by side: a barbell (plates a side), a dumbbell pair (per
// hand), a machine (the stack), a bodyweight movement (BW + belt) and a
// single dumbbell (the plain total, never doubled).
//
//   ?exercises=bench-press,lateral-raise   which catalog ids (default below)
//   ?tier=legend                           which tier palette
//   ?bw=82                                 body weight for the bodyweight total
//
// window.__workout is the session, window.__session its mutators (for
// seeding sets from the console), and window.__reset() throws the
// session away and starts a fresh one.

const params = new URLSearchParams(location.search);
const TIER = params.get('tier') || 'legend';
const BODY_WEIGHT = Number(params.get('bw')) || 82;
const DEFAULT_IDS = ['bench-press', 'incline-db-press', 'lat-pulldown', 'pull-up', 'goblet-squat'];
const IDS = (params.get('exercises') || '').split(',').filter(Boolean);
const PRESET = (IDS.length ? IDS : DEFAULT_IDS)
  .map((id) => getExercise(id))
  .filter(Boolean)
  .map((exercise) => ({
    exerciseId: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    isBodyweight: exercise.isBodyweight === true,
  }));

function Harness() {
  const exercises = useExercises('dev');
  const session = useActiveWorkout('dev');
  const rest = useRestTimer(90);
  const { activeWorkout, startWorkout, discardWorkout } = session;

  useEffect(() => {
    if (!activeWorkout) startWorkout(PRESET);
  }, [activeWorkout, startWorkout]);

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
          screenLockActive={false}
          bodyWeightKg={BODY_WEIGHT}
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
