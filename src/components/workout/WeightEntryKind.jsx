import { ENTRY_KIND, ENTRY_MODE_SMART, ENTRY_MODE_TOTAL } from '../../utils/setLoad';

// The three ways a weight is asked for, made visible: an icon and a word
// for each, shared by the set row's anchor line (SetRow) and the column
// header (ExerciseLogCard), so the same picture appears everywhere a
// number is typed or read back.
//
// There was a fourth — PLATES, per side on a bar — and it went with the
// plate calculator (see SetRow). Nothing can produce that kind any more,
// including for a set that was logged with it: entryKindFor decides what
// a row shows, and it no longer has that answer.
//
// Inline SVG rather than emoji, like ChainIcon and BulbIcon: currentColor
// and the text baseline at any size, and the same weight on every phone.

export const ENTRY_COPY = {
  [ENTRY_KIND.PER_HAND]: {
    header: 'Per hand',
    placeholder: 'Per hand',
    chip: 'per hand',
  },
  [ENTRY_KIND.TOTAL]: {
    header: 'Total',
    placeholder: 'Total',
    chip: 'total',
  },
  [ENTRY_KIND.BODYWEIGHT]: {
    header: 'Load',
    placeholder: 'Belt',
    chip: 'body',
  },
};

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

// A dumbbell: two heads and the handle between them.
function DumbbellIcon({ className }) {
  return (
    <svg {...svgProps} className={className}>
      <rect x="2" y="8" width="4" height="8" rx="1" />
      <rect x="18" y="8" width="4" height="8" rx="1" />
      <path d="M6 12h12" />
    </svg>
  );
}

// A weight stack: three slabs on a guide rod, with the pin in the middle
// one.
function StackIcon({ className }) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M12 2v3M12 19v3" />
      <rect x="5" y="5" width="14" height="4" rx="1" />
      <rect x="5" y="10" width="14" height="4" rx="1" />
      <rect x="5" y="15" width="14" height="4" rx="1" />
      <path d="M19 12h3" />
    </svg>
  );
}

// A figure — the load is the lifter.
function BodyIcon({ className }) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 8.5v6M8 11l4-1.5 4 1.5M12 14.5l-3 6M12 14.5l3 6" />
    </svg>
  );
}

const ICONS = {
  [ENTRY_KIND.PER_HAND]: DumbbellIcon,
  [ENTRY_KIND.TOTAL]: StackIcon,
  [ENTRY_KIND.BODYWEIGHT]: BodyIcon,
};

export function EquipmentIcon({ kind, className = 'h-3.5 w-3.5' }) {
  const Icon = ICONS[kind] ?? StackIcon;
  return <Icon className={className} />;
}

// ⇄ — the override. An SVG for the same reason as the rest: the glyph's
// weight and vertical alignment vary between system fonts.
export function SwapIcon({ className = 'h-3 w-3' }) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </svg>
  );
}

// The column-header toggle. One tap flips the exercise between its
// calculator and the plain total; the pill names the mode that is ON, so
// the reader never has to infer it from the shape of the numbers below.
export function EntryModeToggle({ kind, smartKind, mode, onChange, className = '' }) {
  const isTotal = mode === ENTRY_MODE_TOTAL;
  const copy = ENTRY_COPY[kind];
  const other = isTotal ? ENTRY_COPY[smartKind].header : ENTRY_COPY[ENTRY_KIND.TOTAL].header;
  return (
    <button
      type="button"
      onClick={() => onChange(isTotal ? ENTRY_MODE_SMART : ENTRY_MODE_TOTAL)}
      aria-pressed={isTotal}
      aria-label={`Weight entered as ${copy.header.toLowerCase()}. Switch to ${other.toLowerCase()}`}
      title={`Switch to ${other}`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold leading-4 transition active:scale-95 ${
        isTotal ? 'bg-[var(--tier-accent)]/12' : 'border-white/10 bg-neutral-800/60 text-neutral-400'
      } ${className}`}
      style={isTotal ? { borderColor: 'var(--tier-accent)', color: 'var(--tier-accent)' } : undefined}
    >
      <EquipmentIcon kind={kind} className="h-3 w-3" />
      {copy.header}
      <SwapIcon className="h-3 w-3 opacity-70" />
    </button>
  );
}
