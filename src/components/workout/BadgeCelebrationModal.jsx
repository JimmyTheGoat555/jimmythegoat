import { useEffect } from 'react';
import { getBadge } from '../../data/badges';

// "You earned a trophy." The middle step of the post-workout cascade:
// the tick-list animation hands over to this, and this hands over to the
// Silver Lootbox if one is due (see App.jsx, which owns the ordering).
//
// Confetti is imported dynamically, matching SilverLootboxModal and
// useTierUpCelebration — canvas-confetti is ~7kB that most sessions never
// need, and the burst is a moment late by design anyway. `zIndex: 100`
// puts it over this modal (z-[68]); `disableForReducedMotion` is the
// library's own opt-out and is respected here rather than reimplemented.
export default function BadgeCelebrationModal({ badgeIds = [], onClaim }) {
  const badges = badgeIds.map((id) => getBadge(id)).filter(Boolean);

  useEffect(() => {
    if (badges.length === 0) return;
    let cancelled = false;
    import('canvas-confetti')
      .then(({ default: confetti }) => {
        if (cancelled) return;
        const base = { disableForReducedMotion: true, zIndex: 100, ticks: 300 };
        const trophy = ['#ffd76e', '#f7cf5e', '#d4af37', '#fff6d0'];
        // Two arcs from the lower corners rather than one central burst:
        // the badges sit in the middle of the screen, and a column fired
        // from behind them mostly lands on top of the thing you are meant
        // to be looking at.
        confetti({ ...base, particleCount: 80, angle: 62, spread: 60, origin: { x: 0.05, y: 0.7 }, colors: trophy });
        confetti({ ...base, particleCount: 80, angle: 118, spread: 60, origin: { x: 0.95, y: 0.7 }, colors: trophy });
      })
      // A missing chunk (offline, cache miss) must not cost someone the
      // trophy screen itself — the confetti is the garnish.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Fires once for the set that was handed in; the parent unmounts this
    // rather than swapping its props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nothing the registry can name means nothing to celebrate — get out of
  // the way rather than showing an empty trophy case.
  useEffect(() => {
    if (badges.length === 0) onClaim?.();
  }, [badges.length, onClaim]);
  if (badges.length === 0) return null;

  const many = badges.length > 1;

  return (
    <div className="fixed inset-0 z-[68] flex flex-col items-center justify-center gap-6 bg-neutral-950/97 px-6 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 42%, rgba(247,207,94,0.22), transparent 62%)' }}
      />

      <div className="relative text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300/80">
          {many ? `${badges.length} trophies unlocked` : 'Trophy unlocked'}
        </p>
      </div>

      <ul className="relative flex w-full max-w-sm flex-col items-center gap-5">
        {badges.map((badge) => (
          <li key={badge.id} className="flex flex-col items-center gap-2 text-center">
            {/* badge-celebrate is the pop-in + hard glow (index.css). The
                shelf's badge-earned is a slow breathe for a grid of
                thirteen; this is one trophy at full screen and wants a
                different weight entirely. */}
            <span className="badge-celebrate text-7xl leading-none" aria-hidden="true">
              {badge.icon}
            </span>
            <span className="text-xl font-bold text-neutral-50">{badge.name}</span>
            <span className="max-w-xs text-sm leading-snug text-neutral-400">{badge.blurb}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onClaim}
        autoFocus
        className="relative w-full max-w-xs rounded-2xl bg-[var(--ember)] py-3.5 text-base font-bold text-white transition active:scale-[0.97]"
      >
        Awesome!
      </button>
    </div>
  );
}
