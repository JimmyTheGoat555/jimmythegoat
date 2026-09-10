// Weekly weigh-in day helpers + "does this weight change match their
// goal" logic. Shared by ProfileView (the reminder banner, the public/
// private prompt right after logging) — deliberately reimplemented in
// plain JS with zero imports so functions/index.js (a separate Node
// package with its own dependency tree, not sharing this Vite app's
// module graph) can copy the same two small functions verbatim without
// pulling in a whole client bundle.

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isWeighInDayToday(weighInDay) {
  if (weighInDay === '' || weighInDay == null) return false;
  return new Date().getDay() === Number(weighInDay);
}

export function isWeighInDayTomorrow(weighInDay) {
  if (weighInDay === '' || weighInDay == null) return false;
  const tomorrow = (new Date().getDay() + 1) % 7;
  return tomorrow === Number(weighInDay);
}

// True if a weight change of `deltaKg` (new reading minus previous one) is
// progress toward `fitnessGoal`. Only fat_loss/hypertrophy have an
// inherent scale direction — strength/general_fitness aren't about body
// weight, so this always returns false for those rather than inventing a
// direction that was never the actual goal.
export function goalMatchesDelta(fitnessGoal, deltaKg) {
  if (deltaKg == null) return false;
  if (fitnessGoal === 'fat_loss') return deltaKg < 0;
  if (fitnessGoal === 'hypertrophy') return deltaKg > 0;
  return false;
}
