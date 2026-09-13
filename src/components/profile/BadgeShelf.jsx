import { BADGES, earnedBadgeMap } from '../../data/badges';

function formatEarned(iso) {
  if (!iso) return 'Unlocked';
  return `Unlocked ${new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// The trophy shelf. `badges` is an array of { id, at } — server-awarded
// on logWorkout (functions/badges.js), never writable by a client.
//
// Two modes, and the difference is the point:
//
//   * Your own profile renders the WHOLE catalog. A locked tile showing
//     what it takes to earn it is the only place the app ever states a
//     goal, and a shelf of silhouettes is most of why anyone chases one.
//   * A friend's profile renders ONLY what they have unlocked. Their
//     empty slots are not your business, and a wall of everything they
//     have failed to do would be a strange thing to show a visitor.
export default function BadgeShelf({ badges, unlockedOnly = false, title = 'Trophies' }) {
  const earned = earnedBadgeMap(badges);
  const shown = unlockedOnly ? BADGES.filter((b) => earned.has(b.id)) : BADGES;

  // Nothing earned yet and nothing to explain — render nothing rather than
  // an empty card on someone else's profile.
  if (unlockedOnly && shown.length === 0) return null;

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-neutral-100">{title}</h2>
        <span className="text-sm text-neutral-400 tabular-nums">
          {unlockedOnly ? earned.size : `${earned.size} / ${BADGES.length}`}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {shown.map((badge) => {
          const unlocked = earned.has(badge.id);
          return (
            <li
              key={badge.id}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border p-4 text-center transition ${
                unlocked
                  ? 'border-[var(--tier-accent)]/40 bg-white/[0.07]'
                  : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <span
                // `badge-earned` is the glow keyframe (index.css). Locked
                // tiles are a silhouette: grayscale kills the emoji's own
                // colour, and the low opacity is what makes it read as a
                // shape you have not filled in yet.
                className={`text-4xl leading-none ${unlocked ? 'badge-earned' : 'grayscale opacity-25'}`}
                aria-hidden="true"
              >
                {badge.icon}
              </span>
              <span className={`text-sm font-bold ${unlocked ? 'text-neutral-50' : 'text-neutral-400'}`}>
                {badge.name}
              </span>
              <span className={`text-xs leading-snug ${unlocked ? 'text-[var(--tier-accent)]' : 'text-neutral-500'}`}>
                {unlocked ? formatEarned(earned.get(badge.id)) : badge.requirement}
              </span>
              {/* The flavour line is the reward for having it — locked
                  tiles get the requirement instead, above. */}
              {unlocked && badge.blurb && (
                <span className="text-[11px] leading-snug text-neutral-500">{badge.blurb}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
