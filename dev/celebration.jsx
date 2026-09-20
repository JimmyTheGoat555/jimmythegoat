import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import WorkoutCelebration from '../src/components/workout/WorkoutCelebration';
import AnimatedWorkoutSummary from '../src/components/workout/AnimatedWorkoutSummary';
import { buildSummaryTimeline } from '../src/utils/workoutSummaryTimeline';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { tierCssVars } from '../src/utils/tierTheme';
import { STICKER_THEMES, renderWorkoutStickerCanvas } from '../src/utils/workoutSticker';
import { prepareSummaryScene } from '../src/utils/workoutSummaryScene';
import { tierTheme } from '../src/utils/tierTheme';

// The end-of-workout celebration with sample data, so it can be watched
// without finishing a real session.
//
//   ?mascot=gena         Gena in the footer (default Jimmy)
//   ?n=8                 how many exercises (default 5)
//   ?prs=2               how many of them set a record
//   ?tier=legend         which tier palette (goat | buff | titan | legend)
//   ?summary=1           the bare card, no chrome, plus a "Render sticker"
//                        button that draws the share PNG on a stand-in
//                        photo (click the photo to swap it), a row of
//                        theme buttons (#theme-classic … #theme-pulse).
//                        "Draw frame" paints the canvas twin of the card
//                        (utils/workoutSummaryScene.js) at the same
//                        instant, next to the real one
//   ?theme=clean         which sticker theme to start on (default classic)
//   ?t=2500              with summary=1: draw that instant (controlled)
//   ?optimistic=1        the finish screen as App mounts it now: up at
//                        once with the client's guess and "Saving…", then
//                        the server's records and coins land 2.5s later
//   ?replay=1            History's replay mode, fed a STORED workout doc
//                        (startedAt/finishedAt, unpublishedRecords,
//                        coinBoost markers) instead of loose props
//   ?share=1             open straight on the sticker rail, the way the
//                        share button on a History row does
//
// Dev only — this page is never built.

const params = new URLSearchParams(location.search);
const MASCOT = params.get('mascot') === 'gena' ? 'gena' : 'jimmy';
const N = Number(params.get('n')) || 5;
const PRS = Number(params.get('prs')) || 1;
const TIER = params.get('tier') || 'legend';
const SUMMARY_ONLY = params.get('summary') === '1';
const REPLAY = params.get('replay') === '1';
const SHARE = params.get('share') === '1';
const OPTIMISTIC = params.get('optimistic') === '1';
const SERVER_DELAY_MS = 2500;
const T = params.has('t') ? Number(params.get('t')) : null;
const THEME = params.get('theme') || 'classic';

const NAMES = [
  'Barbell Bench Press',
  'Incline Dumbbell Press',
  'Pull-Up',
  'Seated Cable Row',
  'Overhead Press',
  'Lateral Raise',
  'Barbell Row',
  'Cable Crossover',
  'Face Pull',
  'Dips',
  'Hammer Curl',
];
const exercises = NAMES.slice(0, N).map((name, i) => ({
  name,
  sets:
    name === 'Pull-Up' || name === 'Dips'
      ? [
          { reps: 10, isBodyweight: true },
          { reps: 8, isBodyweight: true, addedWeight: 10 },
          { reps: 8, isBodyweight: true, addedWeight: 10 },
        ]
      : [
          { reps: 10, weight: 60 + i * 5 },
          { reps: 8, weight: 70 + i * 5 },
          { reps: 6, weight: 80 + i * 5 },
          ...(i % 2 === 0 ? [{ reps: 6, weight: 80 + i * 5 }] : []),
        ],
}));
const personalRecords = exercises.slice(0, PRS).map((e) => ({ name: e.name, weight: 85, reps: 6 }));
const totalVolumeKg = exercises.reduce(
  (n, e) => n + e.sets.reduce((m, s) => m + (s.isBodyweight ? 80 + (s.addedWeight ?? 0) : s.weight) * s.reps, 0),
  0,
);
const durationMs = 62 * 60 * 1000 + 12 * 1000;

// Stand-ins for the gym selfie the sticker gets pasted on: a dark gym,
// a bright wall, a busy mid-tone — the three it has to stay legible on.
const PHOTOS = [
  'radial-gradient(circle at 30% 20%, #4a5563 0%, #1b1f26 55%, #0b0d11 100%)',
  'linear-gradient(160deg, #f3efe6 0%, #d9d2c3 60%, #bfb6a3 100%)',
  'repeating-linear-gradient(135deg, #7c6f5a 0 18px, #a08c6b 18px 36px, #5d6b7a 36px 54px)',
];

// What users/{uid}/workouts/{id} actually looks like (functions/economy.js).
const storedWorkout = {
  id: 'dev-stored',
  startedAt: new Date(Date.now() - 3 * 86400000 - durationMs).toISOString(),
  finishedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  totalVolumeKg,
  coinsEarned: 95,
  verified: true,
  unpublishedRecords: personalRecords.map((r) => ({ ...r, exerciseId: r.name.toLowerCase().replace(/ /g, '-') })),
  exercises: exercises.map((e, i) => ({
    exerciseId: e.name.toLowerCase().replace(/ /g, '-'),
    name: e.name,
    muscleGroup: 'chest',
    ...(i === 0 ? { coinBoost: 2 } : {}),
    sets: e.sets.map((s, j) => ({
      id: `s${i}-${j}`,
      completed: true,
      reps: s.reps,
      weight: s.isBodyweight ? 80 + (s.addedWeight ?? 0) : s.weight,
      relativeVolume: 1,
      ...(s.isBodyweight ? { isBodyweight: true, addedWeight: s.addedWeight ?? 0, bodyWeightAtLog: 80 } : {}),
    })),
  })),
};

