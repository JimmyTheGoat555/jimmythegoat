import { Link } from 'react-router-dom';
import { usePostLikes } from '../../hooks/useFeed';
import { STORE_ITEMS, readEquippedAccessories } from '../../data/storeItems';
import { getEvolutionProgress } from '../../utils/evolutionTiers';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { formatRecordLoad } from '../../utils/personalRecords';
import { isOnFire } from '../../utils/streak';

const ITEMS_BY_ID = new Map(STORE_ITEMS.map((item) => [item.id, item]));

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
  const dance = post.equippedDance ? ITEMS_BY_ID.get(post.equippedDance) : null;
  // Older posts predate lifetimeVolume on the feed doc; 0 just means the
  // first tier, which is a sane thing to show rather than nothing.
  const postTier = getEvolutionProgress(post.lifetimeVolume ?? 0, {
    minStage: Number(post.minStage) || 1,
  }).current;

  return (
    <div className="card p-4 flex flex-col gap-2">
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
          <span className="block h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-800">
            <JimmyAvatar
              evolutionStage={postTier.stage}
              equippedAccessories={readEquippedAccessories(post)}
              // Snapshotted on the post, like the stage above it, so an
              // old card keeps showing the run they were on at the time.
              showFire={isOnFire(post.currentStreak)}
              crop="head"
              className="h-full w-full"
            />
          </span>
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
        <span className="tabular-nums">{post.totalVolume.toLocaleString('en-US')}</span> kg
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

      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={toggleLike}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition ${
            likedByMe ? 'bg-[var(--ember)]/20 text-[var(--ember)]' : 'bg-white/10 text-neutral-300'
          }`}
        >
          <span>{likedByMe ? '🔥' : '👏'}</span> {likedByMe ? 'Cheered' : 'Cheer'}
          {count > 0 && <span className="tabular-nums">· {count}</span>}
        </button>
        <span className="text-xs text-neutral-600">🪙 +{post.coinsEarned}</span>
      </div>
    </div>
  );
}
