import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTrainerTrainees } from '../../hooks/useTrainerTrainees';
import { lifetimeVolume, lastWorkoutAt } from '../../utils/workoutStats';
import { getEvolutionProgress } from '../../utils/evolutionTiers';
import GradientBorder from '../shared/GradientBorder';

// Reached via the "Trainees" tab — a trainer's OWN training lives in the
// same Workout/Progress/Social tabs every account gets; this screen is
// purely the roster they manage on top of that. Sign-out lives on the
// shared Profile tab now, same as for a trainee, so there's no duplicate
// sign-out control here.
export default function TrainerDashboard({ profile, workouts }) {
  const { roster } = useTrainerTrainees(profile.id);
  // Your OWN tier reflects your own neglect the same as it does on the
  // Workout/Progress tabs — a trainer who stops training slips a tier too.
  const { current: yourTier } = getEvolutionProgress(lifetimeVolume(workouts), {
    lastWorkoutAt: lastWorkoutAt(workouts),
  });
  const [mascotBroken, setMascotBroken] = useState(false);

  return (
    <div className="flex flex-col gap-4 pt-6 pb-24">
      <div className="flex items-center gap-3">
        {mascotBroken ? (
          <span className="text-4xl leading-none">{yourTier.emoji}</span>
        ) : (
          <img
            src={yourTier.image}
            alt=""
            onError={() => setMascotBroken(true)}
            className="w-14 h-14 object-contain object-top"
          />
        )}
        <div>
          <p className="text-neutral-500 text-lg">Coach dashboard</p>
          <h1 className="text-3xl font-bold text-neutral-50">{profile.displayName}</h1>
        </div>
      </div>

      <GradientBorder tierId={yourTier.id} fillClassName="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">Your trainer code</p>
          <p className="text-2xl font-bold text-neutral-50 tracking-widest">{profile.trainerCode}</p>
        </div>
        <p className="text-xs text-neutral-500 max-w-[9rem] text-right">
          Share this with a trainee so they can connect to you
        </p>
      </GradientBorder>

      <div className="flex items-center justify-between mt-2">
        <h2 className="text-lg font-bold text-neutral-50">
          Your Trainees {roster.length > 0 && `(${roster.length})`}
        </h2>
      </div>

      {roster.length === 0 ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          No trainees connected yet. Share your trainer code above to get started.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {roster.map((trainee) => (
            <li key={trainee.id}>
              <Link to={`/trainees/${trainee.id}`} className="card flex items-center gap-3 p-4">
                <span className="text-3xl leading-none">{trainee.evolution.current.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-neutral-100 truncate">
                    {trainee.displayName}
                  </p>
                  <p className="text-sm text-neutral-500">{trainee.evolution.current.label}</p>
                </div>
                <p className="text-sm font-semibold text-neutral-100 tabular-nums shrink-0">
                  {trainee.totalVolume.toLocaleString('en-US')} kg
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
