#!/usr/bin/env node
/**
 * Proof of the ledger lock (`ledger-lock.mjs`): the exclusive right to write a ledger. A held lock must make a
 * writer stand aside WITHOUT writing and without touching the holder's lock; a lock left by a dead process
 * (older than the stale limit) must not block; a lock the caller took must be gone afterwards, on success and
 * on failure. The units run on lock files in a temporary directory; the end-to-end cases run `capture.mjs`
 * in a constructed repository and home (HOME and USERPROFILE overridden), never the real ledger.
 * Nothing here can hang: every wait is an injected no-op or a bounded retry loop.
 *
 * @es Prueba del lock del ledger: el derecho exclusivo a escribirlo. Un lock ocupado hace que quien escribe se
 * aparte SIN escribir y sin tocar el lock del dueño; un lock de un proceso muerto (más viejo que el límite)
 * no bloquea; un lock tomado ya no existe después, con éxito o con fallo. Las unidades corren sobre ficheros
 * de lock en un directorio temporal; los casos de extremo a extremo corren `capture.mjs` en un repositorio y
 * un home construidos, nunca el ledger real. Nada puede colgarse: toda espera es un no-op inyectado o un
 * bucle de reintentos acotado.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { releaseLock, takeLock, withLock } from './ledger-lock.mjs';
import { provisionLoop, worldEnv } from './fixture-loop.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('failure-capture');

const scratch = mkdtempSync(path.join(os.tmpdir(), 'ledger-lock-selftest-'));
// Removed on every exit, a throw included: a selftest leaves nothing behind it. @es Se elimina en toda salida,
// también ante una excepción: un selftest no deja nada tras de sí.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));
let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition === true) passed += 1;
  else failures.push(`${name}${detail === undefined ? '' : ` — ${String(detail).slice(0, 300)}`}`);
}

/** `takeLock`, answering `'threw'` instead of throwing, so a fault fails the check that expects true or false rather than crashing the run. @es `takeLock`, que responde `'threw'` en vez de lanzar, para que un fallo haga fallar la comprobación que espera true o false en vez de tumbar la corrida. */
function taken(...input) {
  try {
    return takeLock(...input);
  } catch {
    return 'threw';
  }
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

  check('a free lock is taken and its file exists', taken(lock, options(Date.now())) === true && existsSync(lock));
  releaseLock(lock);
  check('releasing removes the file, and releasing it again is harmless', gone(lock) && attempt(() => releaseLock(lock)) === undefined);
}

{
  const { lock, at } = held('held');
  let waits = 0;

  check('a freshly made (still empty) lock is held, not taken', taken(lock, options(at, { wait: () => { waits += 1; } })) === false);
  check('...the holder keeps its file and the taker waited once per attempt', existsSync(lock) && waits === 3, `waits: ${String(waits)}`);
}

{
  const { lock, at } = held('released-meanwhile');

  check('a lock released while the taker waits is taken on the next attempt', taken(lock, options(at, { wait: () => rmSync(lock, { force: true }) })) === true);
}

// --- a stale lock ---------------------------------------------------------------------------------------
{
  const { lock, at } = held('stale', STALE_AFTER + 10_000);

  check('a lock older than the stale limit belonged to a dead process and is taken', taken(lock, options(at)) === true);
  check('...and the file is the new holder\'s, not the dead one\'s', statSync(lock).mtimeMs > at - 5_000);
}

{
  const { lock, at } = held('nearly-stale', STALE_AFTER - 10_000);

  check('NEAR MISS: a lock just inside the stale limit is still held', taken(lock, options(at)) === false);
}

