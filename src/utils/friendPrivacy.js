import { getEvolutionProgress } from './evolutionTiers';
import { readEquippedAccessories } from '../data/storeItems';

// What a friend's profile view is allowed to know.
//
// READ THIS BEFORE TRUSTING IT. This function is a second fence, not the
// first one. Anything it receives has ALREADY been fetched into the
// browser, where it sits in memory and in the network tab no matter what
// React renders. Sanitising on the client cannot make data private; it can
// only keep it off the screen.
//
// The fence that actually matters is upstream and already in place:
//
//   * A friend's real users/{uid} doc is unreadable — owner and connected
//     trainer only (firestore.rules). Their email, coins, friends list and
//     body-weight log never leave the server.
//   * The only readable surface is users/{uid}/public/summary, written
//     exclusively by Cloud Functions (functions/publicProfile.js).
//   * PRs are not flagged-and-hidden, they are ABSENT: turning sharing off
//     deletes `personalRecords` from the published document outright. A
//     reader has nothing to filter because there is nothing there.
//
// So why have this at all? Because `public/summary` will grow. The next
// person to add a field to it — a streak, a body weight, a location — gets
// it rendered by any view that spreads the fetched object. An allowlist
// makes that failure land as a missing field in the UI, which someone
// notices, instead of an accidental disclosure, which nobody does. That is
// the whole value, and it is worth having.
//
// Hence: allowlist, never blocklist. Fields are copied out one at a time
// and everything unrecognised is dropped on the floor.

// A saved routine, stripped to its shape. Weights are the comparison this
// whole screen exists to avoid, so they never survive — not zeroed, not
// nulled-but-present, gone. Sets and reps stay, because the point is that
// a friend can copy the routine.
function sanitizeRoutine(routine) {
  if (!routine || typeof routine !== 'object') return null;
  const exercises = Array.isArray(routine.exercises) ? routine.exercises : [];
  return {
    id: routine.id ?? null,
    name: typeof routine.name === 'string' ? routine.name : 'Untitled routine',
    exercises: exercises.map((exercise) => {
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
      // Rep counts collapse to a range: "3 x 8-10" reads as a routine,
      // where a per-set list starts to read as a log.
      const reps = sets
        .map((set) => Number(set?.reps))
        .filter((n) => Number.isFinite(n) && n > 0);
      const low = reps.length ? Math.min(...reps) : null;
      const high = reps.length ? Math.max(...reps) : null;
      return {
        id: exercise?.id ?? exercise?.exerciseId ?? null,
        name: typeof exercise?.name === 'string' ? exercise.name : 'Exercise',
        setCount: sets.length,
        repRange: low == null ? null : { low, high },
      };
    }),
  };
}

// A single PR, keeping the lift and dropping nothing else — a PR IS its
// weight, so there is no weightless version of one. The privacy decision
// for records is whether the record appears at all, which is what the
// filter below is for.
function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const weight = Number(record.weight);
  if (!Number.isFinite(weight)) return null;
  return {
    exerciseId: record.exerciseId ?? null,
    name: typeof record.name === 'string' ? record.name : 'Lift',
    weight,
    reps: Number.isFinite(Number(record.reps)) ? Number(record.reps) : null,
  };
}

export function sanitizeFriendData(rawData) {
  const raw = rawData ?? {};

  // Tier comes from lifetimeVolume, and only the tier does. The number is
  // consumed here and deliberately not re-exported, so a caller cannot
  // render it by reaching through this object.
  //
  // Note the limit honestly: the raw figure is still in the document the
  // client fetched. If the exact number must never reach a friend's
  // device, publicProfile.js has to publish the derived stage INSTEAD of
  // the volume — a server change, not one this file can make.
  const { current, next, percent, isMaxTier } = getEvolutionProgress(
    Number(raw.lifetimeVolume) || 0,
  );

  // Absent means never shared. `isPublic !== false` rather than
  // `=== true` on purpose: today the server publishes an all-or-nothing
  // list with no per-record flag, so requiring `true` would hide every
  // record that exists. This shape accepts a future per-record opt-in
  // without pretending one is already there.
  const sharedRecords = raw.sharePRs === true && Array.isArray(raw.personalRecords)
    ? raw.personalRecords.filter((r) => r?.isPublic !== false).map(sanitizeRecord).filter(Boolean)
    : [];

  const routines = Array.isArray(raw.savedWorkouts)
    ? raw.savedWorkouts.map(sanitizeRoutine).filter(Boolean)
    : [];

  return {
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,

    // Everything the avatar needs, and nothing that identifies them.
    evolutionStage: current.stage,
    tierId: current.id,
    tierLabel: current.label,
    equippedAccessories: readEquippedAccessories(raw),

    // The bar, without the numbers behind it. `percent` is a position, not
    // a measurement — you cannot read a volume back off a rounded
    // percentage without also knowing the thresholds and doing algebra,
    // and the copy never states either end.
    progressPercent: Math.round(percent),
    nextTierLabel: next?.label ?? null,
    isMaxTier,

    personalRecords: sharedRecords,
    sharesRecords: raw.sharePRs === true,
    savedRoutines: routines,
  };
}
