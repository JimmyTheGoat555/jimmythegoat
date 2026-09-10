import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ExercisePicker from '../workout/ExercisePicker';
import { assignWorkout } from '../../hooks/useAssignedWorkouts';
import { useTrainerTrainees } from '../../hooks/useTrainerTrainees';

export default function AssignWorkoutForm({ profile, exercises }) {
  const { traineeId } = useParams();
  const navigate = useNavigate();
  const { roster } = useTrainerTrainees(profile.id);
  const trainee = roster.find((t) => t.id === traineeId);

  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Same as the active-workout logger: stays open across picks so you can
  // build the whole assigned routine in one visit to the sheet, closing
  // only via its own ✕/backdrop.
  const handleAdd = (exercise) => {
    setSelected((prev) => [
      ...prev,
      { exerciseId: exercise.id, name: exercise.name, muscleGroup: exercise.muscleGroup },
    ]);
  };

  const handleRemove = (exerciseId) => {
    setSelected((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await assignWorkout(traineeId, {
        title: title.trim() || 'Assigned Workout',
        exercises: selected,
        trainerUid: profile.id,
        trainerName: profile.displayName,
      });
      navigate(`/trainees/${traineeId}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-6 pb-24">
      <button
        type="button"
        onClick={() => navigate(`/trainees/${traineeId}`)}
        className="text-sm text-neutral-500 -mb-1"
      >
        ← Back
      </button>

      <div>
        <p className="text-neutral-500 text-lg">Assign to</p>
        <h1 className="text-3xl font-bold text-neutral-50">{trainee?.displayName ?? '…'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          className="w-full bg-neutral-800 text-neutral-50 placeholder-neutral-500 rounded-2xl px-4 py-3.5 text-base outline-none"
          placeholder="Routine name (e.g. Push Day)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          {selected.map((exercise) => (
            <div key={exercise.exerciseId} className="card flex items-center justify-between px-4 py-3.5">
              <span className="text-base text-neutral-100">{exercise.name}</span>
              <button
                type="button"
                onClick={() => handleRemove(exercise.exerciseId)}
                className="text-neutral-500 text-lg leading-none px-1"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full py-4 text-base font-medium text-neutral-300 bg-neutral-900 rounded-2xl"
          >
            + Add Exercise
          </button>
        </div>

        <button
          type="submit"
          disabled={selected.length === 0 || busy}
          className={`w-full font-semibold text-lg py-4 rounded-2xl transition active:scale-[0.98] mt-2 ${
            selected.length === 0 || busy
              ? 'bg-neutral-800 text-neutral-600'
              : 'bg-[var(--success)] text-white'
          }`}
        >
          {busy ? 'Assigning…' : 'Assign Workout'}
        </button>
      </form>

      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          addedExerciseIds={selected.map((e) => e.exerciseId)}
          onAdd={handleAdd}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
