import { useState } from 'react';
import {
  MAX_FEATURED_BADGES,
  TIER_STYLE,
  earnedBadgeMap,
  earnedCategoryBests,
  resolveFeaturedBadges,
} from '../../data/badges';

// Choose which three badges your profile shows.
//
// Offers your best tier per CATEGORY, not all 33 ids: "Bench Press ·
// Bronze" is not a thing to pick when you already hold gold there, and
// listing every rung would make the list mostly noise.
//
// Only earned badges appear. Nothing in this app shows a locked badge any
// more — the catalog is a surprise, not a checklist on display.
export default function BadgePickerModal({ badges, featured, onSave, onClose }) {
  const earned = earnedBadgeMap(badges);
  const options = earnedCategoryBests(earned);
  // Seeded from what is currently ON the profile — including the
  // automatic gold-first default — so opening this and saving without
  // touching anything is a no-op rather than a wipe.
  const [picked, setPicked] = useState(() => resolveFeaturedBadges(badges, featured).map((b) => b.id));

  const toggle = (id) => {
    navigator.vibrate?.([20]);
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : // Full: drop the OLDEST pick rather than refusing the tap. A
          // disabled row that does nothing when you press it reads as
          // broken; sliding the window is what people expect from a
          // "pick three".
          [...prev, id].slice(-MAX_FEATURED_BADGES),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose your badges"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-neutral-950 px-5 pb-3 pt-5">
          <div>
            <h2 className="text-xl font-bold text-neutral-50">Your badges</h2>
            <p className="mt-0.5 text-xs text-neutral-500">
              Pick up to {MAX_FEATURED_BADGES} to show on your profile.
            </p>
          </div>
          <button type="button" onClick={onClose} className="px-1 text-2xl leading-none text-neutral-500">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4">
          {options.length === 0 ? (
            <p className="py-2 text-center text-sm text-neutral-500">
              No badges yet. Go and earn one.
            </p>
          ) : (
            options.map((badge) => {
              const style = TIER_STYLE[badge.tier] ?? TIER_STYLE.gold;
              const on = picked.includes(badge.id);
              return (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => toggle(badge.id)}
                  aria-pressed={on}
                  className="flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[0.98]"
                  style={
                    on
                      ? { borderColor: `${style.color}88`, background: `${style.color}1a` }
                      : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }
                  }
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {badge.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" style={{ color: style.color }}>
                      {badge.name}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">{badge.requirement}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-black"
                    style={{
                      background: on ? style.color : 'rgba(255,255,255,0.08)',
                      color: on ? '#101014' : 'transparent',
                    }}
                  >
                    ✓
                  </span>
                </button>
              );
            })
          )}
        </div>

        {options.length > 0 && (
          <div className="sticky bottom-0 border-t border-white/10 bg-neutral-950 px-5 py-4">
            <button
              type="button"
              onClick={() => {
                onSave(picked);
                onClose();
              }}
              className="w-full rounded-2xl bg-[var(--ember)] py-3.5 text-base font-semibold text-white transition active:scale-[0.97]"
            >
              {picked.length === 0
                ? 'Show my best three'
                : `Show ${picked.length} badge${picked.length === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
