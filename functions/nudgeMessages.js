// The fixed set of nudges a friend can send — allow-listed, not free text.
// Free text into someone else's push notification is a harassment vector
// this app has no moderation for; a closed list of pre-written, Jimmy-
// flavored lines keeps it funny without opening that door. Duplicated in
// src/data/nudgeMessages.js for the picker UI — same convention as
// storeCatalog.js/storeItems.js and records.js/personalRecords.js
// elsewhere in this app (functions/ is CommonJS, src/ is ESM; a build step
// to share ~15 lines costs more than it saves). This file's copy is the
// only one a nudge is ever actually validated against.
const NUDGE_MESSAGES = [
  { id: 'skinny-goat', text: 'Your goat is looking skinny. Go lift!' },
  { id: 'disappointed-jimmy', text: 'Jimmy is disappointed in your lack of gains. Get up!' },
  { id: 'stop-scrolling', text: 'Stop scrolling, start lifting. Jimmy is watching.' },
  { id: 'legs-day', text: "Leg day doesn't skip itself. Neither should you." },
  { id: 'set-without-you', text: 'Jimmy just did a set without you. Awkward.' },
  { id: 'couch-rack', text: "The couch isn't a squat rack. Get to the gym." },
  { id: 'gains-voicemail', text: 'Your gains called. They left a voicemail: "where are you?"' },
  { id: 'goat-status', text: 'Every set you skip, Jimmy skips a nap to judge you for it.' },
];

const NUDGE_MESSAGES_BY_ID = new Map(NUDGE_MESSAGES.map((m) => [m.id, m]));

module.exports = { NUDGE_MESSAGES, NUDGE_MESSAGES_BY_ID };
