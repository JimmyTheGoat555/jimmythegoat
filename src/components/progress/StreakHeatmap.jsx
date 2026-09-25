import { useEffect, useMemo, useRef, useState } from 'react';
import { buildHeatmapWeeks, currentTrainingStreak } from '../../utils/heatmap';

// How many full weeks the grid shows — ~5 months, a good balance between
// "enough history to feel like a contribution graph" and staying inside a
// phone-width card without scrolling on most devices (it's still wrapped
// in a horizontal scroller as a safety net for narrower ones).
const WEEKS = 20;

// Opacity steps for var(--tier-accent) — the grid automatically matches
// whichever tier colour the rest of the app is currently themed with
// (see utils/tierTheme.js), rather than a fixed hardcoded colour.
const LEVEL_OPACITY = [0, 0.28, 0.52, 0.76, 1];

function dateLabel(date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

function Cell({ day, isSelected, onSelect }) {
  if (day.isFuture) {
    return <div className="h-3 w-3 rounded-[3px]" aria-hidden="true" />;
  }
  const label =
    day.level === 0
      ? `${dateLabel(day.date)} — rest day`
      : `${dateLabel(day.date)} — ${Math.round(day.score)} pts`;
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-label={label}
      className="h-3 w-3 rounded-[3px] transition-transform active:scale-90"
      style={{
        background: day.level === 0 ? 'rgba(255,255,255,0.06)' : 'var(--tier-accent)',
        opacity: day.level === 0 ? 1 : LEVEL_OPACITY[day.level],
        outline: isSelected ? '1.5px solid var(--tier-accent)' : 'none',
        outlineOffset: 1,
      }}
    />
  );
}

// A GitHub-style contribution grid over the user's own workout history —
// purely client-side (useCloudWorkouts already has the full list loaded;
// this reads no new data). A comeback/recovery workout still lights up
// its day — see utils/heatmap.js for why that's deliberate.
export default function StreakHeatmap({ workouts }) {
  const weeks = useMemo(() => buildHeatmapWeeks(workouts, WEEKS), [workouts]);
  const streak = useMemo(() => currentTrainingStreak(workouts), [workouts]);
  const [selected, setSelected] = useState(null);
  const scrollRef = useRef(null);

  // Open scrolled to the right edge — "today" — rather than the oldest
  // week, which is what a fresh horizontal scroller shows by default.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  return (
    <section className="card p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-neutral-100">Streak</h2>
        <span className="text-sm font-bold" style={{ color: streak > 0 ? 'var(--tier-accent)' : undefined }}>
          {streak > 0 ? `🔥 ${streak} day${streak === 1 ? '' : 's'}` : 'No streak yet'}
        </span>
      </div>

      {/* The year of squares is wider than the phone, so it scrolls
          sideways inside a tab that scrolls down — touch-pan-x commits the
          axis at the first pixel, overscroll-x-contain keeps a flick at
          either end from leaking out. */}
      <div ref={scrollRef} className="touch-pan-x touch-pinch-zoom overflow-x-auto overscroll-x-contain -mx-1 px-1">
        <div className="flex flex-col gap-1 w-max">
          <div className="flex gap-1">
            {weeks.map((week, i) => (
              <div key={i} className="w-3 shrink-0 text-[9px] leading-none text-neutral-500">
                {week.monthLabel ?? ''}
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, i) => (
              <div key={i} className="flex flex-col gap-1 shrink-0">
                {week.days.map((day) => (
                  <Cell
                    key={day.dayIndex}
                    day={day}
                    isSelected={selected?.dayIndex === day.dayIndex}
                    onSelect={setSelected}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500 min-h-[1em]">
          {selected
            ? selected.level === 0
              ? `${dateLabel(selected.date)} — rest day`
              : `${dateLabel(selected.date)} — ${selected.count} workout${selected.count === 1 ? '' : 's'}, ${Math.round(selected.score)} pts`
            : 'Tap a day for details'}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-neutral-600">Less</span>
          {LEVEL_OPACITY.map((op, i) => (
            <span
              key={i}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: i === 0 ? 'rgba(255,255,255,0.06)' : 'var(--tier-accent)', opacity: i === 0 ? 1 : op }}
            />
          ))}
          <span className="text-[10px] text-neutral-600">More</span>
        </div>
      </div>
    </section>
  );
}
