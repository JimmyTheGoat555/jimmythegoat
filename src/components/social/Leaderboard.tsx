import { Link } from 'react-router-dom';
import { lifetimeVolume, weeklyScore } from '../../utils/workoutStats';
import { getEvolutionProgress } from '../../utils/evolutionTiers';
import { buildBoard } from '../../utils/leaderboard';
import GradientBorder from '../shared/GradientBorder';
import JimmyAvatar from '../evolution/JimmyAvatar';
import { DEFAULT_MASCOT_ID } from '../../data/mascots';

interface FeedPost {
  userId: string;
  userName: string;
  // Relative Strength Volume for the workout — what the board ranks on.
  // Optional because feed posts written before the relative-scoring
  // deploy don't carry it; utils/leaderboard.js maps those from
  // `totalVolume` instead (see there).
  score?: number;
  // Raw kg lifted — still shown on the feed card, and the legacy
  // fallback source for `score`.
  totalVolume: number;
  timestamp: string;
  // Stamped on every post by logWorkout. Nothing renders it any more —
  // the streak aura is gone from every avatar (see JimmyAvatar) — but the
  // field is still written and still published, so the type keeps it
  // rather than pretending the data isn't there.
  currentStreak?: number;
  minStage?: number;
  // The threshold scale the poster's tier was decided with; stamped by
  // logWorkout beside minStage, absent on older posts.
  progressionScale?: number;
  lifetimeVolume?: number;
  mascot?: string;
  equippedAccessories?: string[];
  equippedAccessory?: string;
}

// A resolved friend from the friends directory (hooks/useFriendsGraph.js).
interface Friend {
  uid: string;
  displayName?: string;
}

// A friend's users/{uid}/public/summary (hooks/useFriendSummaries.js),
// or null for an account that has never written one.
type FriendSummary = Record<string, unknown> | null;

interface LeaderboardProps {
  workouts: Record<string, unknown>[];
  feedPosts: FeedPost[];
  // EVERY connected friend, so the board lists the ones who have not
  // trained this week too — at 0, where they belong.
  friends?: Friend[];
  // uid → public summary, for those friends' tier, streak and gear.
  friendSummaries?: Record<string, FriendSummary>;
  // True while the summaries are still on their way; the rows draw
  // regardless (from the feed and the directory) and fill in.
  summariesLoading?: boolean;
  // The signed-in user's own loadout — friends' gear rides along on their
  // summary or feed posts, but yours has to be handed in since neither
  // exists for you here.
  equippedAccessories?: string[];
  // Same reason: no post of yours is in this list to carry it.
  currentStreak?: number;
  minStage?: number;
  // Your own ladder — utils/evolutionTiers.js's progressionScale(account).
  progressionScale?: number;
  // And again the same reason — 'jimmy' | 'gena', see data/mascots.js.
  mascot?: string;
}

interface Rankable {
  id: string;
  username: string;
  lifetimeVolume: number;
  // This week's Relative Strength Volume — strength-to-bodyweight, so a
  // lighter lifter ranks on the same scale as a heavier friend.
  weeklyScore: number;
  isYou: boolean;
  // 2 for a coaching account (see TRAINER_MIN_STAGE).
  minStage: number;
  // 0.65 for a female account, 1 otherwise.
  progressionScale: number;
  currentStreak: number;
  // Multi-slot loadout, so the row shows the gear they're actually
  // wearing (see components/evolution/JimmyAvatar.jsx).
  equippedAccessories?: string[];
  // Which character to draw.
  mascot?: string;
}

const MEDALS = ['🥇', '🥈', '🥉'];

// Head-cropped so the equipped gear is actually legible at 36px — a
// full-body goat this small is mostly legs. JimmyAvatar owns the sprite
// fallback, so there's no broken-image state to track here any more.
function Avatar({
  tierId,
  stage,
  accessories,
  mascot,
}: {
  tierId: string;
  stage: number;
  accessories: string[];
  mascot?: string;
}) {
  return (
    <GradientBorder
      tierId={tierId}
      shape="circle"
      fillClassName="rounded-full overflow-hidden"
      glow={false}
      className="shrink-0"
    >
      <div className="h-11 w-11 bg-neutral-800">
        <JimmyAvatar
          evolutionStage={stage}
          equippedAccessories={accessories}
          mascot={mascot}
          crop="head"
          className="h-full w-full"
        />
      </div>
    </GradientBorder>
  );
}

