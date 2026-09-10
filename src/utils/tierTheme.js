// The accent color/gradient the whole app borrows from a user's current
// evolution tier. Palette is the "Fortnite / Arcade Battle Royale" neon
// set — energetic orange → electric cyan → neon purple → mythic magenta —
// resolved per-tier for active nav tabs, primary buttons, progress-bar
// fills, and glowing card borders anywhere the app wants to feel like "the
// same product" as the sign-in lobby instead of a plain dark afterthought.
// (Formerly had a 5th "kid"/radioactive-yellow entry for the removed
// starting tier — see evolutionTiers.js's own note on why it's gone.)
const TIER_THEME = {
  goat: { from: '#ff8c1a', to: '#ff5e00', accent: '#ff8c1a', glow: 'rgba(255,140,26,0.55)' }, // energetic orange
  buff: { from: '#00e5ff', to: '#00b8d4', accent: '#00e5ff', glow: 'rgba(0,229,255,0.55)' }, // electric cyan
  titan: { from: '#b026ff', to: '#7c1fd9', accent: '#c86bff', glow: 'rgba(176,38,255,0.55)' }, // neon purple
  legend: { from: '#ff2fb0', to: '#b026ff', accent: '#ff2fb0', glow: 'rgba(255,47,176,0.6)' }, // mythic magenta
};

const FALLBACK = TIER_THEME.goat;

export function tierTheme(tierId) {
  return TIER_THEME[tierId] ?? FALLBACK;
}

// The four-stop showcase palette from AuthScreen — the single source of
// truth for it now, so the rest of the app's background can be exactly as
// colorful as the login screen instead of a duller per-tier subset of it.
// A function of angle (not a fixed string) because AuthScreen needs it
// horizontal (90°) to line up with its 4 character columns, while a
// full-page ambient background is free to angle it however looks best.
const EVOLUTION_STOPS = '#ff8c1a 0%, #00e5ff 33%, #b026ff 66%, #ff2fb0 100%';

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
