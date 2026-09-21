// Block/report filtering, checked in plain Node:
//
//   node --test tools/moderation.test.mjs
//
// These helpers decide what a blocked account is allowed to put on your
// screen, so the cases worth pinning are the ones a bug would hide: a
// missing `blockedUsers` field (every account that predates the feature),
// a per-collection author field that isn't where you expect it, and the
// identity of the returned array — the feed query is keyed on it, so a
// new array on every render re-subscribes a live Firestore listener.
// Nothing here touches Firebase.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { REPORT_REASONS, isReportReason, isBlocked, readBlockedUids, reportDocId, withoutBlocked, withoutBlockedUids } =
  await import('../src/utils/moderation.js');

test('readBlockedUids treats an account with no field as blocking nobody', () => {
  assert.deepEqual(readBlockedUids(undefined), []);
  assert.deepEqual(readBlockedUids(null), []);
  assert.deepEqual(readBlockedUids({}), []);
  assert.deepEqual(readBlockedUids({ blockedUsers: null }), []);
  // Not an array — a hand-written doc, or a field that got clobbered.
  assert.deepEqual(readBlockedUids({ blockedUsers: 'abc' }), []);
});

test('readBlockedUids drops junk entries rather than the whole list', () => {
  assert.deepEqual(readBlockedUids({ blockedUsers: ['a', '', null, 7, 'b'] }), ['a', 'b']);
});

test('isBlocked never matches a missing uid', () => {
  assert.equal(isBlocked(['a'], 'a'), true);
  assert.equal(isBlocked(['a'], 'b'), false);
  // An item with no author must not be filtered out by an empty-string
  // entry that somehow survived — readBlockedUids strips those, and this
  // is the second half of that guarantee.
  assert.equal(isBlocked([''], undefined), false);
  assert.equal(isBlocked([], 'a'), false);
});

test('withoutBlocked reads the author through the accessor it is given', () => {
  const posts = [
    { id: '1', userId: 'friend' },
    { id: '2', userId: 'blocked' },
  ];
  assert.deepEqual(
    withoutBlocked(posts, ['blocked'], (p) => p.userId),
    [{ id: '1', userId: 'friend' }],
  );

  // A notification hides the sender two levels down.
  const notifications = [
    { id: 'n1', data: { fromUid: 'blocked' } },
    { id: 'n2', data: { fromUid: 'friend' } },
    { id: 'n3' }, // a weigh-in reminder — nobody sent it
  ];
  assert.deepEqual(
    withoutBlocked(notifications, ['blocked'], (n) => n.data?.fromUid).map((n) => n.id),
    ['n2', 'n3'],
  );
});

test('withoutBlocked keeps the SAME array when nothing is filtered', () => {
  // Load-bearing: hooks/useFeed.js keys a live listener on the joined
  // friend list, and App.jsx feeds these results into useMemo deps. A
  // fresh array identity on every render would re-subscribe the query.
  const posts = [{ userId: 'a' }, { userId: 'b' }];
  assert.equal(withoutBlocked(posts, [], (p) => p.userId), posts);
  assert.equal(withoutBlocked(posts, undefined, (p) => p.userId), posts);
  assert.equal(withoutBlocked(posts, ['nobody-here'], (p) => p.userId), posts);
  // ...and a NEW one only when it actually removed something.
  assert.notEqual(withoutBlocked(posts, ['a'], (p) => p.userId), posts);
});

test('withoutBlocked survives an empty or missing collection', () => {
  assert.deepEqual(withoutBlocked(undefined, ['a'], (x) => x), []);
  assert.deepEqual(withoutBlocked([], ['a'], (x) => x), []);
});

test('withoutBlockedUids filters a bare uid array', () => {
  assert.deepEqual(withoutBlockedUids(['a', 'b', 'c'], ['b']), ['a', 'c']);
  assert.deepEqual(withoutBlockedUids([], ['b']), []);
});

test('reportDocId is one doc per reporter/reported pair', () => {
  assert.equal(reportDocId('me', 'them'), 'me__them');
  // Direction matters: them reporting me is a different document.
  assert.notEqual(reportDocId('me', 'them'), reportDocId('them', 'me'));
});

test('report reasons are unique, non-empty, and validate', () => {
  const ids = REPORT_REASONS.map((reason) => reason.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const reason of REPORT_REASONS) {
    assert.ok(reason.label.length > 0, `${reason.id} needs a label`);
    assert.equal(isReportReason(reason.id), true);
  }
  assert.equal(isReportReason('not-a-reason'), false);
  assert.equal(isReportReason(undefined), false);
});
