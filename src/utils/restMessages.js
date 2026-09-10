// Jimmy's callout once a rest period has been sitting at 0:00 too long —
// client-only, so no server-side duplicate needed the way nudge messages
// (functions/nudgeMessages.js) require: this never leaves the device, it
// just decides what the rest banner says.
export const REST_OVERDUE_MESSAGES = [
  "Did you come here to sleep or to lift?! Get back to work!",
  "The bar isn't going to lift itself. Jimmy's still watching.",
  "Rest is over. This is now a nap, and naps don't build muscle.",
  "Jimmy has seen glaciers move faster than you right now.",
  "That's not a rest, that's a retirement. Get up.",
];

export function randomRestOverdueMessage() {
  return REST_OVERDUE_MESSAGES[Math.floor(Math.random() * REST_OVERDUE_MESSAGES.length)];
}