{
  // No option but the clock and the pause: the defaults are what the writers get, a minute and forty attempts.
  // @es Solo el reloj y la pausa: los valores por defecto son los que reciben los escritores, un minuto y cuarenta intentos.
  const old = held('default-old', 2 * 60_000);
  const recent = held('default-recent', 30_000);
  let waits = 0;

  check('by default a lock two minutes old is taken', taken(old.lock, { now: () => old.at, wait: () => undefined }) === true);
  check('...and one half a minute old is held for forty attempts', taken(recent.lock, { now: () => recent.at, wait: () => { waits += 1; } }) === false && waits === 40, `waits: ${String(waits)}`);
}

{
  const { lock, at } = held('vanishing');
  const outcome = attempt(() => takeLock(lock, options(at, { now: () => { rmSync(lock, { force: true }); return at; } })));

  check('a lock that vanishes while it is being examined is no error, and is taken next', outcome === true, String(outcome));
}

{
  // "It already exists" is contention to wait out; anything else (a missing directory, say) is a fault to name at once.
  // @es «Ya existe» es contienda que se espera; cualquier otra cosa (un directorio ausente, por ejemplo) es un fallo que se nombra de inmediato.
  let waits = 0;
  const fault = attempt(() => takeLock(path.join(scratch, 'no-such-dir', 'x.lock'), options(Date.now(), { wait: () => { waits += 1; } })));

  check('a lock that cannot be created for another reason throws at once, naming the cause in both languages', fault instanceof Error && fault.cause?.code === 'ENOENT' && fault.message.includes('could not be created') && fault.message.includes('ENOENT') && fault.message.includes(' @es ') && waits === 0, `${String(fault)} waits: ${String(waits)}`);
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
  const failure = attempt(() => withLock(lock, () => { throw new Error('boom'); }, options(Date.now())));

  check('a failure in the work reaches the caller unchanged', failure instanceof Error && failure.message === 'boom', String(failure));
  check('...and the lock is gone after the failure', gone(lock));
}

{
  const { lock, at } = held('with-held');
  let ran = 0;
  const refused = attempt(() => withLock(lock, () => { ran += 1; }, options(at)));

  check('withLock on a held lock does not run the work and leaves the holder\'s lock', refused.held === false && ran === 0 && existsSync(lock), JSON.stringify(refused));
}

// --- the owner of a lock: liveness plus age, and a release that removes only its own lock -------------------
/** The pid of a process that has already exited: dead for certain, for the next few seconds. @es El pid de un proceso que ya terminó: seguro muerto durante los próximos segundos. */
const deadPid = spawnSync(process.execPath, ['-e', '0']).pid;

/** A lock file written the way the code under test writes its own, naming `pid` as the owner. @es Un lock escrito como lo escribe el código bajo prueba, con `pid` como dueño. */
function ownedBy(name, pid, ageMs) {
  const lock = path.join(scratch, `${name}.lock`);
  const at = Date.now();

  writeFileSync(lock, `${String(pid)}:fixture`);
  backdate(lock, at, ageMs);

  return { lock, at };
}

{
  const { lock, at } = ownedBy('old-live-owner', process.pid, STALE_AFTER + 10_000);

  check('a lock past the stale age whose owner is still alive is held, never robbed', taken(lock, options(at)) === false && existsSync(lock));
}

{
  const { lock, at } = ownedBy('old-dead-owner', deadPid, STALE_AFTER + 10_000);

  check('a lock past the stale age whose owner is dead is taken, and no breaker file is left', taken(lock, options(at)) === true && gone(`${lock}.breaker`));
  releaseLock(lock);
}

{
  // A system process this user may not signal exists all the same: its lock is not a dead one. Real pid 4 is
  // the Windows System process and pid 1 is init elsewhere; the default liveness check is the one under test.
  // @es Un proceso del sistema al que este usuario no puede enviar señal existe igual: su lock no es de un muerto.
  const { lock, at } = ownedBy('old-system-owner', process.platform === 'win32' ? 4 : 1, STALE_AFTER + 10_000);

  check('a lock whose owner exists but may not be signalled is held', taken(lock, options(at)) === false && existsSync(lock));
}

