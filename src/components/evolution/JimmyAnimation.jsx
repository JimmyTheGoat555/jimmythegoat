import { useState } from 'react';
import { AccessoryLayer } from './JimmyAvatar';

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
  // Streak fire, same flag JimmyAvatar takes. WorkoutHome already spreads
  // the whole useJimmyLook() object in here, so the hero goat — the
  // biggest Jimmy in the app — lights up without touching that call site.
  showFire = false,
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [replay, setReplay] = useState(0);

  // Equipping a different dance, or evolving a tier, points at a file that
  // has not loaded yet — drop back to the sprite until it has. Adjusted
  // during render rather than in an effect (React's documented pattern, as
  // in App.jsx's tab transition) so no frame shows the previous dance as if
  // it were the new one.
  const [renderedSrc, setRenderedSrc] = useState(animationSrc);
  if (renderedSrc !== animationSrc) {
    setRenderedSrc(animationSrc);
    setIsLoaded(false);
    setFailed(false);
    setReplay(0);
  }

  const showAnimation = Boolean(animationSrc) && !failed;
  const canReplay = showAnimation && isLoaded;
  // The counter only ever appends a fragment, so the browser reuses the
  // already-downloaded image and only the animation restarts.
  const playSrc = replay === 0 ? animationSrc : `${animationSrc}#${replay}`;
  const layer =
    'absolute inset-0 w-full h-full object-contain object-bottom transition-opacity duration-200';

  return (
    <div
      className={`relative ${className} ${showFire ? 'streak-fire' : ''} ${canReplay ? 'cursor-pointer' : ''}`}
      onClick={canReplay ? () => setReplay((n) => n + 1) : undefined}
      onKeyDown={
        canReplay
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setReplay((n) => n + 1);
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
          depth="behind"
        />
      )}
      <img
        src={staticImageSrc}
        alt={alt}
        onError={onImageError}
        className={`${layer} ${showAnimation && isLoaded ? 'opacity-0' : 'opacity-100'}`}
      />
      {showAnimation && (
        <img
          src={playSrc}
          alt=""
          aria-hidden="true"
          draggable="false"
          onLoad={() => setIsLoaded(true)}
          onError={() => setFailed(true)}
          className={`${layer} ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {/* Anchored to the SPRITE's box, not the dance's. The two canvases
          are different shapes (376x660 against the sprites' 528x1466), but
          they were built to put Jimmy in the same place: laid out here,
          the settled dance frame's head lands within ~2px of the sprite's
          at lobby size, measured. Mid-move he leans and the gear does not
          follow him — the honest fix would be per-frame anchors, which an
          animated WebP gives no way to read. He holds his opening pose for
          all but the couple of seconds a dance is actually playing. */}
      {evolutionStage != null && (
        <AccessoryLayer evolutionStage={evolutionStage} equippedAccessories={equippedAccessories} />
      )}
    </div>
  );
}
