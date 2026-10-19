#!/usr/bin/env node
/**
 * Proof of the ledger lock (`ledger-lock.mjs`), the adapter of the one state lock (`../hook-state/file-lock.mjs`)
 * for the ledger writers. Every rule of the lock itself (owner token, breaker re-check, identity check, ceiling,
 * contention codes, real-process races) is proven by `../hook-state/file-lock.selftest.mjs`; this proves what is
 * the adapter's: its public API takes, holds and releases the same lock with the ledger's defaults (a minute,
 * forty attempts), and a fault of the lock is said, in both languages, as the ledger lock's while a failure of the
 * work reaches the caller unchanged. The end-to-end cases run `capture.mjs` in a constructed repository and home
 * (HOME and USERPROFILE overridden), never the real ledger. Nothing here can hang: every wait is an injected no-op
 * or a bounded retry loop.
 *
 * @es Prueba del lock del ledger, el adaptador del único lock de estado para los escritores de ledgers. Las reglas
 * del lock mismo las prueba `../hook-state/file-lock.selftest.mjs`; aquí se prueba lo del adaptador: su API pública
 * toma, mantiene y suelta el mismo lock con los valores del ledger (un minuto, cuarenta intentos), y un fallo del
 * lock se dice, en ambos idiomas, como del lock del ledger, mientras que un fallo del trabajo llega sin cambios.
 * Los casos de extremo a extremo corren `capture.mjs` en un repositorio y un home construidos, nunca el ledger real.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { STALE_AFTER_MS, releaseLock, takeLock, withLock } from './ledger-lock.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'ledger-lock-selftest-'));
// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

/** The value of `work`, or the error it threw: a throw fails a check, never crashes the run. @es El valor, o el error lanzado. */
const attempt = (work) => {
  try {
    return work();
  } catch (error) {
    return error;
  }
};

/** What a file holds, `undefined` when it is gone. @es Lo que tiene un fichero, `undefined` si no está. */
const contentOf = (file) => {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
};

/** Backdates a file so it was made `ms` before `at`. @es Retrocede un fichero: se hizo `ms` antes de `at`. */
const backdate = (file, at, ms) => utimesSync(file, (at - ms) / 1000, (at - ms) / 1000);

/** Another writer's (still empty) lock, `ageMs` old. @es El lock (aún vacío) de otro escritor, de `ageMs` de edad. */
function held(name, ageMs = 0) {
  const lock = path.join(scratch, `${name}.lock`);
  const at = Date.now();

  writeFileSync(lock, '');
  if (ageMs > 0) backdate(lock, at, ageMs);

  return { lock, at };
}

const options = (at, extra) => ({ attempts: 3, now: () => at, wait: () => undefined, ...extra });
const gone = (file) => !existsSync(file);

// --- the API: take, hold, release --------------------------------------------------------------------------
{
  const lock = path.join(scratch, 'free.lock');

  check('a free lock is taken, holding this process\'s owner token', attempt(() => takeLock(lock, options(Date.now()))) === true && String(contentOf(lock)).startsWith(`${String(process.pid)}:`), contentOf(lock));
  releaseLock(lock);
  check('releasing removes it, and releasing it again is harmless', gone(lock) && attempt(() => releaseLock(lock)) === undefined);
}

{
  const { lock, at } = held('held');
  let waits = 0;

  check('a freshly made (still empty) lock is held, not taken, and the holder keeps it', attempt(() => takeLock(lock, options(at, { wait: () => { waits += 1; } }))) === false && existsSync(lock) && waits === 3, `waits: ${String(waits)}`);
}

{
  // No option but the clock and the pause: the defaults are what the ledger writers get, a minute and forty attempts.
  // @es Solo el reloj y la pausa: los valores por defecto son los de los escritores de ledgers.
  const old = held('default-old', 2 * 60_000);
  const recent = held('default-recent', 30_000);
  let waits = 0;

  check('the ledger lock\'s stale age is a minute', STALE_AFTER_MS === 60_000, STALE_AFTER_MS);
  check('by default an empty lock two minutes old is taken', attempt(() => takeLock(old.lock, { now: () => old.at, wait: () => undefined })) === true);
  releaseLock(old.lock);
  check('...and one half a minute old is held for forty attempts', attempt(() => takeLock(recent.lock, { now: () => recent.at, wait: () => { waits += 1; } })) === false && waits === 40, `waits: ${String(waits)}`);
}

