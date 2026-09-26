// Which errors count as "you are running yesterday's page against today's
// build":
//
//   node --test tools/staleBuild.test.mjs
//
// This matcher used to live inside ErrorBoundary with exactly one caller.
// It now has two, and they have to agree: the boundary reloads the page
// once on a match, and main.jsx's Sentry `beforeSend` drops the events that
// reload already fixed. If they ever drift apart the symptom is not a
// crash — it is either a Sentry project buried under self-healing chunk
// errors every deploy day, or a genuinely broken build reloading forever
// with nothing reported.
//
// The strings below are the real ones Chrome, Firefox, Safari and Vite
// throw, which is the only reason this regex has five alternatives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStaleBuildError } from '../src/utils/staleBuild.js';

test('the four browsers, plus Vite, all match', () => {
  const real = [
    // Chrome
    "Failed to fetch dynamically imported module: https://jimmythegoat.fit/assets/GymShop-abc123.js",
    // Firefox
    'error loading dynamically imported module',
    // Safari
    "Importing a module script failed.",
    // Older Chrome / webpack-era wording, still seen in the wild
    'Loading chunk 42 failed.',
    // Vite's CSS preload failure — same stale build, different asset
    'Unable to preload CSS for /assets/index-abc123.css',
  ];
  for (const message of real) {
    assert.equal(isStaleBuildError({ name: 'TypeError', message }), true, message);
  }
});

test('an ordinary crash is not a stale build', () => {
  // The whole point: these must reach Sentry, and must NOT trigger a reload.
  const ordinary = [
    "Cannot read properties of undefined (reading 'sets')",
    'workout.exercises is not a function',
    'Firebase: Error (auth/network-request-failed).',
    'Maximum update depth exceeded.',
  ];
  for (const message of ordinary) {
    assert.equal(isStaleBuildError({ name: 'TypeError', message }), false, message);
  }
});

test("Sentry's event shape goes through the same matcher", () => {
  // The two callers hand this function different objects. ErrorBoundary
  // passes a real Error; main.jsx's beforeSend only has Sentry's
  // {type, value} pair and maps it onto name/message. That mapping is the
  // join between them, and this is the test that it still lines up.
  const thrown = { type: 'TypeError', value: 'Failed to fetch dynamically imported module: /assets/GymShop-abc.js' };
  assert.equal(isStaleBuildError({ name: thrown.type, message: thrown.value }), true);
  // Note for anyone widening this later: webpack's ChunkLoadError name is
  // deliberately NOT matched. This app is Vite and never throws it, and a
  // matcher that guesses at strings it cannot see is how you end up
  // silently reloading on a real crash.
});

test('nothing at all is not a stale build', () => {
  // A thrown string, a thrown null, an Error with no message — none of
  // these should silently trigger the reload path.
  assert.equal(isStaleBuildError(undefined), false);
  assert.equal(isStaleBuildError(null), false);
  assert.equal(isStaleBuildError({}), false);
  assert.equal(isStaleBuildError(new Error()), false);
});
