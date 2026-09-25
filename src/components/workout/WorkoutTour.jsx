import { useEffect, useRef, useState } from 'react';
import { GUTTER, tourLayout } from '../../utils/tourLayout';

// The first-workout tour's one visible piece: a dark scrim with a hole cut
// in it around one control, and a speech bubble beside it. One step at a
// time; useWorkoutTour owns which step that is and whether there is a tour
// at all.
//
// The hole is FOUR panels — above, left, right, below the target — rather
// than one element with a giant `box-shadow: 0 0 0 9999px`. Same picture,
// but the shadow trick paints a 9999px blur-free layer that some mobile
// browsers promote to a texture that size, and this screen is already the
// heaviest in the app. Four rectangles are four rectangles.
//
// Nothing underneath is tappable while this is up. That is deliberate:
// the tour points at controls that change state (Chill Mode is a toggle,
// +DS inserts a row), and a tap that both advances the tour and rearranges
// the screen behind it lands as neither.

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export default function WorkoutTour({ step, stepNumber, stepCount, onNext, onDismiss }) {
  const bubbleRef = useRef(null);
  const [layout, setLayout] = useState(null);
  // The loop below runs off one effect keyed on the step, and must not
  // tear down and restart every time the parent re-renders with fresh
  // callbacks.
  const handlers = useRef({ onNext, onDismiss });
  // Written from an effect that runs after every render rather than in the
  // render body: mutating a ref during render is an anti-pattern even when
  // nothing reads it back mid-render, because a render React discards
  // could otherwise leave the ref holding callbacks that were never
  // committed. (Same reasoning as useTabSwipe's stateRef.)
  useEffect(() => {
    handlers.current = { onNext, onDismiss };
  });

  const isLast = stepNumber >= stepCount;

  // Bring the target on screen, once per step. Only when it is actually
  // out of the way: two of the four live in the header, and scrolling the
  // page to centre something that is already visible is a lurch for
  // nothing.
  useEffect(() => {
    const el = document.querySelector(step.target);
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (box.top < GUTTER * 4 || box.bottom > window.innerHeight - 220) {
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [step.target]);

  // Re-measure every frame while a step is up.
  //
  // Cheaper than it sounds and much simpler than the alternative: the
  // target moves under a smooth scroll, the bubble has no height until it
  // has been painted once, and the rest chip can appear and reflow the
  // page. Listening for scroll (in capture, because the scroller may be an
  // ancestor), resize, and the bubble's own resize is three subscriptions
  // that between them still miss a frame of the smooth scroll. This is one
  // getBoundingClientRect per frame, for the few seconds a tour is open,
  // once in an account's lifetime. State is only set when the numbers
  // actually change, so the re-render cost is zero while nothing moves.
  useEffect(() => {
    let frame = 0;
    let previous = '';
    let gaveUp = false;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const el = document.querySelector(step.target);
      if (!el) {
        // The control went away under us. Move on rather than point at a
        // hole where it used to be; `next` only ever moves forward, so
        // this cannot loop.
        if (!gaveUp) {
          gaveUp = true;
          handlers.current.onNext();
        }
        return;
      }
      const bubble = bubbleRef.current;
      const computed = tourLayout(el.getBoundingClientRect(), bubble?.offsetWidth ?? 0, bubble?.offsetHeight ?? 0, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      const key = JSON.stringify(computed);
      if (key !== previous) {
        previous = key;
        setLayout(computed);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step.target]);

  // Escape leaves the tour, like every other overlay in this app.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handlers.current.onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Move focus to each new step so a screen reader reads it out. Without
  // preventScroll this fights the scrollIntoView above.
  useEffect(() => {
    bubbleRef.current?.focus({ preventScroll: true });
  }, [step.id]);

  const spot = layout?.spot;
  // Clamped for the panels only: a target scrolled half off the top gives
  // a negative top, and a panel cannot have a negative height. The ring
  // itself keeps the raw numbers so it stays glued to the control.
  const spotTop = Math.max(0, spot?.top ?? 0);
  const spotBottom = Math.max(0, (spot?.top ?? 0) + (spot?.height ?? 0));
  const spotLeft = Math.max(0, spot?.left ?? 0);
  const spotRight = Math.max(0, (spot?.left ?? 0) + (spot?.width ?? 0));

  return (
    // A tap anywhere on the scrim advances — the idiom every mobile
    // walkthrough uses — while the buttons in the bubble stay explicit for
    // anyone who would rather aim. z-40 clears the bottom nav (z-30) so the
    // scrim covers it, and stays under every modal (z-50 and up) so a rest
    // timer or a dialog is never trapped behind a tutorial.
    <div className="fixed inset-0 z-40" onClick={() => handlers.current.onNext()} role="presentation">
      {spot && (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/75" style={{ height: spotTop }} />
          <div className="absolute inset-x-0 bottom-0 bg-black/75" style={{ top: spotBottom }} />
          <div className="absolute left-0 bg-black/75" style={{ top: spotTop, height: spotBottom - spotTop, width: spotLeft }} />
          <div
            className="absolute right-0 bg-black/75"
            style={{ top: spotTop, height: spotBottom - spotTop, left: spotRight }}
          />
          <div
            className="tour-ring pointer-events-none absolute rounded-2xl border-2 border-[var(--ember)]"
            style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
            aria-hidden="true"
          />
        </>
      )}

      <div
        ref={bubbleRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onClick={(e) => e.stopPropagation()}
        // Hidden rather than mispositioned for the one frame before the
        // bubble has a measured height — the layout that places it needs
        // that height as an input.
        className={`tip-enter absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-xl shadow-black/60 outline-none ${
          layout ? '' : 'invisible'
        }`}
        style={{ top: layout?.top ?? 0, left: layout?.left ?? 0 }}
      >
        {layout && (
          <span
            aria-hidden="true"
            className="absolute h-3 w-3 rotate-45 border-white/10 bg-neutral-900"
            style={{
              left: layout.caretLeft - 6,
              ...(layout.placeBelow
                ? { top: -7, borderTopWidth: 1, borderLeftWidth: 1 }
                : { bottom: -7, borderBottomWidth: 1, borderRightWidth: 1 }),
            }}
          />
        )}

        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ember)] tabular-nums">
          {stepNumber} of {stepCount}
        </p>
        <h2 id="tour-title" className="mt-1 text-base font-bold text-neutral-50">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1.5 text-sm leading-relaxed text-neutral-300">
          {step.body}
        </p>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          {/* Always there, on every step, in the same place. A tutorial
              you have to finish to escape is the thing people complain
              about. */}
          <button
            type="button"
            onClick={() => handlers.current.onDismiss()}
            className="-m-1 p-1 text-xs font-semibold text-neutral-500"
          >
            Skip tutorial
          </button>
          <button
            type="button"
            onClick={() => handlers.current.onNext()}
            className="rounded-xl bg-[var(--ember)] px-4 py-2 text-sm font-bold text-white transition active:scale-95"
          >
            {isLast ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
