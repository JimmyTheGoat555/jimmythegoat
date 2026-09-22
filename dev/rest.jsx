import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import FullScreenTimer from '../src/components/workout/FullScreenTimer';
import FloatingWorkoutBar from '../src/components/workout/FloatingWorkoutBar';
import { useRestTimer } from '../src/hooks/useRestTimer';
import { playRestAlarm, unlockRestAlarm } from '../src/utils/restAlarm';

// The rest timer on its own, so the overtime counter, the alarm and the
// floating bar can be watched without a workout running on a real account.
//
//   ?seconds=4   rest length (default 5)
//   ?full=0      start with the full-screen clock hidden — the floating bar
//                and the hook's raw state are what is left on screen
//   ?boost=…     the 2× ad offer in one of its states, so the copy can be
//                read without an account, a token or an ad: `offer` (the
//                button), `armed`, `busy`, or a NUMBER — how many doubled
//                sets are left on the boosted exercise, which is what the
//                "active" notice counts down (0 = spent).
//
// window.__rest is the live hook result, for driving it from the console.

const params = new URLSearchParams(location.search);
const SECONDS = Number(params.get('seconds')) || 5;

// ActiveWorkoutLogger builds this for real (from the account's tokens and
// the workout's own sets); here it is built from the query string so each
// state can be read on its own.
function boostOfferFromParams(raw) {
  if (raw === null) return null;
  if (raw === 'offer') return { available: true, onWatch: () => {} };
  if (raw === 'armed') return { armed: true };
  if (raw === 'busy') return { busy: true };
  const setsLeft = Number(raw);
  if (!Number.isFinite(setsLeft)) return null;
  return { active: true, setsLeft };
}
const BOOST_OFFER = boostOfferFromParams(params.get('boost'));

function Harness() {
  const rest = useRestTimer(SECONDS);
  const [full, setFull] = useState(params.get('full') !== '0');
  useEffect(() => {
    window.__rest = rest;
  }, [rest]);

  return (
    <div
      className="min-h-screen bg-neutral-950 p-4 text-neutral-100"
      style={{ '--tier-accent': '#f59e0b', '--tier-glow': '#f59e0b' }}
    >
      <div className="flex flex-wrap gap-2">
        <button
          id="start"
          type="button"
          onClick={() => rest.start({ seconds: SECONDS })}
          className="rounded-xl bg-white/10 px-3 py-2 text-sm"
        >
          Start {SECONDS}s rest
        </button>
        <button
          id="beep"
          type="button"
          onClick={() => {
            unlockRestAlarm();
            window.__beep = playRestAlarm();
          }}
          className="rounded-xl bg-white/10 px-3 py-2 text-sm"
        >
          Beep
        </button>
        <button
          id="toggle-full"
          type="button"
          onClick={() => setFull((f) => !f)}
          className="rounded-xl bg-white/10 px-3 py-2 text-sm"
        >
          {full ? 'Hide' : 'Show'} full-screen clock
        </button>
      </div>
      <p id="state" className="mt-3 font-mono text-xs text-neutral-400">
        {JSON.stringify({
          secondsLeft: rest.secondsLeft,
          isDone: rest.isDone,
          overdueSeconds: rest.overdueSeconds,
          isOverdue: rest.isOverdue,
        })}
      </p>

      {rest.isVisible && (
        <FloatingWorkoutBar
          startedAt={new Date(Date.now() - 10 * 60 * 1000).toISOString()}
          exerciseCount={3}
          setCount={7}
          restSecondsLeft={rest.secondsLeft}
          restOverdueSeconds={rest.overdueSeconds}
          onRestore={() => setFull(true)}
        />
      )}
      {rest.isVisible && full && (
        <FullScreenTimer
          secondsLeft={rest.secondsLeft}
          isDone={rest.isDone}
          isOverdue={rest.isOverdue}
          overdueMessage={rest.overdueMessage}
          overdueSeconds={rest.overdueSeconds}
          onAddTime={rest.addTime}
          onSkip={rest.dismiss}
          onMinimize={() => setFull(false)}
          boostOffer={BOOST_OFFER}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
