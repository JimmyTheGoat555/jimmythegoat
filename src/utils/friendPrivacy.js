import { getEvolutionProgress, progressionScale } from './evolutionTiers';
import { mascotCanWear, mascotHasDances, resolveMascotId } from '../data/mascots';
import { readEquippedAccessories, STORE_ITEMS } from '../data/storeItems';
import { BADGES } from '../data/badges';
import { isOnFire } from './streak';

// What a friend's profile view is allowed to know.
//
// READ THIS BEFORE TRUSTING IT. This function is a second fence, not the
// first one. Anything it receives has ALREADY been fetched into the
// browser, where it sits in memory and in the network tab no matter what
// React renders. Sanitising on the client cannot make data private; it can
// only keep it off the screen.
//
// The fence that actually matters is upstream and already in place:
//
//   * A friend's real users/{uid} doc is unreadable — owner and connected
//     trainer only (firestore.rules). Their email, coins, friends list and
//     body-weight log never leave the server.
//   * The only readable surface is users/{uid}/public/summary, written
//     exclusively by Cloud Functions (functions/publicProfile.js).
//   * PRs are not flagged-and-hidden, they are ABSENT: turning sharing off
//     deletes `personalRecords` from the published document outright. A
//     reader has nothing to filter because there is nothing there.
//
// So why have this at all? Because `public/summary` will grow. The next
// person to add a field to it — a streak, a body weight, a location — gets
// it rendered by any view that spreads the fetched object. An allowlist
// makes that failure land as a missing field in the UI, which someone
// notices, instead of an accidental disclosure, which nobody does. That is
// the whole value, and it is worth having.
//
// Hence: allowlist, never blocklist. Fields are copied out one at a time
// and everything unrecognised is dropped on the floor.

// A saved routine, stripped to its shape. Weights are the comparison this
// whole screen exists to avoid, so they never survive — not zeroed, not
// nulled-but-present, gone. Sets and reps stay, because the point is that
// a friend can copy the routine.
//
// Worth knowing: a template in this app is ALREADY weightless at rest.
// useWorkoutTemplates stores only exerciseId/name/muscleGroup — no sets,
// no reps, no loads — so when routines are eventually published there will
// be no weight here to strip. This function still strips, because it must
// keep holding if the published shape ever grows richer than that.
// ── WRITE SIDE ──────────────────────────────────────────────────────────
//
// The twin of sanitizeRoutine below, and it lives in this file rather than
// next to the hook that calls it precisely so the two halves of the same
// contract — what we publish, and what we accept back — sit where you
// cannot change one without seeing the other.
//
// This is an ALLOWLIST BY CONSTRUCTION: three keys are destructured out of
// each exercise and a fresh object is built from them. `weight`,
// `addedWeight`, `sets`, `reps` and anything else added to a template
// later cannot survive, because nothing copies them. That is a stronger
// guarantee than deleting known-bad keys, which silently passes whatever
// the next person adds.
//
// Be clear about what this does and does not buy, though. It runs on the
// client, so it protects a user from ACCIDENTALLY over-sharing — it cannot
// stop someone who tampers with their own client from publishing whatever
// they like into their own public summary. That is a genuinely acceptable
// limit here, and it is worth naming why: the only data at risk is the
// publisher's own, about themselves. Nothing here can leak a third party's
// numbers, which is what the read-side fence exists to prevent.
const MAX_PUBLISHED_ROUTINES = 20;
const MAX_PUBLISHED_EXERCISES = 30;

export function publishableRoutine(template) {
  if (!template || typeof template !== 'object') return null;
  const exercises = Array.isArray(template.exercises) ? template.exercises : [];
  return {
    id: typeof template.id === 'string' ? template.id : null,
    // Templates store `title`; the published shape says `name`, because
    // that is what sanitizeRoutine and RoutineCard read. Translated here,
    // once, rather than teaching every reader about both spellings.
    name: (typeof template.title === 'string' && template.title.trim()) || 'Untitled routine',
    exercises: exercises.slice(0, MAX_PUBLISHED_EXERCISES).map(({ exerciseId, name, muscleGroup }) => ({
      exerciseId: typeof exerciseId === 'string' ? exerciseId : null,
      name: typeof name === 'string' ? name : 'Exercise',
      muscleGroup: typeof muscleGroup === 'string' ? muscleGroup : null,
    })),
  };
}

// The whole published array, rebuilt from the caller's current template
// list. NOT an append: appending cannot express a delete, cannot repair
// drift between the private collection and the public mirror, and cannot
// backfill the templates that already existed before any of this shipped.
// Recomputing the array converges on all three for free.
export function publishableRoutines(templates) {
  return (Array.isArray(templates) ? templates : [])
    .slice(0, MAX_PUBLISHED_ROUTINES)
    .map(publishableRoutine)
    .filter(Boolean);
}

// ── READ SIDE ───────────────────────────────────────────────────────────

