// Placeholders for the two Founder Console metrics the database does not
// record yet. Each carries `mock: true`, and every card drawn from one
// shows the MOCK chip (consoleUi.jsx), so nothing here can be read as a
// real number by accident.
//
// To wire either up, return the same shape from adminAnalytics.js under
// `virality` / `coaching` and the console drops the placeholder on its
// own (FounderConsole.jsx picks the payload when it is non-null).
//
//   virality  Sticker shares are a client action (WorkoutCelebration's
//             copy-to-clipboard) with no write behind it today. Record
//             one per share — a counter on the user doc, or a
//             `stickerShares` collection — and count it here.
//   coaching  The progressive-overload toast (ActiveWorkoutLogger.jsx)
//             fires on-device and is never written. Same fix.
export const MOCK = {
  virality: {
    mock: true,
    totalStickerShares: 1284,
    last7Days: 96,
    themes: [
      { id: 'classic', name: 'Classic', shares: 402 },
      { id: 'frame', name: 'Frame', shares: 287 },
      { id: 'noir', name: 'Noir', shares: 171 },
      { id: 'pulse', name: 'Pulse', shares: 148 },
      { id: 'receipt', name: 'Receipt', shares: 113 },
      { id: 'split', name: 'Split', shares: 71 },
      { id: 'grid', name: 'Grid', shares: 49 },
      { id: 'clean', name: 'Clean', shares: 27 },
      { id: 'pyramid', name: 'Pyramid', shares: 16 },
    ],
  },
  coaching: {
    mock: true,
    overloadTriggers: 342,
    last7Days: 58,
    perHundredSessions: 21,
  },
};
