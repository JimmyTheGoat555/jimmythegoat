import { usePostLikes } from '../../hooks/useFeed';
import { STORE_ITEMS } from '../../data/storeItems';

const ITEMS_BY_ID = new Map(STORE_ITEMS.map((item) => [item.id, item]));

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
  const accessory = post.equippedAccessory ? ITEMS_BY_ID.get(post.equippedAccessory) : null;

  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-lg">
          {accessory?.emoji ?? '🐐'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-100 truncate">{post.userName}</p>
          <p className="text-xs text-neutral-500">{relativeTime(post.timestamp)}</p>
        </div>
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
              <span className="tabular-nums">{pr.weight}</span> kg × {pr.reps}
              <span className="text-amber-200/60"> (was {pr.previousWeight} kg)</span>
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
