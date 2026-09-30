#!/usr/bin/env node
/**
 * Proof of the ledger lock (`ledger-lock.mjs`): the exclusive right to write a ledger. A held lock must make a
 * writer stand aside WITHOUT writing and without touching the holder's lock; a lock left by a dead process
 * (older than the stale limit) must not block; a lock the caller took must be gone afterwards, on success and
 * on failure. Every case runs on lock files in a temporary directory, never on a real ledger's lock.
 * Nothing here can hang: every wait is an injected no-op or a bounded retry loop.
 *
 * @es Prueba del lock del ledger: el derecho exclusivo a escribirlo. Un lock ocupado hace que quien escribe se
 * aparte SIN escribir y sin tocar el lock del dueño; un lock de un proceso muerto (más viejo que el límite)
 * no bloquea; un lock tomado ya no existe después, con éxito o con fallo. Todo caso corre sobre ficheros de
 * lock en un directorio temporal, nunca sobre el lock de un ledger real. Nada puede colgarse: toda espera es
 * un no-op inyectado o un bucle de reintentos acotado.
 */

import { existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { releaseLock, takeLock, withLock } from './ledger-lock.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'ledger-lock-selftest-'));
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

const STALE_AFTER = 60_000;

/** Backdates a lock file so it was made `ms` before `at`. @es Retrocede un fichero de lock: se hizo `ms` antes de `at`. */
const backdate = (file, at, ms) => utimesSync(file, (at - ms) / 1000, (at - ms) / 1000);

/** Another writer's lock, made by the fixture and not by the code under test, and the clock it is judged by. @es El lock de otro escritor, hecho por el fixture, y el reloj con que se juzga. */
function held(name, ageMs = 0) {
  const lock = path.join(scratch, `${name}.lock`);
  const at = Date.now();

  writeFileSync(lock, '');
  if (ageMs > 0) backdate(lock, at, ageMs);

  return { lock, at };
}

/** Options of a unit case: a fixed clock, no sleeping, three attempts. @es Opciones de un caso: reloj fijo, sin esperas, tres intentos. */
const options = (at, extra) => ({ attempts: 3, staleAfterMs: STALE_AFTER, now: () => at, wait: () => undefined, ...extra });

const gone = (file) => !existsSync(file);
const attempt = (work) => { try { return work(); } catch (error) { return error; } };

// --- taking, holding, releasing ------------------------------------------------------------------------
{
  const lock = path.join(scratch, 'free.lock');

  check('a free lock is taken and its file exists', takeLock(lock, options(Date.now())) === true && existsSync(lock));
  releaseLock(lock);
  check('releasing removes the file, and releasing it again is harmless', gone(lock) && attempt(() => releaseLock(lock)) === undefined);
}

{
  const { lock, at } = held('held');
  let waits = 0;

  check('a freshly made (still empty) lock is held, not taken', takeLock(lock, options(at, { wait: () => { waits += 1; } })) === false);
  check('...the holder keeps its file and the taker waited once per attempt', existsSync(lock) && waits === 3, `waits: ${String(waits)}`);
}

{
  const { lock, at } = held('released-meanwhile');

  check('a lock released while the taker waits is taken on the next attempt', takeLock(lock, options(at, { wait: () => rmSync(lock, { force: true }) })) === true);
}

// --- a stale lock ---------------------------------------------------------------------------------------
{
  const { lock, at } = held('stale', STALE_AFTER + 10_000);

  check('a lock older than the stale limit belonged to a dead process and is taken', takeLock(lock, options(at)) === true);
  check('...and the file is the new holder\'s, not the dead one\'s', statSync(lock).mtimeMs > at - 5_000);
}

{
  const { lock, at } = held('nearly-stale', STALE_AFTER - 10_000);

  check('NEAR MISS: a lock just inside the stale limit is still held', takeLock(lock, options(at)) === false);
}

{
  // No option but the clock and the pause: the defaults are what the writers get, a minute and forty attempts.
  // @es Solo el reloj y la pausa: los valores por defecto son los que reciben los escritores, un minuto y cuarenta intentos.
  const old = held('default-old', 2 * 60_000);
  const recent = held('default-recent', 30_000);
  let waits = 0;

  check('by default a lock two minutes old is taken', takeLock(old.lock, { now: () => old.at, wait: () => undefined }) === true);
  check('...and one half a minute old is held for forty attempts', takeLock(recent.lock, { now: () => recent.at, wait: () => { waits += 1; } }) === false && waits === 40, `waits: ${String(waits)}`);
}

{
  const { lock, at } = held('vanishing');
  const outcome = attempt(() => takeLock(lock, options(at, { now: () => { rmSync(lock, { force: true }); return at; } })));

  check('a lock that vanishes while it is being examined is no error, and is taken next', outcome === true, String(outcome));
}

// --- withLock: released on success and on failure -------------------------------------------------------
{
  const lock = path.join(scratch, 'with-success.lock');
  let ran = 0;
  const done = withLock(lock, () => { ran += 1; return 'value'; }, options(Date.now()));

  check('withLock runs the work once, returns its value, and releases the lock', done.held === true && done.value === 'value' && ran === 1 && gone(lock), JSON.stringify(done));
}

{
  const lock = path.join(scratch, 'with-failure.lock');
  const failure = attempt(() => withLock(lock, () => { throw new Error('boom'); }, options(Date.now())));

  check('a failure in the work reaches the caller unchanged', failure instanceof Error && failure.message === 'boom', String(failure));
  check('...and the lock is gone after the failure', gone(lock));
}

{
  const { lock, at } = held('with-held');
  let ran = 0;
  const refused = withLock(lock, () => { ran += 1; }, options(at));

  check('withLock on a held lock does not run the work and leaves the holder\'s lock', refused.held === false && ran === 0 && existsSync(lock), JSON.stringify(refused));
}

rmSync(scratch, { recursive: true, force: true });

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture ledger lock selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
