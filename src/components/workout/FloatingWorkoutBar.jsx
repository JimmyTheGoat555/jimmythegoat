import { useEffect, useState } from 'react';

// Tailwind's red-500 — the overtime colour the full-screen timer uses.
const OVERTIME_RED = '#ef4444';

// Elapsed time, ticking. A second copy of WorkoutTimer's formatter rather
// than that component itself, because this one needs a different size and
// colour and an hour rollover — a workout browsed in the background can
// genuinely run past 60 minutes, where "72:14" reads worse than "1:12:14".
function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// The rest countdown, mm:ss. Always two-digit minutes so the number does
// not change width as it crosses 10:00 — the clock sits at the end of a
// flex row, and a jittering glyph count would nudge the text beside it on
// every tick.
function formatRest(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// The "your workout is still running" bar, shown on every screen EXCEPT
// the workout itself.
//
// It exists because the session does not stop when you leave the screen —
// it never did; `activeWorkout` lives in App and survives every route
// change, and the bottom tabs have always been tappable mid-workout. What
// was missing was any evidence of that: leave the workout screen and the
// app looked exactly as it does with nothing running, with no way back
// except finding the Workout tab again. This is that evidence, and that
// way back.
//
// Sits directly above BottomNav (z-30) at z-20 so the tabs stay on top,
// and is `fixed` so it never participates in any page's scroll.
//
// It shows ONE of two clocks. Ordinarily the session's elapsed time; while
// a rest is counting down, the rest instead — because that is the number
// with a deadline attached, and it is the reason somebody glances at this
// bar at all from three screens away. Both clocks keep running either way;
// this only decides which is on top.
export default function FloatingWorkoutBar({
  startedAt,
  exerciseCount = 0,
  setCount = 0,
  // Seconds left on the rest, or null when none is running. The countdown
  // itself belongs to App's useRestTimer — this bar only draws it, and
  // deliberately has no way to start, extend or skip one.
  restSecondsLeft = null,
  // Seconds past 0:00 once the rest is up — the bar counts up in red,
  // exactly as the full-screen clock does.
  restOverdueSeconds = 0,
  onRestore,
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = formatElapsed(now - new Date(startedAt).getTime());
  // Which clock this bar is showing. While a rest runs, the rest WINS: it
  // is the only one of the two that is counting toward something the
  // lifter has to act on, and a session that has been going 41 minutes is
  // not news. The elapsed clock comes straight back when the rest ends,
  // and it never stopped running underneath — nothing here changes the
  // workout, only which number is on top.
  const isResting = restSecondsLeft !== null;
  const isDone = isResting && restSecondsLeft <= 0;
  const clock = isResting ? (isDone ? `+${formatRest(restOverdueSeconds)}` : formatRest(restSecondsLeft)) : elapsed;
  // Past 0:00 the clock turns red and counts up — the same treatment the
  // full-screen timer gives it, so the two read as one timer seen from
  // two places.
  const clockColor = isDone ? OVERTIME_RED : 'var(--tier-accent)';
  const label = isResting ? (isDone ? 'Over' : 'Rest') : 'Elapsed';

  return (
    // bottom-[var(--nav-total)] rather than a hard-coded offset:
    // BottomNav's height and the home-indicator inset beneath it are both
    // set once in index.css and read here, so a tab row that grows (a
    // fifth tab for a trainer, a larger font, a phone with a gesture bar)
    // cannot leave this overlapping it.
    <div className="fixed inset-x-0 bottom-[var(--nav-total)] z-20 px-3 pb-2">
      <button
        type="button"
        onClick={onRestore}
        aria-label={
          isResting
            ? isDone
              ? `Back to your workout, rest over by ${clock.slice(1)}`
              : `Back to your workout, ${clock} of rest left`
            : `Back to your workout, running ${elapsed}`
        }
        // A rest is the one state this bar has to shout. Off a rest it is
        // a quiet reminder that a session is open; during one it IS the
        // rest timer as far as the lifter is concerned — they are on
        // another tab, phone at arm's length — so the border thickens and
        // takes the state colour outright instead of a 45% wash of it.
        className={`mx-auto flex w-full max-w-md cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-lg transition-transform duration-150 active:scale-[0.98] motion-reduce:active:scale-100 ${
          isResting ? 'border-2' : 'border'
        }`}
        style={{
          borderColor: isResting ? clockColor : 'color-mix(in srgb, var(--tier-accent) 45%, transparent)',
          background: 'linear-gradient(180deg, rgba(23,23,23,0.98), rgba(10,10,10,0.98))',
          backdropFilter: 'blur(8px)',
          boxShadow: isResting ? `0 0 28px -10px ${clockColor}` : undefined,
        }}
      >
        {/* The pulse. Two stacked dots — a solid core and a ring that
            scales and fades out underneath it — so the animation only ever
            touches transform and opacity, which the compositor can run off
            the main thread. A pulsing box-shadow or width would repaint on
            every frame of every feed scroll, which is exactly the lag this
            bar must not introduce. */}
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          <span
            className="absolute inset-0 rounded-full motion-safe:animate-ping"
            style={{ background: clockColor, opacity: 0.75 }}
          />
          <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: clockColor }} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-neutral-50">
            {isDone ? 'Rest over — back to it' : isResting ? 'Resting' : 'Workout in progress'}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {exerciseCount === 0
              ? 'Nothing logged yet — tap to get started'
              : `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} · ${setCount} set${setCount === 1 ? '' : 's'} done`}
          </span>
        </span>

        {/* Captioned in BOTH states, not only while resting. Without the
            caption the number simply starts counting DOWN one second and
            the lifter has no way to tell whether their session clock has
            gone wrong; with it, the swap explains itself. Labelling it in
            one state only would also shift the row's height on every rest. */}
        <span className="flex shrink-0 flex-col items-end leading-none">
          {/* Half again as large during a rest — this is a countdown read
              across a room, not a session clock glanced at. */}
          <span
            className={`font-mono font-bold tabular-nums ${isResting ? 'text-2xl' : 'text-base'}`}
            style={{ color: clockColor, textShadow: isResting ? `0 0 18px ${clockColor}66` : undefined }}
          >
            {clock}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
        </span>

        {/* Chevron up: the visual inverse of the Minimize control on the
            workout screen, so the two read as one gesture in two
            directions. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-neutral-500"
          aria-hidden="true"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>
    </div>
  );
}
