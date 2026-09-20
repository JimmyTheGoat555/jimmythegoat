import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import '../src/index.css';
import RecentWorkoutsList from '../src/components/progress/RecentWorkoutsList';
import HistoryList from '../src/components/history/HistoryList';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { tierCssVars } from '../src/utils/tierTheme';

// The two lists a past workout is shared from, with fixture sessions, so
// the row-level share button can be tapped without an account. It must
// open the finish screen straight on its sticker rail, and it must NOT
// navigate the row's Link — the route readout at the top says where the
// router thinks it is.
//
//   ?list=history   the History page instead of the Progress tab's Recent
//   ?tier=titan     the viewer's tier palette (default buff)
//
// Dev only — this page is never built.

const params = new URLSearchParams(location.search);
const LIST = params.get('list') || 'recent';
const TIER = params.get('tier') || 'buff';
const daysAgo = (days, ms = 0) => new Date(Date.now() - days * 86400000 - ms).toISOString();

// What users/{uid}/workouts/{id} looks like (functions/economy.js), for
// three sessions of different sizes.
function stored(id, daysBack, names, muscleGroup) {
  const exercises = names.map((name, i) => ({
    exerciseId: name.toLowerCase().replace(/ /g, '-'),
    name,
    muscleGroup,
    sets: [10, 8, 6].map((reps, j) => ({
      id: `${id}-${i}-${j}`,
      completed: true,
      reps,
      weight: 60 + i * 5 + j * 10,
      relativeVolume: 1,
    })),
  }));
  const totalVolumeKg = exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + s.reps * s.weight, 0), 0);
  const durationMs = 55 * 60 * 1000;
  return {
    id,
    startedAt: daysAgo(daysBack, durationMs),
    finishedAt: daysAgo(daysBack),
    totalVolumeKg,
    coinsEarned: 80,
    verified: true,
    unpublishedRecords: [],
    exercises,
  };
}
const WORKOUTS = [
  stored('w1', 1, ['Barbell Bench Press', 'Incline Dumbbell Press', 'Cable Crossover', 'Dips'], 'chest'),
  stored('w2', 3, ['Back Squat', 'Romanian Deadlift', 'Leg Press', 'Calf Raise'], 'legs'),
  stored('w3', 6, ['Pull-Up', 'Barbell Row', 'Face Pull'], 'back'),
];

function Where() {
  const { pathname } = useLocation();
  return (
    <p id="route" className="text-xs text-neutral-500">
      route: {pathname}
    </p>
  );
}

function Harness() {
  return (
    <JimmyLookProvider evolutionStage={2} account={{ mascot: 'jimmy', equippedAccessories: [] }}>
      <div className="mx-auto max-w-md px-4 pt-4" style={tierCssVars(TIER)}>
        <Where />
        <Routes>
          <Route
            path="*"
            element={
              LIST === 'history' ? (
                <HistoryList workouts={WORKOUTS} deleteWorkout={() => {}} />
              ) : (
                <RecentWorkoutsList workouts={WORKOUTS} />
              )
            }
          />
        </Routes>
      </div>
    </JimmyLookProvider>
  );
}

// One root across HMR re-runs of this entry, or React warns about a
// container that already has one and the two trees fight over the DOM.
const root = (globalThis.__recentRoot ??= createRoot(document.getElementById('root')));
root.render(
  <StrictMode>
    <MemoryRouter initialEntries={[LIST === 'history' ? '/history' : '/progress']}>
      <Harness />
    </MemoryRouter>
  </StrictMode>,
);
