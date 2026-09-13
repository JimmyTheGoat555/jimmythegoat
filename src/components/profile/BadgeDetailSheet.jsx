import { TIER_STYLE } from '../../data/badges';

function formatEarned(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

// What one badge is and how it was earned.
//
// Exists because a pill has room for a name and nothing else — the metal
// is a colour, and a colour cannot say "0.75× your body weight". Tapping
// one is the only place the app explains itself, and on a phone there is
// no hover to fall back on (the pill's `title` was desktop-only, which is
// to say useless).
//
// `onEdit` is passed only from your OWN profile. Folding the picker in
// here rather than putting a separate control next to the row keeps one
// kind of tap target on the profile: the badges themselves.
export default function BadgeDetailSheet({ badge, earnedAt, onEdit, onClose }) {
  if (!badge) return null;
  const style = TIER_STYLE[badge.tier] ?? TIER_STYLE.gold;
  const date = formatEarned(earnedAt);
  const tiered = badge.name !== badge.categoryName;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl border border-white/10 bg-neutral-950 px-6 pb-7 pt-6 sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={badge.name}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className="text-6xl leading-none"
            style={{ filter: `drop-shadow(0 0 18px ${style.glow})` }}
            aria-hidden="true"
          >
            {badge.icon}
          </span>

          <div>
            <p className="text-xl font-bold" style={{ color: style.color }}>
              {badge.name}
            </p>
            {tiered && (
              <p className="mt-0.5 text-[11px] font-black uppercase tracking-widest" style={{ color: `${style.color}aa` }}>
                {style.label} tier
              </p>
            )}
          </div>

          {/* The sentence that answers "what did I actually do" — the
              threshold folded into the verb, not restated as a spec. */}
          <p
            className="rounded-xl border px-3.5 py-2 text-sm font-semibold"
            style={{ borderColor: `${style.color}44`, background: `${style.color}12`, color: style.color }}
          >
            {badge.howEarned}
          </p>

          <p className="text-sm leading-snug text-neutral-400">{badge.blurb}</p>

          {/* Absent on anything awarded before award-times were recorded,
              and on a friend's badge where we only ever get the id. One
              line or none, rather than "Unlocked —". */}
          {date && <p className="text-xs text-neutral-600">Unlocked {date}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit();
              }}
              className="w-full rounded-2xl border border-white/15 py-3 text-sm font-semibold text-neutral-300 transition active:scale-[0.98]"
            >
              Choose which badges to show
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-[var(--ember)] py-3.5 text-base font-semibold text-white transition active:scale-[0.97]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
