import { getMuscleGroup } from '../../data/exercises';
import { formatSets } from '../../utils/lastPerformance';
import SetRow from './SetRow';

export default function ExerciseLogCard({ exercise, lastTime, onAddSet, onUpdateSet, onRemoveSet, onRemoveExercise }) {
  const group = getMuscleGroup(exercise.muscleGroup);
  const completedCount = exercise.sets.filter((s) => s.completed).length;
  const isBodyweight = exercise.isBodyweight === true;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group?.color }} />
            <h3 className="font-semibold text-neutral-100 text-base">{exercise.name}</h3>
          </div>
          <p className="text-sm text-neutral-500 mt-0.5">
            {completedCount}/{exercise.sets.length} sets completed
          </p>
          {lastTime && lastTime.sets.length > 0 && (
            <p className="text-xs text-neutral-600 mt-1 truncate" title={`Last time: ${formatSets(lastTime.sets)}`}>
              <span className="text-neutral-500">Last time</span> · {formatSets(lastTime.sets)}
            </p>
          )}
        </div>
        <button type="button" onClick={onRemoveExercise} className="text-sm text-neutral-500 px-2 py-1">
          Remove
        </button>
      </div>

      <div className="px-4 pb-1 flex flex-col gap-1">
        <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 px-1 text-xs text-neutral-600">
          <span className="w-5" />
          <span className="text-center">{isBodyweight ? 'Load' : 'Weight'}</span>
          <span className="text-center">Reps</span>
          <span className="w-11" />
          <span className="w-11" />
        </div>
        {exercise.sets.map((set, i) => (
          <SetRow
            key={set.id}
            index={i}
            set={set}
            exerciseId={exercise.exerciseId}
            isBodyweight={isBodyweight}
            // Seed the set entry sheet from the matching set last time
            // (falling back to that session's final set), so opening it
            // pre-fills a sensible guess instead of a blank wheel.
            lastSet={lastTime?.sets?.[i] ?? lastTime?.sets?.at(-1) ?? null}
            onChange={(patch) => onUpdateSet(set.id, patch)}
            onToggleComplete={() => onUpdateSet(set.id, { completed: !set.completed })}
            onRemove={() => onRemoveSet(set.id)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onAddSet}
        className="w-full py-4 text-base font-medium text-[var(--ember)] border-t border-neutral-800/60"
      >
        + Add Set
      </button>
    </div>
  );
}
