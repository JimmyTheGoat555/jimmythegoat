import { useEffect, useState } from 'react';
import { lifetimeVolume, lastWorkoutAt } from '../../utils/workoutStats';
import { EVOLUTION_TIERS, getEvolutionProgress, formatTierGoalKg } from '../../utils/evolutionTiers';
import { loadJSON, saveJSON } from '../../lib/storage';
import { tierGradientCss } from '../../utils/tierTheme';
import GradientBorder from '../shared/GradientBorder';

// Workouts aren't a typed model anywhere else in this JS codebase yet, so
// this stays loose rather than inventing a shape nothing else honors.
type Workout = Record<string, unknown>;

interface JimmyEvolutionProps {
  workouts: Workout[];
  // Latest logged body weight (0 = none yet) — only scales how the
  // relative tier goal is shown in kg. See utils/evolutionTiers.js.
  bodyWeightKg?: number;
}

const LAST_SEEN_KEY = 'last-evolution-tier';

// A single clean card: Jimmy's current evolution stage from lifetime
// tonnage, rendered as a transparent PNG sprite, with a progress bar to
// the next tier.
//
// The Progress tab is a route, so this component fully remounts every
// time the user navigates to it — it never just sits there while
// lifetime volume ticks up in the background. So "smooth transition when
// Jimmy evolves" can't rely on catching a live prop change; instead we
// persist the last tier the user has actually seen (`last-evolution-tier`
// in localStorage). If that differs from the tier they've now reached,
// they leveled up since their last visit — we crossfade from the old
// sprite to the new one once, then record the new tier as seen. If a
// sprite file is missing, each layer falls back to the tier's emoji
// instead of a broken-image icon.
export default function JimmyEvolution({ workouts, bodyWeightKg = 0 }: JimmyEvolutionProps) {
  const totalVolume = lifetimeVolume(workouts);
  const { current, next, percent, isMaxTier, neglected, baseTier } = getEvolutionProgress(totalVolume, {
    lastWorkoutAt: lastWorkoutAt(workouts),
  });

  // Was a `useRef` written and read during render (`if (ref.current ===
  // null) { ref.current = ... }`) — worked by accident, but mutating a ref
  // mid-render is exactly the pattern React 19's compiler can't safely
  // memoize around (flagged live by the linter) and isn't guaranteed safe
  // under Strict Mode's double-render. `useState`'s lazy initializer is
  // the correct tool for "compute once, on mount, no re-render needed
  // when it changes" — React guarantees it runs exactly once per mount,
  // with no render-time mutation at all.
  // Only a genuine climb crossfades. A demotion from the neglect penalty
  // (current.stage BELOW the last seen tier) must not play the "Jimmy
  // evolved!" animation — and the tier that gets recorded as "seen" is
  // the one the volume actually earns (baseTier), not the penalised one,
  // so recovering the penalty later is a silent return to normal rather
  // than a fake level-up.
  const [justEvolved] = useState(() => {
    const lastSeenId = loadJSON(LAST_SEEN_KEY, baseTier.id);
    const lastSeenTier = EVOLUTION_TIERS.find((t) => t.id === lastSeenId) ?? baseTier;
    return lastSeenTier.stage < current.stage ? lastSeenTier : false;
  });

  const [baseImage, setBaseImage] = useState(justEvolved ? justEvolved.image : current.image);
  const [incomingImage, setIncomingImage] = useState(justEvolved ? current.image : null);
  const [brokenImages, setBrokenImages] = useState(new Set());

  useEffect(() => {
    saveJSON(LAST_SEEN_KEY, baseTier.id);
  }, [baseTier.id]);

  const promoteIncoming = () => {
    setBaseImage((prev) => incomingImage ?? prev);
    setIncomingImage(null);
  };

  const markBroken = (src) => {
    setBrokenImages((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  };

  return (
    <GradientBorder tierId={current.id} fillClassName="card p-6 flex flex-col items-center text-center gap-2">
      <div className="relative w-40 h-40 flex items-center justify-center">
        {brokenImages.has(baseImage) ? (
          <span className="text-6xl leading-none">{current.emoji}</span>
        ) : (
          <img
            src={baseImage}
            alt={current.label}
            onError={() => markBroken(baseImage)}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}
        {incomingImage &&
          (brokenImages.has(incomingImage) ? (
            <span
              className="absolute inset-0 flex items-center justify-center text-6xl leading-none animate-[goat-evolve_0.8s_ease-out_forwards]"
              onAnimationEnd={promoteIncoming}
            >
              {current.emoji}
            </span>
          ) : (
            <img
              key={incomingImage}
              src={incomingImage}
              alt={current.label}
              onError={() => markBroken(incomingImage)}
              onAnimationEnd={promoteIncoming}
              className="absolute inset-0 w-full h-full object-contain animate-[goat-evolve_0.8s_ease-out_forwards]"
            />
          ))}
      </div>
      {justEvolved && incomingImage && (
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--tier-accent)' }}>
          Jimmy evolved!
        </p>
      )}
      <p className="text-xl font-bold text-neutral-50">{current.label}</p>
      {neglected ? (
        <p className="text-sm text-[var(--danger)] max-w-xs">
          😴 5 days without training dropped Jimmy a tier. Log a workout to restore {baseTier.label}.
        </p>
      ) : (
        <p className="text-sm text-neutral-500 max-w-xs">{current.description}</p>
      )}

      <div className="w-full mt-3">
        {isMaxTier ? (
          <p className="text-sm font-medium text-[var(--success)]">Max evolution reached 🎉</p>
        ) : (
          <>
            <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${percent}%`, background: tierGradientCss(current.id) }}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {neglected
                ? `Restore ${baseTier.label} — train to recover`
                : `${percent.toFixed(0)}% to ${next!.label} · ${formatTierGoalKg(next!.threshold, bodyWeightKg)}`}
            </p>
          </>
        )}
      </div>
    </GradientBorder>
  );
}
