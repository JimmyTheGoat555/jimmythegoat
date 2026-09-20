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
// A limiter between the beep and the speaker, made once with the
// context. The two voices summed at full scale would clip, and clipping
// on a phone speaker is a crackle, not more volume.
let limiter = null;

// How loud, and how sharp. A gym is a loud room and the phone is on a
// bench, not in a hand: the old 800 Hz sine at a third of full scale
// was polite, and polite does not carry over a squat rack and a
// playlist. The pitch sits where phone speakers are loudest and ears
// most sensitive (2-4 kHz), and a square wave brings the harmonics that
// make a tone cut through music rather than blend into it.
const BEEP_HZ = 2200;
const BEEP_MS = 190;
const BEEP_GAP_MS = 110;
const BEEP_GAIN = 0.9;

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
    if (!ctx) {
      ctx = new AudioCtx();
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 4;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.08;
      limiter.connect(ctx.destination);
    }
    // Returning from a locked screen can leave it suspended even though it
    // was fine when created, so this is a resume as much as an unlock.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    // No WebAudio at all. The vibration and the full-screen colour change
    // still carry the alarm.
    ctx = null;
    limiter = null;
  }
}

// One beep of the double. Shaped rather than switched on and off: a raw
// start/stop clicks, and a click on a 90-second timer is the sound
// people remember. Two voices — the square carries the edge, a sine an
// octave up adds the whistle that reads as an alarm and not a game sound.
function beep(at) {
  const seconds = BEEP_MS / 1000;
  const envelope = ctx.createGain();
  envelope.connect(limiter);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(BEEP_GAIN, at + 0.008);
  envelope.gain.setValueAtTime(BEEP_GAIN, at + seconds - 0.03);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

  for (const [type, hz, level] of [
    ['square', BEEP_HZ, 1],
    ['sine', BEEP_HZ * 2, 0.35],
  ]) {
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = hz;
    const voice = ctx.createGain();
    voice.gain.value = level;
    oscillator.connect(voice);
    voice.connect(envelope);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.02);
  }
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
    beep(now);
    beep(now + (BEEP_MS + BEEP_GAP_MS) / 1000);
    return true;
  } catch {
    return false;
  }
}
