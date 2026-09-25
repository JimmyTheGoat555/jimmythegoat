import { useEffect, useRef } from 'react';
import { MUSCLE_GROUPS } from '../../data/exercises';

export default function MuscleGroupPicker({ selectedGroup, onSelect }) {
  const stripRef = useRef(null);
  const activeRef = useRef(null);

  // Bring the selected chip into view when the strip first appears.
  //
  // Seven chips do not fit a phone — measured at 375px, "Core" (the last
  // one) sits ~250px past the right edge — so a sheet that OPENS on a
  // group other than the first would show the right exercises under a chip
  // row with nothing highlighted and "Chest" leading it. That reads as the
  // filter having failed, which is the exact opposite of what the abs
  // interceptor is for. Nobody noticed before because the only possible
  // opening group was the first chip.
  //
  // MOUNT ONLY. Re-running this on every selection change would fight the
  // user: tapping a chip that is half off-screen would jerk the strip
  // under their finger. A chip they tapped is by definition already
  // visible; only a chip chosen FOR them needs revealing.
  //
  // Scrolls the strip itself rather than calling scrollIntoView, which is
  // free to scroll every scrollable ancestor as well — inside a sheet that
  // is itself a fixed, scrollable overlay, that is a real risk and the
  // measurement is two rects.
  useEffect(() => {
    const strip = stripRef.current;
    const chip = activeRef.current;
    if (!strip || !chip) return;
    const stripRect = strip.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    // A little past the chip so it doesn't land flush against the edge
    // looking like the list ends there.
    const GUTTER = 16;
    if (chipRect.right > stripRect.right) {
      strip.scrollLeft += chipRect.right - stripRect.right + GUTTER;
    } else if (chipRect.left < stripRect.left) {
      strip.scrollLeft -= stripRect.left - chipRect.left + GUTTER;
    }
  }, []);

  return (
    // touch-pan-x / overscroll-x-contain: same pair as every other
    // sideways scroller here (FriendSuggestions has the long version). The
    // first stops the browser waiting to see which way a drag across the
    // chips drifts before it picks an axis; the second stops a flick past
    // the last chip chaining out to whatever is behind.
    <div
      ref={stripRef}
      className="scrollbar-none flex touch-pan-x touch-pinch-zoom overflow-x-auto overscroll-x-contain -mx-4 gap-2 px-4 pb-1"
    >
      {MUSCLE_GROUPS.map((group) => {
        const active = group.id === selectedGroup;
        return (
          <button
            key={group.id}
            ref={active ? activeRef : undefined}
            type="button"
            onClick={() => onSelect(group.id)}
            className={`shrink-0 px-4 py-2.5 rounded-full text-base font-medium transition ${
              active ? 'bg-[var(--ember)] text-white' : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {group.label}
          </button>
        );
      })}
    </div>
  );
}