function AvatarRow({ entry, rank }: { entry: Rankable; rank: number }) {
  const { current } = getEvolutionProgress(entry.lifetimeVolume, {
    minStage: entry.minStage ?? 1,
    scale: entry.progressionScale ?? 1,
  });

  const row = (
    <div className="card flex items-center gap-3.5 p-5">
      <span className="w-7 text-center text-xl font-bold text-neutral-500">{MEDALS[rank] ?? `#${rank + 1}`}</span>
      <Avatar
        tierId={current.id}
        stage={current.stage}
        accessories={entry.equippedAccessories ?? []}
        mascot={entry.mascot}
      />
      <div className="flex-1 min-w-0">
        <p className="text-lg font-bold text-neutral-100 truncate">{entry.isYou ? 'You' : entry.username}</p>
        <p className="text-sm text-neutral-500">{current.label}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xl font-bold text-neutral-100 tabular-nums">
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
  // it comes straight off the friends list or their feed post — and every
  // non-you row is a friend by construction (see utils/leaderboard.js).
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
      role="listitem"
    >
      {bordered}
    </Link>
  );
}

// Purely a ranking display — following/unfollowing friends lives in
// FriendManagementModal, and the feed itself (SocialFeed.jsx) is the real
// "see what friends are up to" surface; this is the at-a-glance "where do
// I stand this week" list. Ranked on Relative Strength Volume so
// bodyweight matters, not raw tonnage — and every connected friend is on
// it, in a scroll window, so the list never has to be cut.
export default function Leaderboard({
  workouts,
  feedPosts,
  friends = [],
  friendSummaries = {},
  summariesLoading = false,
  equippedAccessories = [],
  currentStreak = 0,
  minStage = 1,
  progressionScale = 1,
  // Your own mascot, passed down from SocialPage rather than read from
  // JimmyLook here: every other row on this board belongs to somebody
  // else, and a component that could reach for "the current user" would
  // turn a forgotten prop into everyone wearing your goat.
  mascot = DEFAULT_MASCOT_ID,
}: LeaderboardProps) {
  const you: Rankable = {
    id: 'me',
    username: 'You',
    equippedAccessories,
    currentStreak,
    minStage,
    progressionScale,
    mascot,
    lifetimeVolume: lifetimeVolume(workouts),
    weeklyScore: weeklyScore(workouts),
    isYou: true,
  };

  // The whole board, in order — no cut, so the rank IS the index.
  const rows: Rankable[] = buildBoard({ you, friends, summaries: friendSummaries, feedPosts });
  const friendCount = rows.length - 1;

  return (
    <div className="flex flex-col gap-2">
      {/* A scroll window rather than the page: the list can be as long as
          the friends list now, and the tabs and the header above it should
          stay put while it is scrolled. Capped to the viewport so it never
          overshoots the screen and puts two scrollbars under one thumb.
          The bar itself is hidden (the fade at the foot says "more
          below"), and overscroll-contain keeps a flick at the end of the
          list from dragging the page with it. The horizontal padding is
          for your own row's glow, which a scroll container would
          otherwise clip at the edges. */}
      <div
        role="list"
        aria-label="Weekly leaderboard"
        data-testid="leaderboard-scroll"
        className="fade-bottom scrollbar-none -mx-1.5 max-h-[min(65dvh,600px)] overflow-y-auto overscroll-contain px-1.5 pb-6 pt-1"
      >
        <div className="flex flex-col gap-2.5">
          {rows.map((entry, rank) => (
            <AvatarRow key={entry.id} entry={entry} rank={rank} />
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-neutral-600">
        {friendCount === 0
          ? 'Add friends to see where you stand.'
          : `${summariesLoading ? 'Loading' : 'You and'} ${friendCount} friend${friendCount === 1 ? '' : 's'}${
              summariesLoading ? '…' : ' · ranked by points this week'
            }`}
      </p>
    </div>
  );
}
