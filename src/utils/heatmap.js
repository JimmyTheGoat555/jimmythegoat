// Pure data-shaping for the Streak Heatmap (Progress tab) — a GitHub-style
// contribution grid over the user's own already-loaded workout history
// (useCloudWorkouts already fetches the full list; this is client-only,
// no new reads, no backend). Kept separate from workoutStats.js since
// everything here is specific to laying out the grid.
//
// Deliberately counts a RECOVERY workout as an active day. The server's
// badge/tier streak (functions/records.js) excludes recovery workouts on
// purpose — that streak feeds the reward economy, and a workout that
// earns nothing shouldn't count toward earning a badge either. This
// heatmap isn't a scored mechanic, just "did you show up" — a comeback
// session after time off is exactly the day worth lighting up, not
// hiding.
import { workoutScore } from './workoutStats';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function dayIndexOf(iso) {
  const ms = typeof iso === 'string' ? Date.parse(iso) : iso;
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null;
}

// Map<dayIndex, { count, score }> for every finished workout, keyed by UTC
// calendar day. `score` sums workoutScore() (0 for a recovery workout —
// the heatmap cell's colour intensity still floors at "active" via
// levelForDay below, it just won't read as a big session).
export function activeDayStats(workouts) {
  const byDay = new Map();
  for (const w of workouts ?? []) {
    if (!w.finishedAt) continue;
    const d = dayIndexOf(w.finishedAt);
    if (d == null) continue;
    const entry = byDay.get(d) ?? { count: 0, score: 0 };
    entry.count += 1;
    entry.score += workoutScore(w);
    byDay.set(d, entry);
  }
  return byDay;
}

// 0 = no workout, 1-4 = increasing intensity. A day with a workout always
// reads as at least level 1, even at score 0 (a recovery day) — a lit
// square, never confused with a rest day.
export function levelForDay(stats) {
  if (!stats || stats.count === 0) return 0;
  if (stats.score >= 150) return 4;
  if (stats.score >= 80) return 3;
  if (stats.score >= 30) return 2;
  return 1;
}

// Current consecutive-day streak counting back from today. If today
// hasn't happened yet (no workout logged so far today), counting starts
// from yesterday instead — so the display doesn't drop to 0 every morning
// before the day's workout is even possible yet.
export function currentTrainingStreak(workouts) {
  const days = activeDayStats(workouts);
  const todayIdx = dayIndexOf(new Date().toISOString());
  let cursor = days.has(todayIdx) ? todayIdx : todayIdx - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Builds `weeks` full Sun–Sat columns ending on the CURRENT week, oldest
// first — the shape the grid renders directly. Each cell carries enough
// to render + label itself; `monthLabel` is set on the first column whose
// first-of-month falls inside it, for the small month markers above the
// grid (GitHub does the same thing).
export function buildHeatmapWeeks(workouts, weeks = 20) {
  const dayStats = activeDayStats(workouts);
  const today = new Date();
  const todayIdx = dayIndexOf(today.toISOString());
  const todayDow = today.getUTCDay(); // 0=Sun..6=Sat, matching the UTC day math dayIndexOf uses throughout
  const endIdx = todayIdx + (6 - todayDow); // this week's Saturday
  const startIdx = endIdx - weeks * 7 + 1; // `weeks` full 7-day columns back

  const cells = [];
  for (let d = startIdx; d <= endIdx; d += 1) {
    const stats = dayStats.get(d);
    const date = new Date(d * DAY_MS);
    cells.push({
      dayIndex: d,
      date,
      isFuture: d > todayIdx,
      isToday: d === todayIdx,
      count: stats?.count ?? 0,
      score: stats?.score ?? 0,
      level: levelForDay(stats),
    });
  }

  const weeksOut = [];
  let lastLabeledMonth = -1;
  for (let i = 0; i < cells.length; i += 7) {
    const column = cells.slice(i, i + 7);
    const firstOfMonthCell = column.find((c) => c.date.getUTCDate() === 1);
    const monthOfColumn = (firstOfMonthCell ?? column[0]).date.getUTCMonth();
    let monthLabel = null;
    if (firstOfMonthCell && monthOfColumn !== lastLabeledMonth) {
      monthLabel = MONTH_LABELS[monthOfColumn];
      lastLabeledMonth = monthOfColumn;
    }
    weeksOut.push({ days: column, monthLabel });
  }
  return weeksOut;
}
