import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import AnimatedWorkoutSummary, { SUMMARY_HEIGHT, SUMMARY_WIDTH } from './AnimatedWorkoutSummary';
import { useJimmyLook } from '../../context/JimmyLook';
import { copyWorkoutSticker } from '../../utils/shareWorkout';
import { DEFAULT_STICKER_THEME, STICKER_THEMES, renderWorkoutStickerFile } from '../../utils/workoutSticker';
import { whenIdle } from '../../utils/idle';
import { summaryFromWorkout } from '../../utils/workoutSummaryData';

// Phase 1 of the finish flow: the victory lap, and nothing else.
//
// The replay itself is AnimatedWorkoutSummary — one fixed-size 9:16 card
// that tells the session as a story: the headline numbers count up, the
// exercises are crossed off one by one, and the Legend-tier mascot stands
// under the app's name at the bottom. This screen is only the chrome
// around it: the full-screen backdrop, the box the card is scaled to fit,
// the coin lines, the buttons, and the hand-off to Phase 2 through
// `onDone`.
//
// Nothing on this screen asks for anything. Every prompt — save this
// routine, share these records — waits until onDone fires. The moment
// you finish is for looking at what you lifted, not for answering
// questions about it.
//
// Still no framer-motion. Everything that moves here is driven off one
// requestAnimationFrame clock (hooks/useAnimationClock.js).
//
// ── TWO WAYS IN ─────────────────────────────────────────────────────────
//
// The finish flow mounts it with the server's fresh numbers as loose
// props, and `onDone` advances to Phase 2 (where the reward fires — in
// App, never here). History mounts it with `replay` and a stored
// `workout` document, and `onDone` simply closes it. The replay path
// reads a plain object and calls nothing else: no callable, no Firestore
// write, no reward. Same card, same animation, no economy.
//
// ── THE STICKER ─────────────────────────────────────────────────────────
//
// Both ways in end on the same buttons, which arrive the moment the card
// has finished (or been skipped to the end) and then wait for a tap —
// a share button that disappears two seconds after it arrives is not a
// path. What they share is NOT this card: it is the Strava-style sticker
// (utils/workoutSticker.js), in one of ten looks, every one of them a
// transparent 1080 × 1920 story with the session composed on it, so it
// drops onto a story edge to edge. "Copy to Clipboard" puts that PNG on
// the clipboard — the one route into an Instagram story a web app
// actually has (utils/shareWorkout.js) — and the toast says what to do
// next. It is the only way out: there was a share sheet under it and a
// recorded clip of the sticker beside it, and both were cut. The PNG is
// rendered the moment the card finishes, so the tap has nothing to wait
// for; see shareWorkout.js on why the copy must not wait.
//
// Once they are rendered they take the card's place on the stage: a
// beat after the replay lands, the finished card gives way to the
// stickers themselves, on a stand-in of the photo they will be pasted
// over. The stage is a rail — every look, fully rendered, one per
// screen — and choosing one is a swipe, the way Strava's share sheet
// does it. There is no row of named buttons to read: the sticker is its
// own label. What is under your thumb when you tap a button is what the
// button hands over. The card was the victory lap; the sticker is the
// thing you take away.
//
// Every look is rendered, not only the one in view, so a swipe lands on
// a finished sticker rather than a spinner: one after another, the one
// in view first, each when the thread is quiet. Under the rail sit the
// dots, and nothing else: there is no switch any more. The sticker says
// what was done and how much — the three figures and every exercise by
// name — never the sets and loads, which made it read like a receipt;
// so there is nothing to re-render, and a tap that arrives before a
// look has rendered still goes through, riding the promise.
//
// There was a solid dark card among the themes for a while; it was cut.
// Every sticker is transparent now, and the stand-in photo under the
// preview is what all of them are for.
//
// ── STRAIGHT TO THE STICKERS ────────────────────────────────────────────
//
// `startAtShare` opens on the rail with the card already at its end —
// the share button on a History row, where the session was watched
// weeks ago and the lifter wants the sticker, not the replay. Same
// screen, same buttons, no victory lap and no hold before the swap.

