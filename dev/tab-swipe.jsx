import { StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import '../src/index.css';
import { useTabSwipe } from '../src/hooks/useTabSwipe';

// The REAL useTabSwipe, over the two shapes that matter: ordinary page
// content, and a row that scrolls sideways.
//
// A swipe across the carousel used to clear every threshold the hook has —
// fast, straight, far — so it read as a perfect tab swipe and the tab
// changed under a finger that was trying to move the cards. The hook now
// declines a gesture that starts inside anything horizontally scrollable.
//
// await window.__swipe(target, dx) fires a real touchstart/move/end
// sequence at an element and answers whether the route changed — the only
// way to assert "no navigation happened", since a synthetic click cannot
// express a 60-pixel drag. It AWAITS a frame before reading the path:
// navigate() is a state update, so reading the DOM in the same tick
// reports the old route and every trial looks like a pass.
//
// The negative control is the important one and it is one line:
//
//   rail.style.overflowX = 'visible'
//
// take away the only thing the guard tests for and the same swipe flips
// the tab again, which is the bug this page exists to have caught.
//
// Dev only — this page is never built.

const PATHS = ['/', '/progress', '/social', '/shop'];

function Screen() {
  const containerRef = useRef(null);
  const location = useLocation();
  useTabSwipe(PATHS, containerRef);

  return (
    <div ref={containerRef} data-testid="container" className="min-h-dvh p-4">
      <h1 className="text-xl font-bold text-neutral-50">Tab swipe</h1>
      <p className="mt-1 font-mono text-sm text-[var(--ember)]" data-testid="path">
        {location.pathname}
      </p>

      <p className="mt-6 text-sm text-neutral-400">Plain content — a swipe here SHOULD change tab.</p>
      <div data-testid="plain" className="mt-2 rounded-xl bg-neutral-900 p-8 text-center text-neutral-500">
        plain area
      </div>

      <p className="mt-6 text-sm text-neutral-400">A carousel — a swipe here should move only the cards.</p>
      <div
        data-testid="rail"
        className="mt-2 flex touch-pan-x touch-pinch-zoom snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            data-testid={i === 0 ? 'card' : undefined}
            className="card w-36 shrink-0 snap-start p-6 text-center text-neutral-300"
          >
            Card {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

function Harness() {
  return (
    <Routes>
      {PATHS.map((path) => (
        <Route key={path} path={path} element={<Screen />} />
      ))}
    </Routes>
  );
}

// A real gesture: touchstart → touchmove → touchend, 60px+ across in well
// under the hook's 600ms, straight enough to clear MAX_VERTICAL_RATIO.
window.__swipe = async (testid, dx) => {
  const el = document.querySelector(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`no element for ${testid}`);
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;
  const startX = r.left + r.width / 2 - dx / 2;
  const mk = (type, x, list) =>
    new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      [list]: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
    });
  const path = () => document.querySelector('[data-testid="path"]').textContent;
  const before = path();
  el.dispatchEvent(mk('touchstart', startX, 'touches'));
  el.dispatchEvent(mk('touchmove', startX + dx / 2, 'touches'));
  el.dispatchEvent(mk('touchend', startX + dx, 'changedTouches'));
  await new Promise((r) => setTimeout(r, 50)); // let the route change commit
  return { before, after: path(), navigated: before !== path() };
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryRouter initialEntries={['/progress']}>
      <Harness />
    </MemoryRouter>
  </StrictMode>,
);
