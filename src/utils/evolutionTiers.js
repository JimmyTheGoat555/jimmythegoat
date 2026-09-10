// Jimmy's evolution tiers, gated by lifetime tonnage (kg). Same "always
// something to chase" philosophy as the idle-number and volume-tier systems
// elsewhere in the app.
//
// The original starting tier ("Kid Goat", the plump beginner sprite) was
// removed entirely at the user's request — 4 tiers now, not 5. `goat` is
// the new floor: its threshold moved down to 0 so `getEvolutionProgress`
// (which always treats index 0 as "where everyone starts") still gives
// every brand-new account a real current tier instead of falling through.
// buff/titan/legend keep their original thresholds unchanged — only the
// entry point shifted, the climb above it didn't get any easier.
export const EVOLUTION_TIERS = [
  {
    id: 'goat',
    label: 'Goat',
    threshold: 0,
    emoji: '🐐',
    image: '/assets/jimmy-goat.png',
    description: 'Everyone starts somewhere. Log your first sets to evolve.',
    // 1-based, matching public/animations/dances/dance{N}/stage{N}.mp4 —
    // see utils/danceAnimations.js. An explicit field rather than deriving it
    // from array position, so reordering/inserting a tier later can never
    // silently shift which video folder a stage points at.
    stage: 1,
  },
  {
    id: 'buff',
    label: 'Buff Goat',
    threshold: 50_000,
    emoji: '🐐',
    image: '/assets/jimmy-buff.png',
    description: 'Real strength is showing. Respect.',
    stage: 2,
  },
  {
    id: 'titan',
    label: 'Titan Goat',
    threshold: 150_000,
    emoji: '🐐',
    image: '/assets/jimmy-titan.png',
    description: 'Elite territory. Few make it this far.',
    stage: 3,
  },
  {
    id: 'legend',
    label: 'Legendary G.O.A.T.',
    threshold: 500_000,
    emoji: '🐐',
    image: '/assets/jimmy-legend.png',
    description: 'Greatest Of All Time. Max evolution reached.',
    stage: 4,
  },
];

// Resolves a lifetime-volume number to { current, next, percent, isMaxTier }.
// percent is progress within the CURRENT tier's band (not the raw value),
// so the bar always fills 0->100 meaningfully instead of stalling near 0
// right after evolving.
export function getEvolutionProgress(volume) {
  let currentIndex = 0;
  for (let i = 0; i < EVOLUTION_TIERS.length; i += 1) {
    if (volume >= EVOLUTION_TIERS[i].threshold) currentIndex = i;
  }

  const current = EVOLUTION_TIERS[currentIndex];
  const next = EVOLUTION_TIERS[currentIndex + 1] ?? null;

  if (!next) {
    return { current, next: null, percent: 100, isMaxTier: true };
  }

  const span = next.threshold - current.threshold;
  const progressInSpan = volume - current.threshold;
  const percent = Math.min(100, Math.max(0, (progressInSpan / span) * 100));

  return { current, next, percent, isMaxTier: false };
}
