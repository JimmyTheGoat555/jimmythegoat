// What Jimmy says while you're resting — shown in the tip card under the
// countdown (see components/workout/FullScreenTimer.jsx), rotating every
// 15 seconds so a 90-second rest gets about six of them.
//
// The mix is the point. Straight training science on its own reads like a
// textbook nobody asked for, and pure attitude on its own gets old by the
// third set — alternating the two means the card is worth glancing at all
// session. Same client-only flavor text as gymQuotes.js: never validated,
// stored, or sent anywhere.
//
// Kept factually honest deliberately. A tip that's wrong is worse than no
// tip, and people will repeat these in the gym: the numbers here (bar
// weight, protein range, rest windows) are all standard, checkable figures
// rather than bro-science.
//
// Each tip carries its `kind` so the card can badge itself — a reader
// should be able to tell at a glance whether they're being taught
// something or insulted.

export const TIP_KINDS = {
  fuel: { label: 'Fuel', icon: '🥗', accent: '#7ddb8a' },
  science: { label: 'Training Science', icon: '📊', accent: '#6fc3ff' },
  roast: { label: "Jimmy's Take", icon: '🐐', accent: '#f2c14e' },
};

export const REST_TIPS = [
  // — Nutrition —
  { kind: 'fuel', text: "To lose weight, you must be in a caloric deficit. You can't out-train a bad diet." },
  { kind: 'fuel', text: 'Protein target: roughly 1.6–2.2 g per kg of body weight per day. More than that mostly just makes expensive urine.' },
  { kind: 'fuel', text: 'Creatine monohydrate is the most researched supplement there is. It’s also the cheapest. Funny how that works.' },
  { kind: 'fuel', text: 'Dehydration of just 2% of body weight measurably cuts strength output. Drink.' },
  { kind: 'fuel', text: 'There is no magic fat-burning food. There is a deficit, and there is consistency.' },

  // — Training science —
  { kind: 'science', text: 'A standard Olympic barbell weighs exactly 20 kg (44 lbs). Count it.' },
  { kind: 'science', text: 'A 2-minute warm-up can save you 6 months of injury rehab.' },
  { kind: 'science', text: 'Hypertrophy takes time. Rome wasn’t built in a day, and neither are your calves.' },
  { kind: 'science', text: 'Progressive overload is the whole game: more weight, more reps, or better form than last time.' },
  { kind: 'science', text: 'Muscle is built in the kitchen and the bed, not just under the bar. Sleep is a training variable.' },
  { kind: 'science', text: '2–3 minutes of rest between heavy compound sets beats 60 seconds for strength. Yes, really.' },
  { kind: 'science', text: 'Soreness is not a measure of a good workout. Progress on the bar is.' },
  { kind: 'science', text: 'The last 2–3 reps before failure are where most of the growth signal lives. Don’t bail early.' },
  { kind: 'science', text: 'Full range of motion beats heavier partials for hypertrophy almost every time.' },
  { kind: 'science', text: 'Training a muscle twice a week generally beats once a week at the same total volume.' },

  // — Jimmy's attitude —
  { kind: 'roast', text: 'If you’re reading this, your heart rate is dropping. Good. Now get ready.' },
  { kind: 'roast', text: 'Jimmy sees you scrolling. The bar hasn’t moved.' },
  { kind: 'roast', text: 'Nobody ever regretted the set they did. Plenty regret the one they skipped.' },
  { kind: 'roast', text: 'That weight isn’t heavy. You’re just having a conversation with it.' },
  { kind: 'roast', text: 'Rest is part of the work. Sitting down for nine minutes is not.' },
  { kind: 'roast', text: 'Your excuses don’t lift. Neither do your intentions.' },
  { kind: 'roast', text: 'Everyone wants the physique. Almost nobody wants the Tuesday.' },
  { kind: 'roast', text: 'The only workout you’ll regret is the one you talked yourself out of.' },

  // — Added in the pre-launch content pass. Same rule as everything
  // above: every number here is a standard, checkable figure from the
  // training literature, because people repeat these in the gym.
  { kind: 'science', text: 'Stopping 1–3 reps short of failure grows about as much muscle as grinding to failure — with far less fatigue to recover from.' },
  { kind: 'science', text: 'Roughly 10–20 hard sets per muscle per week is where most people grow. Past that, the returns shrink fast.' },
  { kind: 'science', text: 'Your first few weeks of “newbie gains” are mostly your nervous system learning the movement. The muscle comes after.' },
  { kind: 'science', text: 'Static stretching right before a heavy set temporarily lowers force output. Warm up by moving; stretch afterwards.' },
  { kind: 'science', text: 'A muscle loaded in its stretched position — the bottom of a curl, the deep part of a squat — tends to grow more than the same work cut short.' },
  { kind: 'science', text: 'Sleeping under 6 hours measurably lowers strength, power and recovery. The gains are built while you’re unconscious.' },
  { kind: 'science', text: 'Muscle protein synthesis stays elevated for 24–48 hours after a session. Leg day is really leg two days.' },
  { kind: 'science', text: 'A lighter deload week every 4–8 weeks isn’t weakness — it clears accumulated fatigue so the next block actually works.' },
  { kind: 'science', text: 'You can’t “confuse” a muscle. It responds to tension and progression, not novelty.' },
  { kind: 'science', text: 'On rows and pulldowns your grip usually fails before your back does. Straps aren’t cheating — they’re aiming.' },
  { kind: 'fuel', text: 'Spreading protein over 3–4 meals of ~0.4 g per kg beats one enormous hit at dinner.' },
  { kind: 'fuel', text: 'Caffeine at 3–6 mg per kg of body weight, about an hour out, is one of the few pre-workout ingredients that reliably works.' },
  { kind: 'fuel', text: 'Alcohol blunts muscle protein synthesis for hours after training. That pint costs more than its calories.' },
  { kind: 'fuel', text: 'Losing much more than 1% of your body weight a week starts costing you muscle along with the fat.' },
  { kind: 'roast', text: 'Ego lifting is just negotiating with physics. Physics has never once blinked.' },

  // — Pool expansion. Same rule as everything above: every figure here is
  // a checkable one from the literature, because these get repeated in
  // gyms as fact. Grouped by what they're actually about.

  // — Sleep and water —
  { kind: 'science', text: 'Diet on five hours of sleep and you’ll lose the same weight — but far more of it comes off as muscle instead of fat.' },
  { kind: 'science', text: 'The day’s biggest growth-hormone pulse arrives in your first deep-sleep cycle. No supplement reproduces it.' },
  { kind: 'science', text: 'Young athletes sleeping under 8 hours get injured markedly more often. Sleep is the cheapest prehab there is.' },
  { kind: 'fuel', text: 'Muscle is about 75% water, and thirst lags the deficit — by the time you feel it, your output has already dipped.' },

  // — Two different kinds of tired —
  { kind: 'science', text: 'Most of what you feel after a set of twelve is local — the muscle itself. It’s heavy singles that tax the nervous system.' },
  { kind: 'science', text: 'If even the warm-up feels heavy, you’re systemically fatigued. If only the top set is slow, it’s just the muscle.' },
  { kind: 'science', text: 'Local fatigue clears in minutes to hours. The central kind, after truly maximal work, can take two or three days.' },
  { kind: 'science', text: '“CNS fatigue” gets blamed for a lot of ordinary tiredness. Usually it’s a bad night’s sleep and a hard week, not a fried nervous system.' },

  // — Tendon and connective tissue, which run on a slower clock —
  { kind: 'science', text: 'Muscle adapts in weeks; tendon takes months. That gap is where most overuse injuries are born.' },
  { kind: 'science', text: 'Tendons stiffen from slow, heavy, boring loading — long holds and controlled reps, not bouncing.' },
  { kind: 'science', text: 'A cranky tendon usually wants lighter loading, not total rest. Unloaded connective tissue gets weaker fast.' },
  { kind: 'science', text: 'Part of the drive out of a deep squat is tendon recoiling like a spring — free force you only get by reaching the bottom.' },

  // — Leverage, and where your attention goes —
  { kind: 'science', text: 'Deliberately thinking about the working muscle raises its measured activity — and at moderate loads, grows it more.' },
  { kind: 'science', text: 'Flip the cue when it’s heavy: “push the floor away” beats “squeeze your quads” for raw force. Inward to build, outward to lift.' },
  { kind: 'science', text: 'You can lower roughly 30% more than you can lift. The eccentric is the strongest thing you do — stop dropping it.' },
  { kind: 'science', text: 'A curl is hardest at 90°, where the lever is longest — not at the bottom. Cables and bands move that peak somewhere else.' },

  // — Things everyone repeats that aren't true —
  { kind: 'fuel', text: 'The 30-minute anabolic window is a myth. The muscle stays primed for hours; the day’s total protein is what matters.' },
  { kind: 'science', text: 'Lactic acid doesn’t cause next-day soreness. Lactate is gone within the hour — the ache is mechanical damage.' },
  { kind: 'science', text: 'You can’t spot-reduce. Crunches build abs; they don’t get to choose where the fat comes off.' },
  { kind: 'science', text: 'Most fat leaves the body as carbon dioxide — you breathe it out. Sweat is cooling, not a progress bar.' },
];

// Never returns the tip that's already on screen, so the card visibly
// changes every rotation instead of occasionally "fading" into itself.
export function nextRestTip(current) {
  const pool = current ? REST_TIPS.filter((t) => t.text !== current.text) : REST_TIPS;
  return pool[Math.floor(Math.random() * pool.length)];
}
