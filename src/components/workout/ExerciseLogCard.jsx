import { useState } from 'react';
import { getMuscleGroup } from '../../data/exercises';
import { formatSets } from '../../utils/lastPerformance';
import SetRow from './SetRow';
import DragHandle from './DragHandle';
import ExerciseTipsSheet from './ExerciseTipsSheet';
import { ENTRY_MODE_SMART, entryKindFor, hasSmartCalculator, smartEntryKind } from '../../utils/setLoad';
import { numberSets } from '../../utils/setCascade';
import { ENTRY_COPY, EntryModeToggle, EquipmentIcon } from './WeightEntryKind';

// Chain link. Inline SVG rather than an emoji so it inherits currentColor
// and sits on the text baseline at any size — the emoji chain renders at a
// different weight on every platform.
function ChainIcon({ broken = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
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

// A tick in a ring — a finished exercise, on its collapsed row. Green is
// already this screen's word for "completed" (a checked set, the Finish
// button), so the accordion borrows it rather than inventing a second
// vocabulary for the same fact.
function DoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </svg>
  );
}

// The accordion's affordance, on a collapsed row: this one opens.
function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-neutral-600"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// A bulb. Same reasoning as ChainIcon below: currentColor and the
// baseline, where the 💡 emoji is a yellow blob of a different weight on
// every platform.
function BulbIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2h5c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z" />
    </svg>
  );
}