function sanitizeRoutine(routine) {
  if (!routine || typeof routine !== 'object') return null;
  const exercises = Array.isArray(routine.exercises) ? routine.exercises : [];
  return {
    id: routine.id ?? null,
    // `title` accepted as well as `name` purely as drift insurance: the
    // writer (publishableRoutine) and this reader now live in one file but
    // are called from opposite ends of the app, and the private template
    // doc really does spell it `title`.
    name:
      (typeof routine.name === 'string' && routine.name) ||
      (typeof routine.title === 'string' && routine.title) ||
      'Untitled routine',
    exercises: exercises.map((exercise) => {
      const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
      // Rep counts collapse to a range: "3 x 8-10" reads as a routine,
      // where a per-set list starts to read as a log.
      const reps = sets.map((set) => Number(set?.reps)).filter((n) => Number.isFinite(n) && n > 0);
      const low = reps.length ? Math.min(...reps) : null;
      const high = reps.length ? Math.max(...reps) : null;
      return {
        // exerciseId and muscleGroup are what a COPY needs to rebuild this
        // routine in your own library (see useWorkoutTemplates.saveTemplate).
        // Neither is personal — one is a catalog key, the other a category
        // like "chest" — and without them the copy button has nothing to
        // write.
        exerciseId: exercise?.exerciseId ?? exercise?.id ?? null,
        muscleGroup: typeof exercise?.muscleGroup === 'string' ? exercise.muscleGroup : null,
        name: typeof exercise?.name === 'string' ? exercise.name : 'Exercise',
        // Both null for a real template: they are stored structure-only,
        // with no sets at all (useWorkoutTemplates). These survive for a
        // richer published shape that does carry them; formatReps in the
        // view renders an em dash when they don't.
        setCount: sets.length || null,
        repRange: low == null ? null : { low, high },
      };
    }),
  };
}

// A single PR, keeping the lift and dropping nothing else — a PR IS its
// weight, so there is no weightless version of one. The privacy decision
// for records is whether the record appears at all, which is what the
// filter below is for.
function sanitizeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const weight = Number(record.weight);
  if (!Number.isFinite(weight)) return null;
  return {
    exerciseId: record.exerciseId ?? null,
    name: typeof record.name === 'string' ? record.name : 'Lift',
    weight,
    reps: Number.isFinite(Number(record.reps)) ? Number(record.reps) : null,
  };
}

// The dances a visitor is offered to play on someone else's profile.
//
// Reduced to catalog membership on the way through, which does two things
// at once: an id that is not a real dance cannot reach getDanceAnimationPath
// and ask the browser for an arbitrary path, and the result comes out in
// catalog order rather than purchase order, so two people who own the same
// four dances show the same four buttons in the same places.
//
// The equipped dance is folded in because it is published by a different
// mechanism (a client mirror, live since well before unlockedDances existed
// — see useEconomy.js) and so may be the ONLY dance visible on an account
// whose summary predates this field. Better one real button than an empty
// showcase for someone who demonstrably owns something.
const DANCE_IDS = STORE_ITEMS.filter((item) => item.type === 'dance').map((item) => item.id);
const BADGE_IDS = new Set(BADGES.map((b) => b.id));

function sanitizeBadges(badges) {
  return (Array.isArray(badges) ? badges : [])
    .map((b) => (typeof b === 'string' ? { id: b, at: null } : b))
    .filter((b) => b && BADGE_IDS.has(b.id))
    .map((b) => ({ id: b.id, at: typeof b.at === 'string' ? b.at : null }));
}

function sanitizeDances(unlocked, equipped) {
  const claimed = new Set(Array.isArray(unlocked) ? unlocked : []);
  if (typeof equipped === 'string') claimed.add(equipped);
  return DANCE_IDS.filter((id) => claimed.has(id));
}

// Their most recent feed post, reduced to what the Activity section on
// their profile prints: what the session was, how big, and when. The same
// things the feed card already shows every signed-in user, so nothing new
// is disclosed — but allowlisted rather than passed through all the same,
// because the post document also carries their coins, their score and
// their equipped gear, none of which that section has any use for.
function sanitizeActivity(post) {
  if (!post || typeof post !== 'object') return null;
  const sets = Number(post.totalSets);
  const kg = Number(post.totalVolume);
  return {
    headline: typeof post.headline === 'string' && post.headline ? post.headline : 'A workout',
    totalSets: Number.isFinite(sets) && sets > 0 ? sets : null,
    totalVolumeKg: Number.isFinite(kg) && kg >= 0 ? kg : null,
    at: typeof post.timestamp === 'string' ? post.timestamp : null,
    // For the name at the top of the page when someone is reached from
    // the feed or the leaderboard without being on the friends list.
    posterName: typeof post.userName === 'string' && post.userName ? post.userName : null,
  };
}