{
  const { lock, at } = ownedBy('young-dead-owner', deadPid, 1_000);

  check('NEAR MISS: a lock whose owner is dead but is not yet old is still held', taken(lock, options(at)) === false);
}

{
  const lock = path.join(scratch, 'foreign-release.lock');

  takeLock(lock, options(Date.now()));
  writeFileSync(lock, `${String(process.pid)}:somebody-else`);
  releaseLock(lock);
  check('a release never removes a lock that is no longer the one this process took', existsSync(lock));
}

{
  const { lock } = held('never-taken');

  releaseLock(lock);
  check('a release of a lock this process never took leaves it alone', existsSync(lock));
}

{
  const { lock, at } = ownedBy('breaker-held', deadPid, STALE_AFTER + 10_000);

  writeFileSync(`${lock}.breaker`, `${String(process.pid)}:breaker`);
  check('a stale lock is left alone while a live breaker is at work on it', taken(lock, options(at)) === false && existsSync(lock));
  rmSync(`${lock}.breaker`, { force: true });
}

{
  const { lock, at } = ownedBy('breaker-dead', deadPid, STALE_AFTER + 10_000);

  writeFileSync(`${lock}.breaker`, `${String(deadPid)}:breaker`);
  backdate(`${lock}.breaker`, at, STALE_AFTER + 10_000);
  check('a breaker left by a dead process does not wedge the lock', taken(lock, options(at, { attempts: 5 })) === true && gone(`${lock}.breaker`));
  releaseLock(lock);
}

{
  // The break itself, in the order the race has it: the stale lock was judged, then another process replaced it
  // with a live one before the breaker acted. The live lock must survive. @es La rotura misma, en el orden de la
  // carrera: se juzgó caducado el lock y otro proceso lo sustituyó por uno vivo antes de que el rompedor actuara.
  const { lock, at } = ownedBy('replaced-before-break', deadPid, STALE_AFTER + 10_000);
  let replaced = false;

  check('a stale lock replaced by a live one while it is being broken is not removed', taken(lock, options(at, { attempts: 1, isAlive: (pid) => { if (!replaced) { replaced = true; writeFileSync(lock, `${String(process.pid)}:fresh`); } return pid === process.pid; } })) === false && existsSync(lock) && readFileSync(lock, 'utf8') === `${String(process.pid)}:fresh`);
}

{
  // The lock is released by its owner between the judgement and the break: nothing is left to break, and taking it works.
  // @es El dueño suelta el lock entre el juicio y la rotura: no queda nada que romper, y tomarlo funciona.
  const { lock, at } = ownedBy('released-before-break', deadPid, STALE_AFTER + 10_000);
  const outcome = attempt(() => takeLock(lock, options(at, { isAlive: () => { rmSync(lock, { force: true }); return false; } })));

  check('a stale lock that disappears before the breaker re-reads it is no error, and is taken', outcome === true, String(outcome));
  releaseLock(lock);
}

