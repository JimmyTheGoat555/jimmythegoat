import { useEffect, useState } from 'react';
import { TIER_STYLE, earnedBadgeMap, resolveFeaturedBadges } from '../../data/badges';
import BadgeMedallion from './BadgeMedallion';

// Up to three earned badges as struck metal chips.
//
// This replaced a full 13-slot shelf, and the reason is worth keeping:
// rendering the whole catalog with locked silhouettes and their
// thresholds turned the trophy case into a published to-do list. Nothing
// unearned appears anywhere now — what is left to get stays a surprise.
//
// Tapping a chip raises a tooltip for a few seconds rather than opening a
// sheet. A medal is a glance, not a destination: a full-screen modal to
// read one line of text made looking at your own badges feel like
// navigating somewhere.

const TOOLTIP_MS = 3000;

function formatEarned(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function BadgeRibbon({ badges, featured, onEdit, emptyHint = null, tooltipPlacement = 'bottom' }) {
  // One id, not a boolean per badge: only one tooltip is ever up, and
  // holding the id makes "tap the same chip again to dismiss" a
  // comparison rather than a second piece of state to keep in sync.
  const [activeId, setActiveId] = useState(null);

  const shown = resolveFeaturedBadges(badges, featured);
  const earned = earnedBadgeMap(badges);
  const active = shown.find((b) => b.id === activeId) ?? null;

  // Keyed on activeId so tapping a DIFFERENT chip restarts the clock
  // instead of inheriting the previous one's remaining time. The cleanup
  // is what stops a timer from a chip you already dismissed firing later
  // and clearing a tooltip you have since opened.
  useEffect(() => {
    if (!activeId) return undefined;
    const timer = setTimeout(() => setActiveId(null), TOOLTIP_MS);
    return () => clearTimeout(timer);
  }, [activeId]);

  if (shown.length === 0) {
    // Silence on someone else's profile; a nudge only where it is
    // actionable, which the caller decides by passing emptyHint.
    return emptyHint ? <p className="text-xs text-neutral-600">{emptyHint}</p> : null;
  }

  const style = active ? TIER_STYLE[active.tier] ?? TIER_STYLE.gold : null;
  const date = active ? formatEarned(earned.get(active.id)) : null;

  return (
    // `relative` anchors the tooltip; it is absolutely positioned so
    // raising one never shifts the page underneath it.
    <div className="relative flex flex-wrap items-center justify-center gap-1.5">
      {shown.map((badge) => (
        <button
          key={badge.id}
          type="button"
          // Toggle, so a second tap dismisses rather than silently
          // restarting a timer on a tooltip that is already up.
          onClick={() => setActiveId((cur) => (cur === badge.id ? null : badge.id))}
          aria-label={`${badge.name} — ${badge.howEarned}`}
          aria-expanded={activeId === badge.id}
          className="rounded-full transition active:scale-95"
        >
          <BadgeMedallion badge={badge} size="chip" />
        </button>
      ))}

      {onEdit && (
        // The picker used to live inside the detail sheet, which a
        // three-second tooltip is no place for. A quiet chip at the end of
        // the row is the only remaining way in, so it has to be here.
        <button
          type="button"
          onClick={onEdit}
          aria-label="Choose which badges to show"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-xs text-neutral-500 transition active:scale-95"
        >
          ✎
        </button>
      )}

      {active && (
        <div
          role="status"
          // Anchored to the ROW rather than to the chip. Centring a 15rem
          // tooltip on a chip near either end of a 375px screen pushes it
          // off the edge; centring on the row cannot. Placement flips for
          // the Workout tab, where the ribbon sits against the bottom nav
          // and "below" would be behind it.
          className={`absolute left-1/2 z-20 w-max max-w-[15rem] -translate-x-1/2 rounded-xl border border-white/15 bg-neutral-950/95 px-3 py-2 text-center shadow-lg shadow-black/50 ${
            tooltipPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          <p className="text-xs font-bold" style={{ color: style.color }}>
            {active.name}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-neutral-200">{active.howEarned}</p>
          {date && <p className="mt-0.5 text-[10px] text-neutral-500">Unlocked {date}</p>}
        </div>
      )}
    </div>
  );
}
