import { BADGE_CATEGORIES, TIER_STYLE, earnedBadgeMap, highestEarnedTier, nextTier } from '../../data/badges';

function formatEarned(iso) {
  if (!iso) return 'Unlocked';
  return `Unlocked ${new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// The trophy shelf. `badges` is an array of { id, at } — server-awarded
// on logWorkout (functions/badges.js), never writable by a client.
//
// ONE SLOT PER CATEGORY, not one per badge. There are 33 badge ids across
// 13 categories; rendering them flat would be a wall of near-identical
// tiles saying "Bench Press · Bronze", "Bench Press · Silver"… The
// question a trophy case answers is "where am I on bench", and a single
// tile showing the best metal reached — with the next rung underneath —
// answers it at a glance.
//
// Two modes:
//   * Your own profile renders every category. A locked slot naming what
//     comes next is the only place this app states a goal.
//   * A friend's renders only categories you have something in. Their
//     empty slots are not your business.
export default function BadgeShelf({ badges, unlockedOnly = false, title = 'Trophies' }) {
  const earned = earnedBadgeMap(badges);

  const slots = BADGE_CATEGORIES.map((category) => ({
    category,
    best: highestEarnedTier(category, earned),
    next: nextTier(category, earned),
  })).filter((slot) => !unlockedOnly || slot.best);

  if (unlockedOnly && slots.length === 0) return null;

  // Counted in CATEGORIES, matching what is on screen. Counting the 33
  // ids would make the number disagree with the tiles under it.
  const started = slots.filter((s) => s.best).length;

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
        <span className="text-sm text-neutral-400 tabular-nums">
          {unlockedOnly ? started : `${started} / ${BADGE_CATEGORIES.length}`}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {slots.map(({ category, best, next }) => {
          const style = best ? TIER_STYLE[best.tier] : null;
          const tiered = category.tiers.length > 1;
          return (
            <li
              key={category.id}
              className="flex flex-col items-center gap-1.5 rounded-2xl border p-4 text-center transition"
              style={
                best
                  ? { borderColor: `${style.color}55`, background: `${style.color}0f` }
                  : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }
              }
            >
              <span
                // The metal is carried by a drop-shadow in the tier colour
                // rather than by tinting the emoji: recolouring an emoji
                // is not reliably possible, and a bronze halo around a
                // full-colour icon reads as the metal anyway.
                className={`text-4xl leading-none ${best ? 'badge-earned' : 'grayscale opacity-25'}`}
                style={best ? { filter: `drop-shadow(0 0 8px ${style.glow})` } : undefined}
                aria-hidden="true"
              >
                {category.icon}
              </span>

              <span className={`text-sm font-bold ${best ? 'text-neutral-50' : 'text-neutral-400'}`}>
                {category.name}
              </span>

              {best && tiered && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider"
                  style={{ color: style.color, background: `${style.color}1f`, border: `1px solid ${style.color}55` }}
                >
                  {style.label} · {best.label}
                </span>
              )}

              {/* Earned date for a finished category, the next rung for one
                  still in progress, the requirement for an untouched one.
                  Always exactly one line, so the grid stays even. */}
              <span className="text-xs leading-snug text-neutral-500">
                {best && !next
                  ? formatEarned(earned.get(best.id))
                  : next
                    ? `Next: ${next.label}`
                    : formatEarned(earned.get(best.id))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
