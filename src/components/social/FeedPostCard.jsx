import { Link } from 'react-router-dom';
import { usePostLikes } from '../../hooks/useFeed';
import { STORE_ITEMS, readEquippedAccessories } from '../../data/storeItems';
import { getEvolutionProgress } from '../../utils/evolutionTiers';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { mascotHasDances, resolveMascotId } from '../../data/mascots';
import GradientBorder from '../shared/GradientBorder';
import { formatRecordLoad } from '../../utils/personalRecords';

const ITEMS_BY_ID = new Map(STORE_ITEMS.map((item) => [item.id, item]));

// How heavy a session was, expressed as how loud its card is.
//
// Thresholds are in raw kg, which is the number ON the card — deliberately
// not the relative score the leaderboard ranks on. This is decoration, and
// decoration should agree with the figure the reader can see. A quiet card
// is the default; the glow is for the session that made you put the phone
// down, and it stays rare enough to mean something.
//
// Applied as INLINE STYLE, not Tailwind border classes, and that is not a
// shortcut: `.card` (index.css) already declares `border: 2px solid
// var(--tier-accent)` from an unlayered rule, which beats every layered
// utility Tailwind emits — a `border-amber-400/40` here is silently
// nothing. Recolouring the border the card already has also keeps the
// arcade silhouette intact instead of drawing a second edge inside it.
//
// The glow is a `filter: drop-shadow`, not a box-shadow, for a related
// reason: `.card` is clip-path'd with cut corners, and a box-shadow is
// clipped away with everything else outside that polygon. A filter runs
// on the clipped result, so the glow traces the notched shape.
const HEAVY_KG = 8000;
const SOLID_KG = 3000;

function volumeStyle(kg) {
  if (kg >= HEAVY_KG) {
    return {
      style: {
        borderColor: 'rgba(251,191,36,0.95)',
        filter: 'drop-shadow(0 0 14px rgba(251,191,36,0.35))',
      },
      tag: 'text-amber-300',
      label: 'Heavy session',
    };
  }
  // Mid-weight keeps the card's own tier accent — the default IS a state,
  // and overriding it here would leave nothing for the quiet end to be
  // quieter than.
  if (kg >= SOLID_KG) return { style: undefined, tag: 'text-[var(--ember)]', label: null };
  return { style: { borderColor: 'rgba(255,255,255,0.12)' }, tag: 'text-neutral-400', label: null };
}

