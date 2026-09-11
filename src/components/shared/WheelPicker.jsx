import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

// A native-feeling scroll wheel / spinner — values scroll vertically under
// a fixed selection band (the iOS picker pattern). CSS scroll-snap does
// the momentum + snapping; JS only reads back the snapped value once
// scrolling stops and reports it.
//
//   <WheelPicker value={w} min={1} max={30} step={1} onChange={setW} ariaLabel="Reps" />
//   <WheelPicker value={id} options={[{value,label}, …]} onChange={…} ariaLabel="Split" />
//
// Keyboard: ↑/↓ step, PageUp/PageDown ±10, Home/End to the ends.
//
// No "is this our own programmatic scroll" flag: it isn't needed and a
// flag cleared via rAF/timeout got stranded when the tab was
// backgrounded, freezing the wheel. Instead the settle is idempotent —
// parking the wheel on `value` lands exactly on a snap point, so the
// scroll it triggers reads back the SAME value and emits nothing.

const ITEM_HEIGHT = 40;
const VISIBLE = 5; // odd → one item dead-centre under the band
const PAD = Math.floor(VISIBLE / 2) * ITEM_HEIGHT;

function buildRange(min, max, step) {
  const out = [];
  const s = step > 0 ? step : 1;
  const decimals = (String(s).split('.')[1] || '').length;
  for (let v = min; v <= max + 1e-9; v += s) out.push(Number(v.toFixed(decimals)));
  return out;
}

export default function WheelPicker({
  value,
  min = 0,
  max = 100,
  step = 1,
  options,
  onChange,
  formatValue,
  ariaLabel,
  className = '',
}) {
  const scrollRef = useRef(null);
  const settleTimer = useRef(0);
  // Always-current `value` + `onChange`, so the settle logic below is
  // never a stale closure (it used to compare against a `value` captured
  // several renders ago and skip emitting).
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  // Raw values, memoised on primitives only — an inline `formatValue` prop
  // must not churn this array every render.
  const values = useMemo(() => {
    if (options) return options.map((o) => (o && typeof o === 'object' ? o.value : o));
    return buildRange(min, max, step);
  }, [options, min, max, step]);

  const labelAt = useCallback(
    (i) => {
      if (options) {
        const o = options[i];
        return o && typeof o === 'object' ? o.label : String(o);
      }
      return formatValue ? formatValue(values[i]) : String(values[i]);
    },
    [options, values, formatValue],
  );

  const indexOfValue = useCallback(
    (v) => {
      const exact = values.indexOf(v);
      if (exact !== -1) return exact;
      let best = 0;
      let bestD = Infinity;
      values.forEach((it, i) => {
        const d = Math.abs(Number(it) - Number(v));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    },
    [values],
  );

  const activeIdx = indexOfValue(value);

  // Keep the wheel parked on `value` — mount, a stepper/keyboard step, an
  // external prefill. Lands exactly on `activeIdx * ITEM_HEIGHT`, which is
  // a snap point, so the scroll event it fires settles to the same value.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = activeIdx * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - top) > 1) {
      el.scrollTop = top;
      requestAnimationFrame(() => {
        if (scrollRef.current && Math.abs(scrollRef.current.scrollTop - top) > 1) {
          scrollRef.current.scrollTop = top;
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  const settle = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
    if (Math.abs(el.scrollTop - idx * ITEM_HEIGHT) > 0.5) el.scrollTop = idx * ITEM_HEIGHT;
    const next = values[idx];
    if (next !== undefined && next !== valueRef.current) onChangeRef.current(next);
  }, [values]);

  // A real iOS dial ticks once per ROW passing under the selection band —
  // not once when the spin finally stops — which is what makes a fling
  // feel like a physical wheel with detents instead of a list that went
  // quiet and then buzzed. So the tick lives here, on scroll position,
  // rather than in settle(): one flick across twenty values gives twenty
  // light ticks, decelerating with the scroll, exactly like the native
  // picker. Centralized here for every wheel in the app — ScrollWheelPicker,
  // BodyWeightWheel and HeightFeetWheel each used to keep their own
  // value-changed copy of this (which could only ever fire once per
  // settle), and SetEntrySheet's weight/reps dials had none at all.
  const lastTickIdx = useRef(null);
  const tickIfRowChanged = () => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    if (lastTickIdx.current === null) {
      lastTickIdx.current = idx; // first paint / programmatic park — no buzz
      return;
    }
    if (idx !== lastTickIdx.current) {
      lastTickIdx.current = idx;
      navigator.vibrate?.(5);
    }
  };

  const handleScroll = () => {
    tickIfRowChanged();
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settle, 110);
  };
  // Fires once momentum + snap have fully stopped (React 19 / modern
  // engines). The debounced scroll above is the fallback where it isn't.
  const handleScrollEnd = () => {
    window.clearTimeout(settleTimer.current);
    settle();
  };

  // The +/- steppers and arrow keys move the wheel by setting scrollTop,
  // which fires a scroll event — so the tick above covers these too, and
  // buzzing here as well would double up.
  const step1 = (delta) => {
    const idx = Math.max(0, Math.min(values.length - 1, activeIdx + delta));
    const next = values[idx];
    const el = scrollRef.current;
    if (el) el.scrollTop = idx * ITEM_HEIGHT;
    if (next !== undefined && next !== value) onChange(next);
  };

  const handleKeyDown = (e) => {
    const map = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 };
    if (e.key in map) {
      e.preventDefault();
      step1(map[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      step1(-values.length);
    } else if (e.key === 'End') {
      e.preventDefault();
      step1(values.length);
    }
  };

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ height: VISIBLE * ITEM_HEIGHT }}
      role="spinbutton"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuetext={labelAt(activeIdx)}
      aria-valuenow={typeof values[activeIdx] === 'number' ? values[activeIdx] : undefined}
      onKeyDown={handleKeyDown}
    >
      <div
        className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-xl bg-white/8 border-y border-white/20"
        style={{ height: ITEM_HEIGHT }}
      />
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onScrollEnd={handleScrollEnd}
        className="wheel-scroll h-full overflow-y-scroll"
      >
        <div style={{ height: PAD }} aria-hidden="true" />
        {values.map((v, i) => (
          <div
            key={String(v)}
            className={`wheel-item flex items-center justify-center text-xl font-bold tabular-nums transition-[color,transform] ${
              i === activeIdx ? 'text-neutral-50 scale-105' : 'text-neutral-500'
            }`}
            style={{ height: ITEM_HEIGHT }}
          >
            {labelAt(i)}
          </div>
        ))}
        <div style={{ height: PAD }} aria-hidden="true" />
      </div>
    </div>
  );
}
