// Display-only copy of the allow-listed nudge messages, for the picker UI.
// The server (functions/nudgeMessages.js) is the only copy a send is ever
// actually validated against — if this file goes stale, the worst case is
// the picker offers a message the server would reject, never the reverse.
export const NUDGE_MESSAGES = [
  { id: 'skinny-goat', text: 'Your goat is looking skinny. Go lift!' },
  { id: 'disappointed-jimmy', text: 'Jimmy is disappointed in your lack of gains. Get up!' },
  { id: 'stop-scrolling', text: 'Stop scrolling, start lifting. Jimmy is watching.' },
  { id: 'legs-day', text: "Leg day doesn't skip itself. Neither should you." },
  { id: 'set-without-you', text: 'Jimmy just did a set without you. Awkward.' },
  { id: 'couch-rack', text: "The couch isn't a squat rack. Get to the gym." },
  { id: 'gains-voicemail', text: 'Your gains called. They left a voicemail: "where are you?"' },
  { id: 'goat-status', text: 'Every set you skip, Jimmy skips a nap to judge you for it.' },
];