// --- faults: said as the ledger lock's, in both languages ---------------------------------------------------
{
  const missing = path.join(scratch, 'no-such-dir', 'x.lock');
  const isLedgerFault = (fault) => fault instanceof Error && fault.name === 'LockFault' && fault.cause?.code === 'ENOENT' && fault.message.startsWith(`The ledger lock ${missing} failed: `) && fault.message.includes('could not be created (ENOENT)') && fault.message.includes(` @es Falló el lock del ledger ${missing}: No se pudo crear el lock`);
  const taken = attempt(() => takeLock(missing, options(Date.now())));
  const within = attempt(() => withLock(missing, () => 'never', options(Date.now())));

  check('a lock that cannot be created throws a fault named as the ledger lock\'s, in both halves, with its cause', isLedgerFault(taken), String(taken?.message));
  check('...and withLock says it the same way', isLedgerFault(within), String(within?.message));

  // L4: a fault of ANOTHER lock, thrown by the work, is not the ledger lock's and reaches the caller as it was.
  // @es L4: un fallo de OTRO lock, lanzado por el trabajo, no es del lock del ledger y llega tal cual.
  const ledger = path.join(scratch, 'ledger-own.lock');
  const other = path.join(scratch, 'no-such-dir', 'other.lock');
  let inner;
  const relabelled = attempt(() => withLock(ledger, () => {
    try {
      takeLock(other, options(Date.now()));
    } catch (error) {
      inner = error;
    }

    throw inner;
  }, options(Date.now())));

  check('L4: a fault of another lock thrown inside the work is not relabelled as the ledger lock\'s', relabelled === inner && relabelled?.name === 'LockFault' && !String(relabelled?.message).includes(`The ledger lock ${ledger}`), String(relabelled?.message));
  check('L4: ...and the ledger lock is released after it', !existsSync(ledger));

  // A fault of the ledger lock's own breaker IS the ledger lock's. @es Un fallo del breaker del propio lock SÍ es suyo.
  const { lock: staleLedger, at } = held('stale-ledger', 2 * 60_000);
  const breakerDenied = attempt(() => takeLock(staleLedger, options(at, { create: (file, token) => { if (file.endsWith('.breaker')) throw Object.assign(new Error('EACCES: injected'), { code: 'EACCES' }); writeFileSync(file, token, { flag: 'wx' }); } })));

  check('L4: a fault of the ledger lock\'s own breaker is said as the ledger lock\'s, keeping the file it is about', breakerDenied?.name === 'LockFault' && String(breakerDenied?.message).startsWith(`The ledger lock ${staleLedger} failed: `) && breakerDenied?.file === `${staleLedger}.breaker`, String(breakerDenied?.message));
}

// --- withLock: released on success and on failure -------------------------------------------------------
{
  const lock = path.join(scratch, 'with-success.lock');
  let ran = 0;
  const done = attempt(() => withLock(lock, () => { ran += 1; return 'value'; }, options(Date.now())));

  check('withLock runs the work once, returns its value, and releases the lock', done.held === true && done.value === 'value' && ran === 1 && gone(lock), JSON.stringify(done));
}

{
  const lock = path.join(scratch, 'with-failure.lock');
  const boom = new Error('boom');
  const failure = attempt(() => withLock(lock, () => { throw boom; }, options(Date.now())));

  check('a failure in the work reaches the caller unchanged, and the lock is gone after it', failure === boom && gone(lock), String(failure));
}

{
  const { lock, at } = held('with-held');
  let ran = 0;
  const refused = attempt(() => withLock(lock, () => { ran += 1; }, options(at)));

  check('withLock on a held lock does not run the work and leaves the holder\'s lock', refused.held === false && ran === 0 && existsSync(lock), JSON.stringify(refused));
}

