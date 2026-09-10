import GradientBorder from '../shared/GradientBorder';

// One selectable "mission" in the horizontal picker above the START
// button — a trainer-assigned routine, a saved template, or the Freestyle
// fallback. The selected card gets the full tier-gradient glow treatment;
// the rest sit dimmed, same visual language as everywhere else tier color
// = "this is the active/yours one" (BottomNav's active tab, Leaderboard's
// You row). `onDelete` is optional (only templates are deletable) — kept
// as a sibling button next to the selectable one, not nested inside it,
// so a tap on the ✕ never also fires the card's own onClick.
export default function MissionCard({ icon, title, subtitle, meta, selected, tierId, onClick, onDelete }) {
  const content = (
    <div className="relative">
      <button type="button" onClick={onClick} className="w-56 text-left p-4 flex flex-col gap-2">
        <span className="text-3xl leading-none">{icon}</span>
        <div className="min-w-0">
          <p className="text-base font-bold text-neutral-50 truncate">{title}</p>
          {subtitle && <p className="text-xs text-neutral-400 truncate mt-0.5">{subtitle}</p>}
        </div>
        {meta && (
          <p className="text-xs font-semibold" style={{ color: 'var(--tier-accent)' }}>
            {meta}
          </p>
        )}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${title}`}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-neutral-300 flex items-center justify-center text-xs"
        >
          ✕
        </button>
      )}
    </div>
  );

  return selected ? (
    <GradientBorder tierId={tierId} fillClassName="card" className="shrink-0 snap-center">
      {content}
    </GradientBorder>
  ) : (
    <div className="card shrink-0 snap-center opacity-55">{content}</div>
  );
}
