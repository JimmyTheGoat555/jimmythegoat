import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import FounderConsole from '../src/components/admin/FounderConsole';
import { tierCssVars } from '../src/utils/tierTheme';
import { getEvolutionProgress, progressionScale } from '../src/utils/evolutionTiers';

// The Founder Console on a fixture payload — the shape adminAnalytics.js
// returns — with the three operations faked, so every tab can be looked
// at without an admin session or a deployed function.
//
//   ?tab=economy|operations   which tab to open on
//   ?loading=1                the skeleton state
//   ?error=1                  the "not an admin" state
//   ?fail=1                   every operation rejects
//
// Dev only — this page is never built.
const params = new URLSearchParams(location.search);
const TAB = params.get('tab') || 'analytics';
const LOADING = params.get('loading') === '1';
const ERROR = params.get('error') === '1';
const FAIL = params.get('fail') === '1';

const now = Date.now();
const ago = (days) => new Date(now - days * 86400000).toISOString();
const people = [
  ['Reef', 'reef@example.com', 'jimmy', 4, 212, 9800, 6, 1380, 0],
  ['Dana', 'dana@example.com', 'gena', 3, 96, 2100, 3, 640, 1],
  ['Omri', 'omri@example.com', 'jimmy', 3, 88, 2400, 0, 90, 12],
  ['Noa', 'noa@example.com', 'gena', 2, 31, 480, 2, 310, 2],
  ['Tal', 'tal@example.com', 'jimmy', 2, 27, 610, 0, 45, 21],
  ['Maya', 'maya@example.com', 'gena', 1, 6, 150, 0, 120, 30],
];
const TIERS = { 1: 'Goat', 2: 'Buff Goat', 3: 'Titan Goat', 4: 'Legendary G.O.A.T.' };
const powerUsers = people.map(([name, email, mascot, stage, workouts, volume, streak, coins, dormant], i) => ({
  uid: `uid-${i}`,
  displayName: name,
  email,
  role: i === 2 ? 'trainer' : 'lifter',
  workouts,
  volume,
  currentStreak: streak,
  coins,
  lastWorkoutAt: ago(dormant),
  dormantDays: dormant,
  tier: TIERS[stage],
  stage,
  mascot,
  emailVerified: i % 2 === 0,
  disabled: false,
  createdAt: ago(200 - i * 20),
  lastSignInAt: ago(Math.min(dormant, 3)),
  friends: 5 - (i % 3),
  badges: 4,
  sharePRs: i !== 2,
  hasTrainer: i === 3,
}));

