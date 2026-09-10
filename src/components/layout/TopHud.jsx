function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Persistent chrome above every tab-bar screen (rendered from App.jsx's
// Layout, same scope as BottomNav — not shown on the standalone /workout
// screen, which has its own header). `coins` comes straight off the
// account doc; this holds no state of its own, same "the live doc IS the
// state" reasoning as everywhere else the economy shows up.
export default function TopHud({ coins, onOpenSettings }) {
  return (
    <div className="relative z-10 flex items-center justify-between pt-4">
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 border border-white/10 active:scale-90 transition"
      >
        <GearIcon />
      </button>
      <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/5 border border-white/10">
        <span className="text-base leading-none">🪙</span>
        <span className="text-sm font-semibold text-neutral-100 tabular-nums">{(coins ?? 0).toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}
