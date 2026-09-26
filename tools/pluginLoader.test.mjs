// Every lazy Capacitor plugin loader in src/ must wrap what it returns.
//
//   node --test tools/pluginLoader.test.mjs
//
// tools/pluginThenable.test.mjs pins WHY (a plugin proxy answers `.then`,
// so returning one bare from an async function hangs that function
// forever). This pins WHERE: it is a source scan, because the trap is
// invisible at the call site and the fix is one pair of braces that reads
// like noise.
//
// It was written after the same bug was found twice. The first cost an
// iOS launch screen; lib/localNotifications.js was fixed and commented at
// length — and lib/messaging.js, the only other file with the shape, was
// missed in that same commit and went on hanging every native push call
// on its first line, before it could even ask for permission.
//
// So the check is deliberately not "the two files we know about". It
// finds every `await import('@capacitor…')` in src/ and insists each one
// is accounted for, which means a loader written in some new shape fails
// this test rather than quietly slipping past it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(js|jsx)$/.test(entry) ? [full] : [];
  });
}

// A dynamic import of any Capacitor package — @capacitor/* and the
// community @capacitor-firebase/* and @capacitor-community/* alike.
const IMPORT_RE = /await import\('(@capacitor[^']*)'\)/g;

// The whole safe shape, in one match: destructure the plugin off the
// module namespace, then return it INSIDE an object literal.
const WRAPPED_RE =
  /const\s*\{\s*(\w+)\s*\}\s*=\s*await import\('(@capacitor[^']*)'\);\s*\n\s*return\s*\{\s*\1\s*\};/g;

function matches(re, text) {
  return [...text.matchAll(new RegExp(re.source, re.flags))];
}

test('every Capacitor plugin loader returns the plugin wrapped in an object', () => {
  const offenders = [];
  let loaders = 0;

  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    const imports = matches(IMPORT_RE, text);
    if (imports.length === 0) continue;
    loaders += imports.length;

    const wrapped = matches(WRAPPED_RE, text).length;
    if (wrapped !== imports.length) {
      offenders.push(`${file.slice(SRC.length)} — ${imports.length} loader(s), ${wrapped} wrapped`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Capacitor plugin loaders must read:\n` +
      `    const { Plugin } = await import('@capacitor/thing');\n` +
      `    return { Plugin };\n` +
      `Returning the plugin bare hands a Proxy to the promise machinery, ` +
      `which reads .then off it and waits forever. Offenders:\n  ` +
      offenders.join('\n  '),
  );

  // The scan is only worth anything while it is actually finding the
  // loaders. If a refactor moves or renames them, fail here rather than
  // silently pass over an empty set.
  assert.ok(loaders >= 2, `expected to find the known plugin loaders, found ${loaders}`);
});
