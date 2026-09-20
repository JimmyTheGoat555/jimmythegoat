import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ENTRY_KIND,
  ENTRY_MODE_SMART,
  absoluteSetWeight,
  entryKindFor,
  entryTotalOf,
  isPerHandSet,
  perHandFromSet,
  perHandPatchFor,
  totalPatchFor,
} from '../../utils/setLoad';
import { defaultWeightForExercise } from '../../data/exercises';
import { WEIGHT_MAX_KG, WEIGHT_MIN_KG, REPS_MAX, REPS_MIN, formatWorkingWeight } from '../../utils/units';
import { ENTRY_COPY, EquipmentIcon } from './WeightEntryKind';
import SetEntrySheet from './SetEntrySheet';

const isSet = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

// ── Two ways to reach a number, and why the step is half a kilo ────────
//
// The weight can be TYPED — a field, with a minus and a plus either side
// — or SPUN, on the wheel that opens from the line underneath it
// (SetEntrySheet.jsx). Both write the same set; neither is the "real" one.
//
// They are both here because they answer different questions. Typing wins
// when the number is already in your head and the jump is large (60 → 100).
// The wheel wins with a thumb, mid-set, when the keyboard would cover half
// the screen and the move is one or two notches. The pass that removed the
// wheel kept only the field, which was the wrong half of the change: what
// had to go was the plate CALCULATOR — plates per side on a bar picked
// from a rack of six, arithmetic the lifter had to learn before logging a
// single set — and that is gone and stays gone.
//
// Half a kilo is the step, on the buttons and on the wheel alike, because
// it is the smallest increment that exists on a real rack (the 0.25 kg
// micro-plate is a specialist item, and a 1 kg step cannot reach 7.5 or
// 22.5, two of the most common dumbbells in any gym). The wheel's ladder
// has to hold every value the buttons can produce or the two fight each
// other — see SetEntrySheet.jsx.
//
// What did NOT change is the contract in utils/setLoad.js: `set.weight` is
// still the absolute load, and a per-hand exercise still stores the pair
// with its marker. Only the ways of reaching the number differ. The
// per-hand ↔ total switch still lives on the card's column header, and
// history logged with the calculator still reads back correctly, because
// nothing about storage moved.
const WEIGHT_STEP = 0.5;
// Belt weight on a bodyweight exercise starts at nothing and MUST be
// allowed to be nothing — the whole point is that the body is the load.
const ADDED_MIN_KG = 0;
const ADDED_MAX_KG = 150; // functions/storeCatalog.js MAX_ADDED_WEIGHT_KG
// Where the reps dial opens on a set that has none yet. Eight to twelve is
// the range most hypertrophy work lives in; ten is the middle of it and
// the number people round to out loud.
const SEED_REPS = 10;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

// A number the lifter types. `type="text"` with `inputMode="decimal"`
// rather than `type="number"`: the number input's spinners, its silent
// rejection of a partial value like "1." mid-type, and its locale-
// dependent decimal separator are all problems this field does not need.
//
// The draft is local while focused so a half-typed value is never fought
// over, and committed on every keystroke that parses — the set's stored
// value tracks what is on screen, so nothing is lost if the app is closed
// mid-row. Normalisation (clamping, rounding) waits for blur, because
// clamping while someone is typing "0" on the way to "05" is how a field
// starts refusing input.
function NumberField({ value, placeholder, onCommit, onNormalize, ariaLabel, className = '', editedRef }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (isSet(value) ? String(value) : '');

  const handleChange = (e) => {
    const next = e.target.value;
    // One leading number, optional single decimal point. Anything else —
    // a letter, a second dot, a minus — is simply not accepted, rather
    // than accepted and then silently dropped on blur.
    if (next !== '' && !/^\d*\.?\d*$/.test(next)) return;
    setDraft(next);
    if (editedRef) editedRef.current = true;
    if (next === '') onCommit(null);
    else if (Number.isFinite(Number(next))) onCommit(Number(next));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      value={shown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={handleChange}
      // Select-all on focus: the field almost always arrives pre-filled
      // from last time, and the first thing anyone does is replace it.
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      onBlur={() => {
        setDraft(null);
        onNormalize();
      }}
      className={`h-10 w-full min-w-0 rounded-xl bg-neutral-800 text-center text-base font-semibold tabular-nums text-neutral-100 outline-none transition focus:bg-neutral-700 focus:ring-2 focus:ring-[var(--tier-accent)] ${className}`}
    />
  );
}

function StepButton({ dir, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      // tabIndex -1 so tabbing through a row goes weight → reps and not
      // through four buttons; the row is walked with the keyboard far
      // less often than it is thumbed, and the thumb does not tab.
      tabIndex={-1}
      className="h-10 w-8 shrink-0 rounded-xl bg-neutral-800/80 text-lg font-bold leading-none text-neutral-300 transition active:scale-90"
    >
      {dir < 0 ? '−' : '+'}
    </button>
  );
}

// The dial affordance on the anchor line — a picker with its selection
// band, small enough to sit inside a 10px label. Not an emoji: it has to
// take currentColor and land on the text baseline at this size.
function WheelGlyph() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="h-2.5 w-2.5 shrink-0 opacity-70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="1.6" y="1.6" width="8.8" height="8.8" rx="2.4" />
      <path d="M3.9 6h4.2" />
    </svg>
  );
}

