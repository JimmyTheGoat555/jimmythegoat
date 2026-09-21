import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import WheelPicker, { WHEEL_HEIGHT } from '../shared/WheelPicker';
import { REPS_MAX, REPS_MIN, formatWorkingWeight } from '../../utils/units';

// ── The wheel, back, without the calculator it used to be wrapped in ────
//
// This sheet existed before, was removed with the plate calculator, and is
// back because removing it was the wrong half of the change. The thing
// that had to go was the ARITHMETIC — "plates per side on a bar you pick
// from a rack of six", which asked the lifter to hold a mental model
// before they could log a set. The wheel itself was never the problem: it
// is the fastest way there is to land on a number with one thumb and no
// keyboard covering half the screen.
//
// So what is here now is the wheel and nothing else:
//
//   • one dial for the weight, in whatever unit the row is asking for
//     (per hand / total / belt) — the row decides, this only spins;
//   • one dial for the reps;
//   • a − / + pair under each, half a kilo and one rep;
//   • the live total, when the number on the dial is not the whole load.
//
// No bar picker, no plate row, no per-side mode. The dial steps in 0.5 kg
// for the same reason the buttons do: it is the smallest increment on a
// real rack, and every value a stepper can produce has to exist on the
// wheel or the two fight each other (the old version stepped 1.25 on a
// whole-kilo ladder and quietly did nothing on alternate presses).
//
// ── Double-tap a dial to type ───────────────────────────────────────────
//
// The keyboard is now the EXCEPTION, not the default. Nothing in a set row
// is a text field any more (see SetRow.jsx), so working through a session
// never raises the keyboard: every number is a tap or a spin. But a dial
// is the wrong tool for a large jump — 20 kg to 100 kg is a long spin, and
// someone who already knows the number should be able to just say it. So:
//
//   double-tap a dial  →  the wheel is replaced, in place, by a numeric
//                         field, focused, with its current value selected
//   Enter, or focus leaves  →  the number is saved and the wheel is back
//
// The swap happens inside the dial's own footprint (WHEEL_HEIGHT) so the
// sheet does not resize under the thumb, and a typed number is snapped to
// the dial's own ladder before it is saved — see typedValue(). An
// off-ladder value would sit between two wheel rows, and the wheel would
// pull it to the nearer one the moment it came back, silently changing the
// number that was just typed.
//
// Presentational on purpose. Every number that goes in or out of here is
// in the units the ROW is already showing, and SetRow owns the translation
// to a stored set — the `weight`/`perHandWeight`/`isPerHand` contract in
// utils/setLoad.js is delicate enough to live in exactly one place.
// Changes are live, so "Done" only dismisses.

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

// ── What counts as a double-tap ────────────────────────────────────────
//
// Hand-rolled rather than left to `dblclick`, which on a touch screen is a
// synthesised event with its own delay and is not fired at all by every
// mobile browser. `dblclick` is still listened for, because it is what a
// real mouse sends.
//
// A tap is a pointer that goes down and comes up in the same place. Two of
// them, close together in time AND position, is the gesture.
const TAP_SLOP = 12; // a press that slides further than this was a drag
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_SLOP = 28; // two thumb taps never land on the same pixel
// A tap that lands while the wheel is still moving is someone ARRESTING a
// fling, not asking for a keyboard — and stopping a spin often takes two.
// Scroll events are still arriving through the momentum, so "did this
// wheel scroll a moment ago" is the test.
const SCROLL_QUIET_MS = 250;

// The value a typed string becomes: snapped to the dial's ladder, then
// clamped. `min` is the ladder's first rung, not zero — a per-hand dial
// starts at 0.5 kg — so the snap counts steps from there.
function typedValue(text, { min, max, step }) {
  const n = Number(text);
  if (text.trim() === '' || !Number.isFinite(n)) return null;
  const rung = step > 0 ? min + Math.round((n - min) / step) * step : n;
  return round1(clamp(rung, min, max));
}

function Stepper({ onDown, onUp, children, downLabel, upLabel }) {
  return (
    <div className="mt-2 flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={onDown}
        aria-label={downLabel}
        className="h-10 w-10 rounded-full bg-neutral-800 text-xl font-bold leading-none text-neutral-200 transition active:scale-90"
      >
        −
      </button>
      <span className="w-14 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {children}
      </span>
      <button
        type="button"
        onClick={onUp}
        aria-label={upLabel}
        className="h-10 w-10 rounded-full bg-neutral-800 text-xl font-bold leading-none text-neutral-200 transition active:scale-90"
      >
        +
      </button>
    </div>
  );
}

