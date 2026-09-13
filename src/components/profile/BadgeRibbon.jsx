import { useState } from 'react';
import { TIER_STYLE, earnedBadgeMap, resolveFeaturedBadges } from '../../data/badges';
import BadgeDetailSheet from './BadgeDetailSheet';

// Up to three earned badges as small tier-coloured pills.
//
// This replaced a full 13-slot shelf, and the reason is worth keeping:
// rendering the whole catalog with locked silhouettes and their
// thresholds turned the trophy case into a published to-do list. Nothing
// unearned appears anywhere now — what is left to get stays a surprise.
//
// The pill carries the CATEGORY name only ("Bench Press"), never the
// tier word. The metal is the colour, and "Bench Press · Gold" in a pill
// this size wraps to two lines and reads like a filename. Same chip
// language the equipped-accessory row used before it was dropped.
//
// Each pill is its own button, opening BadgeDetailSheet. That is where
// the tier, the plain-language "what you did", and the unlock date live —
// a pill has room for none of it, and on a phone there is no hover.
// `onEdit` (own profile only) is surfaced INSIDE that sheet rather than
// as a second control out here, so the row stays one kind of target.
export default function BadgeRibbon({ badges, featured, onEdit, emptyHint = null }) {
  const [detail, setDetail] = useState(null);
  const shown = resolveFeaturedBadges(badges, featured);
  const earned = earnedBadgeMap(badges);

  if (shown.length === 0) {
    // Silence on someone else's profile; a nudge only where it is
    // actionable, which the caller decides by passing emptyHint.
    return emptyHint ? <p className="text-xs text-neutral-600">{emptyHint}</p> : null;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {shown.map((badge) => {
          const style = TIER_STYLE[badge.tier] ?? TIER_STYLE.gold;
          return (
            <button
              key={badge.id}
              type="button"
              onClick={() => setDetail(badge)}
              aria-label={`${badge.name} — ${badge.howEarned}`}
              // The tier reads three ways at once — border, wash and text —
              // so bronze and gold stay apart on a dim phone screen
              // outdoors, where a single hue against dark grey is
              // genuinely hard to call.
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition active:scale-95"
              style={{ borderColor: `${style.color}66`, background: `${style.color}14`, color: style.color }}
            >
              <span aria-hidden="true" className="text-sm leading-none">
                {badge.icon}
              </span>
              {badge.categoryName}
            </button>
          );
        })}
      </div>

      {detail && (
        <BadgeDetailSheet
          badge={detail}
          earnedAt={earned.get(detail.id)}
          onEdit={onEdit}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
