import { useEffect, useRef, useState } from 'react';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { useJimmyLook } from '../../context/JimmyLook';

// The victory lap. Plays once a workout has actually been logged, before
// the coins/lootbox land — the point is the small, stupidly satisfying
// feeling of watching the session you just did get ticked off one line at
// a time, rather than the screen simply cutting to a number.
//
// Timing is chained off `crossed` rather than driven by one interval: each
// tick schedules the next, so the haptic and the strike-through can never
// drift apart, and React re-running an effect (StrictMode does this on
// mount) just reschedules a pending timeout instead of firing a duplicate
// buzz. Side effects live in effects, never inside a setState updater —
// React is free to re-run those, which would double up every pulse.
//
// No framer-motion staggerChildren (the brief asked for it again; it still
// isn't a dependency here and this project has no animation library) — a
// chained timeout is the same stagger, and it's what lets each item's
// haptic fire on exactly its own beat, which a CSS animation-delay can't
// do on its own anyway.

const FIRST_TICK_MS = 420; // a beat to read the list before it starts
const STAGGER_MS = 260;
const HOLD_AFTER_DONE_MS = 1500;

export default function WorkoutSummaryChecklist({ exercises, onDone }) {
  const jimmyLook = useJimmyLook();
  const [crossed, setCrossed] = useState(0);
  const total = exercises.length;

  // Held in a ref so changing the callback identity can't restart the
  // sequence mid-flight.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // One item at a time: buzz, then cross it off.
  useEffect(() => {
    if (crossed >= total) return undefined;
    const timer = setTimeout(
      () => {
        navigator.vibrate?.([30]);
        setCrossed((c) => c + 1);
      },
      crossed === 0 ? FIRST_TICK_MS : STAGGER_MS,
    );
    return () => clearTimeout(timer);
  }, [crossed, total]);

  // Whole list done: the success pattern, a beat to enjoy it, then hand
  // over to whatever reward comes next.
  useEffect(() => {
    if (total === 0 || crossed < total) return undefined;
    navigator.vibrate?.([100, 50, 100]);
    const timer = setTimeout(() => onDoneRef.current?.(), HOLD_AFTER_DONE_MS);
    return () => clearTimeout(timer);
  }, [crossed, total]);

  const allDone = total > 0 && crossed >= total;

  return (
    <div className="fixed inset-0 z-[65] flex flex-col items-center justify-center gap-6 bg-neutral-950 px-6 py-10">
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: allDone ? 0.3 : 0.12,
          background: 'radial-gradient(circle at 50% 30%, var(--success), transparent 62%)',
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* The goat who just did the work, wearing what he was wearing
            while he did it. JimmyAvatar owns the sprite and its broken-
            image fallback, so this no longer tracks that itself.
            NOTE this also changes WHICH goat: the hero here was hardcoded
            to getTierByStage(4), so every user's workout ended with the
            Legendary sprite no matter what tier they were actually on.
            There was no comment defending that and it reads as a bug —
            the whole point of the tiers is that you earn the big one. */}
        <JimmyAvatar {...jimmyLook} size="lg" className="drop-shadow-[0_10px_24px_rgba(57,255,20,0.35)]" />
        <h2 className="mt-2 text-center text-2xl text-neutral-50">Workout Logged</h2>
        <p className="mt-1 text-sm text-neutral-500">
          {allDone ? 'Every rep counted.' : `${crossed} of ${total} down…`}
        </p>
      </div>

      <ul className="relative flex w-full max-w-sm flex-col gap-2">
        {exercises.map((name, i) => {
          const done = i < crossed;
          return (
            <li
              key={`${name}-${i}`}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition-colors duration-300"
              style={done ? { borderColor: 'rgba(57,255,20,0.35)', background: 'rgba(57,255,20,0.07)' } : undefined}
            >
              {/* Checkmark pops in as the line lands, not before. */}
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-black transition-all duration-300"
                style={{
                  background: done ? 'var(--success)' : 'rgba(255,255,255,0.08)',
                  color: done ? '#08130a' : 'transparent',
                  transform: done ? 'scale(1)' : 'scale(0.6)',
                }}
              >
                ✓
              </span>

              <span className="relative min-w-0 flex-1">
                <span
                  className="block truncate text-[15px] font-medium transition-colors duration-300"
                  style={{ color: done ? 'rgba(255,255,255,0.45)' : '#f4f4f5' }}
                >
                  {name}
                </span>
                {/* The strike itself is a line that DRAWS across rather
                    than text-decoration appearing all at once — the drawing
                    is the satisfying part, and text-decoration can't be
                    transitioned anyway. */}
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-[2px] w-full origin-left rounded-full"
                  style={{
                    background: 'var(--success)',
                    transform: `scaleX(${done ? 1 : 0})`,
                    transition: 'transform 0.28s ease-out',
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
