#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/file-lock.mjs`: the exclusive right to read-modify-write one state
 * file. THE STATE SPACE: the lock free / held fresh / held stale, a directory that does not exist, work that
 * returns / throws, and the attempts spent waiting. Every option is injected, so nothing here sleeps.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `file-lock.mjs`: el derecho exclusivo a leer-modificar-escribir un fichero
 * de estado. Espacio de estados: el lock libre / ocupado reciente / ocupado caducado, un directorio que no
 * existe, trabajo que vuelve / lanza, y los intentos gastados esperando. Toda opción se inyecta: nada duerme.
 */

import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { STALE_AFTER_MS, takeLock, withLock } from './file-lock.mjs';

const scratch = mkdtempSync(path.join(tmpdir(), 'file-lock-selftest-'));
const lockFile = path.join(scratch, 'x.lock');

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const thrown = (action) => {
  try {
    action();
  } catch (error) {
    return error.code ?? error.message;
  }

  return undefined;
};

/** Gives the lock file a modification time `ageMs` before `at`. @es Pone al lock una fecha `ageMs` anterior a `at`. */
function ageLock(at, ageMs) {
  const seconds = (at - ageMs) / 1000;

  utimesSync(lockFile, seconds, seconds);
}

try {
  const NOW = Date.now();
  const options = (extra) => ({ attempts: 3, now: () => NOW, wait: () => undefined, ...extra });

  check('a free lock is taken', takeLock(lockFile, options()), true);
  check('the lock file exists while held', existsSync(lockFile), true);

  let waits = 0;

  check('a held fresh lock is not taken', takeLock(lockFile, options({ wait: () => { waits += 1; } })), false);
  check('waiting is bounded by the attempts, one wait per attempt', waits, 3);
  check('a lock that was held is untouched by the caller that gave up', existsSync(lockFile), true);

  ageLock(NOW, STALE_AFTER_MS + 1000);
  waits = 0;
  check('a stale lock is broken and taken', takeLock(lockFile, options({ wait: () => { waits += 1; } })), true);
  check('breaking a stale lock costs no wait', waits, 0);

  ageLock(NOW, STALE_AFTER_MS - 1000);
  check('a lock just under the stale limit still holds', takeLock(lockFile, options()), false);

  rmSync(lockFile);
  check('a missing directory is an error, not contention', thrown(() => takeLock(path.join(scratch, 'absent', 'x.lock'), options())), 'ENOENT');
  check('zero attempts never takes the lock', takeLock(lockFile, options({ attempts: 0 })), false);
  check('and creates nothing', existsSync(lockFile), false);

  check('work runs holding the lock and its value comes back', withLock(lockFile, () => existsSync(lockFile) && 42, options()), { held: true, value: 42 });
  check('the lock is gone after the work', existsSync(lockFile), false);
  check('work that throws still releases the lock', [thrown(() => withLock(lockFile, () => { throw new Error('boom'); }, options())), existsSync(lockFile)], ['boom', false]);

  writeFileSync(lockFile, '');
  let ran = false;

  check('a held lock: the work does not run', [withLock(lockFile, () => { ran = true; }, options()), ran], [{ held: false }, false]);
  check('and the holder\'s lock stays', existsSync(lockFile), true);
} catch (error) {
  failures.push(`unexpected throw — ${error.message}`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
