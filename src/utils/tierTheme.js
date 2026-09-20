// The accent color/gradient the whole app borrows from a user's current
// evolution tier.
//
// ── THE SHIFT-DOWN (why there is no orange any more) ────────────────────
//
// The ladder used to open on energetic orange and climb orange → cyan →
// purple → magenta. Two things were wrong with that. The orange owned the
// screen for the entire early game, which is the longest anyone spends on
// one tier and the least flattering backdrop for the mascot art. And it
// collided with gold, the coin/reward colour, so the tier that had earned
// nothing yet was painted in the same family as the payoff.
//
// So every tier moved DOWN one rung and the vacancy opened at the top:
//
//   goat   (floor)  cyan     — was buff's
//   buff            purple   — was titan's
//   titan           magenta  — was legend's
//   legend (max)    GOLD     — new, and animated (see below)
//
// The orange is simply gone. Gold now appears at exactly one place in the
// ladder — the end of it — which is what makes arriving there read as a
// reward rather than as another colour swap.
//
// ── THE MAX TIER ────────────────────────────────────────────────────────
//
// `legend` additionally carries `animated: true`. Nothing in the palette
// changes because of that flag; it tells the UI it may reach for the
// .tier-surface-animated treatment in index.css, a slow three-stop gold
// gradient that drifts across the element. It is deliberately the ONLY
// tier that moves: a premium finish that every tier had would not be one.
// Consumers that cannot animate (canvas, a static border) ignore the flag
// and use `from`/`to` exactly as before, so nothing has to special-case it.
const TIER_THEME = {
  goat: { from: '#00e5ff', to: '#00b8d4', accent: '#00e5ff', glow: 'rgba(0,229,255,0.55)' }, // electric cyan
  buff: { from: '#b026ff', to: '#7c1fd9', accent: '#c86bff', glow: 'rgba(176,38,255,0.55)' }, // neon purple
  titan: { from: '#ff2fb0', to: '#b026ff', accent: '#ff2fb0', glow: 'rgba(255,47,176,0.6)' }, // mythic magenta
  // Premium gold — the brand accent (--color-gold-* in index.css). Values
  // are literals here rather than var() because this table is read by the
  // canvas renderers too, which have no CSS to resolve against.
  legend: {
    from: '#f7cf5e',
    to: '#d4af37',
    accent: '#ffd76a',
    glow: 'rgba(212,175,55,0.6)',
    animated: true,
  },
};

// The floor tier, for an unknown id and for the pre-login screens. Kept
// in sync by hand with the --tier-* defaults in index.css's :root.
const FALLBACK = TIER_THEME.goat;

export function tierTheme(tierId) {
  return TIER_THEME[tierId] ?? FALLBACK;
}

// Whether this tier gets the premium moving treatment — true for the max
// tier only. App.jsx puts `tier-max` on the page root when this is set,
// which is what .tier-max .ambient-bg in index.css hangs off. A predicate
// rather than callers reading `.animated` themselves, so "which tier is
// the special one" stays a fact about this table.
export function tierIsAnimated(tierId) {
  return Boolean(tierTheme(tierId).animated);
}

// The four-stop showcase palette from AuthScreen — the single source of
// truth for it now, so the rest of the app's background can be exactly as
// colorful as the login screen instead of a duller per-tier subset of it.
// A function of angle (not a fixed string) because AuthScreen needs it
// horizontal (90°) to line up with its 4 character columns, while a
// full-page ambient background is free to angle it however looks best.
const EVOLUTION_STOPS = '#00e5ff 0%, #b026ff 33%, #ff2fb0 66%, #d4af37 100%';

export function fullEvolutionGradient(angle = 90) {
  return `linear-gradient(${angle}deg, ${EVOLUTION_STOPS})`;
}

// A CSS linear-gradient string for backgrounds/borders — e.g.
// `style={{ background: tierGradientCss(tier.id) }}`.
export function tierGradientCss(tierId, angle = 135) {
  const t = tierTheme(tierId);
  return `linear-gradient(${angle}deg, ${t.from}, ${t.to})`;
}

// CSS custom properties for the ambient ombre background (see .ambient-bg
// in index.css) and any component that wants to reference the current
// tier's colors via var(--tier-*) instead of importing this module.
export function tierCssVars(tierId) {
  const t = tierTheme(tierId);
  return {
    '--tier-from': t.from,
    '--tier-to': t.to,
    '--tier-accent': t.accent,
    '--tier-glow': t.glow,
  };
}

// The tier colours in force on an element — whatever var(--tier-accent)
// and var(--tier-glow) resolve to there — for code that paints with the
// canvas API and cannot read a CSS variable (utils/workoutSummaryScene.js).
// The goat tier where there is no element or no variable.
export function tierColorsAt(el) {
  const fallback = { accent: FALLBACK.accent, glow: FALLBACK.glow };
  if (!el || typeof getComputedStyle !== 'function') return fallback;
  const style = getComputedStyle(el);
  const accent = style.getPropertyValue('--tier-accent').trim();
  const glow = style.getPropertyValue('--tier-glow').trim();
  return { accent: accent || fallback.accent, glow: glow || fallback.glow };
}
