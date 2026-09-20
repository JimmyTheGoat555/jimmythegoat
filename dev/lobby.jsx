import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import WorkoutHome from '../src/components/workout/WorkoutHome';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { tierCssVars } from '../src/utils/tierTheme';

// The lobby on fixtures: the mascot, the XP bar and the one button, and
// the Start Workout sheet behind it with every kind of option present.
//
//   ?templates=3     saved routines (default 3; 0 disables the option)
//   ?assigned=2      trainer assignments (default 1; 0 hides the option)
//   ?cooldown=1      inside the four-hour cooldown (RestAndRecover instead)
//   ?tier=titan      the palette; also sets the mascot's volume (default buff)
//   ?mascot=gena     which character
//
// window.__started records what the sheet started, for the console.
// Dev only — this page is never built.

const params = new URLSearchParams(location.search);
const TEMPLATES = params.has('templates') ? Number(params.get('templates')) || 0 : 3;
const ASSIGNED = params.has('assigned') ? Number(params.get('assigned')) || 0 : 1;
const COOLDOWN = params.get('cooldown') === '1';
const TIER = params.get('tier') || 'buff';
const MASCOT = params.get('mascot') === 'gena' ? 'gena' : 'jimmy';
const VOLUME = { goat: 120, buff: 900, titan: 2600, legend: 6000 }[TIER] ?? 900;
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

const exercises = (n) => Array.from({ length: n }, (_, i) => ({ exerciseId: `e${i}`, name: `Exercise ${i + 1}` }));
const templates = Array.from({ length: TEMPLATES }, (_, i) => ({
  id: `t${i}`,
  title: ['Push Day', 'Pull Day', 'Leg Day', 'Upper A', 'Lower B'][i % 5],
  exercises: exercises(4 + (i % 3)),
}));
const assignments = Array.from({ length: ASSIGNED }, (_, i) => ({
  id: `a${i}`,
  title: ['Week 3 · Strength', 'Deload'][i % 2],
  assignedByName: 'Coach Dana',
  exercises: exercises(5),
}));
// One verified workout carrying the whole volume, dated so the neglect
// penalty does not bite.
const workouts = [{ id: 'w1', finishedAt: hoursAgo(20), verified: true, score: VOLUME, exercises: [] }];

function Harness() {
  const [started, setStarted] = useState(null);
  const record = (kind, data = null) => {
    setStarted({ kind, data });
    window.__started = { kind, data };
  };
  const account = { mascot: MASCOT, equippedAccessories: [], badges: [], featuredBadges: null };
  return (
    <JimmyLookProvider evolutionStage={2} account={account}>
      <div className="mx-auto max-w-md px-4" style={tierCssVars(TIER)}>
        <WorkoutHome
          onStartWorkout={() => record('empty')}
          onStartAssigned={(a) => record('assigned', a.title)}
          onStartTemplate={(t) => record('template', t.title)}
          onStartProgram={(p) =>
            record(
              'program',
              `${p.splitName} · ${p.title} · ${p.exercises.length} ex · ${p.exercises[0].sets}×${p.exercises[0].reps}`,
            )
          }
          onDeleteTemplate={(id) => record('delete', id)}
          onRecommendTemplate={(t) => record('recommend', t.title)}
          onPlanWorkout={() => record('plan')}
          cooldown={{ loading: false, isCoolingDown: COOLDOWN, remaining: '3h 12m', unlocksAt: Date.now() + 3.2e6 }}
          badges={[]}
          featuredBadges={null}
          assignments={assignments}
          templates={templates}
          workouts={workouts}
          lastWorkoutAt={workouts[0].finishedAt}
          bodyWeightKg={82}
        />
        {started && (
          <p
            data-testid="started"
            className="fixed left-0 right-0 top-2 z-[80] text-center text-xs font-semibold text-emerald-400"
          >
            started: {started.kind}
            {started.data ? ` · ${started.data}` : ''}
          </p>
        )}
      </div>
    </JimmyLookProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
