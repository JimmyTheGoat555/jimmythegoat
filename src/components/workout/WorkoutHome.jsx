import { useMemo, useState } from 'react';
import { useJimmyLook } from '../../context/JimmyLook';
import MissionCard from './MissionCard';
import RestAndRecover from './RestAndRecover';
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
  // Opens the friend picker for one saved routine — App owns the modal,
  // so this screen never needs to know the friends list or the callable.
  onRecommendTemplate,
  onPlanWorkout,
  // useWorkoutCooldown's result. The server refuses a workout logged
  // inside the cooldown window; this is what stops someone reaching that
  // refusal with a session's worth of sets already typed in.
  cooldown = { loading: false, isCoolingDown: false, remaining: '', unlocksAt: null },
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

  // The two (sometimes three) ways into a session, as full-width action
  // cards rather than the folder tabs this used to be. Tabs said
  // "Freestyle" and "Templates" — accurate words that assume you already
  // know what the app means by them. A card has room to say what actually
  // happens when you press it, which is the whole reason for the change.
  //
  // COLOUR CLASSES ARE WRITTEN OUT IN FULL, never assembled from pieces:
  // Tailwind scans source text for complete class names and an
  // interpolated one is silently never generated (see BadgeMedallion for
  // the same note, and the same scar).
  const categories = useMemo(() => {
    const cats = [];
    // Trainer work first when it exists. It is the only one of the three
    // somebody else is waiting on.
    if (assignments.length > 0) {
      cats.push({
        id: 'assigned',
        icon: '🎯',
        title: 'Assigned Missions',
        subtitle: `${assignments.length} routine${assignments.length === 1 ? '' : 's'} from your trainer`,
        border: 'border-violet-500/70',
        glow: 'ring-1 ring-violet-400/40 shadow-[0_0_26px_-8px_rgba(167,139,250,0.85)]',
      });
    }
    cats.push({
      id: 'freestyle',
      icon: '⚡',
      title: 'Create a New Workout',
      subtitle: 'Start an empty session and add exercises on the go',
      border: 'border-cyan-500/70',
      glow: 'ring-1 ring-cyan-400/40 shadow-[0_0_26px_-8px_rgba(34,211,238,0.85)]',
    });
    if (templates.length > 0) {
      cats.push({
        id: 'templates',
        icon: '📋',
        title: 'My Workouts',
        subtitle: "Load a saved routine or a friend's workout",
        border: 'border-amber-500/70',
        glow: 'ring-1 ring-amber-400/40 shadow-[0_0_26px_-8px_rgba(251,191,36,0.85)]',
      });
    }
    return cats;
  }, [assignments.length, templates.length]);

  // Falls back to the first available category whenever the manually-
  // picked one no longer has content (e.g. the last template got deleted
  // while that tab was open) instead of rendering a dead tab.
  // Ordering the CARDS put Create above My Workouts, but the default
  // selection is a separate question and the old answer was the right
  // one: land on the thing with content in it. Someone with a library
  // opened this screen to use it.
  const defaultTab = categories.find((c) => c.id !== 'freestyle')?.id ?? 'freestyle';
  const effectiveTab = categories.some((c) => c.id === activeTab) ? activeTab : defaultTab;
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
    // pb-24 + a min-height 4.5rem taller than the old pair, which is one
    // change rather than two: the extra bottom padding clears the fixed
    // nav now that this screen genuinely scrolls (the action cards made it
    // taller than a phone), and the matching growth in min-height keeps
    // mt-auto landing the start button in exactly the same place it did
    // when the page still fit. Change them together or the button either
    // floats or hides under the tab bar.
    <div className="flex flex-col items-center gap-5 pt-8 pb-24 min-h-[calc(100vh-1.5rem)]">
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

      {/* No "Choose your mission" heading: the tab row and the cards under
          it already say what this is, and a label over a picker that is
          the only thing on the screen is a caption on a photograph of
          itself. */}
      {/* The picker stays up during a cooldown. Only STARTING is blocked,
          and the library is not just a list of things to start: it is
          where routines get read, deleted, and sent to a friend (📤 on
          each card). Hiding it took all of that away for four hours,
          which punished the wrong thing — resting is not a reason to lose
          access to your own templates. */}
      <div className="w-full flex flex-col gap-4">
        {categories.map((cat) => {
          const active = cat.id === effectiveTab;
          return (
            <div key={cat.id} className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setActiveTab(cat.id)}
                aria-pressed={active}
                className={`flex items-center gap-4 rounded-2xl border-2 bg-slate-900/80 p-4 text-left transition-all duration-200 hover:shadow-lg hover:brightness-110 active:scale-95 ${
                  cat.border
                } ${active ? cat.glow : 'opacity-60'}`}
              >
                <span aria-hidden="true" className="text-3xl leading-none">
                  {cat.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold leading-tight text-neutral-50">{cat.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-neutral-400">{cat.subtitle}</span>
                </span>
              </button>

              {/* The routines live UNDER their own card rather than below
                  all three, so opening one reads as that card expanding
                  instead of a list appearing somewhere else on the page.
                  Freestyle has nothing to pick — the card is the whole
                  choice — which is why it never grows one. */}
              {active && cat.id === 'assigned' && (
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4">
                  {assignments.map((assignment, i) => (
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
                </div>
              )}

              {active && cat.id === 'templates' && (
                <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4">
                  {templates.map((template, i) => (
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
                      onRecommend={onRecommendTemplate ? () => onRecommendTemplate(template) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Under the carousel, not inside it: this does not start
            anything, so it must not read as a fourth mission you could
            pick. Quiet by design — planning ahead is the deliberate act
            of a returning user, not the primary call to action.
            Hidden during a cooldown only because RestAndRecover carries
            the same action as its main button — two of them a thumb apart
            would be a choice between identical things. */}
        {onPlanWorkout && !cooldown.isCoolingDown && (
          <button
            type="button"
            onClick={onPlanWorkout}
            className="mt-1 w-full py-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 transition active:scale-[0.98]"
          >
            📝 Make a workout for later
          </button>
        )}
      </div>

      {/* The one thing the cooldown actually takes away: the button. */}
      {cooldown.isCoolingDown ? (
        <RestAndRecover
          remaining={cooldown.remaining}
          unlocksAt={cooldown.unlocksAt}
          onPlanWorkout={onPlanWorkout}
        />
      ) : (
        <button
          type="button"
          onClick={handleStart}
          // Until the economy doc has been read we do not know whether this
          // account is inside a cooldown. Disabled rather than hidden for
          // that instant: hiding the primary action makes the screen look
          // broken, and enabling it would let a fast tap start the exact
          // session this whole feature exists to prevent.
          disabled={cooldown.loading}
          className="btn-arcade relative w-full max-w-xs mt-auto text-2xl py-7 overflow-hidden disabled:opacity-60"
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
      )}
    </div>
  );
}