// One dial: its caption, the wheel, and the keyboard hiding behind a
// double-tap. `children` is the stepper, which stays put through the swap.
function Dial({ caption, value, min, max, step, formatValue, onChange, ariaLabel, typeLabel, allowDecimal, children }) {
  // The draft doubles as the mode: a string means the field is up, null
  // means the wheel is. One piece of state, so the two can never disagree.
  const [draft, setDraft] = useState(null);
  const typing = draft !== null;

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const lastScrollAt = useRef(0);
  const downAt = useRef(null);
  const lastTap = useRef(null);

  // A scroll event does not bubble — but it DOES capture, so a capture
  // listener on the wrapper hears the wheel's own scroller without
  // WheelPicker having to know anything about this.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      lastScrollAt.current = Date.now();
    };
    el.addEventListener('scroll', onScroll, true);
    return () => el.removeEventListener('scroll', onScroll, true);
  }, []);

  // Focus in a LAYOUT effect, not a passive one: iOS only raises the
  // keyboard for a focus() that happens inside the gesture that asked for
  // it, and a passive effect is scheduled after that gesture has ended.
  useLayoutEffect(() => {
    if (!typing) return;
    const el = inputRef.current;
    el?.focus();
    el?.select();
  }, [typing]);

  const startTyping = () => {
    lastTap.current = null;
    setDraft(formatValue ? formatValue(value) : String(value));
  };

  // Blur is the save — including the blur that Enter causes. An empty or
  // unparseable draft changes nothing rather than clearing the set: the
  // dial always holds a number, and this is the way back to the dial.
  const commit = () => {
    const next = draft === null ? null : typedValue(draft, { min, max, step });
    setDraft(null);
    if (next !== null && next !== value) onChange(next);
  };

  const onPointerDown = (e) => {
    downAt.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = (e) => {
    const down = downAt.current;
    downAt.current = null;
    // A mouse has a real dblclick; re-deriving it here as well would make
    // every second click on the wheel open the keyboard.
    if (e.pointerType === 'mouse' || !down) return;
    const moved = Math.abs(e.clientX - down.x) > TAP_SLOP || Math.abs(e.clientY - down.y) > TAP_SLOP;
    if (moved || Date.now() - lastScrollAt.current < SCROLL_QUIET_MS) {
      lastTap.current = null;
      return;
    }
    const now = Date.now();
    const prev = lastTap.current;
    const near =
      prev && Math.abs(e.clientX - prev.x) < DOUBLE_TAP_SLOP && Math.abs(e.clientY - prev.y) < DOUBLE_TAP_SLOP;
    if (near && now - prev.t < DOUBLE_TAP_MS) {
      startTyping();
      return;
    }
    lastTap.current = { t: now, x: e.clientX, y: e.clientY };
  };

  return (
    <div className="flex flex-col items-center">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{caption}</p>
      <div
        ref={wrapRef}
        className="w-full"
        onPointerDown={typing ? undefined : onPointerDown}
        onPointerUp={typing ? undefined : onPointerUp}
        onDoubleClick={typing ? undefined : startTyping}
        // The dial is a focusable spinbutton, so the gesture needs a
        // keyboard twin: Enter on the wheel opens the field, Enter in the
        // field closes it again.
        onKeyDown={(e) => {
          if (typing || e.key !== 'Enter') return;
          e.preventDefault();
          startTyping();
        }}
      >
        {typing ? (
          <div
            className="flex flex-col items-center justify-center rounded-2xl border border-[var(--tier-accent)]/60 bg-neutral-900"
            style={{ height: WHEEL_HEIGHT }}
          >
            <input
              ref={inputRef}
              type="text"
              // Not type="number": its spinners, its refusal of a partial
              // value like "1." mid-type and its locale-dependent decimal
              // separator are all problems this field does not need.
              inputMode={allowDecimal ? 'decimal' : 'numeric'}
              enterKeyHint="done"
              value={draft}
              aria-label={typeLabel}
              onChange={(e) => {
                const next = e.target.value;
                // One number, one optional decimal point. Anything else is
                // not accepted, rather than accepted and silently dropped.
                const ok = allowDecimal ? /^\d*\.?\d*$/ : /^\d*$/;
                if (next !== '' && !ok.test(next)) return;
                setDraft(next);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              onBlur={commit}
              className="w-full bg-transparent text-center text-3xl font-extrabold tabular-nums text-neutral-50 outline-none"
            />
            <span className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
              Enter to save
            </span>
          </div>
        ) : (
          <WheelPicker
            className="w-full"
            value={value}
            min={min}
            max={max}
            step={step}
            formatValue={formatValue}
            onChange={onChange}
            ariaLabel={ariaLabel}
          />
        )}
      </div>
      {children}
    </div>
  );
}

// A tap that lands on the backdrop this soon after the sheet opened is the
// second half of a double-tap on the row that opened it — the sheet slid
// up under a thumb that was already on its way back down. Closing on it
// would read as the app having ignored the lifter entirely.
const BACKDROP_GRACE_MS = 400;

export default function SetEntrySheet({
  // What the row calls itself — "Set 2", or "Set 2 · drop 1" for a drop
  // set. Built by SetRow, which is where the numbering rules live.
  title,
  // What the weight dial is asking for, in the row's own words: "Per
  // hand", "Weight", "Added". Comes from WeightEntryKind's ENTRY_COPY.
  label,
  // The current value in that unit, or null for a set with nothing on it
  // yet — which opens on `seedWeight` and writes it straight away, so
  // closing the sheet always leaves a set that can be ticked off.
  weight,
  seedWeight,
  min,
  max,
  step,
  reps,
  seedReps,
  // The whole load this set represents — shown only when it is saying
  // something the dial does not (a pair of dumbbells, body weight + belt).
  totalText,
  onWeight,
  onReps,
  // Fills a blank set with what the dials are already showing, so opening
  // the sheet and closing it leaves a set that can be ticked off. Separate
  // from onWeight/onReps because the row must NOT read this as the lifter
  // having entered something — a set nobody touched does not tick itself.
  onSeed,
  onClose,
}) {
  const w = weight ?? seedWeight;
  const r = reps ?? seedReps;
  const openedAt = useRef(Date.now());

  useEffect(() => {
    onSeed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setWeight = (v) => onWeight(round1(clamp(Number(v), min, max)));
  const setReps = (v) => onReps(clamp(Math.round(Number(v)), REPS_MIN, REPS_MAX));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={() => {
        if (Date.now() - openedAt.current < BACKDROP_GRACE_MS) return;
        onClose();
      }}
      role="presentation"
    >
      <div
        className="w-full rounded-t-3xl border border-white/10 bg-neutral-950 sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 pb-3 pt-5">
          <h2 className="text-lg font-bold text-neutral-50">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-1 text-2xl leading-none text-neutral-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 px-5 pt-5">
          <Dial
            caption={`${label} · kg`}
            value={w}
            min={min}
            max={max}
            step={step}
            formatValue={formatWorkingWeight}
            onChange={setWeight}
            ariaLabel={`${label} in kilograms`}
            typeLabel={`${label} in kilograms, type a number`}
            allowDecimal
          >
            <Stepper
              onDown={() => setWeight(w - step)}
              onUp={() => setWeight(w + step)}
              downLabel={`Decrease weight by ${step} kilograms`}
              upLabel={`Increase weight by ${step} kilograms`}
            >
              {step} kg
            </Stepper>
          </Dial>

          <Dial
            caption="Reps"
            value={r}
            min={REPS_MIN}
            max={REPS_MAX}
            step={1}
            onChange={setReps}
            ariaLabel="Reps"
            typeLabel="Reps, type a number"
          >
            <Stepper
              onDown={() => setReps(r - 1)}
              onUp={() => setReps(r + 1)}
              downLabel="One rep fewer"
              upLabel="One rep more"
            >
              1 rep
            </Stepper>
          </Dial>
        </div>

        {/* The gesture is worth nothing if nobody knows it is there, and
            there is no way to draw a double-tap. So it is simply said. */}
        <p className="px-5 pb-4 pt-3 text-center text-[11px] font-medium text-neutral-500">
          Double-tap a dial to type the number
        </p>

        {totalText && (
          <div className="px-5 pb-4">
            <div className="flex items-baseline justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total lifted</span>
              <span className="text-xl font-extrabold tabular-nums" style={{ color: 'var(--tier-accent)' }}>
                {totalText}
              </span>
            </div>
          </div>
        )}

        <div className="px-5 pb-5" style={{ paddingBottom: 'calc(1.25rem + var(--safe-b))' }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-[var(--success)] py-3.5 text-base font-semibold text-white transition active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
