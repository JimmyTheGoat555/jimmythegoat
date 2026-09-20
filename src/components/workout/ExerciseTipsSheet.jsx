import { useState } from 'react';
import BottomSheet from '../shared/BottomSheet';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { useJimmyLook } from '../../context/JimmyLook';
import { getMascot } from '../../data/mascots';

// The quick version, for mid-workout: the lifter's own mascot — Jimmy or
// Gena, at their current evolution and in whatever they have equipped —
// delivering the exercise's form cues from a speech bubble. One cue at a
// time, because a lifter between sets reads one line, not a list; a tap
// on the bubble brings the next. Opened from the bulb beside the
// exercise name on the workout screen.
export default function ExerciseTipsSheet({ exercise, open, onClose }) {
  const look = useJimmyLook();
  const mascot = getMascot(look.mascot);
  const tips = exercise?.tips ?? [];

  // Back to the first cue every time the sheet opens. Derived during
  // render from the prop change, same pattern as BottomSheet's phase.
  const [index, setIndex] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setIndex(0);
  }
  const tip = tips[index % Math.max(1, tips.length)];

  return (
    <BottomSheet open={open && tips.length > 0} onClose={onClose} compact title={exercise?.name}>
      <div className="flex items-end gap-3 pb-1 pt-2">
        <JimmyAvatar
          evolutionStage={look.evolutionStage}
          equippedAccessories={look.equippedAccessories}
          mascot={look.mascot}
          crop="head"
          size={72}
          className="shrink-0 rounded-full bg-white/5"
          alt={`${mascot?.name ?? 'Your mascot'}`}
        />
        {/* The bubble is the tap target. Opaque on purpose: its tail is a
            rotated square that has to match it exactly, which a
            translucent fill over the sheet's blur never would. */}
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % tips.length)}
          aria-label={tips.length > 1 ? 'Next tip' : undefined}
          className="relative min-w-0 flex-1 rounded-2xl rounded-bl-md border border-white/10 bg-neutral-900 px-4 py-3 text-left transition active:scale-[0.99]"
        >
          <span
            className="block text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--tier-accent)' }}
          >
            {mascot?.name ?? 'Jimmy'} says
          </span>
          {/* Keyed on the cue so each swap replays index.css's tip-in. */}
          <p key={tip} className="tip-enter mt-1 text-[15px] font-medium leading-snug text-neutral-100">
            {tip}
          </p>
          {tips.length > 1 && (
            <span className="mt-2.5 flex items-center justify-between">
              <span className="flex gap-1" aria-hidden="true">
                {tips.map((t, i) => (
                  <span
                    key={t}
                    className={`h-1 rounded-full transition-all ${i === index ? 'w-4' : 'w-1.5 bg-white/20'}`}
                    style={i === index ? { background: 'var(--tier-accent)' } : undefined}
                  />
                ))}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {index + 1}/{tips.length} · Tap for next
              </span>
            </span>
          )}
          <span
            className="absolute -left-1.5 bottom-4 h-3 w-3 rotate-45 border-b border-l border-white/10 bg-neutral-900"
            aria-hidden="true"
          />
        </button>
      </div>
    </BottomSheet>
  );
}