export default function ExerciseLogCard({
  exercise,
  lastTime,
  onAddSet,
  onAddDropSet,
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
  // Reorder mode: the card collapses to a single draggable row. See
  // ActiveWorkoutLogger, which owns the mode.
  compact = false,
  // A rest-timer 2× boost is pinned to this exercise and still live — see
  // ActiveWorkoutLogger's isBoosted. Drawn as a chip beside the name so
  // the lifter can see where the ad they watched landed.
  boosted = false,
  // The catalog entry for this exercise — the one with `tips` on it — or
  // null. The workout's own copy of the exercise carries only what the
  // log needs, so the logger looks this up (custom exercises included).
  guide = null,
  // How this exercise's weight is entered — 'smart' (the equipment
  // decides: plates a side, per hand, the stack) or 'total' — and the
  // setter that flips it, from the screen's useWeightEntryModes. Without
  // the setter the column header simply names the mode.
  entryMode = ENTRY_MODE_SMART,
  onEntryModeChange = null,
  // For the live total under a bodyweight set; 0 when unknown.
  bodyWeightKg = 0,
  // ── The accordion ──────────────────────────────────────────────────
  //
  // During a workout exactly one exercise is open; everything else is a
  // one-line row. A five-exercise session used to be a page of forty
  // weight fields to scroll past to reach the two you were actually
  // using — and on a phone, mid-set, that scroll is done one-handed with
  // a dumbbell in the other. Collapsed, the whole session is on one
  // screen and the set you are about to log is always in view.
  //
  // The logger owns which one is open (there is only one answer per
  // screen and it has to survive a card unmounting), so this component
  // is told rather than deciding — the same shape as `compact` above.
  // `onExpand` is null outside a live workout, which is what turns the
  // accordion off for the History editor: there, every card is open.
  expanded = true,
  onExpand = null,
}) {
  const group = getMuscleGroup(exercise.muscleGroup);
  const [tipsOpen, setTipsOpen] = useState(false);
  const hasTips = Boolean(guide?.tips?.length);
  const completedCount = exercise.sets.filter((s) => s.completed).length;
  const isBodyweight = exercise.isBodyweight === true;
  const inSuperset = supersetPosition !== null;
  const entryKind = entryKindFor(exercise.exerciseId, { isBodyweight, mode: entryMode });
  const canSwitchEntry = Boolean(onEntryModeChange) && hasSmartCalculator(exercise.exerciseId, isBodyweight);
  // "Finished" means every set on it is ticked. An exercise with no sets
  // at all is not finished, it is empty — which is why the length check
  // is there and not just `every`, whose answer for an empty list is yes.
  const isFinished = exercise.sets.length > 0 && completedCount === exercise.sets.length;

  // Only working sets take a number; the drops hanging off each one are
  // numbered within it. The rules, and why, are in utils/setCascade.js.
  const numberedSets = numberSets(exercise.sets);
  // The shared shell, so a collapsed row and an open card are the same
  // object in the same place rather than two designs that happen to sit
  // in one list.
  const shellClass = `card overflow-hidden ${isDragging ? 'ring-2 ring-white/25' : ''} ${
    inSuperset ? 'border-l-4 border-l-[var(--ember)]' : ''
  } ${supersetPosition === 'middle' || supersetPosition === 'last' ? '-mt-3' : ''}`;
  const supersetBanner = supersetPosition === 'first' && (
    <div className="flex items-center gap-1.5 bg-[var(--ember)]/12 px-5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--ember)]">
      <ChainIcon /> Superset
    </div>
  );

  // ── Compact (reorder) row ───────────────────────────────────────────
  //
  // Dragging a five-set card means dragging something taller than half
  // the screen: you cannot see where it is going, and the list under your
  // thumb is mostly weight chips you are trying not to hit. Collapsed,
  // the whole workout fits on one screen and a reorder is two seconds.
  //
  // Everything that acts on a set is GONE rather than disabled — a row
  // you are about to drag should have nothing on it worth tapping. The
  // superset rail stays, because a group's members must not look
  // separable when the whole point of the screen is moving them around.
  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border bg-neutral-800/80 py-3 pl-1 pr-3.5 shadow-sm transition ${
          isDragging ? 'border-white/30 shadow-lg' : 'border-white/10'
        } ${inSuperset ? 'border-l-4 border-l-[var(--ember)]' : ''}`}
      >
        {dragHandleProps && <DragHandle {...dragHandleProps} label={exercise.name} className="h-9 w-8" />}
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group?.color }} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">{exercise.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
          {completedCount > 0
            ? `${completedCount}/${exercise.sets.length} sets`
            : `${exercise.sets.length} set${exercise.sets.length === 1 ? '' : 's'}`}
        </span>
      </div>
    );
  }

  // ── Collapsed (accordion) row ───────────────────────────────────────
  //
  // One line: the muscle-group dot, the name, and how far through it you
  // are — a tick once every set is ticked. Tapping it makes this the open
  // one, which closes whichever was.
  //
  // Deliberately NOT the compact reorder row above, which looks like
  // something you are about to drag. This is still a card in the stack;
  // only its contents are folded away.
  if (!expanded && onExpand) {
    return (
      <div className={shellClass}>
        {supersetBanner}
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          className="flex w-full items-center gap-2.5 px-5 py-4 text-left transition active:scale-[0.99]"
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group?.color }} />
          <span
            className={`min-w-0 flex-1 truncate text-base font-semibold ${
              isFinished ? 'text-neutral-400' : 'text-neutral-100'
            }`}
          >
            {exercise.name}
          </span>
          {boosted && (
            <span className="shrink-0 text-[11px] font-bold text-amber-300" title="2× coins on this exercise">
              ⚡
            </span>
          )}
          {isFinished ? (
            <span className="flex shrink-0 items-center gap-1 text-[var(--success)]">
              <DoneIcon />
              <span className="sr-only">Finished</span>
            </span>
          ) : (
            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
              {completedCount}/{exercise.sets.length} sets
            </span>
          )}
          <ChevronIcon />
        </button>
      </div>
    );
  }

  return (
    // Grouped cards close the 12px flex gap with a negative margin and
    // share a left rail, which is as close to "one bordered block" as this
    // design gets: `.card` is a clip-path'd arcade shape with cut corners
    // and no border-radius, so an actual wrapping border would trace a
    // rectangle floating around two notched cards rather than hugging
    // them. The rail plus the closed seam reads as one unit and survives
    // the clip. (shellClass, shared with the collapsed row above.)
    <div className={shellClass}>
      {supersetBanner}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex min-w-0 items-start">
          {dragHandleProps && <DragHandle {...dragHandleProps} label={exercise.name} className="-ml-1 mr-1 h-11 w-8" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: group?.color }} />
              <h3 className="font-semibold text-neutral-100 text-base">{exercise.name}</h3>
              {isFinished && (
                <span className="shrink-0 text-[var(--success)]" title="Every set logged">
                  <DoneIcon />
                </span>
              )}
              {/* Form cues from the mascot — a bulb in the row's grey, the
                same weight as the muscle-group dot beside the name. */}
              {hasTips && (
                <button
                  type="button"
                  onClick={() => setTipsOpen(true)}
                  aria-label={`Form tips for ${exercise.name}`}
                  className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition active:scale-90"
                >
                  <BulbIcon />
                </button>
              )}
              {boosted && (
                <span
                  className="shrink-0 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300"
                  title="Coins for this exercise pay double — you watched an ad during a rest."
                >
                  ⚡ 2× coins
                </span>
              )}
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
        {/* No collapse control here on purpose. There is always exactly
            one open card, and opening another closes this one — a chevron
            beside Remove would be a second way to do the same thing, and
            it cost the exercise name a line of wrapping at 375px to say
            so. The collapsed rows carry the affordance. */}
        <button type="button" onClick={onRemoveExercise} className="shrink-0 px-2 py-1 text-sm text-neutral-500">
          Remove
        </button>
      </div>

      <div className="px-4 pb-1 flex flex-col gap-1">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-1.5 px-1 text-xs text-neutral-600">
          <span className="w-8" />
          {/* The weight column is headed by its entry mode — the override
              toggle where there is a calculator to switch off, a named
              icon where there is not — so what the chips below are asking
              for is stated once, above them, before any number is read. */}
          {/* min-w-0: the pill may be a few pixels wider than the chip
              column at 375px; let it overflow the cell rather than widen
              the track and push the Reps label off its chip. */}
          <span className="flex min-w-0 items-center justify-center">
            {canSwitchEntry ? (
              <EntryModeToggle
                kind={entryKind}
                smartKind={smartEntryKind(exercise.exerciseId, isBodyweight)}
                mode={entryMode}
                onChange={onEntryModeChange}
              />
            ) : (
              <span className="inline-flex items-center gap-1 text-neutral-500">
                <EquipmentIcon kind={entryKind} className="h-3 w-3" />
                {ENTRY_COPY[entryKind].header}
              </span>
            )}
          </span>
          <span className="flex w-12 items-center justify-center">Reps</span>
          <span className="w-10" />
          <span className="w-7" />
        </div>
        {numberedSets.map(({ set, setNo, dropNo }) => (
          <SetRow
            key={set.id}
            setNumber={setNo}
            dropNumber={dropNo}
            set={set}
            exerciseId={exercise.exerciseId}
            isBodyweight={isBodyweight}
            onChange={(patch) => onUpdateSet(set.id, patch)}
            onToggleComplete={() => onUpdateSet(set.id, { completed: !set.completed })}
            // Deliberately the SAME call a manual tick makes, so finishing
            // a value and tapping the tick are indistinguishable to the
            // logger — the rest timer, the 2× boost binding and the
            // overload coaching all hang off `completed: true` there, and
            // a second path into "this set is done" would have to
            // re-implement every one of them. See SetRow's onAutoComplete.
            onAutoComplete={() => onUpdateSet(set.id, { completed: true })}
            // Inserts a row below this one rather than re-labelling this
            // one — a drop set has its own weight and its own reps, and a
            // flag has nowhere to put them. Works the same on a drop set,
            // which is what makes doubles and triples fall out for free.
            onAddDropSet={() => onAddDropSet(set.id)}
            onRemove={() => onRemoveSet(set.id)}
            entryMode={entryMode}
            bodyWeightKg={bodyWeightKg}
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

      {hasTips && <ExerciseTipsSheet exercise={guide} open={tipsOpen} onClose={() => setTipsOpen(false)} />}
    </div>
  );
}
