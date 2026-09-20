import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import ExercisePicker from '../src/components/workout/ExercisePicker';
import ExerciseLogCard from '../src/components/workout/ExerciseLogCard';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { useExercises } from '../src/hooks/useExercises';
import { getExercise } from '../src/data/exercises';
import { tierCssVars } from '../src/utils/tierTheme';
import { applySetPatch } from '../src/utils/setCascade';

// The exercise picker and one workout card with sample data, so the (i)
// guide sheet and the mascot's tips sheet can be opened without a
// workout running on a real account.
//
//   ?mascot=gena    Gena delivers the tips (default Jimmy)
//   ?stage=3        her/his evolution stage (default 3)
//   ?tier=legend    which tier palette (goat | buff | titan | legend)
//   ?exercise=squat which catalog entry the card shows (default bench-press)

const params = new URLSearchParams(location.search);
const MASCOT = params.get('mascot') === 'gena' ? 'gena' : 'jimmy';
const STAGE = Number(params.get('stage')) || 3;
const TIER = params.get('tier') || 'legend';
const EXERCISE_ID = params.get('exercise') || 'bench-press';

function Harness() {
  const exercises = useExercises('dev');
  const [pickerOpen, setPickerOpen] = useState(false);
  const catalog = getExercise(EXERCISE_ID) ?? getExercise('bench-press');
  // Three blank sets, edited through the same cascade the active workout
  // uses (utils/setCascade.js), so the smart auto-fill can be watched on
  // the real rows and sheet. window.__patch(setId, patch) drives it from
  // the console.
  const [sets, setSets] = useState([
    { id: 's1', weight: '', reps: '', completed: false },
    { id: 's2', weight: '', reps: '', completed: false },
    { id: 's3', weight: '', reps: '', completed: false },
  ]);
  const patchSet = (id, patch) => setSets((s) => applySetPatch(s, id, patch));
  window.__patch = patchSet;
  window.__sets = sets;
  const exercise = {
    exerciseId: catalog.id,
    name: catalog.name,
    muscleGroup: catalog.muscleGroup,
    isBodyweight: catalog.isBodyweight === true,
    sets,
  };
  const account = { mascot: MASCOT, equippedAccessories: [] };

  return (
    <JimmyLookProvider evolutionStage={STAGE} account={account}>
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4" style={tierCssVars(TIER)}>
        <button
          id="open-picker"
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-xl bg-white/10 px-3 py-2 text-sm"
        >
          Open exercise picker
        </button>
        <ExerciseLogCard
          exercise={exercise}
          guide={exercises.getExercise(exercise.exerciseId) ?? null}
          lastTime={null}
          onAddSet={() => setSets((s) => [...s, { id: `s${s.length + 1}`, weight: 80, reps: 5, completed: false }])}
          onUpdateSet={patchSet}
          onRemoveSet={(id) => setSets((s) => s.filter((set) => set.id !== id))}
          onRemoveExercise={() => {}}
        />
        {pickerOpen && (
          <ExercisePicker
            exercises={exercises}
            addedExerciseIds={[exercise.exerciseId]}
            initialGroup={catalog.muscleGroup}
            onAdd={() => {}}
            onRemove={() => {}}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </JimmyLookProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
