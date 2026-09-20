// The weekly leaderboard's ranking, checked in plain Node:
//
//   node --test tools/leaderboard.test.mjs
//
// Loads the client's utils/leaderboard.js, which is the ordering the
// Social tab draws. The things worth pinning: every connected friend is
// on the board whether or not they trained this week; points this week
// decide the order; level and lifetime points break the ties; and a
// friend's public summary wins over their posts for everything but the
// points. Nothing here touches Firebase.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { buildBoard, compareRank, weeklyTotals, postScore, stageOf } = await import('../src/utils/leaderboard.js');
const { EVOLUTION_TIERS } = await import('../src/utils/evolutionTiers.js');

const NOW = Date.parse('2026-09-19T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();
const you = {
  id: 'me',
  username: 'You',
  isYou: true,
  lifetimeVolume: 1000,
  weeklyScore: 120,
  minStage: 1,
  progressionScale: 1,
};
// Tier thresholds, so the fixtures land on known stages.
const [goat, buff, titan] = EVOLUTION_TIERS;

test('every connected friend is on the board, trained this week or not', () => {
  const friends = [
    { uid: 'a', displayName: 'Ana' },
    { uid: 'b', displayName: 'Ben' },
    { uid: 'c', displayName: 'Cal' },
  ];
  const feedPosts = [{ id: 'p1', userId: 'a', userName: 'Ana', score: 80, totalVolume: 6000, timestamp: hoursAgo(10) }];
  const rows = buildBoard({ you, friends, summaries: {}, feedPosts, now: NOW });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['me', 'a', 'b', 'c'],
  );
  assert.equal(rows.find((r) => r.id === 'b').weeklyScore, 0);
  assert.equal(rows.find((r) => r.id === 'c').username, 'Cal');
  assert.equal(rows.filter((r) => r.isYou).length, 1);
});

test('points this week decide the order; level then lifetime points break ties', () => {
  const friends = [
    { uid: 'zero-goat', displayName: 'Zed' },
    { uid: 'zero-titan', displayName: 'Tia' },
    { uid: 'zero-buff-big', displayName: 'Bea' },
    { uid: 'zero-buff-small', displayName: 'Bob' },
    { uid: 'busy', displayName: 'Bea' },
  ];
  const summaries = {
    'zero-goat': { displayName: 'Zed', lifetimeVolume: goat.threshold + 10, minStage: 1, progressionScale: 1 },
    'zero-titan': { displayName: 'Tia', lifetimeVolume: titan.threshold + 10, minStage: 1, progressionScale: 1 },
    'zero-buff-big': { displayName: 'Bea', lifetimeVolume: buff.threshold + 500, minStage: 1, progressionScale: 1 },
    'zero-buff-small': { displayName: 'Bob', lifetimeVolume: buff.threshold + 10, minStage: 1, progressionScale: 1 },
    busy: { displayName: 'Bea', lifetimeVolume: 50, minStage: 1, progressionScale: 1 },
  };
  const feedPosts = [
    { id: 'p1', userId: 'busy', userName: 'Bea', score: 30, totalVolume: 0, timestamp: hoursAgo(3) },
    { id: 'p2', userId: 'busy', userName: 'Bea', score: 30, totalVolume: 0, timestamp: hoursAgo(30) },
  ];
  const rows = buildBoard({ you, friends, summaries, feedPosts, now: NOW });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['me', 'busy', 'zero-titan', 'zero-buff-big', 'zero-buff-small', 'zero-goat'],
  );
  // The busy Goat with 60 points outranks every idle Titan: points first.
  assert.equal(rows[1].weeklyScore, 60);
  assert.equal(stageOf(rows[1]), 1);
  assert.equal(stageOf(rows[2]), 3);
  // The comparator is a strict total order over these rows.
  for (let i = 1; i < rows.length; i += 1) assert.ok(compareRank(rows[i - 1], rows[i]) < 0);
});

test('the summary wins over the posts for the name, tier and streak; the posts alone decide the points', () => {
  const friends = [{ uid: 'a', displayName: 'Directory Name' }];
  const summaries = {
    a: {
      displayName: 'Summary Name',
      lifetimeVolume: 4000,
      minStage: 1,
      progressionScale: 0.65,
      currentStreak: 9,
      mascot: 'gena',
    },
  };
  const feedPosts = [
    {
      id: 'p1',
      userId: 'a',
      userName: 'Post Name',
      score: 55,
      totalVolume: 0,
      timestamp: hoursAgo(1),
      lifetimeVolume: 10,
      currentStreak: 2,
      mascot: 'jimmy',
    },
  ];
  const [, row] = buildBoard({ you, friends, summaries, feedPosts, now: NOW });
  assert.equal(row.username, 'Summary Name');
  assert.equal(row.lifetimeVolume, 4000);
  assert.equal(row.progressionScale, 0.65);
  assert.equal(row.currentStreak, 9);
  assert.equal(row.mascot, 'gena');
  assert.equal(row.weeklyScore, 55);
});

test('without a summary the posts fill the row, and without either the directory name does', () => {
  const friends = [
    { uid: 'a', displayName: 'Directory A' },
    { uid: 'b', displayName: 'Directory B' },
  ];
  const feedPosts = [
    {
      id: 'p1',
      userId: 'a',
      userName: 'Post A',
      score: 12,
      totalVolume: 0,
      timestamp: hoursAgo(2),
      lifetimeVolume: 777,
      mascot: 'gena',
      currentStreak: 3,
    },
  ];
  const rows = buildBoard({ you, friends, summaries: { a: null, b: null }, feedPosts, now: NOW });
  const a = rows.find((r) => r.id === 'a');
  const b = rows.find((r) => r.id === 'b');
  assert.equal(a.username, 'Post A');
  assert.equal(a.lifetimeVolume, 777);
  assert.equal(a.mascot, 'gena');
  assert.equal(a.currentStreak, 3);
  assert.equal(b.username, 'Directory B');
  assert.equal(b.lifetimeVolume, 0);
  assert.equal(b.mascot, 'jimmy');
});

test('a poster the directory has not resolved yet still gets a row', () => {
  const feedPosts = [
    { id: 'p1', userId: 'ghost', userName: 'Ghost', score: 5, totalVolume: 0, timestamp: hoursAgo(2) },
  ];
  const rows = buildBoard({ you, friends: [], summaries: {}, feedPosts, now: NOW });
  assert.deepEqual(
    rows.map((r) => r.id),
    ['me', 'ghost'],
  );
});

test('only the last seven days count, and a legacy post scores by its kilos', () => {
  const feedPosts = [
    { id: 'old', userId: 'a', userName: 'A', score: 999, totalVolume: 0, timestamp: hoursAgo(24 * 8) },
    { id: 'new', userId: 'a', userName: 'A', totalVolume: 7500, timestamp: hoursAgo(24 * 6) },
  ];
  const totals = weeklyTotals(feedPosts, NOW);
  assert.equal(totals.get('a').weeklyScore, 100);
  assert.equal(postScore({ score: 42 }), 42);
  assert.equal(postScore({ totalVolume: 750 }), 10);
});
