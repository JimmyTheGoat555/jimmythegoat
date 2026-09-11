import { useState } from 'react';
import { getDancePreviewPath, danceNumberForItemId } from '../../utils/danceAnimations';

// A first-workout-only, full-screen reward moment — see functions/economy.js's
// logWorkout, which grants a free dance exactly once, ever, per account,
// and App.jsx, which shows this INSTEAD of folding that grant into the
// normal "+N coins" toast. No framer-motion (not a project dependency —
// every animation elsewhere this session is plain CSS, see index.css's
// chest-* keyframes); confetti reuses the same dynamic
// import('canvas-confetti') pattern as useTierUpCelebration.js.
const STAGE = { CLOSED: 'closed', SHAKING: 'shaking', BURST: 'burst', REVEALED: 'revealed' };

export default function SilverLootboxModal({ reward, evolutionStage, onClose }) {
  const [stage, setStage] = useState(STAGE.CLOSED);
  const [previewBroken, setPreviewBroken] = useState(false);
  const revealed = stage === STAGE.REVEALED;

  const handleOpen = () => {
    if (stage !== STAGE.CLOSED) return; // one shot — ignore a double-tap mid-sequence
    navigator.vibrate?.([100, 50, 100]);
    setStage(STAGE.SHAKING);

    // Anticipation shake, then the burst (flash + confetti fired from
    // roughly the chest's screen position), then the reveal card.
    window.setTimeout(() => {
      setStage(STAGE.BURST);
      import('canvas-confetti')
        .then(({ default: confetti }) => {
          const base = { disableForReducedMotion: true, zIndex: 100, ticks: 300 };
          confetti({
            ...base,
            particleCount: 140,
            spread: 100,
            startVelocity: 48,
            origin: { y: 0.55 },
            colors: ['#f5f5f9', '#cacad4', '#ffffff', '#8d8d98', '#ffd76a'],
          });
          confetti({ ...base, particleCount: 60, angle: 60, spread: 70, origin: { x: 0.1, y: 0.6 } });
          confetti({ ...base, particleCount: 60, angle: 120, spread: 70, origin: { x: 0.9, y: 0.6 } });
        })
        .catch(() => {
          // Chunk failed to load (offline, blocked) — the flash + shake +
          // reveal still carry the moment.
        });
      window.setTimeout(() => setStage(STAGE.REVEALED), 550);
    }, 550);
  };

  const danceNumber = danceNumberForItemId(reward.itemId);
  const previewSrc = !previewBroken ? getDancePreviewPath(danceNumber, evolutionStage) : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center overflow-hidden bg-black">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% 42%, rgba(200,200,225,0.22), transparent 62%)' }}
      />

      {/* A low-key escape hatch from the very start — the sequence is
          meant to be savored, not skippable mid-open, but nothing here
          should be a hard trap. */}
      {!revealed && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-6 text-xs font-semibold uppercase tracking-wide text-white/40"
        >
          Skip
        </button>
      )}

      {!revealed && (
        <div className="relative flex flex-col items-center gap-8 px-6 text-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/50">First Workout Complete</p>
            <h1 className="mt-2 text-2xl font-extrabold uppercase tracking-tight text-white">
              A Silver Chest Appeared!
            </h1>
          </div>

          <div className="relative flex h-56 w-56 items-center justify-center">
            <div
              className="absolute h-40 w-40 rounded-full opacity-70 blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(210,210,230,0.8), transparent 70%)' }}
            />

            <button
              type="button"
              onClick={handleOpen}
              disabled={stage !== STAGE.CLOSED}
              aria-label="Open the silver chest"
              className={[
                'relative flex flex-col items-center active:scale-95',
                stage === STAGE.CLOSED ? 'animate-[chest-breathe_2.6s_ease-in-out_infinite]' : '',
                stage === STAGE.SHAKING ? 'animate-[chest-shake_0.55s_ease-in-out]' : '',
              ].join(' ')}
            >
              {/* Lid — flies off + fades on burst */}
              <div
                className="chest-metal chest-sheen h-14 w-40 rounded-t-2xl"
                style={{
                  transition: 'transform 0.5s ease-in, opacity 0.5s ease-in',
                  transform: stage === STAGE.BURST ? 'translateY(-60px) rotate(-20deg)' : 'translateY(0) rotate(0)',
                  opacity: stage === STAGE.BURST ? 0 : 1,
                }}
              />
              {/* Base */}
              <div className="chest-metal chest-sheen -mt-2 flex h-24 w-44 items-start justify-center rounded-2xl pt-3">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-black text-neutral-900 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #fff6d0, #d4af37)' }}
                >
                  ?
                </span>
              </div>
            </button>

            {stage === STAGE.BURST && (
              <div
                className="pointer-events-none absolute h-40 w-40 rounded-full animate-[chest-flash_0.5s_ease-out]"
                style={{ background: 'radial-gradient(circle, #fff, transparent 70%)' }}
              />
            )}
          </div>

          {stage === STAGE.CLOSED && <p className="animate-pulse text-sm text-white/60">Tap the chest to open it</p>}
        </div>
      )}

      {revealed && (
        <div className="relative flex w-full max-w-xs flex-col items-center gap-5 px-6 text-center animate-[reward-pop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_both]">
          <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#d4af37' }}>
            🎉 Legendary Unlock
          </p>

          <div className="w-full rounded-3xl p-[2px]" style={{ background: 'linear-gradient(135deg, #fff6d0, #d4af37, #fff6d0)' }}>
            <div className="flex flex-col items-center gap-3 rounded-[22px] bg-neutral-950 px-6 py-7">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt={reward.name}
                  onError={() => setPreviewBroken(true)}
                  className="h-32 w-32 object-contain"
                />
              ) : (
                <span className="text-6xl leading-none">{reward.emoji}</span>
              )}
              <p className="text-xl font-extrabold text-white">{reward.name}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Dance unlocked · Free</p>
            </div>
          </div>

          <p className="text-sm text-white/70">
            Dances are rare flex items in the Shop — you just unlocked your first one, completely free.
          </p>

          <button type="button" onClick={onClose} className="btn-arcade w-full py-4 text-lg">
            Let's Go
          </button>
        </div>
      )}
    </div>
  );
}
