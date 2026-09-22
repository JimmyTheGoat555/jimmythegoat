// The finish gate.
//
// logWorkout (functions/economy.js) re-validates every set server-side and
// refuses the WHOLE workout the instant one is out of bounds. That is the
// right call for a payload boundary and the wrong thing to discover after
// the confetti: the celebration used to start optimistically the moment
// "Done" was tapped, so a rejection arrived as a card being yanked off the
// screen and replaced by red text — the app congratulating you and then
// taking it back.
//
// So everything the server can refuse a workout for that THIS DEVICE can
// work out for itself is checked here first, before anything moves. Same
// checks, same order, same bounds — but with the one thing the server
// cannot know: which exercise and which set row the lifter has to go and
// fix. "Weight must be between 1 and 250 kg" is a fact; "Dumbbell Curl,
// set 2 — that works out to 260 kg" is an instruction.
//
// What is deliberately NOT here: anything whose answer lives on the
// server. The workout cooldown, the rest-boost token's validity, whether
// the profile doc exists — a client cannot know those, and guessing at
// them would mean blocking a finish the server would have accepted, which
// is worse than the problem this file exists to solve. Those still come
// back as a rejection and still take the celebration down (App.jsx), and
// that is the correct division: this file is not a second authority, it
// is the same authority consulted earlier.
//
// Run against the RECONCILED payload — the exact array useEconomy sends —
// so what is checked here is what the server will check. See
// reconcileWorkoutLoads in setLoad.js.

import { REPS_MIN, REPS_MAX, WEIGHT_MIN_KG, WEIGHT_MAX_KG } from './units.js';
import { entryTotalOf } from './setLoad.js';
import { isBodyweightExercise } from '../data/exercises.js';

// Mirrors functions/storeCatalog.js. The weight and rep bounds already had
// a home on this side (units.js); these three did not, because until now
// nothing on the client needed to know them.
const MAX_ADDED_WEIGHT_KG = 150;
const MAX_SETS_PER_WORKOUT = 100;
const MAX_EXERCISES_PER_WORKOUT = 40;

const round1 = (n) => Math.round(n * 10) / 10;

// "Dumbbell Curl, set 2" — the exercise by the name on screen, the set by
// its position in its own exercise (NOT the running completed-set count
// the server uses for MAX_SETS_PER_WORKOUT, which corresponds to nothing
// the lifter can see).
function where(exercise, setIndex) {
  const name = typeof exercise?.name === 'string' && exercise.name ? exercise.name : 'This exercise';
  return setIndex === null ? name : `${name}, set ${setIndex + 1}`;
}

// The absolute load the server will score this set at — doubled for a
// dumbbell, added up for a bar. entryTotalOf is the client's side of the
// same rule as economy.js's deriveWeight, and on a reconciled set the two
// agree by construction: the reconciler is what removes the cases where
// they could not.
export function effectiveWeightOf(set, exerciseId) {
  return round1(entryTotalOf(set, exerciseId));
}

// Returns null when the workout will be accepted, or { message } naming
// the first thing that would be refused. First, not all of them: a list of
// five problems is a wall, and fixing the first usually fixes the rest.
export function firstWorkoutProblem(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { message: 'A workout needs at least one exercise.' };
  }
  if (exercises.length > MAX_EXERCISES_PER_WORKOUT) {
    return { message: `A single workout can't include more than ${MAX_EXERCISES_PER_WORKOUT} exercises.` };
  }

  let completedSets = 0;
  const claimedTokens = new Set();

  for (const exercise of exercises) {
    if (!exercise || typeof exercise.exerciseId !== 'string' || !Array.isArray(exercise.sets)) {
      return { message: 'One of these exercises is malformed — remove it and add it again.' };
    }

    // Trusted from the seed catalog, exactly as the server trusts its own
    // list — never the `isBodyweight` flag sitting on the payload.
    const isBodyweight = isBodyweightExercise(exercise.exerciseId);

    // The same token on two exercises is a rejection, not a warning. It
    // needs two entries sharing an exerciseId to happen at all, which
    // addExercise() prevents — but a routine seeded through emptyWorkout()
    // is not deduped, so it is reachable, and unreachable-looking things
    // are exactly what this file is for.
    const boostTokenId = exercise.boostTokenId;
    if (typeof boostTokenId === 'string' && boostTokenId) {
      if (claimedTokens.has(boostTokenId)) {
        return { message: `${where(exercise, null)} is sharing a rest-timer boost with another exercise.` };
      }
      claimedTokens.add(boostTokenId);
    }

    for (let i = 0; i < exercise.sets.length; i += 1) {
      const set = exercise.sets[i];
      // Un-ticked rows don't count toward the workout, so they don't count
      // against it either — a half-typed set left behind is not an error.
      if (!set?.completed) continue;

      completedSets += 1;
      if (completedSets > MAX_SETS_PER_WORKOUT) {
        return { message: `A single workout can't log more than ${MAX_SETS_PER_WORKOUT} sets.` };
      }

      const reps = Number(set.reps);
      if (!Number.isInteger(reps) || reps < REPS_MIN || reps > REPS_MAX) {
        const blank = set.reps === '' || set.reps === null || set.reps === undefined;
        return {
          message: blank
            ? `${where(exercise, i)} is ticked off but has no reps.`
            : `${where(exercise, i)}: reps must be a whole number between ${REPS_MIN} and ${REPS_MAX} — that one says ${set.reps}.`,
        };
      }

      if (isBodyweight) {
        // The entered weight is meaningless here (body weight is the load,
        // folded in server-side); only the belt is bounded.
        const added = round1(Number(set.addedWeight) || 0);
        if (!Number.isFinite(added) || added < 0 || added > MAX_ADDED_WEIGHT_KG) {
          return {
            message: `${where(exercise, i)}: added weight must be between 0 and ${MAX_ADDED_WEIGHT_KG} kg — that one says ${set.addedWeight}.`,
          };
        }
        continue;
      }

      const weight = effectiveWeightOf(set, exercise.exerciseId);
      if (!Number.isFinite(weight) || weight < WEIGHT_MIN_KG || weight > WEIGHT_MAX_KG) {
        const blank = set.weight === '' || set.weight === null || set.weight === undefined;
        if (blank) return { message: `${where(exercise, i)} is ticked off but has no weight.` };
        // Say both numbers whenever they differ. They differ for a real
        // reason — a dumbbell set stores one hand and scores the pair —
        // and quoting only the one that was typed produced the one error
        // nobody could act on: "got 40", for a set worth 260.
        const typed = round1(Number(set.weight));
        const from = Number.isFinite(typed) && typed !== weight ? ` (${typed} kg per hand, doubled)` : '';
        return {
          message: `${where(exercise, i)}: weight must be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg — that set works out to ${weight} kg${from}.`,
        };
      }
    }
  }

  if (completedSets === 0) {
    return { message: 'Log at least one completed set to finish a workout.' };
  }

  return null;
}