// The record this one beat, in the same units the new one is shown in.
// Returns null when there is nothing worth printing.
function previousLoad(pr) {
  if (pr.isBodyweight === true || pr.previousWeight === undefined) {
    const prev = Number(pr.previousAddedWeight);
    return Number.isFinite(prev) && prev > 0 ? `BW +${prev} kg` : null;
  }
  return `${pr.previousWeight} kg`;
}

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// One card per feedPosts doc — see functions/economy.js (the only writer)
// and firestore.rules' feedPosts match. `equippedDance`/`equippedAccessory`
// on the post are a SNAPSHOT of what the poster had on at the moment they
// logged this specific workout, not a live view of their current profile
// — see the comment in logWorkout() for why that's the deliberate choice
// (shows what they were "wearing" for that workout, and needs no read
// access to their otherwise-private full profile doc to render).
export default function FeedPostCard({ post, myUid }) {
  const { count, likedByMe, toggleLike } = usePostLikes(post.id, myUid);
  // Resolved once and used for both the avatar below and the dance emoji:
  // a mascot with no clips of its own does not advertise one on its posts
  // either, the same way its gear is not drawn.
  const mascot = resolveMascotId(post);
  const dance =
    post.equippedDance && mascotHasDances(mascot) ? ITEMS_BY_ID.get(post.equippedDance) : null;
  // Older posts predate lifetimeVolume on the feed doc; 0 just means the
  // first tier, which is a sane thing to show rather than nothing.
  const postTier = getEvolutionProgress(post.lifetimeVolume ?? 0, {
    minStage: Number(post.minStage) || 1,
  }).current;
  const heat = volumeStyle(Number(post.totalVolume) || 0);

  return (
    <div className="card p-4 flex flex-col gap-2" style={heat.style}>
      <div className="flex items-center gap-2">
        {/* The poster as they actually look — head-cropped so the gear
            reads at 40px. Stage comes from the volume the post itself
            carries, so an old post keeps showing who they were then. */}
        {/* Avatar and name open that person's profile. One Link around
            both rather than two, so the whole identity block is a single
            target — at 40px an avatar alone is an awkward tap on a phone.
            The timestamp rides inside it too; it is part of the same
            block and excluding it would leave a dead strip in the middle
            of the tap area.

            Your own post goes to /profile instead of the public view of
            yourself, matching the leaderboard's "You" row. */}
        <Link
          to={post.userId === myUid ? '/profile' : `/friends/${post.userId}`}
          aria-label={`Open ${post.userId === myUid ? 'your' : `${post.userName}'s`} profile`}
          className="flex min-w-0 flex-1 items-center gap-2 transition-transform duration-150 active:scale-[0.98]"
        >
          {/* Ringed in the poster's own tier gradient — the same
              treatment the leaderboard gives its rows, so a face means the
              same thing on both screens and the avatar stops disappearing
              into the card. */}
          <GradientBorder
            tierId={postTier.id}
            shape="circle"
            fillClassName="rounded-full overflow-hidden"
            glow={false}
            className="shrink-0"
          >
            <span className="block h-11 w-11 bg-neutral-800">
              <JimmyAvatar
                evolutionStage={postTier.stage}
                equippedAccessories={readEquippedAccessories(post)}
                // Snapshotted on the post, like the stage above it, so an
                // old card keeps showing the run they were on at the time.
                streak={post.currentStreak}
                // Likewise: which character they were posting as. Posts
                // from before the field existed resolve to Jimmy, which is
                // what they showed at the time.
                mascot={mascot}
                crop="head"
                className="h-full w-full"
              />
            </span>
          </GradientBorder>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-neutral-100">{post.userName}</span>
            <span className="block text-xs text-neutral-500">{relativeTime(post.timestamp)}</span>
          </span>
        </Link>
        {dance && (
          <span className="text-xl" title={dance.name}>
            {dance.emoji}
          </span>
        )}
      </div>

      <p className="text-base text-neutral-200">
        {post.headline} · <span className="tabular-nums">{post.totalSets}</span> sets ·{' '}
        <span className={`font-semibold tabular-nums ${heat.tag}`}>
          {post.totalVolume.toLocaleString('en-US')} kg
        </span>
        {heat.label && (
          <span className="ml-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
            {heat.label}
          </span>
        )}
      </p>

      {/* Only present when they chose to share it — the server writes an
          empty array otherwise, and posts from before this feature have no
          field at all, hence the ?? []. */}
      {(post.personalRecords ?? []).length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 flex flex-col gap-0.5">
          {post.personalRecords.map((pr) => (
            <p key={pr.exerciseId} className="text-xs text-amber-200">
              🏆 <span className="font-semibold">New PR — {pr.name}:</span>{' '}
              <span className="tabular-nums">{formatRecordLoad(pr)}</span> × {pr.reps}
              {/* Omitted when there is nothing to compare against. A
                  bodyweight PR publishes no absolute load, so its "was" is
                  the previous BELT figure — and a first-ever bodyweight PR
                  with no belt on either side has no meaningful previous at
                  all, where this used to print "(was undefined kg)". */}
              {previousLoad(pr) && <span className="text-amber-200/60"> (was {previousLoad(pr)})</span>}
            </p>
          ))}
        </div>
      )}

      {/* Reward on the left, the one thing you can DO on the right — the
          corner a thumb rests in, and the same corner on every card in the
          feed, so cheering never becomes a hunt. */}
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className="text-xs text-neutral-600">🪙 +{post.coinsEarned}</span>
        <button
          type="button"
          onClick={toggleLike}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition active:scale-95 ${
            likedByMe ? 'bg-[var(--ember)]/20 text-[var(--ember)]' : 'bg-white/10 text-neutral-300'
          }`}
        >
          <span>{likedByMe ? '🔥' : '👏'}</span> {likedByMe ? 'Cheered' : 'Cheer'}
          {count > 0 && <span className="tabular-nums">· {count}</span>}
        </button>
      </div>
    </div>
  );
}