// --- capture.mjs, end to end in a constructed repository and home --------------------------------------
const LESSON = 'I asserted a number from memory and it was wrong, root cause: I never measured it -> RULE: measure it before stating it';

/** A fresh project holding a copy of the loop, and a fresh home. @es Un proyecto con copia del loop y un home nuevos. */
function world(name) {
  const repo = path.join(scratch, name, 'repo');
  const home = path.join(scratch, name, 'home');
  const loop = path.join(repo, '.claude', 'failure-capture');

  mkdirSync(path.join(loop, 'state'), { recursive: true });
  mkdirSync(path.join(home, '.claude'), { recursive: true });
  provisionLoop(loop);
  writeFileSync(path.join(repo, '.claude', 'CLAUDE.md'), '# Project\n', 'utf8');

  return { repo, home, loop, ledger: path.join(home, '.claude', 'lessons-ledger.md'), lock: path.join(loop, 'state', 'ledger.lock'), spool: path.join(loop, 'state', 'spool') };
}

/** Runs `capture` in a world: `{ status, out }`. @es Ejecuta `capture` en un mundo. */
function capture(target, key) {
  const args = ['capture', '--key', key, '--scope', 'global', '--actor', 'orchestrator', '--lesson', LESSON];

  try {
    const out = execFileSync(process.execPath, [path.join(target.loop, 'capture.mjs'), ...args], { cwd: target.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: worldEnv(target.home, { loop: target.loop }), timeout: 60_000 });

    return { status: 0, out };
  } catch (error) {
    return { status: typeof error?.status === 'number' ? error.status : 'did-not-run', out: `${error?.stdout ?? ''}${error?.stderr ?? ''}` };
  }
}

const spooled = (target) => (existsSync(target.spool) ? readdirSync(target.spool).filter((file) => file.endsWith('.json')).length : 0);
const ledgerOf = (target) => (existsSync(target.ledger) && statSync(target.ledger).isFile() ? readFileSync(target.ledger, 'utf8') : '');

{
  const target = world('held');

  writeFileSync(target.lock, '');

  const run = capture(target, 'held-lesson');

  check('a capture that meets a held lock is recorded as spooled, with the reason in both languages', run.status === 0 && run.out.includes('the ledger is locked by another writer') && run.out.includes(' @es '), `exit ${run.status}: ${run.out}`);
  check('...the ledger is not written, the entry waits in the spool, the holder\'s lock is untouched', !existsSync(target.ledger) && spooled(target) === 1 && existsSync(target.lock), `spooled: ${String(spooled(target))}`);

  rmSync(target.lock, { force: true });

  const next = capture(target, 'second-lesson');

  check('once the lock is free, the next capture folds the waiting entry too', next.status === 0 && ledgerOf(target).includes('<!--fc:held-lesson#1-->') && ledgerOf(target).includes('<!--fc:second-lesson#1-->') && spooled(target) === 0, `${next.out}\n${ledgerOf(target)}`);
  check('...and the lock is gone after the capture', gone(target.lock));
}

{
  const target = world('stale');

  writeFileSync(target.lock, '');
  backdate(target.lock, Date.now(), 2 * STALE_AFTER_MS);

  const run = capture(target, 'stale-lesson');

  check('a capture over a stale lock folds its entry and leaves no lock behind', run.status === 0 && ledgerOf(target).includes('<!--fc:stale-lesson#1-->') && gone(target.lock), `${run.out}\n${ledgerOf(target)}`);
}

{
  const target = world('failing');

  mkdirSync(target.ledger);

  const run = capture(target, 'failing-lesson');

  check('a capture whose write fails exits non-zero, releases the lock and keeps the entry in the spool', run.status !== 0 && gone(target.lock) && spooled(target) === 1, `exit ${run.status}, spooled ${String(spooled(target))}`);
}

for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.stdout.write(`failure-capture ledger lock selftest: ${passed} passed, ${failures.length} failed\n`);
process.exit(failures.length === 0 && passed > 0 ? 0 : 1);
