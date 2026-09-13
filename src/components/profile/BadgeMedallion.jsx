// A badge rendered as a struck metal medal, in the metal it was won in.
//
// One component for every surface badges appear on — the profile ribbon,
// the picker, the detail sheet, the post-workout celebration — so a gold
// medal is the same object everywhere instead of four near-misses.
//
// CLASS STRINGS ARE WRITTEN OUT IN FULL, never assembled from fragments
// like `from-${metal}-700`. Tailwind scans source text for complete class
// names; an interpolated one is simply never generated, and the failure
// is silent — an unstyled badge, not a build error.
const METAL = {
  bronze: {
    fill: 'bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900',
    // Rim a shade lighter than the fill reads as a struck edge catching
    // the light; the same colour reads as a flat sticker.
    ring: 'ring-1 ring-inset ring-amber-400/40',
    text: 'text-amber-50',
    sub: 'text-amber-100/70',
    glow: '',
  },
  silver: {
    fill: 'bg-gradient-to-br from-slate-200 via-slate-400 to-slate-500',
    ring: 'ring-1 ring-inset ring-white/50',
    // Dark text on a light metal. Silver at these values is bright enough
    // that white type on it is genuinely hard to read outdoors.
    text: 'text-slate-900',
    sub: 'text-slate-700',
    glow: '',
  },
  gold: {
    fill: 'bg-gradient-to-br from-yellow-200 via-amber-400 to-yellow-600',
    ring: 'ring-1 ring-inset ring-yellow-100/60',
    text: 'text-amber-950',
    sub: 'text-amber-900/80',
    // Only gold glows. If every tier did, none of them would read as
    // rarer than the others.
    glow: 'shadow-[0_0_20px_-4px_rgba(250,204,21,0.75)]',
  },
};

// The reflective sweep that sells "metal" rather than "coloured circle":
// a hard diagonal highlight over the top-left, and a soft darkening into
// the bottom-right. Both are pointer-events-none overlays rather than
// extra gradients on the fill, so the fill stays one legible colour ramp.
function Sheen({ rounded }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${rounded}`}
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.12) 34%, rgba(255,255,255,0) 52%)',
        }}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${rounded}`}
        style={{ background: 'linear-gradient(135deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 100%)' }}
      />
    </>
  );
}

export function medallionMetal(tier) {
  return METAL[tier] ?? METAL.gold;
}

// `chip`  — the profile ribbon: icon + name on one line.
// `md`    — a picker row's leading medal.
// `lg`    — the hero medal on the detail sheet and the celebration.
export default function BadgeMedallion({ badge, size = 'chip', className = '' }) {
  const m = medallionMetal(badge.tier);

  if (size === 'chip') {
    return (
      <span
        className={`relative inline-flex items-center gap-1.5 overflow-hidden rounded-full px-3 py-1 text-xs font-bold tracking-wide ${m.fill} ${m.ring} ${m.glow} ${m.text} ${className}`}
      >
        <Sheen rounded="rounded-full" />
        <span aria-hidden="true" className="relative text-sm leading-none drop-shadow-sm">
          {badge.icon}
        </span>
        <span className="relative">{badge.categoryName}</span>
      </span>
    );
  }

  const px = size === 'lg' ? 'h-24 w-24 text-5xl' : 'h-11 w-11 text-xl';
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${px} ${m.fill} ${m.ring} ${m.glow} ${className}`}
    >
      <Sheen rounded="rounded-full" />
      <span aria-hidden="true" className="relative leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
        {badge.icon}
      </span>
    </span>
  );
}
