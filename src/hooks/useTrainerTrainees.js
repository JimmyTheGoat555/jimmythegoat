import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { lifetimeVolume } from '../utils/workoutStats';
import { getEvolutionProgress, progressionScale, TRAINER_MIN_STAGE } from '../utils/evolutionTiers';

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

  // `trainees` is a brand-new array identity on EVERY roster snapshot —
  // `snap.docs.map(...)` rebuilds it even when the update touched
  // something these listeners don't care about, which is most of the time
  // (a trainee's coins ticking up after a workout rewrites their user
  // doc). Depending on the array directly tore down and re-opened all N
  // workout subscriptions on each of those, and a fresh onSnapshot always
  // replays the whole collection — so one trainee earning a coin cost a
  // full re-read of every trainee's entire workout history.
  //
  // Only the SET OF IDS actually matters to this effect, so it depends on
  // a stringified list of them: same ids, same string, no re-subscribe.
  // Same idiom as useFeed.js's `friendUidsKey`, and safe for the same
  // reason — Firestore uids are alphanumeric, so a comma can't appear
  // inside one and split() is the exact inverse of join().
  const traineeIdsKey = trainees.map((t) => t.id).join(',');

  useEffect(() => {
    // '' is the empty roster; ''.split(',') would hand back [''] and open
    // a listener on users//workouts.
    const traineeIds = traineeIdsKey ? traineeIdsKey.split(',') : [];
    const unsubs = traineeIds.map((traineeId) =>
      onSnapshot(collection(db, 'users', traineeId, 'workouts'), (snap) => {
        const workouts = snap.docs.map((d) => d.data());
        setVolumeByUid((prev) => ({ ...prev, [traineeId]: lifetimeVolume(workouts) }));
      }),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }, [traineeIdsKey]);

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
        // Their own doc again: the mascot and the gender answer are right
        // here, so the coach sees the trainee on the ladder they climb.
        scale: progressionScale(trainee),
      }),
    };
  });

  return { roster };
}