const DATA = {
  generatedAt: new Date(now - 4 * 60000).toISOString(),
  sortBy: 'workouts',
  totals: {
    users: 48,
    userDocs: 51,
    orphanedDocs: 3,
    coins: 21860,
    workouts: 1412,
    feedPosts: 1180,
    activeLast7Days: 23,
    newLast7Days: 4,
    signedInLast7Days: 31,
    emailVerified: 19,
    disabled: 0,
    onStreak: 11,
    neverTrained: 9,
    trainers: 2,
    withTrainer: 6,
    sharingPRs: 30,
    totalVolume: 31240,
    byStage: [
      { stage: 1, count: 21 },
      { stage: 2, count: 16 },
      { stage: 3, count: 9 },
      { stage: 4, count: 2 },
    ],
  },
  errors: {},
  pulse: { activeLastHour: 3, activeLastDay: 9, activeLast30Days: 34, dauMau: 0.26 },
  engagement: {
    avgWorkoutsPerWeek: 2.4,
    avgWorkoutDurationMin: 52,
    sampleSize: 300,
    topExercises: [
      { id: 'bench-press', name: 'Bench Press', sessions: 188 },
      { id: 'squat', name: 'Squat', sessions: 151 },
      { id: 'lat-pulldown', name: 'Lat Pulldown', sessions: 137 },
      { id: 'hip-thrust', name: 'Hip Thrust', sessions: 94 },
      { id: 'deadlift', name: 'Deadlift', sessions: 88 },
    ],
  },
  economy: {
    coinsEarned: 64120,
    coinsSpent: 18450,
    coinsInCirculation: 21860,
    topShopItems: [
      { id: 'accessory-shades', name: 'Shades', emoji: '🕶️', cost: 250, owners: 19 },
      { id: 'dance-shuffle', name: 'The Shuffle', emoji: '🕺', cost: 600, owners: 14 },
      { id: 'accessory-cap', name: 'Ball Cap', emoji: '🧢', cost: 150, owners: 12 },
      { id: 'accessory-gena-pink', name: 'Pink Set', emoji: '🎀', cost: 900, owners: 7 },
      { id: 'dance-victory', name: 'Victory Lap', emoji: '🏆', cost: 1100, owners: 4 },
    ],
  },
  gamification: {
    mascotSplit: { jimmy: 31, gena: 17 },
    avgStageByMascot: [
      { mascot: 'jimmy', count: 31, trained: 26, avgStage: 1.9, avgStageTrained: 2.15 },
      { mascot: 'gena', count: 17, trained: 13, avgStage: 1.82, avgStageTrained: 2.08 },
    ],
    dropOff: [
      { stage: 1, lifters: 12, dormant: 7, rate: 0.58 },
      { stage: 2, lifters: 16, dormant: 5, rate: 0.31 },
      { stage: 3, lifters: 9, dormant: 1, rate: 0.11 },
      { stage: 4, lifters: 2, dormant: 0, rate: 0 },
    ],
    dormantDays: 14,
  },
  virality: null,
  coaching: null,
  powerUsers,
  scanned: 51,
  truncated: false,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The accounts the targeted module can find — the same six people, held
// mutable so a fake coin or tier change shows up on the next dossier.
const directory = people.map(([name, email, mascot, stage, workouts, volume, streak, coins, dormant], i) => ({
  uid: `uid-${i}`,
  displayName: name,
  email,
  mascot,
  gender: mascot === 'gena' ? 'female' : 'male',
  role: i === 2 ? 'trainer' : 'lifter',
  coins,
  volume,
  workouts,
  streak,
  stage,
  lastWorkoutAt: ago(dormant),
  createdAt: ago(200 - i * 20),
  badges: Array.from({ length: 4 }, (_, n) => ({ id: `badge-${n}`, at: ago(30) })),
  messages: [],
  lastAdminGrant: null,
}));
const byUid = (uid) => {
  const u = directory.find((d) => d.uid === uid);
  if (!u) throw new Error(`No account with id ${uid}.`);
  return u;
};
const dossierOf = (u) => {
  const scale = progressionScale(u);
  const minStage = u.role === 'trainer' ? 2 : 1;
  const { current } = getEvolutionProgress(u.volume, { minStage, scale });
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    gender: u.gender,
    mascot: u.mascot,
    mascotExplicit: u.uid === 'uid-1' ? null : u.mascot,
    coins: u.coins,
    badgeCount: u.badges.length,
    createdAt: u.createdAt,
    lastWorkoutAt: u.lastWorkoutAt,
    workoutCount: u.workouts,
    currentStreak: u.streak,
    volume: u.volume,
    recordsVolume: u.uid === 'uid-4' ? u.volume + 40 : u.volume,
    summaryVolume: Math.round(u.volume),
    scale,
    minStage,
    stage: current.stage,
    tier: current.label,
    auth: u.uid === 'uid-5' ? null : { emailVerified: u.uid !== 'uid-3', disabled: false, lastSignInAt: ago(1) },
    lastMessage: u.messages[0] ?? null,
    lastAdminGrant: u.lastAdminGrant,
  };
};

