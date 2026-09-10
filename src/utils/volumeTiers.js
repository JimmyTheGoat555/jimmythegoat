// Realistic weekly-tonnage tiers for the gamified progress bar on
// WeeklyVolumeCard. Thresholds are in kilograms of total weekly volume
// (sum of weight x reps across every completed set that week).
export const VOLUME_TIERS = [
  { id: 'starter', label: 'Starter', threshold: 5000 },
  { id: 'intermediate', label: 'Intermediate', threshold: 12000 },
  { id: 'beast', label: 'Beast Mode', threshold: 20000 },
];

// Returns the tier badge + a 0-100 progress toward the next milestone.
// Once past the top tier, the "next milestone" keeps rolling forward in
// whole multiples of the top threshold so the bar always has something to
// aim at instead of just sitting maxed out forever.
export function getVolumeTierProgress(volume) {
  const reached = [...VOLUME_TIERS].reverse().find((tier) => volume >= tier.threshold);
  const nextTier = VOLUME_TIERS.find((tier) => volume < tier.threshold);

  if (nextTier) {
    return {
      currentLabel: reached ? reached.label : 'Warming Up',
      nextLabel: nextTier.label,
      percent: Math.min(100, (volume / nextTier.threshold) * 100),
    };
  }

  const topThreshold = VOLUME_TIERS.at(-1).threshold;
  const nextMultiple = topThreshold * (Math.floor(volume / topThreshold) + 1);
  return {
    currentLabel: reached.label,
    nextLabel: `${nextMultiple.toLocaleString('en-US')} kg`,
    percent: Math.min(100, (volume / nextMultiple) * 100),
  };
}