{
  // On Windows a file being deleted, or open in another process, refuses a create with EPERM or EBUSY: that is
  // contention to wait out, like EEXIST, never a fault. @es En Windows un fichero que se borra, o abierto en otro
  // proceso, rechaza el create con EPERM o EBUSY: es contienda que se espera, como EEXIST, nunca un fallo.
  const failing = (code, times) => { let left = times; return (file) => { if (left > 0) { left -= 1; throw Object.assign(new Error(code), { code }); } return openSync(file, 'wx'); }; };
  const lock = path.join(scratch, 'contended-create.lock');

  check('a create refused twice with EPERM is taken on the third attempt', taken(lock, options(Date.now(), { attempts: 5, create: failing('EPERM', 2) })) === true);
  releaseLock(lock);
  check('a create refused with EBUSY on every attempt stands aside without throwing', taken(lock, options(Date.now(), { attempts: 3, create: failing('EBUSY', 9) })) === false);
  check('a create refused with EACCES is a fault, thrown at once', taken(lock, options(Date.now(), { attempts: 3, create: failing('EACCES', 9) })) === 'threw');

  const stale = ownedBy('busy-removal', deadPid, STALE_AFTER + 10_000);
  let removals = 0;
  const busyOnce = (file) => { removals += 1; if (removals === 1) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' }); rmSync(file, { force: true }); };

  check('a removal refused once with EBUSY while breaking a stale lock is retried, not thrown', taken(stale.lock, options(stale.at, { attempts: 6, remove: busyOnce })) === true && removals >= 2, `removals: ${String(removals)}`);
  releaseLock(stale.lock);

  const broken = ownedBy('failing-removal', deadPid, STALE_AFTER + 10_000);

  check('a removal that fails for another reason is a fault, thrown', taken(broken.lock, options(broken.at, { remove: () => { throw Object.assign(new Error('EIO'), { code: 'EIO' }); } })) === 'threw');
}

const CONTENDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ledger-lock-contender.mjs');

/**
 * Runs `count` contenders as real processes at the same moment on one lock and reports how many entered the
 * critical section while another was inside, and each exit code (3 is a contender that never held the lock).
 * @es Lanza `count` contendientes como procesos reales a la vez sobre un lock e informa cuántos entraron a la
 * sección crítica con otro dentro, y cada código de salida (3 es quien nunca tuvo el lock).
 */
async function race(name, { count, holdMs, staleAfterMs, attempts, prepare = () => undefined }) {
  const dir = path.join(scratch, name);
  const lock = path.join(dir, 'ledger.lock');
  const violations = path.join(dir, 'violations.txt');

  mkdirSync(dir, { recursive: true });
  prepare(lock);

  const errors = [];
  const children = Array.from({ length: count }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, [CONTENDER, lock, path.join(dir, 'inside.txt'), violations, String(holdMs), String(staleAfterMs), String(attempts)], { stdio: ['ignore', 'ignore', 'pipe'] });

    child.stderr.on('data', (chunk) => errors.push(String(chunk).split('\n').find((line) => line.includes('Error')) ?? ''));
    child.on('exit', (code) => resolve(code));
  }));
  const codes = await Promise.all(children);

  return { overlaps: existsSync(violations) ? readFileSync(violations, 'utf8').split('\n').filter(Boolean).length : 0, codes, errors, lockLeft: existsSync(lock) };
}

{
  // A holder slower than the stale age is ALIVE: the old code judged by age alone and let the next waiter delete
  // its lock, so two processes were inside at once. @es Un dueño más lento que la edad límite sigue VIVO: el código
  // anterior juzgaba solo por edad y dejaba que el siguiente en espera borrase su lock, y dos procesos quedaban dentro.
  const outcome = await race('slow-live-holder', { count: 4, holdMs: 200, staleAfterMs: 40, attempts: 400 });

  check('K1: four real processes holding the lock longer than the stale age are never inside together', outcome.overlaps === 0 && outcome.codes.every((code) => code === 0), JSON.stringify(outcome));
  check('K1: ...and nobody leaves the lock behind', !outcome.lockLeft);
}

{
  // A lock left by a dead process, taken over by several waiters at once: exactly one at a time may enter.
  // @es Un lock de un proceso muerto, que varios en espera quieren tomar a la vez: entra uno solo cada vez.
  const outcome = await race('dead-holder-takeover', { count: 6, holdMs: 60, staleAfterMs: 40, attempts: 400, prepare: (lock) => { writeFileSync(lock, `${String(deadPid)}:fixture`); backdate(lock, Date.now(), 120_000); } });

  check('K1: six real processes taking over a dead owner\'s lock are never inside together', outcome.overlaps === 0 && outcome.codes.every((code) => code === 0), JSON.stringify(outcome));
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
  backdate(target.lock, Date.now(), 2 * STALE_AFTER);

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
