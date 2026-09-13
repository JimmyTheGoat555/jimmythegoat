import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { lifetimeVolume } from '../utils/workoutStats';
import { getEvolutionProgress, TRAINER_MIN_STAGE } from '../utils/evolutionTiers';

// One live subscription per connected trainee's workout collection, kept
// alongside the roster subscription. Not the cheapest possible design (a
// trainer with 50 trainees opens 51 listeners) but for a coach's actual
// roster size this is simple, fully realtime, and needs no Cloud Function —
// worth revisiting with a denormalized 'lifetimeVolume' field on the user
// doc if a trainer's roster ever gets large.
export function useTrainerTrainees(trainerUid) {
  const [trainees, setTrainees] = useState([]);
  const [volumeByUid, setVolumeByUid] = useState({});

  useEffect(() => {
    if (!trainerUid) {
      setTrainees([]);
      return;
    }
    const q = query(collection(db, 'users'), where('trainerId', '==', trainerUid));
    return onSnapshot(q, (snap) => {
      setTrainees(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [trainerUid]);

  useEffect(() => {
    const unsubs = trainees.map((trainee) =>
      onSnapshot(collection(db, 'users', trainee.id, 'workouts'), (snap) => {
        const workouts = snap.docs.map((d) => d.data());
        setVolumeByUid((prev) => ({ ...prev, [trainee.id]: lifetimeVolume(workouts) }));
      }),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [trainees]);

  const roster = trainees.map((trainee) => {
    const totalVolume = volumeByUid[trainee.id] ?? 0;
    // A trainee's own doc is readable by their connected trainer (see
    // firestore.rules), so `role` is right here — no need for the
    // published mirror the friend-facing screens rely on. Matters for the
    // rare coach who is also being coached.
    return {
      ...trainee,
      totalVolume,
      evolution: getEvolutionProgress(totalVolume, {
        minStage: trainee.role === 'trainer' ? TRAINER_MIN_STAGE : 1,
      }),
    };
  });

  return { roster };
}