function Harness() {
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  // The optimistic finish: null until the pretend server answers.
  const [serverResult, setServerResult] = useState(null);
  useEffect(() => {
    if (!OPTIMISTIC || done) return undefined;
    setServerResult(null);
    const t = setTimeout(() => setServerResult({ personalRecords, coinsEarned: 120 }), SERVER_DELAY_MS);
    return () => clearTimeout(t);
  }, [run, done]);
  const [png, setPng] = useState(null);
  const [photo, setPhoto] = useState(0);
  const [theme, setTheme] = useState(THEME);
  const [frame, setFrame] = useState(null);
  const summary = { exercises, durationMs, totalVolumeKg, personalRecords, finishedAt: null };
  const drawFrame = async () => {
    const scene = await prepareSummaryScene({ summary, mascot: MASCOT, tier: tierTheme(TIER) });
    const c = document.createElement('canvas');
    c.width = scene.width * 2;
    c.height = scene.height * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    scene.draw(ctx, T ?? scene.durationMs, 2);
    setFrame(c.toDataURL('image/png'));
  };
  const renderPng = async () => {
    const canvas = await renderWorkoutStickerCanvas({
      summary: { exercises, durationMs, totalVolumeKg, personalRecords, finishedAt: null },
      mascot: MASCOT,
      theme,
      tier: tierTheme(TIER),
    });
    setPng(canvas.toDataURL('image/png'));
  };
  const account = { mascot: MASCOT, equippedAccessories: [] };
  const timeline = buildSummaryTimeline(exercises);

  if (SUMMARY_ONLY) {
    return (
      <div className="flex min-h-screen flex-col items-center gap-3 p-6" style={tierCssVars(TIER)}>
        <p className="text-xs text-neutral-500">
          timeline ends at {timeline.endAt}ms · {T === null ? 'playing' : `frozen at ${T}ms`}
        </p>
        <div className="flex flex-wrap items-start justify-center gap-4">
          <AnimatedWorkoutSummary
            key={run}
            exercises={exercises}
            durationMs={durationMs}
            totalVolumeKg={totalVolumeKg}
            personalRecords={personalRecords}
            mascot={MASCOT}
            elapsedMs={T}
            onFinished={() => setDone(true)}
          />
          {frame && <img id="frame-png" src={frame} alt="" style={{ width: 360, height: 640 }} />}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STICKER_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              id={`theme-${t.id}`}
              aria-pressed={theme === t.id}
              className={`rounded px-3 py-1 text-xs ${theme === t.id ? 'bg-white text-black' : 'bg-white/10'}`}
              onClick={() => setTheme(t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="rounded bg-white/10 px-3 py-1 text-xs"
            onClick={() => {
              setDone(false);
              setRun((r) => r + 1);
            }}
          >
            replay {done ? '(finished)' : ''}
          </button>
          <button type="button" className="rounded bg-white/10 px-3 py-1 text-xs" onClick={renderPng}>
            Render sticker
          </button>
          <button type="button" className="rounded bg-white/10 px-3 py-1 text-xs" onClick={drawFrame}>
            Draw frame
          </button>
        </div>
        {png && (
          <button
            type="button"
            id="sticker-photo"
            onClick={() => setPhoto((p) => (p + 1) % PHOTOS.length)}
            className="flex w-[360px] items-center justify-center p-4"
            style={{ background: PHOTOS[photo], aspectRatio: '9 / 16' }}
            title="Click to swap the stand-in photo"
          >
            <img id="story-png" src={png} alt="" style={{ width: 240 }} />
          </button>
        )}
      </div>
    );
  }

  return (
    <JimmyLookProvider evolutionStage={4} account={account}>
      <div style={tierCssVars(TIER)}>
        {!done && OPTIMISTIC ? (
          <WorkoutCelebration
            key={run}
            exercises={exercises}
            durationMs={durationMs}
            totalVolumeKg={totalVolumeKg}
            personalRecords={serverResult ? serverResult.personalRecords : []}
            coinsEarned={serverResult ? serverResult.coinsEarned : 0}
            pending={!serverResult}
            onDone={() => setDone(true)}
          />
        ) : !done && REPLAY ? (
          <WorkoutCelebration
            key={run}
            replay
            startAtShare={SHARE}
            workout={storedWorkout}
            onDone={() => setDone(true)}
          />
        ) : !done ? (
          <WorkoutCelebration
            key={run}
            exercises={exercises}
            durationMs={durationMs}
            totalVolumeKg={totalVolumeKg}
            personalRecords={personalRecords}
            coinsEarned={120}
            coinBoosts={[{ exerciseId: 'bench-press', name: 'Barbell Bench Press', multiplier: 2 }]}
            startAtShare={SHARE}
            onDone={() => setDone(true)}
          />
        ) : (
          <div className="flex min-h-screen items-center justify-center">
            <button
              type="button"
              className="btn-arcade px-8 py-3"
              onClick={() => {
                setDone(false);
                setRun((r) => r + 1);
              }}
            >
              Replay
            </button>
          </div>
        )}
      </div>
    </JimmyLookProvider>
  );
}

// One root across HMR re-runs of this entry, or React warns about a
// container that already has one and the two trees fight over the DOM.
const root = (globalThis.__celebrationRoot ??= createRoot(document.getElementById('root')));
root.render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
