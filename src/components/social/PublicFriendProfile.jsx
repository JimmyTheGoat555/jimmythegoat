import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useReturnTo } from '../../hooks/useReturnTo';
import { useFriendProfile } from '../../hooks/useFriendProfile';
import { sanitizeFriendData } from '../../utils/friendPrivacy';
import { getStoreItem } from '../../data/storeItems';
import { formatRecordLoad, recordSortKey } from '../../utils/personalRecords';
import { cheerTargetId, useCheers } from '../../hooks/useCheers';
import JimmyAnimation from '../evolution/JimmyAnimation';
import { getTierByStage } from '../../utils/evolutionTiers';
import { mascotSpriteFor } from '../../data/mascots';
import { danceNumberForItemId, getDanceAnimationPath } from '../../utils/danceAnimations';
import { ENABLE_EMOTES } from '../../config/features';
import BadgeRibbon from '../profile/BadgeRibbon';
import NudgeModal from './NudgeModal';
import { relativeTime } from '../../utils/relativeTime';

// Someone else's profile. Read-only by construction — there is nothing here
// to edit, and nothing here that they have not published.
//
// The view never touches the hook's return value directly. Everything goes
// through sanitizeFriendData first, so this file cannot render a field that
// the allowlist has not been taught about. See utils/friendPrivacy.js for
// what that does and does not protect against — in short, the real fence is
// firestore.rules plus functions/publicProfile.js, and this is the second
// one behind it.

