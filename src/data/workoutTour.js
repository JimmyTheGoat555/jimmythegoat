// The first-workout tour: the four controls on the logging screen a
// first-timer has no way to guess at, in the order they sit on the screen.
//
// WHY SELECTORS AND NOT REFS. Two of these four are rendered inside a
// list — the bulb is per exercise card, +DS is per set row — so a ref
// would have to be threaded down through ExerciseLogCard and SetRow and
// then disambiguated at the top ("which card's bulb?"). A selector asks
// the DOM the same question and answers it the way the tour wants:
// querySelector returns the FIRST match in document order, which is the
// topmost one on screen, which is the one worth pointing at. The cost is
// one `data-tour` attribute per control, which is also a grep-able marker
// that the element is spoken about somewhere.
//
// A step whose target is not in the DOM is skipped rather than shown
// pointing at nothing: the bulb only renders for exercises the catalog
// has tips for, and +DS only once a set row exists. See useWorkoutTour.
//
// `title` names the control; `body` says what it does and — for the two
// that surprise people — what it does not. Kept out of the components so
// the wording can change without touching the logger.
export const WORKOUT_TOUR_STEPS = [
  {
    id: 'chill',
    target: '[data-tour="chill"]',
    title: 'Chill Mode',
    body: 'Normally ticking a set off starts a rest countdown. Switch the snowflake on and it will not — you rest only when you ask.',
  },
  {
    id: 'rest',
    target: '[data-tour="rest"]',
    title: 'Rest timer',
    body: 'Starts a rest whenever you want one, and reopens the one already running. It keeps counting if you leave this screen.',
  },
  {
    id: 'tips',
    target: '[data-tour="tips"]',
    title: 'Form cues',
    body: "Jimmy's pointers for this exercise — how to set up and what to watch out for. There is one on every exercise that has them.",
  },
  {
    id: 'dropset',
    target: '[data-tour="dropset"]',
    title: 'Drop sets',
    body: 'Hangs a lighter set off this one: same movement, straight away, less weight. It adds a new row — it does not change this set.',
  },
];
