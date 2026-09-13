import { useMemo, useState } from 'react';
import { useJimmyLook } from '../../context/JimmyLook';
import MissionCard from './MissionCard';
import BadgeRibbon from '../profile/BadgeRibbon';
import JimmyAnimation from '../evolution/JimmyAnimation';
import { lifetimeVolume } from '../../utils/workoutStats';
import { getEvolutionProgress, formatTierGoalKg } from '../../utils/evolutionTiers';
import { tierGradientCss } from '../../utils/tierTheme';
import { danceNumberForItemId, getDanceAnimationPath } from '../../utils/danceAnimations';

// Matches .btn-arcade's own clip-path in index.css — duplicated here (not
// `clipPath: 'inherit'`) so the press-burst overlay is reliably clipped
// to the exact same slanted shape regardless of inheritance quirks.
const ARCADE_BUTTON_CLIP = 'polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%)';
const TAB_CLIP = 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)';

// The app's "lobby" — Jimmy front and center on a glowing launchpad,
// framed by the mission-select strip and stat bar like a game HUD, with
// one unmissable chunky button to drop in. "Choose your mission" is a
// small tabbed picker across three sources: a trainer's Assigned routines,
// your own saved Templates, and the always-available Freestyle fallback —
// tabs only show up for categories that actually have content (a trainee
// with no assignments and no templates yet just sees Freestyle, no empty
// tabs). Every color here reads from the app-wide --tier-* variables
// App.jsx sets, so it's always tuned to how far THIS user has actually
// evolved, not a generic skin.
//
// Scope note: templates are personal — "load any routine you saved," not
// yet a trainer-shared library a trainee can browse from their coach (that
// would need its own assignable-library data model, a bigger feature than
// "save what I just did as a shortcut"). A trainer's own workouts already
// get the same save/load templates feature on their own account, since
// trainers and trainees share one app experience.
export default function WorkoutHome({
  onStartWorkout,
  onStartAssigned,
  onStartTemplate,
  onDeleteTemplate,
  onPlanWorkout,
  // users/{uid}.badges — the same array the Profile shelf renders.
  badges,
  featuredBadges,
  assignments = [],
  templates = [],
  workouts = [],
  equippedDance = null,
  // During a tier-up celebration (see hooks/useTierUpCelebration.js) this
  // is briefly 100, then null again — the XP bar rushes to full, holds,
  // and snaps back to the real percentage of the newly-reached tier.
  barOverride = null,
  // ISO timestamp of the user's last workout (utils/workoutStats.js) —
  // drives the 1-tier neglect penalty inside getEvolutionProgress.
  lastWorkoutAt = null,
  // Latest logged body weight (0 = none). Only used to render the relative
  // tier goals as big absolute-kg numbers; 0 falls back to 75 kg inside
  // formatTierGoalKg.
  bodyWeightKg = 0,
  // 2 for a coaching account — see TRAINER_MIN_STAGE in evolutionTiers.
  minStage = 1,
}) {
  const [activeTab, setActiveTab] = useState(null);
  const [assignedIdx, setAssignedIdx] = useState(0);
  const [templateIdx, setTemplateIdx] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [mascotBroken, setMascotBroken] = useState(false);

  const totalVolume = lifetimeVolume(workouts);
  const { current, next, percent, isMaxTier, neglected, baseTier } = getEvolutionProgress(totalVolume, {
    minStage,
    lastWorkoutAt,
  });
  const remaining = next ? Math.max(0, next.threshold - totalVolume) : 0;
  // null (no dance owned/equipped) is the common case and JimmyAnimation
  // already falls back to the plain static sprite for it — see there.
  const danceAnimationPath = getDanceAnimationPath(danceNumberForItemId(equippedDance), current.stage);

  const categories = useMemo(() => {
    const cats = [];
    if (assignments.length > 0) cats.push({ id: 'assigned', label: 'Assigned', icon: '🎯' });
    if (templates.length > 0) cats.push({ id: 'templates', label: 'Templates', icon: '📋' });
    cats.push({ id: 'freestyle', label: 'Freestyle', icon: '🔥' });
    return cats;
  }, [assignments.length, templates.length]);

  // Falls back to the first available category whenever the manually-
  // picked one no longer has content (e.g. the last template got deleted
  // while that tab was open) instead of rendering a dead tab.
  const effectiveTab = categories.some((c) => c.id === activeTab) ? activeTab : categories[0].id;
  const clampedAssignedIdx = Math.min(assignedIdx, Math.max(assignments.length - 1, 0));
  const clampedTemplateIdx = Math.min(templateIdx, Math.max(templates.length - 1, 0));

  let activeMission = { type: 'freestyle', data: null };
  if (effectiveTab === 'assigned' && assignments[clampedAssignedIdx]) {
    activeMission = { type: 'assigned', data: assignments[clampedAssignedIdx] };
  } else if (effectiveTab === 'templates' && templates[clampedTemplateIdx]) {
    activeMission = { type: 'template', data: templates[clampedTemplateIdx] };
  }

  const handleStart = () => {
    setPressed(true);
    navigator.vibrate?.(35);
    // Let the press animation actually play before the route change
    // unmounts this screen — the whole point of the "dynamic feedback"
    // ask, just kept short so it never slows down starting a workout.
    setTimeout(() => {
      if (activeMission.type === 'assigned') {
        onStartAssigned(activeMission.data);
      } else if (activeMission.type === 'template') {
        onStartTemplate(activeMission.data);
      } else {
        onStartWorkout();
      }
    }, 220);
  };

  // The current user's own look, straight from context — no prop to thread
  // down from App, and no chance of the lobby mascot drifting out of sync
  // with the shop that dressed him.
  const jimmyLook = useJimmyLook();

  const startLabel =
    activeMission.type === 'assigned'
      ? 'Start Mission'
      : activeMission.type === 'template'
        ? 'Load Template'
        : 'Enter the Arena';

  return (
    <div className="flex flex-col items-center gap-5 pt-8 pb-6 min-h-[calc(100vh-6rem)]">
      <div className="relative flex flex-col items-center justify-end mt-1 h-52 w-full">
        {/* The lobby launchpad — sits behind the mascot by DOM order alone
            (a local stacking group, not the app-wide fixed ambient layers
            that needed explicit z-index; plain order is reliable here). */}
        <div className="pedestal absolute bottom-1 w-40 h-9" />
        <div
          className="absolute w-48 h-48 rounded-full blur-3xl opacity-70 pointer-events-none"
          style={{ background: 'radial-gradient(circle, var(--tier-glow), transparent 70%)' }}
        />
        {mascotBroken ? (
          <span className="relative text-8xl leading-none">{current.emoji}</span>
        ) : (
          <JimmyAnimation
            animationSrc={danceAnimationPath}
            staticImageSrc={current.image}
            alt={current.label}
            onImageError={() => setMascotBroken(true)}
            // Fills the launchpad's full height, which sets how big Jimmy
            // reads against the pedestal ellipse below him. Both the sprite
            // and the dance animation are built to the same proportions, so
            // this one number scales them together and he stays on his feet
            // on the ellipse — see JimmyAnimation.
            className="w-52 h-52"
            {...jimmyLook}
          />
        )}
      </div>

      <p className="text-2xl text-neutral-50 -mt-2">{current.label}</p>

      {neglected && (
        <div className="w-full -mt-2 rounded-xl bg-[var(--danger)]/15 border border-[var(--danger)]/30 px-3 py-2 text-center">
          <p className="text-xs font-semibold text-[var(--danger)]">
            😴 5 days off — Jimmy slipped to {current.label}
          </p>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Log any workout to restore {baseTier.label}.
          </p>
        </div>
      )}

      {/* Earned badges only, sitting between the tier name and the
          progress bar — what you have already done, directly above the
          measure of what is left. Nothing unearned renders, here or
          anywhere: the catalog is a surprise, not a checklist.

          Tooltip opens downward (the default): there is a goat directly
          above this and open space below. */}
      <BadgeRibbon badges={badges} featured={featuredBadges} />

      <div className="w-full">
        {isMaxTier ? (
          <p className="text-center text-sm font-bold" style={{ color: 'var(--tier-accent)' }}>
            🏆 Max evolution reached — Legendary G.O.A.T.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-1.5 px-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {neglected ? `Restore: ${baseTier.label}` : `Next: ${next.label}`}
              </span>
              <span className="text-xs font-extrabold" style={{ color: 'var(--tier-accent)' }}>
                {neglected ? 'train to recover' : `${formatTierGoalKg(remaining, bodyWeightKg)} to go`}
              </span>
            </div>
            <div className="h-3.5 w-full rounded-full bg-black/40 overflow-hidden border border-white/10">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${barOverride ?? Math.max(percent, 3)}%`,
                  background: tierGradientCss(current.id),
                }}
              />
            </div>
          </>
        )}
      </div>

      <div className="w-full flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 px-0.5">Choose your mission</p>

        {categories.length > 1 && (
          <div className="flex gap-2 px-0.5">
            {categories.map((cat) => {
              const active = cat.id === effectiveTab;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveTab(cat.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wide transition ${
                    active ? 'text-black' : 'text-neutral-400 bg-white/5 border border-white/10'
                  }`}
                  style={{
                    clipPath: TAB_CLIP,
                    background: active ? tierGradientCss(current.id) : undefined,
                  }}
                >
                  <span>{cat.icon}</span> {cat.label}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4">
          {effectiveTab === 'assigned' &&
            assignments.map((assignment, i) => (
              <MissionCard
                key={assignment.id}
                icon="🎯"
                title={assignment.title}
                subtitle={assignment.assignedByName ? `From ${assignment.assignedByName}` : 'Assigned workout'}
                meta={`${assignment.exercises.length} exercise${assignment.exercises.length === 1 ? '' : 's'}`}
                selected={i === clampedAssignedIdx}
                tierId={current.id}
                onClick={() => setAssignedIdx(i)}
              />
            ))}

          {effectiveTab === 'templates' &&
            templates.map((template, i) => (
              <MissionCard
                key={template.id}
                icon="📋"
                title={template.title}
                subtitle="Saved template"
                meta={`${template.exercises.length} exercise${template.exercises.length === 1 ? '' : 's'}`}
                selected={i === clampedTemplateIdx}
                tierId={current.id}
                onClick={() => setTemplateIdx(i)}
                onDelete={onDeleteTemplate ? () => onDeleteTemplate(template.id) : undefined}
              />
            ))}

          {effectiveTab === 'freestyle' && (
            <MissionCard
              icon="🔥"
              title="Freestyle Workout"
              subtitle="Log whatever you want"
              selected
              tierId={current.id}
              onClick={() => {}}
            />
          )}
        </div>

        {/* Under the carousel, not inside it: this does not start
            anything, so it must not read as a fourth mission you could
            pick. Quiet by design — planning ahead is the deliberate act
            of a returning user, not the primary call to action. */}
        {onPlanWorkout && (
          <button
            type="button"
            onClick={onPlanWorkout}
            className="mt-1 w-full py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 transition active:scale-[0.98]"
          >
            📝 Make a workout for later
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="btn-arcade relative w-full max-w-xs mt-auto text-2xl py-7 overflow-hidden"
      >
        {startLabel}
        {pressed && (
          <span
            className="absolute inset-0 animate-[button-burst_0.4s_ease-out_forwards]"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.6), transparent 60%)',
              clipPath: ARCADE_BUTTON_CLIP,
            }}
          />
        )}
      </button>

      {/* BELOW the arena button, deliberately. This screen exists to get
          someone into a workout, and the trophy case is something you
          scroll down to afterwards — above it would push the primary
          action off the fold on a small phone. `mt-auto` on the button
          already pins that to the bottom of the viewport, so this lands
          just past it rather than competing with it.

          Same full shelf as Profile, locked silhouettes included: "what
          am I close to" is the reason to look at it from here at all. */}
    </div>
  );
}
