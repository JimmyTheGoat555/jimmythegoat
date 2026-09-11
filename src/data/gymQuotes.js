// Rotating gym-bro one-liners for the active workout screen (see
// ActiveWorkoutLogger.jsx). Client-only flavor text — never validated,
// stored, or sent anywhere, so unlike nudgeMessages.js there's no server
// twin to keep in sync. One is picked at random when a workout starts and
// again each time the line is tapped.
export const GYM_QUOTES = [
  'No pain, no gain.',
  'Light weight, baby!',
  'Shut up and squat.',
  'Eat clen, tren hard.',
  'Pain is temporary, pride is forever.',
  "The bar is heavy because it's full of your excuses.",
  'Sore today, strong tomorrow.',
  'Earned, never given.',
  'Sweating is just fat crying.',
  "If it doesn't challenge you, it doesn't change you.",
  'Iron therapy is the best therapy.',
  'One more rep, or go home.',
  'Wake up, lift, eat, sleep, repeat.',
  'Your only limit is you.',
  'A 1-rep max fixes everything.',
  "The weights won't lift themselves.",
  'Be stronger than your excuses.',
  'Champions train, losers complain.',
  'Pumping iron and taking names.',
  "Excuses don't build muscle.",
  'Heavy weights, heavy mind.',
  'Leave your ego at the door.',
  'Blood, sweat, and respect.',
  'Zero reps wasted.',
  'Go heavy or go home.',
];

// Random quote, optionally guaranteed different from `exclude` so tapping
// to cycle never lands on the same line twice in a row.
export function randomGymQuote(exclude) {
  const pool = exclude ? GYM_QUOTES.filter((q) => q !== exclude) : GYM_QUOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}
