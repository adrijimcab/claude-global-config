#!/usr/bin/env node
/**
 * The decisions of `hook-state/file-lock.mjs`, each broken once, that `file-lock.selftest.mjs` must catch. A
 * mutant that only crashes the selftest counts as a survivor (`crashKills: 'fail'`).
 *
 * @es Las decisiones de `file-lock.mjs`, rotas una a una, que `file-lock.selftest.mjs` debe detectar. Un
 * mutante que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'hook-state/file-lock.mjs';

const MUTANTS = [
  ['the lock is created non-exclusively', L, "openSync(lockFile, 'wx')", "openSync(lockFile, 'w')"],
  ['any create failure counts as contention', L, "if (error?.code !== 'EEXIST') throw error;", ''],
  ['a stale lock is never broken', L, 'if (isStale(lockFile, staleAfterMs, now)) rmSync(lockFile, { force: true });\n      else wait();', 'wait();'],
  ['a fresh lock is broken as if stale', L, 'now() - statSync(lockFile).mtimeMs > staleAfterMs', 'true'],
  ['the stale limit is five seconds too short', L, 'mtimeMs > staleAfterMs', 'mtimeMs > staleAfterMs - 5000'],
  ['a stale lock is broken and then waited on', L, 'rmSync(lockFile, { force: true });\n      else wait();', 'rmSync(lockFile, { force: true });\n      wait();'],
  ['the wait is skipped', L, 'else wait();', ''],
  ['the attempts are unbounded in effect (one extra)', L, 'attempt < attempts;', 'attempt <= attempts;'],
  ['a caller that gave up removes the holder\'s lock', L, '  if (!takeLock(lockFile, options)) return { held: false };', '  if (!takeLock(lockFile, options)) { rmSync(lockFile, { force: true }); return { held: false }; }'],
  ['the work runs without the lock', L, '  if (!takeLock(lockFile, options)) return { held: false };\n', ''],
  ['the lock is not released after the work', L, '    rmSync(lockFile, { force: true });\n  }\n}', '  }\n}'],
  ['the lock is released only when the work returns', L, '  try {\n    return { held: true, value: work() };\n  } finally {\n    rmSync(lockFile, { force: true });\n  }', '  const value = work();\n  rmSync(lockFile, { force: true });\n  return { held: true, value };'],
  ['the work value is lost', L, 'value: work()', 'value: undefined']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/file-lock.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 120_000
});

process.exit(survivors === 0 ? 0 : 1);
