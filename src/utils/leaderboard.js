// The weekly leaderboard's ranking, as plain data — every row on the
// board, in order — so the component only draws and the ordering can be
// checked in Node (tools/leaderboard.test.mjs).
//
// The board is built from the FULL friends list, not from whoever happened
// to post this week. Each friend's row draws on two public sources:
//
//   * their users/{uid}/public/summary — displayName, lifetimeVolume (for
//     the tier), streak, gear, mascot; kept current by logWorkout and by
//     equipItem's live mirror. Absent for an account that has never
//     trained, which is exactly the "0 points, base tier" row it should be.
//   * their feed posts in the rolling 7-day window — the ONLY source of
//     this week's points, and the fallback for the cosmetics when the
//     summary has not loaded (or predates a field).
//
// A friend with no post this week is on the board at 0. That is the whole
// point: a board that only lists people who trained hides the friend who
// is falling behind, which is the one you would want to nudge.

import { getEvolutionProgress, progressionScale as progressionScaleOf } from './evolutionTiers.js';
import { resolveMascotId } from '../data/mascots.js';
import { readEquippedAccessories } from '../data/storeItems.js';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Divisor for feed posts written before per-workout `score` existed —
// map their raw kg onto the relative scale against an average lifter, the
// same 75 kg constant src/utils/workoutStats.js's workoutScore() uses for
// legacy workouts. Every post since carries a real `score`, and the
// rolling window has long since cleared the old ones, but a stray legacy
// post must still rank sanely rather than as 4,000 points.
export const LEGACY_BODYWEIGHT_KG = 75;

export function postScore(post) {
  if (typeof post?.score === 'number' && Number.isFinite(post.score)) return post.score;
  return (Number(post?.totalVolume) || 0) / LEGACY_BODYWEIGHT_KG;
}

// This week's points per poster, with the newest post in the window kept
// as the fallback source for the row's cosmetics. The streak is the
// longest-lived value across the week's posts, so the row shows the run
// they are actually on rather than whatever the oldest post said.
export function weeklyTotals(feedPosts, now = Date.now()) {
  const cutoff = now - WEEK_MS;
  const totals = new Map();
  for (const post of feedPosts ?? []) {
    if (!post?.userId) continue;
    const at = new Date(post.timestamp).getTime();
    if (!Number.isFinite(at) || at < cutoff) continue;
    const value = postScore(post);
    const streak = Number(post.currentStreak) || 0;
    const existing = totals.get(post.userId);
    if (existing) {
      existing.weeklyScore += value;
      existing.currentStreak = Math.max(existing.currentStreak, streak);
      if (at > existing.latestAt) {
        existing.latestAt = at;
        existing.latest = post;
      }
    } else {
      totals.set(post.userId, { weeklyScore: value, currentStreak: streak, latestAt: at, latest: post });
    }
  }
  return totals;
}

// The evolution stage a row is drawn at — the "level" the tie-break
// below ranks on.
export function stageOf(entry) {
  return getEvolutionProgress(Number(entry?.lifetimeVolume) || 0, {
    minStage: entry?.minStage ?? 1,
    scale: entry?.progressionScale ?? 1,
  }).current.stage;
}

// The order of the board. Points this week decide it — that is the
// competition, and the number every row shows. Everything after is a
// tie-break, which matters most among the friends who have not trained
// this week and all sit on 0: their level (evolution stage), then their
// lifetime points, so the strongest of them still reads as the strongest,
// and finally the name so the order is stable between renders.
export function compareRank(a, b) {
  if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
  const byStage = stageOf(b) - stageOf(a);
  if (byStage !== 0) return byStage;
  const byLifetime = (Number(b.lifetimeVolume) || 0) - (Number(a.lifetimeVolume) || 0);
  if (byLifetime !== 0) return byLifetime;
  if (a.isYou !== b.isYou) return a.isYou ? -1 : 1;
  return String(a.username ?? '').localeCompare(String(b.username ?? ''));
}

// Every row, ranked. `you` is the signed-in user's own row (built by the
// caller from their private data); `friends` is the resolved friends
// list ({ uid, displayName }); `summaries` maps uid → public summary (or
// null when that account has none); `feedPosts` is the live feed.
export function buildBoard({ you, friends = [], summaries = {}, feedPosts = [], now = Date.now() }) {
  const totals = weeklyTotals(feedPosts, now);
  const rows = [];
  const seen = new Set();
  if (you) {
    rows.push(you);
    seen.add(you.id);
  }

  const rowFor = (uid, fallbackName) => {
    const week = totals.get(uid);
    const post = week?.latest ?? null;
    const summary = summaries?.[uid] ?? null;
    // The summary is the fresher of the two wherever both carry a field —
    // equipItem mirrors gear onto it the instant something is worn, and
    // logWorkout rewrites it with every post — so it wins, and the post
    // fills whatever it lacks.
    const source = summary ?? post ?? {};
    const worn = readEquippedAccessories(summary ?? {});
    return {
      id: uid,
      username: summary?.displayName ?? post?.userName ?? fallbackName ?? 'Friend',
      lifetimeVolume: Number(summary?.lifetimeVolume ?? post?.lifetimeVolume) || 0,
      weeklyScore: week?.weeklyScore ?? 0,
      isYou: false,
      minStage: Number(summary?.minStage ?? post?.minStage) || 1,
      progressionScale: progressionScaleOf(source),
      currentStreak: Number(summary?.currentStreak ?? week?.currentStreak) || 0,
      equippedAccessories: worn.length > 0 ? worn : readEquippedAccessories(post ?? {}),
      mascot: resolveMascotId(source),
    };
  };

  for (const friend of friends ?? []) {
    const uid = friend?.uid;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    rows.push(rowFor(uid, friend.displayName));
  }
  // A poster the friends directory has not resolved yet (the lookup is a
  // separate, slower query) is still a friend — the feed only ever holds
  // friends' posts — so they keep their row rather than vanishing until
  // the directory catches up.
  for (const uid of totals.keys()) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    rows.push(rowFor(uid, null));
  }

  return rows.sort(compareRank);
}
