import { Link } from 'react-router-dom';
import { lifetimeVolume, weeklyScore } from '../../utils/workoutStats';
import { getEvolutionProgress } from '../../utils/evolutionTiers';
import GradientBorder from '../shared/GradientBorder';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { readEquippedAccessories } from '../../data/storeItems';
import { isOnFire } from '../../utils/streak';

interface FeedPost {
  userId: string;
  userName: string;
  // Relative Strength Volume for the workout — what the board ranks on.
  // Optional because feed posts written before the relative-scoring
  // deploy don't carry it; weeklyFriendTotals() maps those from
  // `totalVolume` instead (see there).
  score?: number;
  // Raw kg lifted — still shown on the feed card, and the legacy
  // fallback source for `score`.
  totalVolume: number;
  timestamp: string;
  // Stamped on every post by logWorkout. Optional: posts written before
  // the streak deploy don't carry it, and those simply don't burn.
  currentStreak?: number;
  minStage?: number;
}

interface LeaderboardProps {
  workouts: Record<string, unknown>[];
  feedPosts: FeedPost[];
  // The signed-in user's own loadout — friends' gear rides along on their
  // feed posts, but yours has to be handed in since you have no post here.
  equippedAccessories?: string[];
  // Same reason: no post of yours is in this list to carry it.
  currentStreak?: number;
  minStage?: number;
}

interface Rankable {
  id: string;
  username: string;
  lifetimeVolume: number;
  // This week's Relative Strength Volume — strength-to-bodyweight, so a
  // lighter lifter ranks on the same scale as a heavier friend.
  weeklyScore: number;
  isYou: boolean;
  // 2 for a coaching account (see TRAINER_MIN_STAGE); rides on the post.
  minStage: number;
  // Longest-lived value wins across the week's posts, so the row shows
  // the run they are actually on rather than whatever the oldest post in
  // the window happened to say.
  currentStreak: number;
  // Multi-slot loadout, so the row shows the gear they're actually
  // wearing (see components/evolution/JimmyAvatar.jsx).
  equippedAccessories?: string[];
}

