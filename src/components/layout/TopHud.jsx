function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-chrome-muted)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// The brand logo — public/newlogo.zozo.png, the same file behind the
// favicon, the home-screen icon and the launch screen — as a small
// app-icon tile in the middle of the HUD. Square in the file, so h-8
// with w-auto is a 32px square; rounded and ringed like the launcher
// icon it is.
const BRAND_LOGO = '/newlogo.zozo.png';

// Persistent chrome above every tab-bar screen (rendered from App.jsx's
// Layout, same scope as BottomNav — not shown on the standalone /workout
// screen, which has its own header). `coins` comes straight off the
// account doc; this holds no state of its own, same "the live doc IS the
// state" reasoning as everywhere else the economy shows up.
//
// Three equal columns, not justify-between: the gear and the coin pill
// are different widths, and the logo has to sit on the screen's true
// centre line, not the midpoint of the gap between them.
export default function TopHud({ coins, onOpenSettings }) {
  return (
    // pt-4's worth of breathing room PLUS whatever the notch/status bar
    // occupies. With viewport-fit=cover (index.html) the page paints
    // under the status bar, so without this the coin counter and the gear
    // sit behind the clock and battery on a notched phone.
    //
    // min-height is --hud-h (index.css): that padding plus the 2.5rem
    // control row, which is exactly what this renders at — pinned so a
    // page sizing itself to "the screen below the HUD" (WorkoutHome's
    // lobby) subtracts the real height, not a copied number.
    <div
      className="relative z-10 grid grid-cols-3 items-center"
      style={{ paddingTop: 'calc(var(--safe-t) + 1rem)', minHeight: 'var(--hud-h)' }}
    >
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="justify-self-start w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 active:scale-90 transition"
      >
        <GearIcon />
      </button>
      <img
        src={BRAND_LOGO}
        alt="Jimmy the Goat"
        draggable="false"
        className="justify-self-center h-8 w-auto aspect-square rounded-[10px] object-cover select-none shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_4px_12px_rgba(0,0,0,0.45)]"
      />
      <div className="justify-self-end flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 border border-white/10">
        <span className="text-base leading-none">🪙</span>
        <span className="text-sm font-semibold text-neutral-100 tabular-nums">
          {(coins ?? 0).toLocaleString('en-US')}
        </span>
      </div>
    </div>
  );
}
