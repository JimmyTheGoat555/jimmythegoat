import { lazy, Suspense } from 'react';

// Sharing a past session from the row it sits in, without the detail
// page in between.
//
// The finish screen already knows how to open straight on its stickers
// (WorkoutCelebration's `startAtShare`); these are the two ends of the
// wire to it from a list — the button on a row, and the screen mounted
// where a row cannot mount it.

// The end-of-workout screen. Lazy: it pulls the animated card and the
// mascot art, and most visits to a list of workouts never open it.
const WorkoutCelebration = lazy(() => import('./WorkoutCelebration'));

// Instagram's "send" glyph — the paper plane — rather than the box-and-
// arrow: this is the button that takes a session OUT to a story, and on
// History it sits next to a Replay, so it must not read as a second play
// control.
function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[17px] w-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 3 10.5 13.5" />
      <path d="M21 3 14.5 21l-4-7.5L3 9.5z" />
    </svg>
  );
}

// The share button on a workout row. The rows are Links, so the tap is
// stopped here before it can navigate — the whole point is that sharing
// does not go through the detail page.
export function ShareWorkoutButton({ onClick, label = 'Share this workout' }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        navigator.vibrate?.([12]);
        onClick();
      }}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-[var(--tier-accent)] transition active:scale-95"
    >
      <SendIcon />
    </button>
  );
}

// The share screen for one stored workout, or nothing. Mount it OUTSIDE
// the row's Link: the screen is position-fixed, but its clicks still
// bubble through the React tree, and inside a Link every button on it
// would also navigate.
export function QuickShareSheet({ workout, onClose }) {
  if (!workout) return null;
  return (
    <Suspense fallback={null}>
      <WorkoutCelebration replay startAtShare workout={workout} onDone={onClose} />
    </Suspense>
  );
}
