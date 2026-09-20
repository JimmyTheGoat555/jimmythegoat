import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../src/index.css';
import Leaderboard from '../src/components/social/Leaderboard';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { tierCssVars } from '../src/utils/tierTheme';

// The weekly board on fixtures, without a Firestore round trip: a friends
// list of any size, with every kind of row the real one produces — friends
// who posted this week, friends with a summary but no post (0 points, on
// their real tier), friends who have never trained (no summary at all),
// and a poster the directory has not resolved yet.
//
//   ?count=14       how many friends (default 14; try 1, 0, 40)
//   ?tier=titan     the viewer's tier palette (default legend)
//   ?loading=1      the summaries still on their way
//
// Dev only — this page is never built.

const params = new URLSearchParams(location.search);
const COUNT = params.has('count') ? Number(params.get('count')) || 0 : 14;
const TIER = params.get('tier') || 'legend';
const LOADING = params.get('loading') === '1';
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

const NAMES = [
  'Dana',
  'Nadav',
  'Yael',
  'Omer',
  'Noa',
  'Itai',
  'Shira',
  'Lior',
  'Tamar',
  'Eden',
  'Roni',
  'Amit',
  'Maya',
  'Gal',
  'Ziv',
  'Neta',
  'Tom',
  'Adi',
  'Bar',
  'Ori',
];
const LIFETIMES = [120, 900, 2600, 6000];

const friends = Array.from({ length: COUNT }, (_, i) => ({
  uid: `u${i}`,
  displayName: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
}));

const summaries = {};
const feedPosts = [];
friends.forEach((friend, i) => {
  const neverTrained = i % 5 === 4;
  const gena = i % 2 === 1;
  const lifetime = LIFETIMES[i % 4];
  if (!neverTrained && !LOADING) {
    summaries[friend.uid] = {
      displayName: friend.displayName,
      lifetimeVolume: lifetime,
      minStage: 1,
      progressionScale: gena ? 0.65 : 1,
      currentStreak: i % 4,
      mascot: gena ? 'gena' : 'jimmy',
      equippedAccessories: [],
    };
  }
  const postedThisWeek = !neverTrained && i % 3 !== 2;
  if (!postedThisWeek) return;
  const sessions = 1 + (i % 3);
  for (let k = 0; k < sessions; k += 1) {
    feedPosts.push({
      id: `p${i}-${k}`,
      userId: friend.uid,
      userName: friend.displayName,
      score: 40 + ((i * 37 + k * 11) % 90),
      totalVolume: 4000,
      timestamp: hoursAgo(6 + k * 20 + i),
      currentStreak: i % 4,
      minStage: 1,
      progressionScale: gena ? 0.65 : 1,
      mascot: gena ? 'gena' : 'jimmy',
      lifetimeVolume: lifetime,
    });
  }
});
// A poster the friends directory has not resolved (no entry in `friends`).
if (COUNT > 3) {
  feedPosts.push({
    id: 'ghost',
    userId: 'ghost',
    userName: 'Ghost',
    score: 33,
    totalVolume: 2500,
    timestamp: hoursAgo(2),
  });
}

// Your own week: two sessions, so "You" lands mid-board.
const workouts = [
  { id: 'w1', finishedAt: hoursAgo(5), verified: true, score: 95, exercises: [] },
  { id: 'w2', finishedAt: hoursAgo(50), verified: true, score: 88, exercises: [] },
];

function Harness() {
  return (
    <JimmyLookProvider evolutionStage={3} account={{ mascot: 'jimmy', equippedAccessories: [] }}>
      <MemoryRouter>
        <div className="mx-auto min-h-screen max-w-md px-4 pt-6" style={tierCssVars(TIER)}>
          <h1 className="mb-3 text-lg font-bold text-neutral-100">🏆 Leaderboard</h1>
          <Leaderboard
            workouts={workouts}
            feedPosts={feedPosts}
            friends={friends}
            friendSummaries={summaries}
            summariesLoading={LOADING}
            equippedAccessories={[]}
            currentStreak={3}
            minStage={1}
            progressionScale={1}
            mascot="jimmy"
          />
          <p className="mt-6 text-center text-xs text-neutral-700">
            Content below the board, to check the page itself still scrolls.
          </p>
        </div>
      </MemoryRouter>
    </JimmyLookProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
