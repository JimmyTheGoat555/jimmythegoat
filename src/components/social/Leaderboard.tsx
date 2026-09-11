import { useState } from 'react';
import { lifetimeVolume, weeklyScore } from '../../utils/workoutStats';
import { getEvolutionProgress } from '../../utils/evolutionTiers';
import GradientBorder from '../shared/GradientBorder';

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
}

interface LeaderboardProps {
  workouts: Record<string, unknown>[];
  feedPosts: FeedPost[];
}

interface Rankable {
  id: string;
  username: string;
  lifetimeVolume: number;
  // This week's Relative Strength Volume — strength-to-bodyweight, so a
  // lighter lifter ranks on the same scale as a heavier friend.
  weeklyScore: number;
  isYou: boolean;
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
    } else {
      // No cheap way to know a friend's LIFETIME volume from feed posts
      // alone (that would need their full history) — left at 0, which
      // just means their tier badge here defaults to the base "Goat"
      // rather than reflecting their real evolution progress. A cosmetic
      // approximation only; nothing security- or economy-relevant reads
      // this value.
      totals.set(post.userId, {
        id: post.userId,
        username: post.userName,
        lifetimeVolume: 0,
        weeklyScore: value,
        isYou: false,
      });
    }
  }
  return [...totals.values()];
}

function Avatar({ tierId, emoji, image }: { tierId: string; emoji: string; image: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xl">
        {emoji}
      </span>
    );
  }
  return (
    <GradientBorder tierId={tierId} shape="circle" fillClassName="rounded-full overflow-hidden" glow={false} className="shrink-0">
      <img src={image} alt="" onError={() => setBroken(true)} className="h-9 w-9 object-cover object-top bg-neutral-800" />
    </GradientBorder>
  );
}

function AvatarRow({ entry, rank }: { entry: Rankable; rank: number }) {
  const { current } = getEvolutionProgress(entry.lifetimeVolume);

  const row = (
    <div className="card flex items-center gap-3 p-4">
      <span className="w-6 text-center text-lg font-semibold text-neutral-500">
        {MEDALS[rank] ?? `#${rank + 1}`}
      </span>
      {entry.isYou ? (
        <Avatar tierId={current.id} emoji={current.emoji} image={current.image} />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xl">
          {current.emoji}
        </span>
      )}
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
  return entry.isYou ? (
    <GradientBorder tierId={current.id} fillClassName="" glow>
      {row}
    </GradientBorder>
  ) : (
    row
  );
}

// Purely a ranking display now — following/unfollowing friends moved to
// FollowManager.jsx, and the feed itself (SocialFeed.jsx) is the real
// "see what friends are up to" surface; this card is just the at-a-glance
// "where do I stand this week" number. Ranked on Relative Strength Volume
// so bodyweight matters, not raw tonnage.
export default function Leaderboard({ workouts, feedPosts }: LeaderboardProps) {
  const you: Rankable = {
    id: 'me',
    username: 'You',
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
