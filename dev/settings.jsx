import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import SettingsPanel from '../src/components/profile/SettingsPanel';
import { JimmyLookProvider } from '../src/context/JimmyLook';
import { tierCssVars } from '../src/utils/tierTheme';

// The Settings overlay on a fake account, for the role switch: the two
// cards, the confirm dialog each way, the busy state and the notice, with
// the callable replaced by a promise that flips the fake account.
//
//   ?role=trainer    start as a coach (default trainee)
//   ?coached=1       start connected to a coach (trainee only)
//   ?fail=1          the callable is not deployed (functions/not-found)
//   ?slow=1          a two-second round trip, to see "Switching…"
//   ?tier=titan      the palette (default buff)
//
// Dev only — this page is never built. The trainee-count listener runs
// against the real project as whoever the dev app is signed in as and is
// refused for a uid it does not own, which is the "count unknown" copy.

const params = new URLSearchParams(location.search);
const ROLE = params.get('role') === 'trainer' ? 'trainer' : 'trainee';
const COACHED = params.get('coached') === '1';
const FAIL = params.get('fail') === '1';
const SLOW = params.get('slow') === '1';
const TIER = params.get('tier') || 'buff';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noop = async () => {};

const PROFILE = {
  fitnessGoal: 'strength',
  weeklyTarget: 3,
  heightCm: 180,
  bodyWeightLog: [{ id: 'w1', date: '2026-09-18', weight: 82 }],
};

function Harness() {
  const [account, setAccount] = useState({
    id: 'dev',
    displayName: 'Reef',
    email: 'dev@example.com',
    role: ROLE,
    trainerCode: ROLE === 'trainer' ? 'K7Q2ZP' : null,
    trainerId: ROLE === 'trainee' && COACHED ? 'coach-1' : null,
    mascot: 'jimmy',
    equippedAccessories: [],
    sharePRs: false,
    askForLocker: true,
    defaultRestTimer: 90,
    coins: 120,
  });

  const onUpdateRole = async (role) => {
    await wait(SLOW ? 2000 : 600);
    if (FAIL) {
      const err = new Error('not-found');
      err.code = 'functions/not-found';
      throw err;
    }
    const trainerCode = role === 'trainer' ? (account.trainerCode ?? 'K7Q2ZP') : account.trainerCode;
    setAccount((prev) => ({ ...prev, role, trainerCode, trainerId: role === 'trainer' ? null : prev.trainerId }));
    window.__lastRoleCall = role;
    return {
      role,
      changed: true,
      trainerCode: role === 'trainer' ? trainerCode : null,
      traineesReleased: role === 'trainee' ? 2 : 0,
      assignmentsRemoved: role === 'trainee' ? 3 : 0,
    };
  };

  window.__account = account;
  return (
    <JimmyLookProvider evolutionStage={2} account={account}>
      <div className="min-h-screen" style={tierCssVars(TIER)}>
        <SettingsPanel
          account={account}
          profile={PROFILE}
          uid="dev"
          onUpdateUsername={async (name) => name}
          onUpdateGoals={noop}
          onUpdateDetails={noop}
          onLogBodyWeight={noop}
          onSignOut={noop}
          onDeleteAccount={noop}
          onUpdateSharePRs={noop}
          onUpdateAskForLocker={noop}
          onUpdateDefaultRestTimer={noop}
          onUpdateMascot={noop}
          onUpdateRole={onUpdateRole}
          onClose={() => {}}
        />
      </div>
    </JimmyLookProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
