import { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// The Founder Console's live operations — thin wrappers over the admin-only
// callables in functions/adminOps.js (the global ones) and
// functions/adminUserActions.js (the targeted ones). Each returns the
// callable's payload or throws a plain Error whose message the panel can
// show; `busy` names the operation in flight so a form can lock itself.
function describe(err) {
  if (err?.code === 'functions/permission-denied') return 'This account is not an admin.';
  if (err?.code === 'functions/not-found' && /No account/.test(err?.message ?? '')) return err.message;
  if (err?.code === 'functions/invalid-argument' || err?.code === 'functions/failed-precondition') return err.message;
  if (err?.code === 'functions/not-found' || err?.code === 'functions/unavailable') {
    return 'That operation is not deployed yet — deploy functions and try again.';
  }
  return err?.message ?? 'Something went wrong.';
}

export function useAdminOps() {
  const [busy, setBusy] = useState(null);

  const run = useCallback(async (name, payload) => {
    setBusy(name);
    try {
      const { data } = await httpsCallable(functions, name)(payload);
      return data;
    } catch (err) {
      throw new Error(describe(err));
    } finally {
      setBusy(null);
    }
  }, []);

  return {
    busy,
    // Everyone at once (adminOps.js).
    setAnnouncement: useCallback((payload) => run('adminSetAnnouncement', payload), [run]),
    grantCoins: useCallback((payload) => run('adminGrantCoins', payload), [run]),
    grantXp: useCallback((payload) => run('adminGrantXp', payload), [run]),
    // One account at a time (adminUserActions.js).
    findUsers: useCallback((term) => run('adminFindUsers', { term }), [run]),
    userProfile: useCallback((uid) => run('adminUserProfile', { uid }), [run]),
    messageUser: useCallback((payload) => run('adminMessageUser', payload), [run]),
    adjustCoins: useCallback((payload) => run('adminAdjustCoins', payload), [run]),
    shiftEvolution: useCallback((payload) => run('adminShiftEvolution', payload), [run]),
    setMascot: useCallback((payload) => run('adminSetMascot', payload), [run]),
  };
}
