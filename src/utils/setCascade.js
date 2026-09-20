// Smart cascading set inputs — the active workout's answer to typing the
// same numbers five times for five straight sets.
//
// When a set's load or reps change, the same values flow DOWN to every
// later set in the exercise that is still open to them. Two rules decide
// which sets those are, and they are the whole feature:
//
//   * Down, never up. Editing set 2 fills sets 3 and 4 and leaves set 1
//     exactly as it was. A lifter working down the list can correct any
//     set and only what is below it follows.
//   * A completed set is never rewritten. A checked set is a record of
//     what happened, not a plan; the cascade skips it and carries on to
//     the open sets beneath.
//
// One extension of the second rule, and it runs BOTH ways: a drop set
// neither receives the cascade nor starts one.
//
//   * It does not receive: its load is a deliberate step down from the set
//     above, so filling it with that set's weight would undo the one thing
//     that makes it a drop set.
//   * It does not send: its load is a step DOWN and its reps are whatever
//     failure gave at that weight. Cascading either into the working sets
//     underneath would load the next straight set at the finisher's
//     weight — and a drop set now sits in the middle of the list with
//     working sets beneath it, so this is not hypothetical. Type 51 x 7
//     into a drop off set 2 and set 3 would quietly become 51 x 7.
//
// The cascade only happens in the ACTIVE workout (useWorkouts.updateSet).
// Editing a finished workout in History changes one set at a time, as it
// always did — that screen corrects a record, it does not plan one.

// The load travels as a unit: the absolute weight AND the entry context
// the sheet writes beside it (bar, plates per side, per-dumbbell weight),
// so a later set re-opens showing the same bar and plates rather than
// back-solving them from the total. See utils/setLoad.js for the fields.
const LOAD_FIELDS = ['weight', 'addedWeight', 'barWeight', 'weightPerSide', 'perHandWeight', 'isPerHand'];
const REPS_FIELDS = ['reps'];

// The part of `patch` that flows down: whichever of the two groups it
// touches, and nothing else. `completed`, `isDropSet` and the id are
// decisions about ONE set and never travel.
export function cascadePatch(patch) {
  const out = {};
  for (const group of [LOAD_FIELDS, REPS_FIELDS]) {
    if (!group.some((field) => field in patch)) continue;
    for (const field of group) if (field in patch) out[field] = patch[field];
  }
  return out;
}

export function acceptsCascade(set) {
  return set.completed !== true && set.isDropSet !== true;
}

// `sets` with `patch` applied to the set with `setId`, and its load/reps
// carried down to every later set that accepts them. A set whose values
// already match keeps its object, so rows that did not change do not
// re-render; a set that does not accept the cascade is untouched.
export function applySetPatch(sets, setId, patch) {
  const index = sets.findIndex((s) => s.id === setId);
  if (index === -1) return sets;
  // Nothing flows out of a drop set — see the header. `acceptsCascade`
  // below is the other half of the same rule.
  const flow = sets[index]?.isDropSet === true ? {} : cascadePatch(patch);
  const fields = Object.keys(flow);
  return sets.map((set, i) => {
    if (i === index) return { ...set, ...patch };
    if (i < index || fields.length === 0 || !acceptsCascade(set)) return set;
    return fields.every((field) => set[field] === flow[field]) ? set : { ...set, ...flow };
  });
}

// ── Numbering a list that has drop sets in it ───────────────────────────
//
// The other place a drop set changes an answer, and the reason it lives
// here beside acceptsCascade: both are the same statement — a drop set
// belongs to the set above it, not beside it.
//
// So only WORKING sets take a number. Numbering the drops would tell a
// lifter who did three sets and two drops that they did five, and every
// row below one would renumber the moment it was added. `dropNo` is the
// row's place in the chain hanging off `setNo`, counting from 1, and it
// resets on every working set — which is all a double or a triple drop
// needs to read correctly.
//
// A drop whose working set was deleted out from under it numbers from
// zero; SetRow renders that as a bare "Drop 1" rather than "Set 0".
export function numberSets(sets) {
  let setNo = 0;
  let dropNo = 0;
  return (sets ?? []).map((set) => {
    if (set?.isDropSet === true) dropNo += 1;
    else {
      setNo += 1;
      dropNo = 0;
    }
    return { set, setNo, dropNo };
  });
}
