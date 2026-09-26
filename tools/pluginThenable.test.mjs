// Why lib/localNotifications.js wraps the plugin in an object:
//
//   node --test tools/pluginThenable.test.mjs
//
// This pins a JavaScript semantic rather than our own function, which is
// unusual for this suite and deliberate. The wrapper in `plugin()` looks
// like pointless indirection — the obvious "cleanup" is to return the
// plugin directly — and doing that cost a debugging session: the iOS build
// sat on its launch screen while Safari logged
//
//     Unhandled Promise Rejection: Error:
//     "LocalNotifications.then()" is not implemented on ios
//
// A Capacitor plugin is a Proxy that answers EVERY property with a native
// method call, so it looks like a thenable to `await`. The stand-in below
// reproduces that faithfully, and the two tests are the before and after.
//
// Nothing here imports Capacitor: the plugin only exists on a device, and
// the bug is about how the promise machinery treats the object, not about
// what the object does.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A Capacitor plugin proxy: any property you read comes back as a callable
// that dispatches to native, and native rejects what it does not implement.
// `stray` collects the promises the bridge hands back — in the app nobody
// holds those, which is precisely why the console showed an unhandled
// rejection.
function makePluginProxy(stray) {
  return new Proxy(
    {},
    {
      get: (_target, prop) => () => {
        const call = Promise.reject(new Error(`"LocalNotifications.${String(prop)}()" is not implemented on ios`));
        stray.push(call);
        // Claimed immediately, and ONLY so the test runner survives its own
        // demonstration: node --test aborts on an unhandled rejection. The
        // app attaches nothing here, which is exactly why Safari logged one.
        call.catch(() => {});
        return call;
      },
    },
  );
}

// Did this promise settle — either way — within a beat?
async function settlesQuickly(promise) {
  const pending = Symbol('pending');
  const raced = await Promise.race([
    promise.then(
      () => 'resolved',
      () => 'rejected',
    ),
    new Promise((r) => setTimeout(() => r(pending), 50)),
  ]);
  return raced !== pending;
}

test('returning the plugin bare hangs AND rejects into nowhere — the bug', async () => {
  const stray = [];
  const pluginProxy = makePluginProxy(stray);
  async function bare() {
    return pluginProxy;
  }
  const promise = bare();

  // 1. The machinery read `.then`, found a function and called it, and is
  //    now waiting for a callback the bridge will never make. Not a
  //    rejection — a hang. That is why the caller's try/catch did not help
  //    and why the notification was simply never scheduled.
  assert.equal(await settlesQuickly(promise), false, 'must never settle');

  // 2. And the call the bridge made rejected with no one holding it. That
  //    is the line Safari printed.
  assert.equal(stray.length, 1, 'exactly one bridge call, which nothing in the app owns');
  const [err] = await Promise.allSettled(stray);
  assert.equal(err.status, 'rejected');
  assert.match(err.reason.message, /"LocalNotifications\.then\(\)" is not implemented on ios/);
});

test('returning it wrapped resolves, and hands back the same object', async () => {
  const stray = [];
  const pluginProxy = makePluginProxy(stray);
  async function wrapped() {
    return { LocalNotifications: pluginProxy };
  }
  assert.equal(await settlesQuickly(wrapped()), true);
  const { LocalNotifications } = await wrapped();
  assert.equal(LocalNotifications, pluginProxy);
  // Nothing was dispatched to native at all: no `.then` was ever read.
  assert.equal(stray.length, 0);
});

test('a plain object is not mistaken for a thenable', async () => {
  const pluginProxy = makePluginProxy([]);
  // The one property that decides it. An ordinary object answers undefined,
  // the proxy answers a function — that single difference is the whole bug.
  assert.equal(typeof { LocalNotifications: pluginProxy }.then, 'undefined');
  assert.equal(typeof pluginProxy.then, 'function');
});
