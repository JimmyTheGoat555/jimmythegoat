// The rest-over alarm: one AudioContext, unlocked by the tap that starts
// the rest, reused for the life of the session.
//
// ── WHY NOT AN <audio> ELEMENT ───────────────────────────────────────────
//
// It used to be one, holding a base64 WAV, and the reasoning was sound at
// the time: an AudioContext created 90 seconds after the last touch is
// routinely left suspended, so the beep silently never played. An <audio>
// element unlocked by the earlier tap kept permission to play later.
//
// What that missed is what an <audio> element DOES to the phone it plays
// on. It takes the media session — so on iOS and Android it pauses
// whatever the lifter was listening to, and nothing resumes it. You get
// your beep and they lose their music for the rest of the set. Reported
// exactly that way, and it is the worse failure of the two.
//
// The fix is not to go back to a context created at fire time, which is
// the thing that did not work. It is to create the context ONCE, on the
// user gesture that starts the rest, and keep it. WebAudio mixes with
// other audio instead of claiming the session, so Spotify keeps playing
// underneath the beep.
//
// ── THE HONEST LIMIT ─────────────────────────────────────────────────────
//
// Neither approach makes sound reliably with the screen LOCKED — mobile
// browsers suspend audio for a backgrounded page, and no amount of
// WebAudio changes that. That case is covered by a notification instead
// (see restNotification.js); this module is the foreground alarm.

let ctx = null;

function audioContextClass() {
  return typeof window === 'undefined' ? null : window.AudioContext || window.webkitAudioContext;
}

// Call from a REAL user gesture — the tap that completes a set and starts
// the rest. Creating the context here (rather than at fire time) is the
// whole trick: a context born inside a gesture starts in the 'running'
// state, and stays usable for later beeps that have no gesture of their
// own.
//
// Safe to call on every set: creating it twice is what we are avoiding,
// and resuming an already-running context is a no-op.
export function unlockRestAlarm() {
  const AudioCtx = audioContextClass();
  if (!AudioCtx) return;
  try {
    if (!ctx) ctx = new AudioCtx();
    // Returning from a locked screen can leave it suspended even though it
    // was fine when created, so this is a resume as much as an unlock.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    // No WebAudio at all. The vibration and the full-screen colour change
    // still carry the alarm.
    ctx = null;
  }
}

// One beep of the double. Shaped rather than switched on and off: a raw
// start/stop on a sine wave clicks, and a click on a 90-second timer is
// the sound people remember.
function beep(at, frequency, durationMs) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const seconds = durationMs / 1000;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.32, at + 0.012);
  gain.gain.setValueAtTime(0.32, at + seconds - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

  oscillator.start(at);
  oscillator.stop(at + seconds + 0.02);
}

// Beep-beep. Two hits read as deliberate where one reads as a
// notification from some other app.
export function playRestAlarm() {
  if (!ctx) {
    // Never unlocked (the rest was started by something other than a tap,
    // or WebAudio is unavailable). Try once — it may work on Android,
    // where a suspended context is less of a certainty than on iOS.
    unlockRestAlarm();
    if (!ctx) return false;
  }
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    beep(now, 800, 180);
    beep(now + 0.27, 800, 180);
    return true;
  } catch {
    return false;
  }
}
