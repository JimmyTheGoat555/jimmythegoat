import { BADGES, earnedBadgeMap } from '../../data/badges';

function formatEarned(iso) {
  if (!iso) return 'Unlocked';
  return `Unlocked ${new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// The "Trophies" section on the Profile page. Renders the whole catalog:
// unlocked badges in full colour, locked ones desaturated with the
// requirement to earn them. `badges` is users/{uid}.badges (array of
// { id, at }) — server-awarded on logWorkout, see functions/badges.js.
export default function BadgeShelf({ badges }) {
  const earned = earnedBadgeMap(badges);

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-neutral-100">Trophies</h2>
        <span className="text-sm text-neutral-400 tabular-nums">
          {earned.size} / {BADGES.length}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-3">
        {BADGES.map((badge) => {
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
                className={`text-4xl leading-none ${unlocked ? '' : 'grayscale opacity-30'}`}
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
