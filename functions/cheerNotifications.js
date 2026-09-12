// "Someone cheered you" — the inbox side of the two like surfaces.
//
// Deliberately Firestore triggers rather than something the liking client
// calls. A cheer is written straight from the browser (one tiny doc, no
// callable involved — see hooks/useFeed.js and hooks/useCheers.js), so a
// client-side notify would mean granting every user write access to other
// people's inboxes. The rules do not allow that and should not: cross-user
// delivery goes through the Admin SDK, which is exactly what a trigger is.
//
// Neither function calls FCM. Writing the notification doc is enough —
// sendPushOnNotificationCreate (index.js) turns any new inbox doc into a
// push, which is the rule that keeps "a new notification type never needs
// new server code" true.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

// Both like surfaces store the liker's uid AS the document id, so the
// wildcard IS the liker.
async function notifyOwner(db, { ownerUid, likerUid, title, body, data }) {
  // Cheering your own thing is not news.
  if (!ownerUid || !likerUid || ownerUid === likerUid) {
    logger.info('cheer notification skipped', { ownerUid, likerUid, reason: ownerUid === likerUid ? 'self' : 'missing-uid' });
    return;
  }

  const likerSnap = await db.collection('users').doc(likerUid).get();
  const fromName = likerSnap.data()?.displayName ?? 'Someone';

  logger.info('cheer notification written', { ownerUid, likerUid, ...data });
  await db.collection('users').doc(ownerUid).collection('notifications').add({
    type: 'cheer_received',
    title: title(fromName),
    body,
    data: { fromUid: likerUid, fromName, ...data },
    read: false,
    createdAt: new Date().toISOString(),
  });
}

// A cheer on a feed post. The post doc carries its author.
exports.notifyOnPostCheer = onDocumentCreated(
  'feedPosts/{postId}/likes/{likerUid}',
  async (event) => {
    const db = getFirestore();
    const { postId, likerUid } = event.params;
    const postSnap = await db.collection('feedPosts').doc(postId).get();
    if (!postSnap.exists) return;

    await notifyOwner(db, {
      ownerUid: postSnap.data().userId,
      likerUid,
      title: (name) => `${name} cheered your workout 🔥`,
      body: 'Someone liked what you lifted.',
      data: { postId },
    });
  },
);

// A cheer on a personal record or a saved routine. There is no document for
// the thing being cheered — a PR is an array entry inside the owner's
// public/summary — so the owner is encoded in the target id instead:
// "{ownerUid}__{itemId}". Split on the FIRST separator only; a uid never
// contains one but an itemId could.
exports.notifyOnItemCheer = onDocumentCreated(
  'cheers/{targetId}/likes/{likerUid}',
  async (event) => {
    const db = getFirestore();
    const { targetId, likerUid } = event.params;
    const separator = targetId.indexOf('__');
    if (separator < 0) return;
    const ownerUid = targetId.slice(0, separator);
    const itemId = targetId.slice(separator + 2);

    // Routine ids are prefixed at the call site (PublicFriendProfile);
    // anything else is an exerciseId naming a PR.
    const isRoutine = itemId.startsWith('routine_');
    let what = isRoutine ? 'routine' : 'personal record';

    // Name the actual lift when we can — "cheered your Deadlift" lands
    // better than "cheered your personal record". One read, and the same
    // published doc the profile view already reads, so nothing private is
    // touched. Best-effort: falls back to the generic wording.
    if (!isRoutine) {
      try {
        const summary = await db.collection('users').doc(ownerUid).collection('public').doc('summary').get();
        const record = (summary.data()?.personalRecords ?? []).find((r) => r.exerciseId === itemId);
        if (record?.name) what = record.name;
      } catch {
        // keep the generic wording
      }
    }

    await notifyOwner(db, {
      ownerUid,
      likerUid,
      title: (name) => `${name} cheered your ${what} ❤️`,
      body: isRoutine ? 'They liked one of your routines.' : 'Someone rates your lifting.',
      data: { targetId, itemId },
    });
  },
);
