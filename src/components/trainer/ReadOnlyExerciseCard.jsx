import { getMuscleGroup } from '../../data/exercises';

// A trainer's view of one exercise within a trainee's workout — same
// visual language as ExerciseLogCard, but plain text instead of editable
// inputs (a coach can look, never rewrite a trainee's logged numbers).
export default function ReadOnlyExerciseCard({ exercise }) {
  const group = getMuscleGroup(exercise.muscleGroup);
  const completedCount = exercise.sets.filter((s) => s.completed).length;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group?.color }} />
          <h3 className="font-semibold text-neutral-100 text-base">{exercise.name}</h3>
        </div>
        <p className="text-sm text-neutral-500 mt-0.5">
          {completedCount}/{exercise.sets.length} sets completed
        </p>
      </div>

      <div className="px-5 pb-4 flex flex-col gap-1.5">
        {exercise.sets.map((set, i) => (
          <div
            key={set.id}
            className={`flex items-center gap-3 text-sm rounded-xl px-3 py-2 ${
              set.completed ? 'bg-[var(--success)]/15' : 'bg-neutral-900'
            }`}
          >
            <span className="text-neutral-500 w-4 tabular-nums">{i + 1}</span>
            <span className="text-neutral-100 tabular-nums flex-1">
              {set.weight || '—'} kg × {set.reps || '—'} reps
            </span>
            {set.completed && <span className="text-[var(--success)]">✓</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
