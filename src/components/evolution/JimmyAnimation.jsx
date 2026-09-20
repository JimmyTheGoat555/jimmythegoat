import { useEffect, useRef, useState } from 'react';
import { AccessoryLayer } from './JimmyAvatar';
import { DEFAULT_MASCOT_ID, mascotHasDances, outfitSpriteFor } from '../../data/mascots';
import { webpDurationMs } from '../../utils/webpDuration';

// When the clip's length cannot be read (webpDurationMs returned null),
// how long to let it play before handing back to the outfit sprite. The
// longest clip shipped today is 5.05s (dance2); this leaves it its final
// frame and a beat, and only ever runs in the failure case.
const FALLBACK_CLIP_MS = 5500;

// Jimmy's hero display: the static tier sprite, swapped for the equipped
// dance once that dance has loaded. Tap him and he performs it again.
//
// He is NOT a <video>. The dances arrived as MP4s, which cannot carry an
// alpha channel — the transparency had been flattened into a checkerboard
// that showed as a grey box around him — so they are animated WebP in an
// <img> instead, the one format with real alpha that plays everywhere the
// app runs, iOS Safari included.
//
// That trade has one cost, and it lands exactly here: an <img> has no
// play(), no currentTime, and no loop attribute. Playback is controlled in
// the only two places available instead —
//
//   * plays once: the loop count is baked into each file (see
//     source-media/pipeline/set_loop.py). They were generated as seamless
//     loops, so the frame each one holds on is essentially its opening
//     pose, and Jimmy settles rather than freezing mid-move.
//
//   * replays on tap: by changing the `src` string. Remounting the element
//     with an identical src does NOT restart an animated WebP — the browser
//     keeps one animation state per URL, so a fresh <img> just joins the
//     existing playhead (measured, not assumed). A distinct URL gets its own
//     state, and a `#fragment` is distinct to the image decoder while still
//     being the same resource to the network, so replays cost no bytes.
//
// Both layers deliberately share box classes: the animation canvas is built
// to the same character-height and floor proportions as the static sprites,
// so with object-contain/object-bottom the swap neither resizes Jimmy nor
// lifts him off his pedestal.
export default function JimmyAnimation({
  animationSrc,
  staticImageSrc,
  alt,
  className = '',
  onImageError,
  // Worn gear, drawn over whichever layer is showing. Optional: the shop's
  // dance previews pass nothing, because there the subject is the dance.
  evolutionStage,
  equippedAccessories = [],
  // Which character is on the pedestal. Two jobs here, not one: it places
  // the gear (AccessoryLayer below), and it is the last line of defence
  // against playing one character's dance over the other's sprite. The
  // path arriving in `animationSrc` was already resolved per mascot
  // (utils/danceAnimations), but a mascot without clips of its own is
  // refused a clip HERE as well, so a call site that forgets cannot
  // reintroduce the swap. Gena's clips are built to the same canvas
  // numbers as Jimmy's (source-media/pipeline/build_gena.py), which is
  // what lets the object-contain layering below hold for her too.
  mascot = DEFAULT_MASCOT_ID,
  // Whether tapping the goat replays the clip. Off for a caller that owns
  // the tap itself (PublicFriendProfile drives playback from outside, so
  // two handlers would fight over the same press).
  interactive = true,
  // Whether the clip plays on arrival, or waits for a tap. WorkoutHome
  // turns it off for a character in an outfit set: the clips were keyed
  // from the plain sprite, so an arrival dance would open the screen on
  // her in the wrong clothes and only then cut to the set she paid for.
  // At rest she is in the set, gear on; the dance is still one tap away.
  autoplay = true,
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [replay, setReplay] = useState(0);
  const [outfitBroken, setOutfitBroken] = useState(false);

  // An equipped outfit set replaces the still sprite with the set's own
  // render of the character at this tier — resolved HERE rather than
  // asked of the caller, for the reason the mascot is re-checked below:
  // every call site already passes the gear and the mascot for the
  // accessory layer, and one that forgot to also swap `staticImageSrc`
  // would show the plain sprite under a hoodie-less set. Falls back to
  // the caller's sprite if the set's file fails (same reasoning as
  // JimmyAvatar: the outfit files are not precached, the base ones are).
  const outfitSrc = outfitBroken
    ? null
    : evolutionStage != null
      ? outfitSpriteFor(mascot, evolutionStage, equippedAccessories)
      : null;
  const stillSrc = outfitSrc ?? staticImageSrc;

  // A mascot with no clips of its own resolves to no clip at all, which is
  // the state this component already knows how to render: it holds the
  // static sprite, exactly as it does for a dance whose file is missing.
  // Everything below reads `clip`, never `animationSrc`, so there is no
  // path that can play one mascot's dance over another's sprite.
  const clip = mascotHasDances(mascot) ? animationSrc : null;

  // Equipping a different dance, or evolving a tier, points at a file that
  // has not loaded yet — drop back to the sprite until it has. Adjusted
  // during render rather than in an effect (React's documented pattern, as
  // in App.jsx's tab transition) so no frame shows the previous dance as if
  // it were the new one. Switching mascot goes through the same reset,
  // since it changes `clip` too.
  const [renderedSrc, setRenderedSrc] = useState(clip);
  // ── THE CLIP IS A PERFORMANCE; THE SPRITE IS THE RESTING STATE ──────
  //
  // A clip plays once and then HANDS BACK: it is given exactly its own
  // length (read off the file — utils/webpDuration) and then faded out
  // over the sprite. Two reasons, both about what an animated WebP
  // cannot do:
  //
  //   * Gear cannot follow the dance. There is no per-frame position in
  //     the file, so worn accessories are placed against the sprite's
  //     landmarks and would float over a head that is moving. So the
  //     accessory layer is hidden while the clip is on top and returns
  //     with the sprite — she takes the shades off to dance.
  //   * The clips were keyed from the plain sprites, so a character in
  //     an outfit set dances in default gear; holding the clip's final
  //     frame would leave her in the wrong clothes for as long as the
  //     screen is open.
  //
  // Every clip's settled frame is registered to its sprite (feet on the
  // ground line, same body height — tools/normalize-sprites.mjs), so the
  // hand-back is a crossfade between two images of the same character
  // standing in the same place, not a hop. `settled` is that state; it
  // clears for a replay and for a new clip.
  const [settled, setSettled] = useState(false);
  // When the current play began, so the hand-back is timed from the
  // frame the animation actually started on rather than from when the
  // file's length came back.
  const playStartedAt = useRef(0);
  if (renderedSrc !== clip) {
    setRenderedSrc(clip);
    setIsLoaded(false);
    setFailed(false);
    setReplay(0);
    setSettled(false);
  }

  // Without autoplay the clip is not even requested until the first tap:
  // `replay` counts taps, and 0 means "nobody asked yet".
  const showAnimation = Boolean(clip) && !failed && (autoplay || replay > 0);
  // Tappable whenever there is a clip to play — before it has loaded,
  // too, when autoplay is off, because that tap is what loads it.
  const canReplay = interactive && Boolean(clip) && !failed && (isLoaded || !autoplay);
  const handsBack = showAnimation && isLoaded;
  useEffect(() => {
    if (!handsBack) return undefined;
    let cancelled = false;
    let timer = null;
    webpDurationMs(clip).then((ms) => {
      if (cancelled || ms === Infinity) return;
      const total = ms ?? FALLBACK_CLIP_MS;
      const elapsed = performance.now() - playStartedAt.current;
      timer = setTimeout(() => setSettled(true), Math.max(0, total - elapsed));
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `replay` restarts the timer for the same clip.
  }, [handsBack, clip, replay]);

  const replayClip = () => {
    playStartedAt.current = performance.now();
    setSettled(false);
    setReplay((n) => n + 1);
  };
  // No streak aura here either — see JimmyAvatar for why the fire was
  // pulled from every surface rather than only from the lobby goat.
  // The counter only ever appends a fragment, so the browser reuses the
  // already-downloaded image and only the animation restarts.
  const playSrc = replay === 0 ? clip : `${clip}#${replay}`;
  // The clip is on top only while it is actually playing; before it has
  // loaded, and after it has handed back, the sprite shows.
  const clipOnTop = showAnimation && isLoaded && !settled;
  const layer = 'absolute inset-0 w-full h-full object-contain object-bottom transition-opacity duration-200';
  // The gear goes with the sprite, on the same fade — see the note above.
  const gearClass = `transition-opacity duration-200 ${clipOnTop ? 'opacity-0' : 'opacity-100'}`;

  return (
    <div
      className={`relative ${className} ${canReplay ? 'cursor-pointer' : ''}`}
      onClick={canReplay ? replayClip : undefined}
      onKeyDown={
        canReplay
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                replayClip();
              }
            }
          : undefined
      }
      role={canReplay ? 'button' : undefined}
      tabIndex={canReplay ? 0 : undefined}
      aria-label={canReplay ? `Play ${alt}'s dance again` : undefined}
    >
      {/* Behind the goat, so a collar passes under his neck rather than
          across it. Drawn before both layers below, all absolutely
          positioned, so paint order follows DOM order. */}
      {evolutionStage != null && (
        <AccessoryLayer
          evolutionStage={evolutionStage}
          equippedAccessories={equippedAccessories}
          mascot={mascot}
          depth="behind"
          className={gearClass}
        />
      )}
      <img
        src={stillSrc}
        alt={alt}
        // The set's own file failing drops to the caller's plain sprite;
        // only the plain sprite failing is the caller's problem.
        onError={outfitSrc ? () => setOutfitBroken(true) : onImageError}
        className={`${layer} ${clipOnTop ? 'opacity-0' : 'opacity-100'}`}
      />
      {showAnimation && (
        <img
          src={playSrc}
          alt=""
          aria-hidden="true"
          draggable="false"
          onLoad={() => {
            // The animation starts when the image is shown, which is
            // this frame; a replay's onLoad fires again for the new
            // fragment URL, so this is per play, not per file.
            playStartedAt.current = performance.now();
            setIsLoaded(true);
          }}
          onError={() => setFailed(true)}
          className={`${layer} ${clipOnTop ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {/* Anchored to the SPRITE's box, not the dance's, and shown only
          with the sprite — hidden for the seconds a clip is on top, since
          an animated WebP offers no per-frame anchors to follow. */}
      {evolutionStage != null && (
        <AccessoryLayer
          evolutionStage={evolutionStage}
          equippedAccessories={equippedAccessories}
          mascot={mascot}
          className={gearClass}
        />
      )}
    </div>
  );
}