function Harness() {
  const [sortBy, setSortBy] = useState('workouts');
  const [busy, setBusy] = useState(null);
  const rows = [...powerUsers].sort((a, b) => (sortBy === 'volume' ? b.volume - a.volume : b.workouts - a.workouts));
  const analytics = {
    data: LOADING || ERROR ? null : { ...DATA, sortBy, powerUsers: rows },
    loading: LOADING,
    error: ERROR ? 'This account is not an admin.' : null,
    reload: () => {},
    sortBy,
    setSortBy,
  };
  const fake = (name, reply) => async (payload) => {
    setBusy(name);
    await wait(600);
    setBusy(null);
    if (FAIL) throw new Error('That operation is not deployed yet — deploy functions and try again.');
    return reply(payload);
  };
  const ops = {
    busy,
    setAnnouncement: fake('adminSetAnnouncement', (p) => ({ ...p, id: String(Date.now()) })),
    grantCoins: fake('adminGrantCoins', (p) => ({
      accounts: p.target === 'all' ? 48 : 1,
      coins: p.coins,
      displayName: 'Dana',
    })),
    grantXp: fake('adminGrantXp', (p) => ({
      accounts: p.target === 'all' ? 48 : 1,
      points: p.points,
      displayName: 'Dana',
    })),
    findUsers: fake('adminFindUsers', (term) => {
      const t = term.toLowerCase();
      return {
        results: directory
          .filter((u) => u.uid === term || u.displayName.toLowerCase().includes(t))
          .map((u) => ({
            uid: u.uid,
            displayName: u.displayName,
            mascot: u.mascot,
            gender: u.gender,
            role: u.role,
            coins: u.coins,
          })),
      };
    }),
    userProfile: fake('adminUserProfile', (uid) => dossierOf(byUid(uid))),
    messageUser: fake('adminMessageUser', ({ uid, title, body }) => {
      const u = byUid(uid);
      const m = { id: String(Date.now()), title, body, createdAt: new Date().toISOString(), readAt: null };
      u.messages.unshift(m);
      return { id: m.id, displayName: u.displayName, createdAt: m.createdAt };
    }),
    adjustCoins: fake('adminAdjustCoins', ({ uid, delta, note }) => {
      const u = byUid(uid);
      const before = u.coins;
      u.coins = Math.max(0, before + delta);
      u.lastAdminGrant = { coins: u.coins - before, note, at: new Date().toISOString() };
      return { before, after: u.coins, applied: u.coins - before, displayName: u.displayName };
    }),
    shiftEvolution: fake('adminShiftEvolution', ({ uid, direction }) => {
      const u = byUid(uid);
      const d = dossierOf(u);
      const target = d.stage + direction;
      if (target > 4) throw new Error(`${u.displayName} is already at the top tier.`);
      if (target < d.minStage)
        throw new Error('A coach is drawn from Buff Goat up — there is no lower tier for this account.');
      const thresholds = [0, 400, 2000, 5000];
      const volumeAfter = thresholds[target - 1] * d.scale + 1;
      const out = {
        displayName: u.displayName,
        from: { stage: d.stage, label: d.tier },
        to: { stage: target, label: ['Goat', 'Buff Goat', 'Titan Goat', 'Legendary G.O.A.T.'][target - 1] },
        volumeBefore: u.volume,
        volumeAfter,
        delta: Math.round((volumeAfter - u.volume) * 100) / 100,
        adjustmentId: 'fake',
      };
      u.volume = volumeAfter;
      return out;
    }),
    setMascot: fake('adminSetMascot', ({ uid, mascot }) => {
      const u = byUid(uid);
      const before = dossierOf(u);
      u.mascot = mascot;
      const after = dossierOf(u);
      return {
        displayName: u.displayName,
        mascot,
        before: { mascot: before.mascot, scale: before.scale, stage: before.stage, tier: before.tier },
        after: { mascot, scale: after.scale, stage: after.stage, tier: after.tier },
        postsUpdated: u.workouts,
        summaryUpdated: true,
        newBadges: mascot === 'gena' ? ['peach-builder-10'] : [],
      };
    }),
  };
  return (
    <div className="mx-auto max-w-5xl px-4" style={tierCssVars('titan')}>
      <FounderConsole analytics={analytics} ops={ops} initialTab={TAB} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