// A logged set: the drop-set marker, the weight, the reps, the tick and
// the delete. Bounds live in utils/units.js and are enforced again in
// functions/economy.js — the clamps here are a courtesy, not a boundary.
export default function SetRow({
  index,
  set,
  exerciseId,
  isBodyweight = false,
  onChange,
  onToggleComplete,
  onRemove,
  onToggleDropSet,
  // 'smart' or 'total' for this exercise — from the screen's
  // useWeightEntryModes, via ExerciseLogCard. The switch itself is the
  // card's column header; this row only reads the answer.
  entryMode = ENTRY_MODE_SMART,
  // The lifter's body weight for the live total under a bodyweight set.
  // 0 when unknown; a stored set carries its own `bodyWeightAtLog`.
  bodyWeightKg = 0,
  // ── Auto-complete ──────────────────────────────────────────────────
  //
  // Finishing a value is the same statement as ticking the box, so the
  // tick is done for you: when focus LEAVES this row and something in it
  // was actually edited, a set with both numbers on it marks itself
  // complete. `onAutoComplete` is separate from onToggleComplete because
  // the logger treats it the same as a manual tick (it starts the rest
  // timer) and this is the one place that distinction is made.
  //
  // Leaving the ROW, not the field, is the load-bearing part: weight and
  // reps sit side by side, and completing on a field blur would fire the
  // full-screen rest timer the instant somebody tabbed from weight to
  // reps — with the reps still wrong, because they were on their way to
  // fix them.
  onAutoComplete,
}) {
  const kind = entryKindFor(exerciseId, { isBodyweight, mode: entryMode });
  const isPerHandKind = kind === ENTRY_KIND.PER_HAND;
  const isBodyKind = kind === ENTRY_KIND.BODYWEIGHT;
  const copy = ENTRY_COPY[kind];

  // A bodyweight set only needs reps (the load is your body weight, added
  // by the server; belt weight defaults to 0). A weighted set needs both.
  const hasWeight = isBodyKind || isSet(set.weight);
  const ready = isSet(set.reps) && hasWeight;

  // Whether anything in this row has been touched since focus entered it
  // — see onAutoComplete above. A ref, not state: nothing renders from it
  // and it must not cause a re-render mid-keystroke.
  const editedRef = useRef(false);
  const rowRef = useRef(null);
  // The wheel (SetEntrySheet). Declared up here because handleRowBlur
  // below has to know whether it is open.
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── What the weight field holds ────────────────────────────────────
  //
  // One number on screen, three possible meanings, exactly as before —
  // the entry kind decides. The stored set is written through
  // utils/setLoad.js in every case, so the marker fields a per-hand set
  // needs are written whichever mode is showing.
  //
  // A dumbbell (or crossover) set from before the per-hand marker stores
  // ONE implement as its whole weight and was scored that way. Read back
  // in History it is shown as the total it counted for rather than as
  // "25 per hand, total 25", which would contradict itself. The logger
  // never shows one: sets are normalised when seeded from history.
  const legacyPerHand = isPerHandKind && isSet(set.weight) && !isPerHandSet(set);
  const shownKind = legacyPerHand ? ENTRY_KIND.TOTAL : kind;

  const weightValue = isBodyKind
    ? isSet(set.addedWeight)
      ? Number(set.addedWeight)
      : null
    : shownKind === ENTRY_KIND.PER_HAND
      ? isSet(set.weight)
        ? perHandFromSet(set)
        : null
      : isSet(set.weight)
        ? entryTotalOf(set, exerciseId)
        : null;

  // Where a step from an empty field starts, so tapping + on a blank set
  // lands somewhere sane instead of at the minimum.
  const seedWeight = () => {
    const base = defaultWeightForExercise(exerciseId);
    return shownKind === ENTRY_KIND.PER_HAND ? base : isBodyKind ? 0 : base;
  };

  const weightBounds = isBodyKind
    ? [ADDED_MIN_KG, ADDED_MAX_KG]
    : shownKind === ENTRY_KIND.PER_HAND
      ? // The stored load is the pair, so the per-hand number is bounded
        // by half of what the server accepts for a set.
        [round1(WEIGHT_MIN_KG / 2), round1(WEIGHT_MAX_KG / 2)]
      : [WEIGHT_MIN_KG, WEIGHT_MAX_KG];

  const commitWeight = (n) => {
    if (n === null) {
      // Clearing the field clears the set's weight — an empty set is a
      // real state (it is what a freshly added set looks like) and must
      // stay reachable, or a mistyped number can never be taken back.
      // The context fields go with it, for the same reason every patch
      // below names them: see NO_BAR in utils/setLoad.js.
      onChange(
        isBodyKind
          ? { addedWeight: '' }
          : {
              weight: '',
              barWeight: undefined,
              weightPerSide: undefined,
              perHandWeight: undefined,
              isPerHand: undefined,
            },
      );
      return;
    }
    const v = round1(n);
    // Both builders live in utils/setLoad.js, and neither is a bare
    // `{ weight }`: a per-hand exercise has to carry its marker whichever
    // mode is showing (or the server doubles the number a second time),
    // and every patch has to blank the plate-calculator context a set
    // seeded from older history may still be carrying.
    if (isBodyKind) onChange({ addedWeight: v });
    else if (shownKind === ENTRY_KIND.PER_HAND) onChange(perHandPatchFor(v));
    else onChange(totalPatchFor(exerciseId, v));
  };

  const normalizeWeight = () => {
    if (weightValue === null) return;
    const clamped = round1(clamp(weightValue, weightBounds[0], weightBounds[1]));
    if (clamped !== round1(weightValue)) commitWeight(clamped);
  };

  const stepWeight = (dir) => {
    editedRef.current = true;
    const from = weightValue === null ? seedWeight() : weightValue;
    commitWeight(round1(clamp(from + dir * WEIGHT_STEP, weightBounds[0], weightBounds[1])));
  };

  const commitReps = (n) => {
    if (n === null) {
      onChange({ reps: '' });
      return;
    }
    onChange({ reps: Math.round(n) });
  };
  const normalizeReps = () => {
    if (!isSet(set.reps)) return;
    const clamped = clamp(Math.round(Number(set.reps)), REPS_MIN, REPS_MAX);
    if (clamped !== Number(set.reps)) onChange({ reps: clamped });
  };

  // ── The anchor line ────────────────────────────────────────────────
  //
  // `weight` is the absolute load for every weighted set; a STORED
  // bodyweight set also has it (the server folded body weight in), while
  // one still being logged has only the belt, so the total is built from
  // the lifter's current body weight when known and spelled "BW + belt"
  // when not.
  const bw =
    Number(bodyWeightKg) > 0 ? Number(bodyWeightKg) : Number(set.bodyWeightAtLog) > 0 ? Number(set.bodyWeightAtLog) : 0;
  const totalText = !hasWeight
    ? null
    : isBodyKind
      ? isSet(set.weight) && Number(set.weight) > 0
        ? `${formatWorkingWeight(set.weight)} kg`
        : bw > 0
          ? `${formatWorkingWeight(bw + (Number(set.addedWeight) || 0))} kg`
          : Number(set.addedWeight) > 0
            ? `BW + ${formatWorkingWeight(set.addedWeight)} kg`
            : 'BW'
      : `${formatWorkingWeight(absoluteSetWeight(set))} kg`;
  // Under a TOTAL field the anchor would only repeat the field, so the
  // line names the unit instead. Under per-hand and bodyweight it is
  // saying something the number does not.
  const anchorText = shownKind === ENTRY_KIND.TOTAL && !isBodyKind ? 'kg' : totalText;

  const isDrop = set.isDropSet === true;

  // Focus leaving the row is what completes the set — see onAutoComplete.
  // `relatedTarget` is where focus is GOING: null when it goes nowhere (a
  // tap on the page background, which is most of them on a phone), and an
  // element inside this row when it is only moving between the row's own
  // controls, which is not leaving.
  const handleRowBlur = (e) => {
    // While the wheel is up it owns this set, and closeSheet below is the
    // one that decides. Without this, tapping from the weight dial to the
    // reps dial reads as leaving the row — the sheet is portalled out of
    // it — and would tick the set off with the reps still wrong.
    if (sheetOpen) return;
    if (e.relatedTarget && rowRef.current?.contains(e.relatedTarget)) return;
    if (!editedRef.current) return;
    editedRef.current = false;
    if (!set.completed && ready) onAutoComplete?.();
  };

  // A set deleted or re-ordered out from under a pending edit must not
  // carry its "edited" flag into whatever takes its place.
  useEffect(
    () => () => {
      editedRef.current = false;
    },
    [],
  );

  // ── The wheel ──────────────────────────────────────────────────────
  //
  // Opened from the line under the weight field, and from the "reps"
  // label, which is the same sheet.
  //
  // Spinning a dial is entering a value, so it counts as an edit; filling
  // a blank set with the numbers the dials happen to be showing is not.
  const sheetWeight = (v) => {
    editedRef.current = true;
    commitWeight(v);
  };
  const sheetReps = (v) => {
    editedRef.current = true;
    commitReps(v);
  };
  const seedFromSheet = () => {
    if (weightValue === null) commitWeight(seedWeight());
    if (!isSet(set.reps)) commitReps(SEED_REPS);
  };
  const closeSheet = () => {
    setSheetOpen(false);
    // The sheet's own version of handleRowBlur — closing it is the moment
    // the lifter is done with this set, exactly as leaving the row is.
    if (!editedRef.current) return;
    editedRef.current = false;
    if (!set.completed && ready) onAutoComplete?.();
  };

  const wheelLabel = `Set ${index + 1} — open the weight and reps wheel`;

  return (
    <div
      ref={rowRef}
      onBlur={handleRowBlur}
      // A drop set is indented and rail-marked rather than recoloured: the
      // green fill already means "completed", and a second background
      // colour on the same row would put two unrelated meanings in one
      // channel. The rail reads as "hangs off the set above", which is
      // exactly what a drop set is.
      className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-1.5 rounded-2xl py-1.5 transition ${
        set.completed ? 'bg-[var(--success)]/15' : ''
      } ${isDrop ? 'ml-3 border-l-2 border-[var(--ember)] pl-1' : ''}`}
    >
      {/* The set number and the drop-set toggle, stacked in one column.
          DS is SPELLED OUT, always, in both states — this used to be the
          set number quietly doing double duty, which meant the feature
          existed and nobody could see it. A toggle nobody can find is a
          toggle nobody has. */}
      <button
        type="button"
        onClick={onToggleDropSet}
        aria-pressed={isDrop}
        aria-label={`Set ${index + 1} — ${
          isDrop ? 'drop set, tap to make it a normal set' : 'tap to mark it as a drop set'
        }`}
        title={isDrop ? 'Drop set — tap to make it a normal set' : 'Mark as a drop set'}
        tabIndex={-1}
        className={`flex h-11 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border transition active:scale-90 ${
          isDrop
            ? 'border-[var(--ember)] bg-[var(--ember)]/15 text-[var(--ember)]'
            : 'border-neutral-800 bg-neutral-900/40 text-neutral-500'
        }`}
      >
        <span className="text-[9px] leading-none tabular-nums opacity-60">{index + 1}</span>
        <span className="text-[10px] font-black leading-none tracking-tight">DS</span>
      </button>

      <div className="flex min-w-0 flex-col items-stretch">
        <div className="flex min-w-0 items-center gap-1">
          <StepButton dir={-1} onClick={() => stepWeight(-1)} label={`Decrease set ${index + 1} weight by 0.5 kg`} />
          <NumberField
            value={weightValue}
            placeholder={isBodyKind ? '0' : String(defaultWeightForExercise(exerciseId))}
            onCommit={commitWeight}
            onNormalize={normalizeWeight}
            ariaLabel={`Set ${index + 1} weight, ${copy.chip}`}
            editedRef={editedRef}
          />
          <StepButton dir={1} onClick={() => stepWeight(1)} label={`Increase set ${index + 1} weight by 0.5 kg`} />
        </div>
        {/* The anchor line doubles as the way into the wheel. It was
            already sitting under the field saying what the number adds up
            to; giving it a border and a dial glyph costs no height and is
            the only place on a 375px row with room for the affordance. */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          tabIndex={-1}
          aria-label={wheelLabel}
          title="Open the wheel"
          data-testid="set-total"
          className="mt-1 flex h-5 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1 text-[10px] font-semibold tabular-nums text-neutral-400 transition active:scale-95"
        >
          <EquipmentIcon kind={shownKind} className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{anchorText ?? copy.placeholder}</span>
          <WheelGlyph />
        </button>
      </div>

      <div className="flex w-12 flex-col items-stretch">
        <NumberField
          value={isSet(set.reps) ? Math.round(Number(set.reps)) : null}
          placeholder="—"
          onCommit={commitReps}
          onNormalize={normalizeReps}
          ariaLabel={`Set ${index + 1} reps`}
          editedRef={editedRef}
        />
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          tabIndex={-1}
          aria-label={wheelLabel}
          title="Open the wheel"
          className="mt-1 h-5 rounded-lg text-center text-[10px] font-semibold uppercase tracking-wide text-neutral-500 transition active:scale-95"
        >
          reps
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          // A manual tick settles the question — it must not be undone or
          // redone by the auto-complete on the way out of the row.
          editedRef.current = false;
          onToggleComplete();
        }}
        disabled={!set.completed && !ready}
        aria-label="Mark set complete"
        className={`flex h-11 w-10 items-center justify-center rounded-full text-lg font-bold transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${
          set.completed ? 'bg-[var(--success)] text-white' : 'bg-neutral-800 text-neutral-500'
        }`}
      >
        ✓
      </button>

      <button
        type="button"
        onClick={onRemove}
        aria-label="Delete set"
        tabIndex={-1}
        // Narrower than the tick (still a 44px-tall target): the one
        // control on the row nobody needs to hit quickly.
        className="flex h-11 w-7 items-center justify-center rounded-full text-neutral-600 transition active:scale-95"
      >
        ✕
      </button>

      {/* Portalled to <body>, and it has to be: the exercise card carries
          a `filter: drop-shadow(...)` for its glow, and a filtered element
          becomes the containing block for every `position: fixed`
          descendant. Rendered in place, this sheet was laid out inside the
          card — 339px wide, its header clipped off by the card's
          overflow-hidden — instead of over the screen. */}
      {sheetOpen &&
        createPortal(
          <SetEntrySheet
            index={index}
            label={ENTRY_COPY[shownKind].header}
            weight={weightValue}
            seedWeight={seedWeight()}
            min={weightBounds[0]}
            max={weightBounds[1]}
            step={WEIGHT_STEP}
            reps={isSet(set.reps) ? Math.round(Number(set.reps)) : null}
            seedReps={SEED_REPS}
            // Only when it is saying something the dial does not. Under a
            // TOTAL field the "total" would be the same number twice.
            totalText={shownKind === ENTRY_KIND.TOTAL && !isBodyKind ? null : totalText}
            onWeight={sheetWeight}
            onReps={sheetReps}
            onSeed={seedFromSheet}
            onClose={closeSheet}
          />,
          document.body,
        )}
    </div>
  );
}
