// Find people by username.
//
// WHY THIS IS A CALLABLE AND NOT THE CLIENT-SIDE PREFIX QUERY
//
// The obvious implementation —
//
//   collection('users')
//     .where('displayName', '>=', term)
//     .where('displayName', '<=', term + '')
//
// — cannot be authorised against this database, ever. `users/{uid}` is
// readable by its owner and a connected trainer only, and Firestore
// rejects a whole collection query unless the rule can be proven from the
// query's own filters alone. A filter on displayName says nothing about
// whether the caller owns the document, so the query 403s before a single
// row is read. This is not theoretical: the same conclusion is written up
// on the trainerCodes rule in firestore.rules, where it was confirmed with
// a direct REST call against a deployed rule.
//
// So the search runs where the rules do not apply — the Admin SDK — and
// the client receives a chosen, minimal payload instead of documents.
//
// WHY AN IN-MEMORY SCAN RATHER THAN A RANGE QUERY
//
// Two reasons, and the second is the real one:
//
//   * A `>=` / `<= ` range on displayName is byte-ordered and so
//     CASE-SENSITIVE. Searching "dana" would not find "Dana", which is
//     most of the names in a fitness app. Fixing that properly means
//     storing a lowercased mirror of every displayName and keeping it in
//     sync through signup, the one-time rename, and onboarding.
//   * A range query is also prefix-only: "reef" would never find
//     "Big Reef". Substring matching is what people expect from a search
//     box, and no Firestore query shape provides it.
//
// Reading every user document and filtering in memory gives both, costs
// one read per account, and needs no schema change, no new index and no
// rules change. At this app's size (tens of accounts) that is the correct
// trade by a wide margin.
//
// WHERE THIS STOPS BEING TRUE: roughly a few thousand accounts, where the
// per-call read cost and the latency of pulling every name stop being
// free. The migration at that point is to store `nameLower` on each user
// doc, write it wherever displayName is written, and switch the filter
// below to a prefix range on that field — accepting prefix-only matching
// — or to move search to a dedicated index (Algolia/Typesense) if
// substring matching still matters. Nothing in the client contract
// changes when that happens, which is the point of it being a callable.
//
// WHAT THIS DELIBERATELY CHANGES ABOUT DISCOVERY
//
// Until now you could only be added by someone you handed your friend
// code to. A username search engine ends that by design: every account is
// now findable by name, and by extension addable. That is the ordinary
// posture for a social app and it is what was asked for — but it is a
// real product change, not an implementation detail, and it is also
// inherently enumerable (walk the alphabet, collect the user list). The
// controls that remain are the result cap here and the 20-requests-per-
// hour cap on actually contacting anyone (functions/guards.js).
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');

// Below this, a search matches most of the database and means nothing.
const MIN_TERM = 2;
const MAX_TERM = 40;
const MAX_RESULTS = 20;

exports.searchUsers = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.');
  const uid = request.auth.uid;

  const term = String(request.data?.term ?? '').trim().slice(0, MAX_TERM).toLowerCase();
  if (term.length < MIN_TERM) return { results: [] };

  const db = getFirestore();

  // `select()` fetches only the field we filter on. Still one read per
  // document — Firestore bills reads, not bytes — but it keeps the
  // payload crossing the wire proportional to the names rather than to
  // every user's whole record.
  const [meSnap, allSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users').select('displayName').get(),
  ]);
  const myFriends = new Set(Array.isArray(meSnap.data()?.friends) ? meSnap.data().friends : []);

  const matches = allSnap.docs
    .filter((doc) => doc.id !== uid)
    .map((doc) => ({ uid: doc.id, displayName: doc.data().displayName ?? '' }))
    .filter((u) => u.displayName && u.displayName.toLowerCase().includes(term))
    // Names that START with the term first — someone typing "da" wants
    // Dana before Amanda — then alphabetical inside each band so the list
    // does not reshuffle as unrelated accounts are created.
    .sort((a, b) => {
      const aPrefix = a.displayName.toLowerCase().startsWith(term);
      const bPrefix = b.displayName.toLowerCase().startsWith(term);
      if (aPrefix !== bPrefix) return aPrefix ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    })
    .slice(0, MAX_RESULTS);

  if (matches.length === 0) return { results: [] };

  // Relationship state, so the button can say the true thing instead of
  // offering "Add friend" and then failing with already-exists. Incoming
  // requests are one read of my own inbox; outgoing ones live in THEIR
  // inboxes, so those are batched into a single getAll rather than a loop
  // of awaits. Same shape as friendSuggestions.js.
  const [incomingSnap, outgoingSnaps, summarySnaps] = await Promise.all([
    db.collection('users').doc(uid).collection('friendRequests').get(),
    db.getAll(
      ...matches.map((m) => db.collection('users').doc(m.uid).collection('friendRequests').doc(uid)),
    ),
    db.getAll(
      ...matches.map((m) => db.collection('users').doc(m.uid).collection('public').doc('summary')),
    ),
  ]);
  const incomingFrom = new Set(incomingSnap.docs.map((d) => d.id));
  const sentTo = new Set(outgoingSnaps.filter((s) => s.exists).map((s) => s.ref.parent.parent.id));

  const results = matches.map((match, i) => {
    // Everything cosmetic comes from public/summary — the document that is
    // already readable by any signed-in user who knows the uid. Search
    // makes people findable; it does not widen what is visible about them
    // once found. An account with no summary yet still appears, drawn at
    // the base tier with no gear, because being un-findable until your
    // first workout would be a worse bug than a plain avatar.
    const summary = summarySnaps[i].exists ? summarySnaps[i].data() : {};
    return {
      uid: match.uid,
      displayName: summary.displayName ?? match.displayName,
      lifetimeVolume: summary.lifetimeVolume ?? 0,
      equippedAccessories: summary.equippedAccessories ?? null,
      equippedAccessory: summary.equippedAccessory ?? null,
      currentStreak: summary.currentStreak ?? 0,
      // Drives which control the row renders. Deliberately three separate
      // booleans rather than one status string: they are independent
      // facts, and collapsing them here would mean re-deriving them in the
      // UI the moment a fourth state (blocked, say) exists.
      isFriend: myFriends.has(match.uid),
      requestSent: sentTo.has(match.uid),
      requestReceived: incomingFrom.has(match.uid),
    };
  });

  return { results };
});
