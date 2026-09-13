import { useEffect, useState } from 'react';
import { getStoreItem } from '../../data/storeItems';
import { getTierByStage } from '../../utils/evolutionTiers';
import { danceNumberForItemId, getDanceAnimationPath } from '../../utils/danceAnimations';
import JimmyAnimation from '../evolution/JimmyAnimation';

// Someone else's dance showcase: their goat, in their gear, performing the
// emotes they unlocked. Opened by tapping the avatar on their profile.
//
// Everything it draws arrives as props from PublicFriendProfile, already
// through sanitizeFriendData — this component never fetches and never sees
// the raw summary, so it cannot render a field the allowlist has not been
// taught about. `unlockedDances` is reduced to real catalog ids there too,
// which is what makes the path lookup below safe: getDanceAnimationPath
// interpolates a number into a URL, and that number can only ever come
// from an id the catalog already knows.
//
// Same overlay language as NudgeModal/ConfirmDialog: dark scrim, rounded
// sheet from the bottom on phones and a centred card from `sm` up, closed
// by the ✕, the scrim, or Escape.
export default function FriendDancesModal({
  friendName,
  evolutionStage,
  equippedAccessories = [],
  unlockedDances = [],
  equippedDance = null,
  dancesPublished = true,
  onClose,
}) {
  // What is playing, and how many times it has been asked to play.
  //
  // The counter is the whole trick. An animated WebP has no play() — the
  // only handle on playback is the src string, and the browser keeps one
  // animation state per URL, so re-rendering the same src just joins the
  // playhead already in flight (see JimmyAnimation for the measurement
  // behind that). Bumping a counter into the fragment makes each press a
  // distinct URL to the image decoder while staying the same resource to
  // the network — a real restart that costs no bytes.
  //
  // Opens on whatever they have equipped, when they have one: that is the
  // dance they chose to be seen doing, so it is the right thing to be
  // mid-performance when the sheet slides up.
  const [playing, setPlaying] = useState(() =>
    equippedDance ? { id: equippedDance, plays: 1 } : null,
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tier = getTierByStage(evolutionStage);
  const danceNumber = danceNumberForItemId(playing?.id);
  const basePath = getDanceAnimationPath(danceNumber, evolutionStage);
  // No path at all (nothing selected yet) leaves JimmyAnimation showing
  // the static sprite, which is exactly the resting state we want.
  const animationSrc = basePath && playing.plays > 1 ? `${basePath}#${playing.plays}` : basePath;

  const play = (danceId) => {
    navigator.vibrate?.([30]);
    setPlaying((prev) =>
      prev?.id === danceId ? { id: danceId, plays: prev.plays + 1 } : { id: danceId, plays: 1 },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm sm:rounded-3xl rounded-t-3xl bg-neutral-950 border border-white/10 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${friendName}'s dances`}
      >
        <div className="sticky top-0 z-10 bg-neutral-950 flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <div>
            <h2 className="text-xl font-bold text-neutral-50">{friendName}'s moves</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {unlockedDances.length > 0
                ? 'Tap one to make them perform it.'
                : 'Nothing unlocked yet.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-500 text-2xl leading-none px-1">
            ✕
          </button>
        </div>

        {/* The stage. Fixed height so switching between a dance and the
            static sprite never resizes the sheet under the buttons — both
            layers are built to the same character height and floor line
            (see JimmyAnimation), so the swap is invisible. */}
        <div className="px-5 pt-4">
          <div className="relative h-56 rounded-2xl bg-gradient-to-b from-white/[0.06] to-transparent border border-white/5 flex items-end justify-center overflow-hidden">
            <JimmyAnimation
              animationSrc={animationSrc}
              staticImageSrc={tier?.image}
              alt={`${friendName} the ${tier?.label ?? 'goat'}`}
              className="h-48 w-40 mb-3"
              evolutionStage={evolutionStage}
              equippedAccessories={equippedAccessories}
            />
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-2">
          {unlockedDances.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {dancesPublished
                ? `${friendName} hasn't unlocked any dances yet. Out-lift them while you can.`
                : `${friendName}'s dances will show up here after their next workout.`}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {unlockedDances.map((danceId) => {
                const item = getStoreItem(danceId);
                const isPlaying = playing?.id === danceId;
                return (
                  <button
                    key={danceId}
                    type="button"
                    onClick={() => play(danceId)}
                    // active:scale, not a keyframe: the press should track
                    // the finger and spring back on release, which is a
                    // state, not an animation with a duration.
                    className={`flex items-center gap-2 text-left text-sm rounded-xl px-3 py-2.5 border transition-all duration-150 active:scale-95 ${
                      isPlaying
                        ? 'bg-[var(--ember)]/15 border-[var(--ember)]/40 text-neutral-100'
                        : 'bg-white/5 border-white/10 text-neutral-300'
                    }`}
                    aria-pressed={isPlaying}
                  >
                    <span className="text-lg leading-none">{item?.emoji ?? '🎵'}</span>
                    <span className="font-medium truncate">{item?.name ?? 'Dance'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