function MysteryProgress({ percent, nextTierLabel, isMaxTier, name }) {
  // Clamped, and 0 for anything that is not a number. An undefined width
  // is not "no bar": the fill is a block, so it would render FULL.
  const width = Math.min(100, Math.max(0, Number(percent) || 0));
  if (isMaxTier) {
    return (
      <div className="flex flex-col gap-2">
        <div className="h-2 w-full rounded-full bg-[var(--success)]/25 overflow-hidden">
          <div className="h-full w-full rounded-full bg-[var(--success)]" />
        </div>
        <p className="text-xs text-neutral-500">Fully evolved. There is nothing left to chase.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="h-2 w-full rounded-full bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${width}%`, background: 'var(--tier-accent)' }}
          // The bar is the only quantity on screen, and the label below it
          // is deliberately vague. A friend gets to see that someone is
          // close to evolving without being handed a number to measure
          // themselves against — which is the entire point of the screen.
          role="img"
          aria-label={`${name} is on the way to ${nextTierLabel}`}
        />
      </div>
      <p className="text-xs text-neutral-500">
        {width > 0 ? (
          <>
            Approaching <span className="text-neutral-300 font-medium">{nextTierLabel}</span>…
          </>
        ) : (
          // "Approaching" at zero reads as a taunt. A fresh account is not
          // approaching anything yet; say what comes first instead.
          <>
            Just getting started. Next up: <span className="text-neutral-300 font-medium">{nextTierLabel}</span>.
          </>
        )}
      </p>
    </div>
  );
}

function RoutineCard({ routine, onCopy, ownerUid, myUid }) {
  return (
    <Cheerable
      targetId={cheerTargetId(ownerUid, `routine_${routine.id}`)}
      myUid={myUid}
      className="card p-4 flex flex-col gap-2"
    >
      {(cheer) => (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-neutral-100">{routine.name}</p>
            <CheerButton {...cheer} onToggle={cheer.toggleLike} />
          </div>
          <ul className="flex flex-col gap-1">
            {routine.exercises.map((exercise, i) => (
              <li
                key={exercise.id ?? `${exercise.name}-${i}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="text-neutral-300">{exercise.name}</span>
                {/* Omitted entirely rather than rendered as "× —". A template
                in this app stores no sets at all (useWorkoutTemplates:
                exerciseId/name/muscleGroup and nothing else), so setCount
                is null for every routine published today and this span
                would otherwise be a dangling multiplication sign on every
                single line. The branch stays for a future published shape
                that does carry set data. */}
                {exercise.setCount != null && (
                  <span className="text-neutral-500 tabular-nums whitespace-nowrap">
                    {exercise.setCount} × {formatReps(exercise.repRange)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {onCopy && <CopyRoutineButton routine={routine} onCopy={onCopy} />}
        </>
      )}
    </Cheerable>
  );
}

function formatReps(range) {
  if (!range) return '—';
  return range.low === range.high ? `${range.low}` : `${range.low}-${range.high}`;
}

// Double tap to cheer.
//
// Timed by hand rather than using onDoubleClick, which is unreliable on
// touch — Safari in particular treats the second tap as a gesture candidate
// and does not always emit dblclick. Two ordinary click events inside a
// short window is the thing that actually happens on every platform.
//
// Taps that land on something already interactive are ignored: without this
// a quick double press on the heart itself would toggle twice AND fire the
// gesture, and the same on 'Copy to My Workouts' would cheer the routine
// you were trying to copy.
const DOUBLE_TAP_MS = 320;

function useDoubleTap(onDoubleTap) {
  const last = useRef(0);
  return useCallback(
    (event) => {
      if (event.target.closest?.('button, a, input, textarea, select')) return;
      const now = Date.now();
      if (now - last.current < DOUBLE_TAP_MS) {
        last.current = 0;
        onDoubleTap();
      } else {
        last.current = now;
      }
    },
    [onDoubleTap],
  );
}

// Wraps one cheerable thing: owns its cheer state, handles the double tap,
// and renders the burst. The heart button is handed the same state rather
// than calling the hook again, so the two controls cannot disagree.
function Cheerable({ targetId, myUid, className = '', children }) {
  const { count, likedByMe, toggleLike, like } = useCheers(targetId, myUid);
  const [burst, setBurst] = useState(0);
  const cheerable = Boolean(targetId && myUid);

  const handleDoubleTap = useCallback(() => {
    navigator.vibrate?.([30]);
    setBurst((n) => n + 1);
    like();
  }, [like]);

  const onClick = useDoubleTap(handleDoubleTap);

  return (
    <div className={`relative ${className}`} onClick={cheerable ? onClick : undefined}>
      {children({ count, likedByMe, toggleLike, cheerable })}
      {burst > 0 && (
        <span
          // Keyed on the counter so a fresh element mounts each time —
          // re-adding the same class to a live node does not restart a CSS
          // animation.
          key={burst}
          className="cheer-burst pointer-events-none absolute inset-0 flex items-center justify-center text-4xl"
          aria-hidden="true"
        >
          ❤️
        </span>
      )}
    </div>
  );
}

// A cheer button: heart, count, pop.
//
// The pop is a CSS keyframe (see index.css). The brief asked for
// framer-motion; it has never been a dependency in this project, and a
// 260ms two-keyframe animation does not justify adding a runtime for it.
//
// `animate` is keyed off the like count rather than a boolean, so a fresh
// animation fires on every toggle — re-adding an identical class name would
// not restart it, and toggling a boolean off-then-on needs a second render.
function CheerButton({ count, likedByMe, onToggle, cheerable }) {
  const [beat, setBeat] = useState(0);
  if (!cheerable) return null;

  const handleToggleLike = () => {
    // Buzz and pop on the tap, not on the write. Unlike copying a routine —
    // where confirming a save that then fails would be a lie — a cheer is
    // reversible, already optimistic, and rolls itself back if the write
    // fails. Waiting here would make the heart feel broken.
    navigator.vibrate?.([30]);
    setBeat((n) => n + 1);
    onToggle();
  };

  return (
    <button
      type="button"
      onClick={handleToggleLike}
      aria-pressed={likedByMe}
      aria-label={likedByMe ? `Remove your cheer (${count})` : `Cheer this (${count})`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold transition-colors duration-200 ${
        likedByMe ? 'text-[var(--ember)]' : 'text-neutral-500'
      }`}
    >
      <span key={beat} className={beat ? 'cheer-pop' : undefined} aria-hidden="true">
        {likedByMe ? '❤️' : '🤍'}
      </span>
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

// 'Copied!' holds for this long before the button goes back to being a
// button. Long enough to read, short enough that a second copy is not
// blocked behind it.
const COPIED_HOLD_MS = 2000;

function CopyRoutineButton({ routine, onCopy }) {
  const [state, setState] = useState('idle'); // idle | saving | copied | failed
  const timer = useRef(null);
  // The in-flight latch is a REF, not the state above. State is captured by
  // the render closure, so two taps in the same frame both read 'idle' and
  // both write — measured, three synchronous clicks produced three saved
  // copies. `disabled` does not help either: it is not on the DOM until
  // React re-renders. A ref updates synchronously, which is the only thing
  // that closes the window.
  const inFlight = useRef(false);

  // Two reasons this is scoped to one button rather than lifted: a shared
  // "which one is copied" id would need clearing on every other press, and
  // the timeout below has to die with the component that owns it. Leaving
  // it running would set state on an unmounted card the moment someone taps
  // Back inside the two seconds.
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopyWorkout = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('saving');
    try {
      await onCopy(routine);
      // Only buzz once the write has actually landed. Confirming a save
      // that then fails is worse than a slightly later buzz.
      navigator.vibrate?.([50]);
      setState('copied');
    } catch {
      setState('failed');
    }
    inFlight.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), COPIED_HOLD_MS);
  };

  const label = { idle: 'Copy to My Workouts', saving: 'Copying…', copied: '✓ Copied!', failed: "Couldn't copy" }[
    state
  ];
  const tone =
    state === 'copied'
      ? 'bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/40'
      : state === 'failed'
        ? 'bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/40'
        : 'bg-white/5 text-neutral-300 border-white/10';

  return (
    <button
      type="button"
      onClick={handleCopyWorkout}
      disabled={state === 'saving'}
      // Announced rather than only coloured: a checkmark that turns green is
      // invisible to a screen reader and to anyone who cannot tell the two
      // greens apart.
      aria-live="polite"
      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm font-semibold transition-colors duration-200 ${tone}`}
    >
      {label}
    </button>
  );
}

// The brand mark that signs the share stickers, at rest here as the quiet
// centrepiece of an empty section — the same file WorkoutCelebration's
// BrandMark ghosts onto its buttons.
const BRAND_MARK = '/assets/logo-mark.png';

// The empty state for the Activity section — and only for that section.
//
// This used to be the whole page. A friend with no public/summary got one
// line of copy in place of their profile, which hid exactly the things a
// brand-new account has to show a friend: their goat, their name, and the
// bar they are about to start filling. The header and the evolution card
// now render for everyone, and this sits in the body where the workout
// they have not logged yet would go.
function NoActivityYet({ name, onNudge }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2 text-center">
      <img
        src={BRAND_MARK}
        alt=""
        aria-hidden="true"
        draggable="false"
        className="mb-1.5 h-8 w-auto select-none opacity-30"
      />
      <p className="text-sm text-neutral-300">{name} hasn't logged a workout yet.</p>
      <p className="text-xs text-neutral-500">Their first session shows up here.</p>
      {onNudge && (
        <button type="button" onClick={onNudge} className="mt-1.5 text-xs font-semibold text-[var(--ember)]">
          Nudge them to get started →
        </button>
      )}
    </div>
  );
}

// Their most recent session, as the feed already shows it to everyone —
// see sanitizeActivity for the handful of fields that make it here.
function LatestActivity({ activity }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-base text-neutral-200">
        {activity.headline}
        {activity.totalSets != null && (
          <>
            {' · '}
            <span className="tabular-nums">{activity.totalSets}</span> sets
          </>
        )}
        {activity.totalVolumeKg != null && (
          <>
            {' · '}
            <span className="font-semibold tabular-nums text-neutral-100">
              {activity.totalVolumeKg.toLocaleString('en-US')} kg
            </span>
          </>
        )}
      </p>
      {activity.at && <p className="text-xs text-neutral-500">Last workout {relativeTime(activity.at)}</p>}
    </div>
  );
}

export default function PublicFriendProfile({ friends, onSendNudge, onSaveTemplate, myUid }) {
  const { friendUid } = useParams();
  const goBack = useReturnTo('/social');
  const knownFriend = (friends ?? []).find((f) => f.uid === friendUid);

  const raw = useFriendProfile(friendUid);
  const friend = sanitizeFriendData(raw);

  // The friends-list name arrives with no round trip; the published one is
  // preferred once it lands, since it is the more current source of truth.
  // Their latest post is the third source, for someone reached from the
  // feed or the leaderboard who is not on the friends list at all.
  const name = friend.displayName ?? knownFriend?.displayName ?? friend.latestActivity?.posterName ?? 'This friend';

  if (raw.loading) {
    return (
      <div className="flex flex-col gap-5 pt-6 pb-nav">
        <p className="text-sm text-neutral-500">Loading {name}'s profile…</p>
      </div>
    );
  }

  // No branch for "nothing published" any more. An account that has never
  // trained has no public/summary, and used to get a single line of copy
  // in place of the whole page; it now renders the same screen as everyone
  // else, on the sanitiser's defaults — base goat, 0% to the next tier —
  // with each section showing its own empty state.
  return (
    <FriendProfileScreen
      friend={friend}
      name={name}
      friendUid={friendUid}
      myUid={myUid}
      onBack={goBack}
      onSendNudge={(messageId) => onSendNudge(friendUid, messageId)}
      onSaveTemplate={onSaveTemplate}
    />
  );
}

// The screen itself, as a pure function of sanitised data. Split from the
// loader above so it can be handed ANY input — a friend with nothing
// published, an empty badge list, an undefined loadout, no data at all —
// and still draw the header, and so dev/friend-profile.html can show every
// one of those states without a Firestore round trip. Nothing in here
// returns early: each section decides its own empty state, and the header
// has none.
export function FriendProfileScreen({
  friend = sanitizeFriendData(null),
  name = 'This friend',
  friendUid = null,
  myUid = null,
  onBack,
  onSendNudge,
  onSaveTemplate,
}) {
  const [nudging, setNudging] = useState(false);
  // How many times the visitor has asked to see the emote. 0 means the
  // clip has never been requested — and therefore never fetched.
  const [avatarPlays, setAvatarPlays] = useState(0);

  const friendTier = getTierByStage(friend.evolutionStage);
  const danceNumber = danceNumberForItemId(friend.equippedDance);
  const danceName = getStoreItem(friend.equippedDance)?.name ?? 'move';
  // `friend.mascot` is what sanitizeFriendData published — the id, never
  // the gender it was derived from — so this resolves to their character's
  // own clip, or to null for a mascot that has none.
  // Null while ENABLE_EMOTES (config/features.js) is off — nothing to
  // play, nothing fetched, and the avatar below is not a button at all.
  const dancePath = ENABLE_EMOTES ? getDanceAnimationPath(danceNumber, friend.evolutionStage, friend.mascot) : null;
  // Null until the first tap, so the WebP is never even requested for a
  // visitor who only came to read their PRs. Each further tap bumps the
  // fragment: a distinct URL to the image decoder (which is what restarts
  // an animated WebP — see JimmyAnimation) but the same cached resource
  // to the network.
  const avatarAnimationSrc =
    avatarPlays === 0 || !dancePath ? null : avatarPlays === 1 ? dancePath : `${dancePath}#${avatarPlays}`;

  // Only the EQUIPPED emote is ever shown — what someone else owns but is
  // not wearing is not this screen's business. Someone with nothing
  // equipped therefore has nothing to play, and the tap does nothing
  // rather than opening a browser of their wardrobe.
  const handleAvatarTap = () => {
    if (!dancePath) return;
    navigator.vibrate?.([30]);
    setAvatarPlays((n) => n + 1);
  };

  // Copies the STRUCTURE into your own library — the same shape
  // saveTemplate already writes for your own routines (exerciseId, name,
  // muscleGroup and nothing else), so a copied routine is indistinguishable
  // from one you built yourself and carries none of their numbers. It
  // cannot carry weights even in principle: templates do not store any.
  //
  // Attributed in the title because a library of anonymous "Push Day"s is
  // useless a month later.
  const handleCopyWorkout = onSaveTemplate
    ? (routine) =>
        onSaveTemplate(
          // "big reef's arms and shoulders" — the owner's name possessive,
          // in front. Attribution has to be in the TITLE because a copied
          // template is otherwise indistinguishable from your own, and a
          // library of anonymous "Push Day"s is useless a month later.
          `${name}'s ${routine.name}`,
          routine.exercises
            .filter((e) => e.exerciseId)
            .map(({ exerciseId, name: exerciseName, muscleGroup }) => ({
              exerciseId,
              name: exerciseName,
              muscleGroup,
            })),
        )
    : null;

  // The avatar markup, shared by both shells below: a <button> that plays
  // the equipped emote when the emotes are on, a plain box when they are
  // hidden (ENABLE_EMOTES, config/features.js).
  const avatar = (
    <span className="relative flex items-end justify-center">
      {/* Tier-coloured glow standing in for the ring the head crop
          used to have — it keeps the tier legible without boxing a
          full-length goat into a circle. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 h-32 w-40 rounded-full blur-3xl opacity-60"
        style={{ background: 'radial-gradient(circle, var(--tier-glow), transparent 70%)' }}
      />
      <JimmyAnimation
        animationSrc={avatarAnimationSrc}
        staticImageSrc={mascotSpriteFor(friend.mascot, friendTier?.stage)}
        alt={`${name} the ${friend.tierLabel}`}
        className="relative h-44 w-40"
        evolutionStage={friend.evolutionStage}
        equippedAccessories={friend.equippedAccessories}
        // Theirs, from the summary — see friendPrivacy's sanitize.
        // It also gates the dance: a Gena profile holds her sprite
        // instead of playing a clip of Jimmy doing her emote.
        mascot={friend.mascot}
        // This component owns the tap; two handlers on one press
        // would each restart the clip.
        interactive={false}
      />
    </span>
  );

  return (
    <div className="flex flex-col gap-5 pt-6 pb-nav">
      <button type="button" onClick={onBack} className="text-sm font-medium text-neutral-500 self-start">
        ← Back
      </button>

      {/* The header. Always drawn, whatever the data — a brand-new account
          gets the base goat, its name and the bar at zero, which is a
          profile, where a line saying there is nothing to see was not. */}
      <div className="flex flex-col items-center gap-3 text-center">
        {/* THEIR goat in THEIR gear — explicit props, never useJimmyLook().
            Reading the current user's context here would quietly dress every
            friend in your own loadout, and it would look entirely plausible.

            Full body, not a head crop: the gear below the neck (tank,
            hoodie, jeans) is most of what someone has actually bought, and
            a circular head shot hides all of it.

            He is STILL when the page opens. `animationSrc` stays null until
            a tap, so the clip is not even fetched — the profile of someone
            you just wanted to look at should not start performing at you.
            A real <button>, so it is keyboard-reachable and announced. */}
        {ENABLE_EMOTES ? (
          <button
            type="button"
            onClick={handleAvatarTap}
            className="transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ember)] rounded-3xl"
            aria-label={danceNumber ? `Play ${name}'s ${danceName}` : `See ${name}'s dances`}
          >
            {avatar}
          </button>
        ) : (
          // No emotes to play while the flag is off, so no button either: a
          // control announced as "play their dance" with nothing behind it
          // is worse than a still picture.
          <div className="rounded-3xl">{avatar}</div>
        )}

        <div>
          <h1 className="text-2xl font-bold text-neutral-50">{name}</h1>
          <p className="text-sm text-neutral-500">{friend.tierLabel}</p>
        </div>

        {/* The three they chose, right under the name where the accessory
            chips used to sit. No picker and no empty state — someone
            else's blank shelf is not worth a line of copy. */}
        <BadgeRibbon badges={friend.badges} featured={friend.featuredBadges} />

        <button
          type="button"
          onClick={() => setNudging(true)}
          className="mt-1 bg-[var(--ember)] text-white font-semibold text-sm px-5 py-2.5 rounded-xl"
        >
          🐐 Nudge
        </button>
      </div>

      <section className="card p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Evolution</p>
        <MysteryProgress
          percent={friend.progressPercent}
          nextTierLabel={friend.nextTierLabel}
          isMaxTier={friend.isMaxTier}
          name={name}
        />
      </section>

      {/* Their feed, reduced to its most recent entry. This is the section
          the old whole-page "nothing to show" copy belonged to, and where
          it lives now. */}
      <section className="card p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Activity</p>
        {friend.latestActivity ? (
          <LatestActivity activity={friend.latestActivity} />
        ) : (
          <NoActivityYet name={name} onNudge={() => setNudging(true)} />
        )}
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Personal Records</p>
        {/* Checked before the sharing flag: an account that has never
            trained has not "chosen" anything about its PRs, and telling a
            visitor otherwise would read as a snub. */}
        {!friend.hasActivity ? (
          <p className="text-sm text-neutral-500">No personal records yet — they start with {name}'s first workout.</p>
        ) : !friend.sharesRecords ? (
          <p className="text-sm text-neutral-500">{name} hasn't chosen to share their PRs.</p>
        ) : friend.personalRecords.length === 0 ? (
          <p className="text-sm text-neutral-500">No personal records logged yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {friend.personalRecords
              .slice()
              // Not `b.weight - a.weight`: a published bodyweight record has no
              // `weight` at all any more, and NaN comparisons silently scramble
              // the whole list rather than misplacing one row.
              .sort((a, b) => recordSortKey(b) - recordSortKey(a))
              .map((pr) => (
                <li key={pr.exerciseId ?? pr.name}>
                  <Cheerable
                    targetId={cheerTargetId(friendUid, pr.exerciseId)}
                    myUid={myUid}
                    className="flex items-center justify-between gap-2 text-base"
                  >
                    {(cheer) => (
                      <>
                        <span className="text-neutral-300">{pr.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-100 tabular-nums">
                            {formatRecordLoad(pr)}
                            {pr.reps ? ` × ${pr.reps}` : ''}
                          </span>
                          <CheerButton {...cheer} onToggle={cheer.toggleLike} />
                        </span>
                      </>
                    )}
                  </Cheerable>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* Routines are structure only — see sanitizeRoutine. Nothing here
          renders until the server actually publishes saved workouts, which
          it does not today: templates live at users/{uid}/templates and are
          owner-only by rule. The section stays because the sanitiser and
          the UI for it are the parts that need to exist BEFORE any such
          data is published, not after. */}
      {friend.savedRoutines.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Saved Routines</p>
          <p className="text-xs text-neutral-600 -mt-1">Structure only — steal the routine, not the numbers.</p>
          <div className="flex flex-col gap-3">
            {friend.savedRoutines.map((routine, i) => (
              <RoutineCard
                key={routine.id ?? `${routine.name}-${i}`}
                routine={routine}
                onCopy={handleCopyWorkout}
                ownerUid={friendUid}
                myUid={myUid}
              />
            ))}
          </div>
        </section>
      )}

      {nudging && <NudgeModal friendName={name} onSend={onSendNudge} onClose={() => setNudging(false)} />}
    </div>
  );
}
