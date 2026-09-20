import { useState } from 'react';
import { useJimmyLook } from '../../context/JimmyLook';
import RestAndRecover from './RestAndRecover';
import StartWorkoutSheet from './StartWorkoutSheet';
import BadgeRibbon from '../profile/BadgeRibbon';
import JimmyAnimation from '../evolution/JimmyAnimation';
import { lifetimeVolume } from '../../utils/workoutStats';
import { getEvolutionProgress, formatTierGoalKg } from '../../utils/evolutionTiers';
import { tierGradientCss } from '../../utils/tierTheme';
import { danceNumberForItemId, getDanceAnimationPath } from '../../utils/danceAnimations';
import { equippedOutfitFor, mascotSpriteFor } from '../../data/mascots';
import { ENABLE_EMOTES } from '../../config/features';
import { useBottomChrome } from '../../hooks/useBottomChrome';

// The app's "lobby" — Jimmy front and center, the tier and the XP bar
// under him, and ONE unmissable chunky button.
// Nothing else: the three ways into a session (an empty workout, a saved
// template, a trainer's assignment) and the "plan one for later" link
// used to sit here as a stack of cards between the bar and the button,
// and the screen read as a menu with a mascot on top. They live behind
// the button now, in StartWorkoutSheet — one tap opens the choosing, and
// the lobby itself is the character and how far they have come. Every
// colour here reads from the app-wide --tier-* variables App.jsx sets, so
// it is always tuned to how far THIS user has actually evolved.
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
  // One of Jimmy's Workouts — see StartWorkoutSheet and data/jimmyWorkouts.js.
  onStartProgram = null,
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
  // 0.65 for a female account — see progressionScale in evolutionTiers.
  progressionScale = 1,
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [mascotBroken, setMascotBroken] = useState(false);

  const totalVolume = lifetimeVolume(workouts);
  const { current, next, percent, isMaxTier, neglected, baseTier } = getEvolutionProgress(totalVolume, {
    minStage,
    scale: progressionScale,
    lastWorkoutAt,
  });
  const remaining = next ? Math.max(0, next.threshold - totalVolume) : 0;

  // The current user's own look, straight from context — no prop to thread
  // down from App, and no chance of the lobby mascot drifting out of sync
  // with the shop that dressed him. Read up here, above the dance path,
  // because the path is per mascot: the same equipped dance is a
  // different file on Gena.
  const jimmyLook = useJimmyLook();
  // null (no dance owned/equipped) is the common case and JimmyAnimation
  // already falls back to the plain static sprite for it — see there.
  const danceAnimationPath = getDanceAnimationPath(
    danceNumberForItemId(equippedDance),
    current.stage,
    jimmyLook.mascot,
  );

  // The button opens the sheet; the sheet starts the session. The burst
  // plays over the button while the sheet slides up, and clears itself
  // when its animation ends — this screen no longer unmounts on the press
  // the way it did when the button started the workout directly.
  const handleStart = () => {
    setPressed(true);
    navigator.vibrate?.(35);
    setSheetOpen(true);
  };

  // The Start Workout pill is the other thing living in the strip just
  // above the tab row, and it is the screen the "+N coins" toast lands on
  // after a session is logged — so without this the reward message would
  // appear on top of the button it is congratulating you for pressing.
  // Publishing its footprint lets the toast stack above it the same way it
  // stacks above the minimised-workout bar.
  //
  // 6.5rem, and the number is worth explaining because the obvious one is
  // wrong. The pill itself is 4.5rem, but it does not sit at its sticky
  // offset while the page fits on screen — mt-auto parks it at the bottom
  // of the flex column and .pb-nav's own 1.75rem of padding sits below it
  // (index.css). Its real top edge is therefore 6.25rem above the tab row,
  // not 5.5rem, which measured as a 13px overlap with the toast. 6.5rem
  // clears it with a little air. Cleared on unmount, so every other tab
  // gets the toast back down next to the row.
  useBottomChrome('--cta-h', '6.5rem');

  return (
    // Fits one phone screen again now that the picker is gone: pb-nav
    // clears the fixed tab bar, min-height fills the viewport so mt-auto
    // parks the button at the bottom, and the space between the bar and
    // the button is deliberately empty — it is what makes the mascot and
    // the button read as the only two things here.
    //
    // "The viewport" is the DYNAMIC viewport below the HUD: 100dvh minus
    // --hud-h (index.css). The old 100vh − 1.5rem ignored the 3.5rem HUD
    // this sits under and, on iOS, 100vh is the tallest the viewport ever
    // gets rather than what is on screen — together the box ran 2rem plus
    // the notch inset past the bottom edge, and the button parked inside
    // the tab row. On a phone too short for everything (SE-class, or with
    // the announcement banner up) the page scrolls and the sticky button
    // below floats clear of the row on its own.
    <div className="flex flex-col items-center gap-5 pt-8 pb-nav min-h-[calc(100dvh-var(--hud-h))]">
      <div className="relative flex flex-col items-center justify-end mt-2 h-60 w-full">
        {/* Just the character on the page background. The glowing pedestal
            ring and the blurred tier-glow disc that used to sit behind him
            are gone on purpose — clean and minimal — and the streak fire is
            switched off below for the same reason, so nothing rings, halos
            or burns around him here. h-60: with the room the picker used to
            take, the character is the screen. */}
        {mascotBroken ? (
          <span className="relative text-8xl leading-none">{current.emoji}</span>
        ) : (
          <JimmyAnimation
            // No clip at all while ENABLE_EMOTES (config/features.js) is
            // off: with nothing to play, JimmyAnimation holds the still
            // sprite and never becomes the tap-to-replay button, so there
            // is no emote trigger on this screen. danceAnimationPath is
            // still resolved above; only what reaches the mascot changes.
            animationSrc={ENABLE_EMOTES ? danceAnimationPath : null}
            // The tier picks the stage, the mascot picks whose sprite.
            // `jimmyLook.mascot` is spread in below as well (that is what
            // places the gear and gates the dance); this one line is only
            // because the static layer is passed as an explicit src.
            staticImageSrc={mascotSpriteFor(jimmyLook.mascot, current.stage)}
            alt={current.label}
            onImageError={() => setMascotBroken(true)}
            // Fills the stage's full height, which sets how big Jimmy reads.
            // Both the sprite and the dance animation are built to the same
            // proportions, so this one number scales them together and his
            // feet stay on the same line — see JimmyAnimation.
            className="w-60 h-60"
            {...jimmyLook}
            // In an outfit set the lobby opens on her AT REST — in the
            // set, gear on — and the dance waits for a tap, because the
            // clips show her in default gear (see JimmyAnimation). Jimmy
            // and plain Gena still dance on arrival.
            autoplay={!equippedOutfitFor(jimmyLook.mascot, jimmyLook.equippedAccessories)}
          />
        )}
      </div>

      <p className="text-2xl text-neutral-50 -mt-2">{current.label}</p>

      {neglected && (
        <div className="w-full -mt-2 rounded-xl bg-[var(--danger)]/15 border border-[var(--danger)]/30 px-3 py-2 text-center">
          <p className="text-xs font-semibold text-[var(--danger)]">😴 5 days off — Jimmy slipped to {current.label}</p>
          <p className="text-[11px] text-neutral-400 mt-0.5">Log any workout to restore {baseTier.label}.</p>
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

      {/* The one thing the cooldown actually takes away: the button. */}
      {cooldown.isCoolingDown ? (
        <RestAndRecover remaining={cooldown.remaining} unlocksAt={cooldown.unlocksAt} onPlanWorkout={onPlanWorkout} />
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
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          data-testid="start-workout"
          // A floating pill, not a block on the bottom edge. mt-auto parks
          // it at the foot of the lobby, where pb-nav already leaves 1.75rem
          // of clear space above the tab row; sticky is for the screens
          // where the lobby is taller than the viewport — there it rides
          // 1rem above the row while the rest scrolls underneath, instead
          // of sitting below the fold under the tabs. z-10 lifts it over
          // that scrolling content and keeps it under the nav (z-30), the
          // minimised-workout bar (z-20) and every sheet — and --float-bar-h
          // (index.css) lifts it over that bar while a session is parked.
          // overflow-hidden clips the press burst to the pill.
          className="btn-launch sticky bottom-[calc(var(--nav-total)+var(--float-bar-h)+1rem)] z-10 mt-auto w-full max-w-sm rounded-full py-5 text-[28px] leading-none overflow-hidden disabled:opacity-60"
        >
          Start Workout
          {pressed && (
            <span
              className="absolute inset-0 animate-[button-burst_0.4s_ease-out_forwards]"
              onAnimationEnd={() => setPressed(false)}
              style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.6), transparent 60%)' }}
            />
          )}
        </button>
      )}

      <StartWorkoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        assignments={assignments}
        templates={templates}
        onStartWorkout={onStartWorkout}
        onStartAssigned={onStartAssigned}
        onStartTemplate={onStartTemplate}
        onStartProgram={onStartProgram}
        onDeleteTemplate={onDeleteTemplate}
        onRecommendTemplate={onRecommendTemplate}
        onPlanWorkout={onPlanWorkout}
      />
    </div>
  );
}