const MEDALS = ['🥇', '🥈', '🥉'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Divisor for feed posts written before per-workout `score` existed —
// map their raw kg onto the relative scale against an average lifter, the
// same 75 kg constant src/utils/workoutStats.js's workoutScore() uses for
// legacy workouts. Keeps the board sane on deploy day; every post from
// then on carries a real `score` and this branch stops mattering within a
// week as the rolling window clears the old ones.
const LEGACY_BODYWEIGHT_KG = 75;

function postScore(post: FeedPost): number {
  if (typeof post.score === 'number' && Number.isFinite(post.score)) return post.score;
  return (Number(post.totalVolume) || 0) / LEGACY_BODYWEIGHT_KG;
}

// Derives each FOLLOWED friend's weekly ranking number from their own
// recent feed posts (see hooks/useFeed.js) rather than a live query
// against their private workout history — a friend's users/{uid}/workouts
// subcollection is only readable by its owner or a connected trainer (see
// firestore.rules), and extending that to "anyone following you" would
// mean broadening read access to real per-set data for a leaderboard
// number. Feed posts already carry exactly the summary this needs
// (userName, score, timestamp) and are universally readable by design, so
// this is the same data a friend would see in their own feed, just
// re-aggregated. A friend with no posts in the last 7 days simply doesn't
// show up here — same as them having 0 this week.
function weeklyFriendTotals(feedPosts: FeedPost[]): Rankable[] {
  const cutoff = Date.now() - WEEK_MS;
  const totals = new Map<string, Rankable>();
  for (const post of feedPosts) {
    if (new Date(post.timestamp).getTime() < cutoff) continue;
    const value = postScore(post);
    const existing = totals.get(post.userId);
    if (existing) {
      existing.weeklyScore += value;
      existing.currentStreak = Math.max(existing.currentStreak, Number(post.currentStreak) || 0);
    } else {
      // logWorkout now stamps the poster's running lifetime total onto
      // each feed post, so a friend's tier no longer has to default to the
      // base one here. Older posts predate that field and fall back to 0,
      // which still just means "base tier" — cosmetic either way, nothing
      // security- or economy-relevant reads it.
      totals.set(post.userId, {
        id: post.userId,
        username: post.userName,
        lifetimeVolume: post.lifetimeVolume ?? 0,
        weeklyScore: value,
        isYou: false,
        minStage: Number(post.minStage) || 1,
        currentStreak: Number(post.currentStreak) || 0,
        equippedAccessories: readEquippedAccessories(post),
      });
    }
  }
  return [...totals.values()];
}

// Head-cropped so the equipped gear is actually legible at 36px — a
// full-body goat this small is mostly legs. JimmyAvatar owns the sprite
// fallback, so there's no broken-image state to track here any more.
function Avatar({ tierId, stage, accessories, showFire }: { tierId: string; stage: number; accessories: string[]; showFire: boolean }) {
  return (
    <GradientBorder tierId={tierId} shape="circle" fillClassName="rounded-full overflow-hidden" glow={false} className="shrink-0">
      <div className="h-9 w-9 bg-neutral-800">
        <JimmyAvatar evolutionStage={stage} equippedAccessories={accessories} showFire={showFire} crop="head" className="h-full w-full" />
      </div>
    </GradientBorder>
  );
}

function AvatarRow({ entry, rank }: { entry: Rankable; rank: number }) {
  const { current } = getEvolutionProgress(entry.lifetimeVolume, { minStage: entry.minStage ?? 1 });

  const row = (
    <div className="card flex items-center gap-3 p-4">
      <span className="w-6 text-center text-lg font-semibold text-neutral-500">
        {MEDALS[rank] ?? `#${rank + 1}`}
      </span>
      <Avatar
        tierId={current.id}
        stage={current.stage}
        accessories={entry.equippedAccessories ?? []}
        showFire={isOnFire(entry.currentStreak)}
      />
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-neutral-100 truncate">
          {entry.isYou ? 'You' : entry.username}
        </p>
        <p className="text-sm text-neutral-500">{current.label}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-base font-semibold text-neutral-100 tabular-nums">
          {Math.round(entry.weeklyScore).toLocaleString('en-US')}
        </p>
        <p className="text-xs text-neutral-500">pts this wk</p>
      </div>
    </div>
  );

  // Your own row gets the tier-gradient glow border — everyone else stays
  // plain glass so your spot on the board actually pops.
  const bordered = entry.isYou ? (
    <GradientBorder tierId={current.id} fillClassName="" glow>
      {row}
    </GradientBorder>
  ) : (
    row
  );

  // Every row opens that person's profile. A friend's `id` IS their uid —
  // it comes straight off their feed post — and every non-you row is a
  // friend by construction, since the posts this board aggregates are only
  // ever fetched for uids in your own friends list (useFeed).
  //
  // No chevron or other affordance: the right-hand side already carries
  // the score, and a whole tappable row is the convention the rest of the
  // app's lists already use (FriendsManager, the feed). The press scale is
  // the feedback instead.
  //
  // Scale only, no focus ring: `.card` is a clip-path'd arcade shape with
  // no border-radius, so any ring would trace a plain rectangle floating
  // around its cut corners. Keyboard focus still lands on the link itself,
  // which the browser outlines.
  return (
    <Link
      to={entry.isYou ? '/profile' : `/friends/${entry.id}`}
      aria-label={entry.isYou ? 'Open your profile' : `Open ${entry.username}'s profile`}
      className="block transition-transform duration-150 active:scale-[0.99]"
    >
      {bordered}
    </Link>
  );
}

// Purely a ranking display now — following/unfollowing friends moved to
// FollowManager.jsx, and the feed itself (SocialFeed.jsx) is the real
// "see what friends are up to" surface; this card is just the at-a-glance
// "where do I stand this week" number. Ranked on Relative Strength Volume
// so bodyweight matters, not raw tonnage.
export default function Leaderboard({
  workouts,
  feedPosts,
  equippedAccessories = [],
  currentStreak = 0,
  minStage = 1,
}: LeaderboardProps) {
  const you: Rankable = {
    id: 'me',
    username: 'You',
    equippedAccessories,
    currentStreak,
    minStage,
    lifetimeVolume: lifetimeVolume(workouts),
    weeklyScore: weeklyScore(workouts),
    isYou: true,
  };

  const ranked: Rankable[] = [you, ...weeklyFriendTotals(feedPosts)].sort(
    (a, b) => b.weeklyScore - a.weeklyScore,
  );

  return (
    <div className="flex flex-col gap-2">
      {ranked.map((entry, index) => (
        <AvatarRow key={entry.id} entry={entry} rank={index} />
      ))}
    </div>
  );
}
