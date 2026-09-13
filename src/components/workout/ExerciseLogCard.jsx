import { getMuscleGroup } from '../../data/exercises';
import { formatSets } from '../../utils/lastPerformance';
import SetRow from './SetRow';

// The six-dot grip. Only rendered while manual sorting is on — a handle
// that can't do anything is worse than no handle.
function DragHandle(props) {
  return (
    <button
      type="button"
      aria-label={`Reorder ${props['aria-exercise'] ?? 'exercise'}`}
      className="-ml-1 mr-1 flex h-11 w-8 shrink-0 cursor-grab items-center justify-center text-neutral-500 active:cursor-grabbing active:text-neutral-200"
      {...props}
      aria-exercise={undefined}
    >
      <svg viewBox="0 0 10 16" className="h-4 w-2.5" aria-hidden="true">
        {[0, 1, 2].map((row) =>
          [0, 1].map((col) => (
            <circle key={`${row}-${col}`} cx={col * 6 + 2} cy={row * 6 + 2} r="1.5" fill="currentColor" />
          )),
        )}
      </svg>
    </button>
  );
}

// Chain link. Inline SVG rather than an emoji so it inherits currentColor
// and sits on the text baseline at any size — the emoji chain renders at a
// different weight on every platform.
function ChainIcon({ broken = false }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M9.5 14.5 14.5 9.5" />
      {broken ? (
        <>
          <path d="M8 11 6.5 12.5a3.5 3.5 0 0 0 5 5L13 16" />
          <path d="M16 13l1.5-1.5a3.5 3.5 0 0 0-5-5L11 8" />
          <path d="M4 4l16 16" />
        </>
      ) : (
        <>
          <path d="M8.5 12 7 13.5a3.5 3.5 0 0 0 5 5l1.5-1.5" />
          <path d="M15.5 12 17 10.5a3.5 3.5 0 0 0-5-5L10.5 7" />
        </>
      )}
    </svg>
  );
}

export default function ExerciseLogCard({
  exercise,
  lastTime,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onRemoveExercise,
  dragHandleProps = null,
  isDragging = false,
  // Where this card sits in its superset: null when it is not in one, else
  // 'first' | 'middle' | 'last'. Computed by the logger, which is the only
  // place that can see the neighbours.
  supersetPosition = null,
  // Shown only when there IS a next exercise to link to.
  onLinkNext = null,
  onUnlink = null,
}) {
  const group = getMuscleGroup(exercise.muscleGroup);
  const completedCount = exercise.sets.filter((s) => s.completed).length;
  const isBodyweight = exercise.isBodyweight === true;
  const inSuperset = supersetPosition !== null;

  return (
    <div
      // Grouped cards close the 12px flex gap with a negative margin and
      // share a left rail, which is as close to "one bordered block" as
      // this design gets: `.card` is a clip-path'd arcade shape with cut
      // corners and no border-radius, so an actual wrapping border would
      // trace a rectangle floating around two notched cards rather than
      // hugging them. The rail plus the closed seam reads as one unit and
      // survives the clip.
      className={`card overflow-hidden ${isDragging ? 'ring-2 ring-white/25' : ''} ${
        inSuperset ? 'border-l-4 border-l-[var(--ember)]' : ''
      } ${supersetPosition === 'middle' || supersetPosition === 'last' ? '-mt-3' : ''}`}
    >
      {supersetPosition === 'first' && (
        <div className="flex items-center gap-1.5 bg-[var(--ember)]/12 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--ember)]">
          <ChainIcon /> Superset
        </div>
      )}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex min-w-0 items-start">
          {dragHandleProps && <DragHandle {...dragHandleProps} aria-exercise={exercise.name} />}
          <div className="min-w-0">
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
        </div>
        <button type="button" onClick={onRemoveExercise} className="shrink-0 text-sm text-neutral-500 px-2 py-1">
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
            onToggleDropSet={() => onUpdateSet(set.id, { isDropSet: !set.isDropSet })}
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

      {/* Lives on the bottom edge of the card rather than floating between
          two cards, because the list that renders these (ReorderableList)
          measures and drags whole items — an element sitting in the gap
          would be dragged around as part of neither. */}
      {(onLinkNext || onUnlink) && (
        <div className="border-t border-neutral-800/60">
          {onUnlink ? (
            <button
              type="button"
              onClick={onUnlink}
              className="flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold text-neutral-500 active:scale-[0.98] transition"
            >
              <ChainIcon broken /> Break superset
            </button>
          ) : (
            <button
              type="button"
              onClick={onLinkNext}
              className="flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold text-neutral-500 active:scale-[0.98] transition"
            >
              <ChainIcon /> Superset with next
            </button>
          )}
        </div>
      )}
    </div>
  );
}
