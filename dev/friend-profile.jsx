import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { FriendProfileScreen } from '../src/components/social/PublicFriendProfile';
import { sanitizeFriendData } from '../src/utils/friendPrivacy';
import { tierCssVars } from '../src/utils/tierTheme';

// Someone else's profile in each of its data states, without a Firestore
// round trip: the screen is rendered straight from hook-shaped fixtures
// run through the same sanitiser the real page uses.
//
//   ?state=new       brand-new account: no summary, no post (default)
//   ?state=shared    toggled PR sharing before ever training — a summary
//                    with nothing behind it
//   ?state=active    a Gena on a streak, with a badge, shared PRs and a
//                    post from this morning
//   ?state=legend    fully evolved
//   ?state=broken    undefined for everything — the crash test
//   ?tier=titan      the VIEWER's tier palette (default goat)
//
// Dev only — this page is never built.

const params = new URLSearchParams(location.search);
const STATE = params.get('state') || 'new';
const TIER = params.get('tier') || 'goat';
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

const FIXTURES = {
  new: { raw: { hasSummary: false, lifetimeVolume: 0, minStage: 1 }, name: 'Nadav' },
  shared: {
    raw: {
      hasSummary: true,
      displayName: 'Dana',
      lifetimeVolume: 0,
      sharePRs: true,
      personalRecords: [],
      mascot: 'gena',
    },
    name: 'Dana',
  },
  active: {
    raw: {
      hasSummary: true,
      displayName: 'Dana',
      lifetimeVolume: 950,
      minStage: 1,
      mascot: 'gena',
      currentStreak: 3,
      sharePRs: true,
      personalRecords: [
        { exerciseId: 'bench-press', name: 'Barbell Bench Press', weight: 62.5, reps: 5 },
        { exerciseId: 'squat', name: 'Back Squat', weight: 90, reps: 3 },
      ],
      badges: [{ id: 'bench-80kg', at: hoursAgo(72) }],
      featuredBadges: ['bench-80kg'],
      latestPost: {
        userName: 'Dana',
        headline: 'Chest & Triceps',
        totalSets: 17,
        totalVolume: 6240,
        timestamp: hoursAgo(3),
        mascot: 'gena',
      },
    },
    name: 'Dana',
  },
  legend: {
    raw: {
      hasSummary: true,
      displayName: 'Omri',
      lifetimeVolume: 9000,
      minStage: 1,
      currentStreak: 12,
      sharePRs: false,
      latestPost: { userName: 'Omri', headline: 'Legs', totalSets: 24, totalVolume: 11800, timestamp: hoursAgo(30) },
    },
    name: 'Omri',
  },
  broken: { raw: undefined, name: undefined },
};

function Harness() {
  const fixture = FIXTURES[STATE] ?? FIXTURES.new;
  const friend = fixture.raw === undefined ? undefined : sanitizeFriendData(fixture.raw);
  return (
    <div className="mx-auto max-w-md px-4" style={tierCssVars(TIER)}>
      <FriendProfileScreen
        friend={friend}
        name={fixture.name}
        onBack={() => {}}
        onSendNudge={async () => {}}
        onSaveTemplate={async () => {}}
      />
    </div>
  );
}

// One root across HMR re-runs of this entry, or React warns about a
// container that already has one and the two trees fight over the DOM.
const root = (globalThis.__friendProfileRoot ??= createRoot(document.getElementById('root')));
root.render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
