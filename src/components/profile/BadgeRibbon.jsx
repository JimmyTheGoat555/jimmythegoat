import { TIER_STYLE, resolveFeaturedBadges } from '../../data/badges';

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
export default function BadgeRibbon({ badges, featured, onEdit, emptyHint = null }) {
  const shown = resolveFeaturedBadges(badges, featured);

  if (shown.length === 0) {
    // Silence on someone else's profile; a nudge only where it is
    // actionable, which the caller decides by passing emptyHint.
    return emptyHint ? <p className="text-xs text-neutral-600">{emptyHint}</p> : null;
  }

  const pills = shown.map((badge) => {
    const style = TIER_STYLE[badge.tier] ?? TIER_STYLE.gold;
    return (
      <span
        key={badge.id}
        // The tier reads three ways at once — border, wash and text — so
        // bronze and gold stay apart on a dim phone screen outdoors,
        // where a single hue against dark grey is genuinely hard to call.
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
        style={{ borderColor: `${style.color}66`, background: `${style.color}14`, color: style.color }}
        title={`${badge.name} — ${badge.requirement}`}
      >
        <span aria-hidden="true" className="text-sm leading-none">
          {badge.icon}
        </span>
        {badge.categoryName}
      </span>
    );
  });

  if (!onEdit) {
    return <div className="flex flex-wrap items-center justify-center gap-1.5">{pills}</div>;
  }

  // On your own profile the whole row is the way in to changing it —
  // there is no other control, and a separate "edit" link next to three
  // pills would outweigh them.
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label="Choose which badges to show"
      className="flex flex-wrap items-center justify-center gap-1.5 rounded-full transition active:scale-[0.98]"
    >
      {pills}
    </button>
  );
}
