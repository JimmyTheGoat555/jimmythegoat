import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The app's bottom sheet: slides up over a dimmed page, and closes from
// the backdrop, the handle, a drag down on the handle, or Escape.
//
// Mounted into document.body on purpose. The obvious place to render one
// — inside the card or list row that opened it — is inside `.card`, whose
// drop-shadow filter makes it the containing block for anything fixed
// beneath it (index.css), so a sheet drawn there would be pinned and
// clipped to the card. A portal puts it over the page whatever opened it.
// React events still bubble up the OWNER tree from a portal, so the root
// stops them: a tap inside the sheet must not read as a tap on the row,
// the drag list or the picker button behind it.
//
// `open` drives an enter and an exit: the sheet mounts off-screen, slides
// in on the next frame, and on close slides out before unmounting, so a
// caller toggles one boolean and never has to know about the animation.
// Keep the content mounted while it closes — a sheet whose text vanishes
// the instant it starts to move looks broken.
//
// `compact` is the short variant for a quick tip, sized to its content;
// the default grows to most of the screen and scrolls inside.

// Matches .sheet-motion in index.css. The exit unmounts on this timer
// rather than on transitionend, which never fires for an element the
// browser did not get to paint (a sheet closed on the frame it opened).
const MOTION_MS = 320;
// How far the handle has to be pulled down before letting go closes it.
const DISMISS_DRAG_PX = 80;

export default function BottomSheet({ open, onClose, title, compact = false, children }) {
  // closed → opening (mounted, off-screen) → open → closing → closed.
  // Derived from `open` during render — React's own pattern for reacting
  // to a prop change without an extra effect+render — and advanced by the
  // effect below once the browser has had its frame.
  const [phase, setPhase] = useState(open ? 'opening' : 'closed');
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setPhase(open ? 'opening' : phase === 'closed' ? 'closed' : 'closing');
  }

  useEffect(() => {
    if (phase === 'opening') {
      // Two frames: the first commits the off-screen transform, the second
      // starts the transition from it. One is not reliably enough.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setPhase('open'));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    if (phase === 'closing') {
      const t = setTimeout(() => setPhase('closed'), MOTION_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const titleId = useId();

  // Focus moves into the sheet and back out again, so a keyboard or a
  // screen reader lands on it and is returned to whatever opened it.
  useEffect(() => {
    if (phase !== 'open') return undefined;
    restoreFocusRef.current = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const el = restoreFocusRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, [phase, onClose]);

  // Pull the handle down to dismiss. Pointer events with capture, so the
  // gesture survives the finger wandering off the handle; the panel
  // follows the finger with no transition, then either closes or springs
  // back with one.
  const [drag, setDrag] = useState(null); // { startY, dy } while a pull is in progress
  const onHandleDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ startY: e.clientY, dy: 0 });
  };
  const onHandleMove = (e) => {
    setDrag((d) => (d ? { ...d, dy: Math.max(0, e.clientY - d.startY) } : d));
  };
  const onHandleUp = () => {
    setDrag((d) => {
      if (d && d.dy > DISMISS_DRAG_PX) onClose?.();
      return null;
    });
  };

  if (phase === 'closed') return null;
  const shown = phase === 'open';
  const dy = drag?.dy ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* touch-none: a finger dragging on the dim must not scroll the page
          underneath it, which iOS would otherwise happily do. */}
      <div
        className={`sheet-motion absolute inset-0 touch-none bg-black/60 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`relative flex w-full max-w-md flex-col rounded-t-[28px] border-x border-t border-white/10 bg-neutral-950/94 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] outline-none backdrop-blur-md ${
          compact ? 'max-h-[60vh]' : 'max-h-[85vh]'
        } ${drag ? '' : 'sheet-motion'}`}
        style={{
          transform: shown ? `translateY(${dy}px)` : 'translateY(100%)',
          paddingBottom: 'var(--safe-b)',
        }}
      >
        {/* The handle: a real button, so it is a tap target as well as a
            grab handle — the "subtle close" of the two closes. */}
        <div
          className="touch-none"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="mx-auto mb-1 mt-2.5 flex h-7 w-16 items-center justify-center rounded-full active:opacity-60"
          >
            <span className="h-1 w-9 rounded-full bg-white/25" aria-hidden="true" />
          </button>
          {title && (
            <h2 id={titleId} className="px-5 pb-2 text-xl font-bold text-neutral-50">
              {title}
            </h2>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
