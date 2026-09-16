// How long an animated WebP plays, in ms — the one thing an <img> will not
// tell you. JimmyAnimation needs it for a character wearing an outfit set:
// her dance clips were keyed from the plain sprite, so once a clip has
// played it has to hand back to the sprite (see there), and "has played"
// is a number only the file knows.
//
// Read straight off the container rather than guessed from a constant:
// RIFF chunks, an ANIM chunk carrying the loop count, one ANMF chunk per
// frame carrying its duration (24-bit LE at byte 12 of the chunk body).
// Total = frames × loops. The same layout source-media/pipeline/set_loop.py
// patches when it bakes the loop count in.
//
// `cache: 'force-cache'` because by the time this is asked the <img> has
// already downloaded the file; this should be served from the HTTP cache,
// never a second copy over the network. One promise per URL, kept for the
// session, so a replay tap costs nothing.
const durations = new Map();

function parse(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = (i) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null;

  let loops = 1;
  let frames = 0;
  let total = 0;
  for (let i = 12; i + 8 <= bytes.length; ) {
    const size = view.getUint32(i + 4, true);
    const body = i + 8;
    if (body + size > bytes.length) break;
    const name = tag(i);
    if (name === 'ANIM' && size >= 6) {
      loops = view.getUint16(body + 4, true);
    } else if (name === 'ANMF' && size >= 16) {
      total += bytes[body + 12] | (bytes[body + 13] << 8) | (bytes[body + 14] << 16);
      frames += 1;
    }
    // Chunks are padded to an even length; the pad byte is not in `size`.
    i = body + size + (size & 1);
  }
  if (frames === 0) return null;
  // 0 means "forever" in the container. Reported as Infinity so a caller
  // waiting for the end knows there is none, rather than getting a 0 and
  // cutting the clip off before its first frame.
  return loops === 0 ? Infinity : total * loops;
}

// Resolves to the clip's total play time in ms, Infinity for a looping
// clip, or null if the file could not be read or is not animated. Never
// rejects: a missing number must degrade to "do nothing", not to an
// error in the middle of drawing a goat.
export function webpDurationMs(url) {
  if (typeof url !== 'string' || !url) return Promise.resolve(null);
  // The replay fragment (`clip#3`) is the same file to the network.
  const key = url.split('#')[0];
  if (!durations.has(key)) {
    durations.set(
      key,
      fetch(key, { cache: 'force-cache' })
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => (buf ? parse(buf) : null))
        .catch(() => null),
    );
  }
  return durations.get(key);
}