export function sanitizeFriendData(rawData) {
  const raw = rawData ?? {};

  // Tier comes from lifetimeVolume, and only the tier does. The number is
  // consumed here and deliberately not re-exported, so a caller cannot
  // render it by reaching through this object.
  //
  // Note the limit honestly: the raw figure is still in the document the
  // client fetched. If the exact number must never reach a friend's
  // device, publicProfile.js has to publish the derived stage INSTEAD of
  // the volume — a server change, not one this file can make.
  const { current, next, percent, isMaxTier } = getEvolutionProgress(Number(raw.lifetimeVolume) || 0, {
    minStage: Number(raw.minStage) || 1,
    // The ladder the server decided their tier on, published beside
    // minStage; a summary from before it was published resolves from the
    // mascot it does carry.
    scale: progressionScale(raw),
  });

  // Resolved before the fields below, several of which are gated on it:
  // a mascot with no cosmetic art of its own publishes no gear and no
  // dances (see data/mascots.js).
  const mascot = resolveMascotId(raw);

  // Absent means never shared. `isPublic !== false` rather than
  // `=== true` on purpose: today the server publishes an all-or-nothing
  // list with no per-record flag, so requiring `true` would hide every
  // record that exists. This shape accepts a future per-record opt-in
  // without pretending one is already there.
  const sharedRecords =
    raw.sharePRs === true && Array.isArray(raw.personalRecords)
      ? raw.personalRecords
          .filter((r) => r?.isPublic !== false)
          .map(sanitizeRecord)
          .filter(Boolean)
      : [];

  const routines = Array.isArray(raw.savedWorkouts) ? raw.savedWorkouts.map(sanitizeRoutine).filter(Boolean) : [];

  const latestActivity = sanitizeActivity(raw.latestPost);

  return {
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,

    // Everything the avatar needs, and nothing that identifies them.
    evolutionStage: current.stage,
    tierId: current.id,
    tierLabel: current.label,
    // Emptied for a mascot with no accessory art of its own. AccessoryLayer
    // would refuse to draw them anyway, so this is belt to that braces —
    // but it is the belt that matters for the parts of a profile that are
    // NOT the avatar: a visitor should not be offered a dance to play on
    // somebody who cannot perform it.
    // Per item: what this mascot can actually wear, and nothing else —
    // the same allowlist AccessoryLayer enforces, applied before publish.
    equippedAccessories: readEquippedAccessories(raw).filter((id) => mascotCanWear(mascot, id)),
    // Which character they are. Passed through the same resolver the owner
    // of the account uses, so a summary written before the mascot field
    // existed still lands on the right goat via its `gender` — and note
    // that neither field is published on its own: only this derived id
    // leaves here, so a friend's client learns which sprite to draw and
    // never reads their gender off the wire.
    mascot,

    // Their workout streak, and whether it is long enough to set them
    // alight. The threshold is imported rather than re-typed as `>= 2`
    // here: two files deciding independently when fire starts is how you
    // end up with a friend's goat burning on their profile and not on
    // the leaderboard.
    // Trophies, reduced to ids the registry actually knows. An award is
    // just an id and a date — it says which milestone, never the numbers
    // behind it — so nothing here needs stripping, only validating: an id
    // the catalog cannot name would render as a blank tile, and one from
    // a tampered document should not render at all.
    badges: sanitizeBadges(raw.badges),
    // Ids only, validated against the registry the same way. The reader
    // intersects these with what was actually earned, so a stale or
    // forged entry renders nothing.
    featuredBadges: (Array.isArray(raw.featuredBadges) ? raw.featuredBadges : [])
      .filter((id) => BADGE_IDS.has(id))
      .slice(0, 3),

    currentStreak: Number(raw.currentStreak) || 0,
    showFire: isOnFire(raw.currentStreak),

    // Cosmetic and published on purpose (economy.js writes it into
    // public/summary); there is no opt-out the way there is for PRs,
    // because a showcase nobody can see is not a showcase.
    unlockedDances: mascotHasDances(mascot) ? sanitizeDances(raw.unlockedDances, raw.equippedDance) : [],
    equippedDance: mascotHasDances(mascot) && DANCE_IDS.includes(raw.equippedDance) ? raw.equippedDance : null,
    // Distinguishes "owns no dances" from "their summary predates the
    // field" — the second is fixed by them logging a workout, the first
    // is not, and the two want different copy.
    // False for a mascot with no clips, which is the honest answer: the
    // showcase is not "empty pending their next workout", it does not
    // apply to them at all.
    dancesPublished: mascotHasDances(mascot) && Array.isArray(raw.unlockedDances),

    // The bar, without the numbers behind it. `percent` is a position, not
    // a measurement — you cannot read a volume back off a rounded
    // percentage without also knowing the thresholds and doing algebra,
    // and the copy never states either end.
    progressPercent: Math.round(percent),
    nextTierLabel: next?.label ?? null,
    isMaxTier,

    personalRecords: sharedRecords,
    sharesRecords: raw.sharePRs === true,
    savedRoutines: routines,

    // The body's activity section, and the one fact the rest of the page
    // keys its empty states off. "Has trained" is a post OR some volume:
    // a summary can exist with nothing behind it (setSharePRs writes one
    // for an account that toggled sharing before its first session), so
    // the document's mere presence is deliberately not the signal.
    latestActivity,
    hasActivity: latestActivity !== null || (Number(raw.lifetimeVolume) || 0) > 0,
  };
}
