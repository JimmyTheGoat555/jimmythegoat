import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { roundToTenth } from '../utils/units';

const DEFAULT_PROFILE = {
  name: '',
  heightCm: '',
  bodyWeightLog: [], // [{ id, date, weight, visibility: 'public' | 'private' }]
  // Onboarding questionnaire (collected at sign-up, editable later from
  // Profile) — see utils/onboarding.js for the id sets bodyType/
  // fitnessGoal draw from. weeklyTarget is a plain number (workouts/week).
  bodyType: '',
  fitnessGoal: '',
  weeklyTarget: '',
  // Day of week (0 = Sunday .. 6 = Saturday) for the weekly weigh-in
  // reminder, or '' if the user hasn't set one. See utils/weighIn.js.
  weighInDay: '',
};

// Cloud replacement for the old localStorage-only useProfile — body weight
// and details used to live purely on the trainee's own device, which meant
// a trainer had literally no way to see them. Same external shape as
// before ({ profile, updateDetails, logBodyWeight, deleteBodyWeightEntry })
// so ProfileView didn't need to change beyond the import, backed instead
// by a single doc at users/{uid}/meta/profile.
export function useCloudProfile(uid) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

  useEffect(() => {
    if (!uid) {
      setProfile(DEFAULT_PROFILE);
      return;
    }
    return onSnapshot(doc(db, 'users', uid, 'meta', 'profile'), (snap) => {
      setProfile(snap.exists() ? { ...DEFAULT_PROFILE, ...snap.data() } : DEFAULT_PROFILE);
    });
  }, [uid]);

  const save = useCallback(
    (next) => {
      if (!uid) return;
      setDoc(doc(db, 'users', uid, 'meta', 'profile'), next);
    },
    [uid],
  );

  const updateDetails = useCallback(
    (patch) => {
      save({ ...profile, ...patch });
    },
    [profile, save],
  );

  // `visibility` defaults private — a weigh-in only becomes something that
  // could ever be surfaced beyond you-and-your-trainer if you explicitly
  // opt in each time (see WeighInModal), never by default.
  const logBodyWeight = useCallback(
    (weight, visibility = 'private', date = new Date().toISOString()) => {
      save({
        ...profile,
        bodyWeightLog: [
          // Same 0.1 precision the workout weight uses (utils/units.js).
          { id: crypto.randomUUID(), date, weight: roundToTenth(weight), visibility },
          ...profile.bodyWeightLog,
        ],
      });
    },
    [profile, save],
  );

  const deleteBodyWeightEntry = useCallback(
    (id) => {
      save({ ...profile, bodyWeightLog: profile.bodyWeightLog.filter((entry) => entry.id !== id) });
    },
    [profile, save],
  );

  return { profile, updateDetails, logBodyWeight, deleteBodyWeightEntry };
}

// Read-only variant for a Trainer looking at one Trainee's body weight —
// same live subscription, no mutation methods.
export function useReadOnlyProfile(uid) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    if (!uid) {
      setProfile(DEFAULT_PROFILE);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(doc(db, 'users', uid, 'meta', 'profile'), (snap) => {
      setProfile(snap.exists() ? { ...DEFAULT_PROFILE, ...snap.data() } : DEFAULT_PROFILE);
      setLoading(false);
    });
  }, [uid]);

  return { profile, loading };
}
