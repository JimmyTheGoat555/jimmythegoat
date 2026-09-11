import { getExercise } from '../data/exercises';

// "Jimmy's Priority" — orders the exercises in an active workout the way a
// coach would program them, rather than the order they happened to be
// tapped in.
//
// Two rules, applied in order:
//
//   1. Compound before isolation. Multi-joint work is the most technically
//      demanding and the most systemically fatiguing, so it belongs while
//      you're freshest. Curling to failure first and then trying to squat
//      is the mistake this is here to prevent.
//   2. Bigger muscle first. Within the same movement class, legs/back/chest
//      lead, then shoulders, then arms, then core and calves.
//
// Deliberately a STABLE sort: two exercises that tie on both rules keep the
// order the lifter put them in. That matters more than it sounds — someone
// who has consciously arranged bench before incline press should not see
// those two swap around every time a set is logged.

// Lower sorts earlier.
const MOVEMENT_RANK = { compound: 0, isolation: 1 };

// The big three prime movers tie at 1 on purpose: there's no meaningful
// exercise-science claim that back must precede legs, and inventing one
// would just shuffle a lifter's chosen split for no reason.
const GROUP_RANK = {
  legs: 1,
  back: 1,
  chest: 1,
  shoulders: 2,
  biceps: 3,
  triceps: 3,
  core: 4,
};

const FALLBACK_GROUP_RANK = 2; // a custom exercise, in the middle
const FALLBACK_MOVEMENT_RANK = MOVEMENT_RANK.isolation;

// `entry` is an active-workout exercise ({ exerciseId, muscleGroup, ... }).
// Metadata is read from the catalog by id, falling back to whatever the
// entry itself carries, so a custom exercise (absent from the catalog)
// still sorts somewhere sensible instead of being thrown to one end.
export function exercisePriority(entry) {
  const meta = getExercise(entry.exerciseId);
  const movement = meta?.movement;
  const group = meta?.muscleGroup ?? entry.muscleGroup;
  return {
    movementRank: MOVEMENT_RANK[movement] ?? FALLBACK_MOVEMENT_RANK,
    sizeRank: meta?.sizeRank ?? GROUP_RANK[group] ?? FALLBACK_GROUP_RANK,
  };
}

// Returns a NEW array; never mutates the input (the caller is holding React
// state). Array.prototype.sort is guaranteed stable in every engine this
// app runs on, which is what preserves the lifter's own order among ties.
export function sortExercisesByPriority(exercises) {
  return [...exercises].sort((a, b) => {
    const pa = exercisePriority(a);
    const pb = exercisePriority(b);
    return pa.movementRank - pb.movementRank || pa.sizeRank - pb.sizeRank;
  });
}

// True when the list is already in priority order — lets the UI say
// "already optimal" instead of offering a reorder that would visibly do
// nothing.
export function isPrioritySorted(exercises) {
  const sorted = sortExercisesByPriority(exercises);
  return sorted.every((e, i) => e.exerciseId === exercises[i].exerciseId);
}