const EMPTY_HOLD_MS = 400;
const TOAST_MS = 5500;
// How long the finished card holds the stage before the sticker takes
// it: long enough for the last beat to land and the buttons to arrive.
const STAGE_SWAP_MS = 900;
// The stand-in for the gym selfie a transparent sticker gets pasted
// over: a dark, slightly lit surface, so white ink and its shadow read
// the way they will on a real photo.
const PHOTO_STAND_IN = 'radial-gradient(120% 90% at 28% 18%, #3d4452 0%, #1c2028 52%, #0d0f14 100%)';
const COPIED_TOAST = 'Sticker Copied! 📸 Open Instagram Story and tap Paste';

// Scales a fixed-size design box down to fit whatever space it is given,
// keeping its aspect. The card is laid out once at SUMMARY_WIDTH ×
// SUMMARY_HEIGHT and never reflows; on a phone this is what fits it
// between the status bar and the buttons.
function ScaledStage({ width, height, children }) {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const fit = () => {
      const rect = box.getBoundingClientRect();
      setScale(Math.max(0.2, Math.min(1, rect.width / width, rect.height / height)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [width, height]);
  return (
    <div ref={boxRef} className="flex h-full w-full items-center justify-center">
      <div style={{ width: width * scale, height: height * scale }}>
        <div
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// One slide of the rail: the PNG the buttons hand over, shown at its
// true proportions on the stand-in photo, never wider than the sticker's
// own design width so the type stays the size it will be. Before its
// render lands, the stand-in alone at the story's proportions,
// so the rail has something the size of a sticker to snap to.
function StickerSlide({ src, rendering, themeName }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      {src ? (
        <img
          src={src}
          alt={`Your workout sticker, ${themeName} theme`}
          draggable="false"
          className="block h-auto w-auto max-h-full max-w-full select-none rounded-[28px] object-contain p-3 transition-opacity duration-300"
          style={{
            maxWidth: 'min(100%, 344px)',
            background: PHOTO_STAND_IN,
            opacity: rendering ? 0.55 : 1,
          }}
        />
      ) : (
        <div
          role="img"
          aria-label={`${themeName} sticker, rendering`}
          className="w-full max-h-full animate-pulse rounded-[28px]"
          style={{ maxWidth: 'min(100%, 344px)', aspectRatio: '9 / 16', background: PHOTO_STAND_IN }}
        />
      )}
    </div>
  );
}

// Which slide is in view, and a way to get to another without a swipe.
// Dots, not names: the sticker on the stage is the label. Locked while a
// copy, share or recording is mid-flight, for the same reason the rail
// and the switch are: what is handed over should be what was on the
// stage when the button was tapped.
function RailDots({ value, onPick, disabled, reveal }) {
  return (
    <div
      role="tablist"
      aria-label="Sticker look"
      className="flex items-center justify-center gap-1.5 transition-all duration-500"
      style={reveal}
    >
      {STICKER_THEMES.map((theme) => {
        const selected = theme.id === value;
        return (
          <button
            key={theme.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`${theme.name} sticker`}
            disabled={disabled}
            onClick={() => onPick(theme.id)}
            className="flex h-7 items-center px-1"
          >
            <span
              aria-hidden="true"
              className={`block h-1.5 rounded-full transition-all duration-300 ${selected ? 'w-5' : 'w-1.5 bg-white/30'}`}
              style={
                selected ? { background: 'var(--tier-accent)', boxShadow: '0 0 10px -2px var(--tier-glow)' } : undefined
              }
            />
          </button>
        );
      })}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5" />
    </svg>
  );
}

// Jimmy's mark, ghosted onto the share action — the button that carries
// the sticker out of the app, and until now the only thing on this
// screen with nothing of him on it. Decorative: hidden from assistive
// tech, never a target, never a layout box. `corner` is the big button's
// version — pinned bottom-right and bleeding off the edge like a stamp,
// so the label keeps its centre — and the default is a glyph-sized mark
// beside a label.
const BRAND_MARK = '/assets/logo-mark.png';
function BrandMark({ corner = false, opacity = 0.16 }) {
  return (
    <img
      src={BRAND_MARK}
      alt=""
      aria-hidden="true"
      draggable="false"
      className={`pointer-events-none select-none ${corner ? 'absolute -bottom-2 -right-1 h-[42px] w-auto' : 'h-3.5 w-auto'}`}
      style={{ opacity }}
    />
  );
}

// How long a fresh card may play before the Skip comes back as a
// failsafe. The longest the replay can actually run is about 6.5s
// (workoutSummaryTimeline.js); this is deliberately more than double
// that, because it is a safety net and not a second skip button.
const CELEBRATION_ESCAPE_MS = 15000;

export default function WorkoutCelebration({
  // [{ name, sets: [{ reps, weight, isBodyweight, addedWeight }] }] — only
  // completed sets, filtered by the caller.
  exercises,
  // Wall-clock length of the session, from the server (logWorkout's
  // return) rather than measured here — see economy.js's durationMs for
  // why the client's own start time is not trustworthy enough to headline.
  durationMs = 0,
  totalVolumeKg = 0,
  // The SERVER's record list (logWorkout's return), keyed to rows by
  // exercise NAME. Safe because both arrays are built from the same
  // workout in the same request.
  personalRecords,
  recommendationBounty = null,
  coinsEarned = 0,
  // [{ exerciseId, name, multiplier }] — the rest-timer boosts the SERVER
  // actually applied (logWorkout's return). Named under the coin line so
  // a session that paid more than its lifts suggest says why.
  coinBoosts = [],
  // A stored workout to replay (History). Loose props above override
  // whatever it carries — see summaryFromWorkout.
  workout = null,
  // Replay: "Done" instead of the hand-off, and the coin line reads as a
  // record of what was earned, not a payout.
  replay = false,
  // Open on the stickers, with the card already at its end and no hold
  // before the swap — the share button on a History row. See the header.
  startAtShare = false,
  // The finish flow mounts this the moment "Done" is tapped, while the
  // server is still logging the workout. Until it answers, the records
  // and coins above are the client's own guess and "Continue" waits:
  // what comes after the celebration (the coin toast, the PR share)
  // needs the server's word.
  pending = false,
  // Called SYNCHRONOUSLY from the "Copy to Clipboard" tap with { summary,
  // mascot, equippedAccessories, theme, sticker } and
  // expected to return a promise of 'copied' | 'failed' | 'unsupported'.
  onCopy = copyWorkoutSticker,
  onDone,
}) {
  const jimmyLook = useJimmyLook();
  const [finished, setFinished] = useState(startAtShare);
  const [skipped, setSkipped] = useState(startAtShare);
  // See `skippable` below — the escape hatch for a replay that never
  // reports finishing. Never armed on a History replay, which is
  // skippable from the first frame anyway.
  const [escaped, setEscaped] = useState(false);
  useEffect(() => {
    if (replay || startAtShare) return undefined;
    const t = setTimeout(() => setEscaped(true), CELEBRATION_ESCAPE_MS);
    return () => clearTimeout(t);
  }, [replay, startAtShare]);
  const [copyState, setCopyState] = useState(null);
  const [toast, setToast] = useState(null);
  // Which look the sticker is rendered in. The transparent original is
  // the default: it is the one that goes over a photo.
  const [theme, setTheme] = useState(DEFAULT_STICKER_THEME);
  // The rendered PNGs as object URLs, by look, for the rail; and
  // whether the stage is ready to show them (see STAGE_SWAP_MS).
  const [previews, setPreviews] = useState(() => new Map());
  const previewsRef = useRef(previews);
  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  const [stageReady, setStageReady] = useState(startAtShare);
  // The sticker PNGs, rendered as soon as the card finishes — by
  // look, a promise of a File (or of null if it could not be made)
  // and, once resolved, the File itself. Ready before the buttons are,
  // so a tap goes straight to the clipboard; and handing
  // over the File rather than its promise means the clipboard write does
  // not depend on the browser accepting a promise inside a ClipboardItem.
  const rendersRef = useRef(new Map());
  const filesRef = useRef(new Map());
  // The rail, and the frame in which its scroll is next read.
  const railRef = useRef(null);
  const railFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(railFrame.current), []);
  // The selection as the scroll handler sees it — a frame callback can
  // outlive the render it was queued in.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  // One shape whichever way we were mounted. The session itself is
  // computed once — it is finished, it does not change — while what it
  // EARNED (records, coins, boosts) follows the props, because on the
  // finish screen those arrive from the server after this has mounted.
  const [base] = useState(() => {
    const fromWorkout = workout ? summaryFromWorkout(workout) : null;
    return {
      exercises: exercises ?? fromWorkout?.exercises ?? [],
      durationMs: durationMs || fromWorkout?.durationMs || 0,
      totalVolumeKg: totalVolumeKg || fromWorkout?.totalVolumeKg || 0,
      finishedAt: fromWorkout?.finishedAt ?? null,
      storedRecords: fromWorkout?.personalRecords ?? [],
      storedCoins: fromWorkout?.coinsEarned || 0,
      storedBoosts: fromWorkout?.coinBoosts ?? [],
    };
  });
  const summary = useMemo(
    () => ({
      exercises: base.exercises,
      durationMs: base.durationMs,
      totalVolumeKg: base.totalVolumeKg,
      finishedAt: base.finishedAt,
      personalRecords: personalRecords ?? base.storedRecords,
      coinsEarned: coinsEarned || base.storedCoins,
      coinBoosts: coinBoosts?.length ? coinBoosts : base.storedBoosts,
    }),
    [base, personalRecords, coinsEarned, coinBoosts],
  );
  const empty = summary.exercises.length === 0;
  const stickerOptions = () => {
    const key = theme;
    return {
      summary,
      mascot: jimmyLook.mascot,
      equippedAccessories: jimmyLook.equippedAccessories,
      theme,
      sticker: filesRef.current.get(key) ?? rendersRef.current.get(key) ?? undefined,
    };
  };

  // The rail's touches are its own. App.jsx's Layout listens for a
  // horizontal flick across the whole tab area (hooks/useTabSwipe.js)
  // and turns it into a tab change — with native listeners on its
  // container, which fire on the way up BEFORE the event reaches
  // React's root, so a synthetic onTouchStart stopPropagation here
  // would come too late. A swipe along the rail is exactly that flick,
  // and until this it also flipped the tab underneath the celebration.
  // So the same kind of listener, one element down: the touch events
  // stop at the rail and the container never hears them. Passive —
  // propagation may be stopped from a passive listener; the scrolling
  // itself is not touched.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;
    const keep = (e) => e.stopPropagation();
    const events = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    for (const type of events) rail.addEventListener(type, keep, { passive: true });
    return () => {
      for (const type of events) rail.removeEventListener(type, keep);
    };
    // The rail mounts with the finished card (finished && !empty): that
    // is when there is an element to listen on.
  }, [finished, empty]);

  // Held in a ref so a changing callback identity can't restart the
  // hold timer mid-flight.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Replay over: the success pattern, then the screen holds for the tap
  // rather than moving on by itself. Only an empty session, with nothing
  // to show or share, advances on its own.
  useEffect(() => {
    if (!finished) return undefined;
    if (!empty) {
      // No fanfare for a screen opened straight on the stickers: nothing
      // was just achieved, a button was tapped.
      if (!startAtShare) navigator.vibrate?.([100, 50, 100]);
      return undefined;
    }
    const t = setTimeout(() => onDoneRef.current?.(), EMPTY_HOLD_MS);
    return () => clearTimeout(t);
  }, [finished, empty, startAtShare]);

  // Rendered when the card finishes — every look, one after another, the
  // one in view first — and kept for as long as the screen is up.
  //
  // And rendered when the thread is quiet, not in the frame the card
  // finishes in: that frame already carries the last beat, the haptic and
  // the buttons arriving, and a 960px canvas encode on top of it is a
  // visible hitch on a phone. A tap that lands before it has started
  // still goes through — it rides the promise.
  useEffect(() => {
    if (!finished || empty) return undefined;
    let stale = false;
    const cancels = [];
    const order = [theme, ...STICKER_THEMES.map((t) => t.id).filter((id) => id !== theme)];
    let chain = Promise.resolve();
    for (const id of order) {
      const key = id;
      if (filesRef.current.has(key)) continue;
      const render = chain
        .then(
          () =>
            new Promise((resolve) => {
              cancels.push(whenIdle(resolve, { timeout: 400 }));
            }),
        )
        .then(() =>
          stale
            ? null
            : renderWorkoutStickerFile({
                summary,
                mascot: jimmyLook.mascot,
                equippedAccessories: jimmyLook.equippedAccessories,
                theme: id,
              }),
        )
        .then((file) => {
          if (stale) return file;
          filesRef.current.set(key, file);
          // The rail shows the same File the buttons hand over — one
          // render, one image.
          if (file) setPreviews((prev) => new Map(prev).set(key, URL.createObjectURL(file)));
          return file;
        })
        .catch(() => null);
      rendersRef.current.set(key, render);
      chain = render;
    }
    return () => {
      stale = true;
      cancels.forEach((cancel) => cancel?.());
    };
    // Reads the frozen summary and the look (fixed once `finished` is
    // true); `theme` only orders the queue and must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, empty]);
  // The URLs go with the screen.
  useEffect(
    () => () => {
      for (const url of previewsRef.current.values()) URL.revokeObjectURL(url);
    },
    [],
  );

  // The card keeps the stage for a beat after it lands, then the rail
  // takes over (once something is on it — a slow render simply holds
  // the card a little longer).
  useEffect(() => {
    if (!finished || empty || stageReady) return undefined;
    const t = setTimeout(() => setStageReady(true), STAGE_SWAP_MS);
    return () => clearTimeout(t);
  }, [finished, empty, stageReady]);
  const showSticker = stageReady && previews.size > 0;

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const showToast = (text, tone = 'success') => setToast({ text, tone, key: Date.now() });

  // No await before onCopy: Safari only honours a clipboard write made in
  // the tap itself. The still-rendering PNG, if it is, rides inside the
  // ClipboardItem as a promise — see shareWorkout.js.
  const handleCopy = () => {
    if (copyState === 'copying') return;
    setCopyState('copying');
    let outcome;
    try {
      outcome = onCopy(stickerOptions());
    } catch {
      outcome = 'failed';
    }
    Promise.resolve(outcome).then(
      (result) => {
        const state = result ?? 'copied';
        setCopyState(state);
        if (state === 'copied') showToast(COPIED_TOAST);
        else if (state === 'unsupported') showToast("This browser can't copy images. Try Safari or Chrome.", 'error');
        else showToast("Couldn't copy the sticker. Tap to try again.", 'error');
      },
      () => {
        setCopyState('failed');
        showToast("Couldn't copy the sticker. Tap to try again.", 'error');
      },
    );
  };
  const copyLabel =
    copyState === 'copying' ? 'Copying sticker…' : copyState === 'copied' ? 'Sticker copied ✓' : 'Copy to Clipboard';

  // Not while a copy is mid-flight: what is handed over should be what
  // the stage showed when the button was tapped.
  const busy = copyState === 'copying';
  // A change to what the sticker shows: the old "copied ✓" is about a
  // different image.
  const invalidateOutputs = () => setCopyState(null);
  const changeTheme = (next) => {
    if (busy || next === themeRef.current) return;
    navigator.vibrate?.([12]);
    setTheme(next);
    invalidateOutputs();
  };
  // The look in view is the selection. Read from the slide nearest the
  // centre, once per frame — cheap for four slides — and acted on only
  // when it changes, so a swipe ticks once, where the snap will land it,
  // and not on every pixel.
  const handleRailScroll = () => {
    if (railFrame.current) return;
    railFrame.current = requestAnimationFrame(() => {
      railFrame.current = 0;
      const rail = railRef.current;
      if (!rail) return;
      const middle = rail.scrollLeft + rail.clientWidth / 2;
      let nearest = null;
      let distance = Infinity;
      for (const slide of rail.children) {
        const gap = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - middle);
        if (gap < distance) {
          distance = gap;
          nearest = slide.dataset.theme;
        }
      }
      if (nearest) changeTheme(nearest);
    });
  };
  // A dot tap: the rail moves, and the scroll handler makes the choice,
  // so there is exactly one place where the selection is decided.
  const scrollToTheme = (id) => {
    const rail = railRef.current;
    const slide = rail?.querySelector(`[data-theme="${id}"]`);
    if (!rail || !slide) return;
    rail.scrollTo({ left: slide.offsetLeft - (rail.clientWidth - slide.offsetWidth) / 2, behavior: 'smooth' });
  };
  // The rail does not move while a copy is in flight — the selection is
  // what the button was tapped over — nor before the card is done.
  const railLocked = !finished || busy;

  // ── Why a fresh workout cannot be skipped ─────────────────────────
  //
  // The replay used to be skippable from its first frame. It isn't any
  // more, for the workout you have just finished: this is the payoff the
  // whole session is for, it runs under seven seconds (see
  // workoutSummaryTimeline.js), and a "Skip" sitting there the entire
  // time teaches people to reach for it before they have seen the thing
  // once. So while a FRESH card is playing there is no button at all —
  // not a disabled one, which would just be the same invitation greyed
  // out — and "Continue" arrives with the finished card.
  //
  // A HISTORY replay keeps its Skip. That card is something you opened on
  // purpose to get at the sticker, often weeks later, and making someone
  // sit through the animation to reach a share button they came for is a
  // different thing entirely from letting them enjoy their own finish.
  //
  // `escaped` is the failsafe, and only that. If `onFinished` never
  // arrives — the clock is driven by requestAnimationFrame and the page
  // being hidden pauses it, but a thrown render or a wedged frame loop
  // would strand somebody on a full-screen overlay with no way out — the
  // Skip comes back after a window more than twice the longest possible
  // card. It should never fire in normal use.
  const skippable = replay || escaped;
  const skip = () => {
    if (finished && pending) return;
    if (finished) onDoneRef.current?.();
    else if (skippable) setSkipped(true);
  };

  // A row crossed off is felt as well as seen; the rhythm is legible
  // through a pocket.
  const handleBeat = (kind) => navigator.vibrate?.(kind === 'finish' ? [40] : [14]);

  const revealStyle = {
    opacity: finished ? 1 : 0,
    transform: finished ? 'none' : 'translateY(6px)',
    pointerEvents: finished ? 'auto' : 'none',
  };

  return (
    <div className="fixed inset-0 z-[65] flex flex-col bg-[#06021c]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: finished ? 0.5 : 0.28,
          transition: 'opacity 900ms ease',
          background:
            'radial-gradient(60% 40% at 50% 0%, var(--tier-glow), transparent 70%), radial-gradient(50% 30% at 50% 100%, color-mix(in srgb, var(--success) 35%, transparent), transparent 70%)',
        }}
      />

      {/* The one loud thing on the screen when it shows: what just
          happened, and the next tap to make. */}
      {toast && (
        <div
          key={toast.key}
          role="status"
          aria-live="polite"
          className="tip-enter pointer-events-none absolute left-4 right-4 top-[calc(var(--safe-t)+14px)] z-10 flex justify-center"
        >
          <div
            className="max-w-sm rounded-2xl bg-white px-4 py-3 text-center text-[15px] font-bold leading-snug text-[var(--color-jimmy-950)]"
            style={{
              boxShadow: `0 0 0 2px ${toast.tone === 'error' ? '#ff5a5f' : 'var(--tier-accent)'}, 0 16px 40px -12px rgba(0,0,0,0.85)`,
            }}
          >
            {toast.text}
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 px-5 pb-2 pt-[calc(var(--safe-t)+14px)]">
        {/* The card and the sticker share the stage: the card plays,
            holds for a beat, then fades under the sticker. Both stay
            mounted — the card has nothing left to do once finished, and
            the sticker's image must not be re-decoded on every swap of
            the switch. */}
        <div
          className="absolute inset-x-5 bottom-2 top-[calc(var(--safe-t)+14px)] transition-opacity duration-500"
          style={{ opacity: showSticker ? 0 : 1 }}
          aria-hidden={showSticker}
        >
          <ScaledStage width={SUMMARY_WIDTH} height={SUMMARY_HEIGHT}>
            <AnimatedWorkoutSummary
              exercises={summary.exercises}
              durationMs={summary.durationMs}
              totalVolumeKg={summary.totalVolumeKg}
              personalRecords={summary.personalRecords}
              finishedAt={summary.finishedAt}
              mascot={jimmyLook.mascot}
              equippedAccessories={jimmyLook.equippedAccessories}
              skipToEnd={skipped}
              onFinished={() => setFinished(true)}
              onBeat={handleBeat}
            />
          </ScaledStage>
        </div>
        {finished && !empty && (
          <div
            className="absolute inset-x-5 bottom-2 top-[calc(var(--safe-t)+14px)] transition-opacity duration-500"
            style={{ opacity: showSticker ? 1 : 0, pointerEvents: showSticker ? 'auto' : 'none' }}
            aria-hidden={!showSticker}
          >
            {/* The rail: one slide per look, the whole stage wide, snapping
                to centre. Locked by switching its overflow off, which keeps
                its position — the slide in view stays the slide in view.
                touch-pan-x: a finger on it pans it and nothing else, and
                the browser commits to that at the first pixel instead of
                waiting to see which way the touch drifts (pinch-zoom is
                kept — index.css on why); overscroll-x-contain: either end
                is the end, nothing behind it scrolls on and no browser
                turns the overrun into a back-swipe. The tab swipe under
                the screen is dealt with in the effect on railRef. */}
            <div
              ref={railRef}
              onScroll={handleRailScroll}
              role="group"
              aria-roledescription="carousel"
              aria-label="Sticker looks — swipe to choose"
              className={`scrollbar-none flex h-full w-full snap-x snap-mandatory touch-pan-x touch-pinch-zoom overscroll-x-contain ${
                railLocked ? 'overflow-x-hidden' : 'overflow-x-auto'
              }`}
            >
              {STICKER_THEMES.map((look) => {
                const key = look.id;
                return (
                  <div
                    key={look.id}
                    data-theme={look.id}
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${look.name} sticker`}
                    className="h-full w-full shrink-0 snap-center"
                  >
                    <StickerSlide
                      src={previews.get(key) ?? null}
                      rendering={!filesRef.current.has(key)}
                      themeName={look.name}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Everything below is held back until the replay is over, so
          nothing competes with the beat. */}
      <div className="relative flex shrink-0 flex-col items-center gap-2.5 px-6 pb-[calc(var(--safe-b)+18px)] pt-2">
        <div
          className="flex min-h-[22px] flex-col items-center gap-1"
          style={{
            opacity: finished ? 1 : 0,
            transition: 'opacity 600ms ease',
          }}
        >
          {summary.coinsEarned > 0 && (
            <p className="text-center text-base font-bold text-[var(--tier-accent)]">
              🪙 {replay ? `Earned ${summary.coinsEarned} coins` : `+${summary.coinsEarned} coins`}
            </p>
          )}
          {summary.coinsEarned > 0 && summary.coinBoosts.length > 0 && (
            <p className="text-center text-xs font-semibold text-amber-300">
              ⚡{' '}
              {summary.coinBoosts.length > 2
                ? `${summary.coinBoosts[0].multiplier}× coins on ${summary.coinBoosts.length} exercises`
                : summary.coinBoosts.map((boost) => `${boost.multiplier}× on ${boost.name}`).join(' · ')}
            </p>
          )}
          {recommendationBounty && (
            <p className="text-center text-sm text-amber-300">
              🪙 {recommendationBounty.senderName} earned {recommendationBounty.coins} coins for sending you this.
            </p>
          )}
        </div>
        <div className="flex w-full max-w-sm flex-col items-center gap-2">
          {/* All of these arrive with the finished card — held back until
              then so they never compete with the replay, and never offer
              a card that is still counting. Same controls on the finish
              screen and on a History replay. */}
          {!empty && (
            <RailDots value={theme} onPick={scrollToTheme} disabled={!finished || busy} reveal={revealStyle} />
          )}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!finished || copyState === 'copying'}
            aria-hidden={!finished}
            className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-3.5 text-[15px] font-black text-[var(--color-jimmy-950)] transition-all duration-500 active:scale-[0.98] disabled:active:scale-100"
            style={{
              ...revealStyle,
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0) 55%), var(--tier-accent)',
              boxShadow: finished ? '0 0 30px -6px var(--tier-glow), 0 10px 24px -14px rgba(0,0,0,0.8)' : 'none',
            }}
          >
            <BrandMark corner opacity={0.2} />
            <CopyIcon />
            {copyLabel}
          </button>
          {/* Gone rather than disabled while a fresh card plays — see
              `skippable`. min-h holds the row's height across the swap so
              the coin lines above it do not jump when it appears. */}
          <div className="flex min-h-[3.25rem] w-full items-center">
            {(finished || skippable) && (
              <button
                type="button"
                onClick={skip}
                disabled={finished && pending}
                aria-busy={finished && pending}
                className="btn-arcade mt-0.5 w-full py-3.5 text-base disabled:opacity-70"
              >
                {finished ? (pending ? 'Saving…' : replay ? 'Done' : 'Continue') : 'Skip'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
