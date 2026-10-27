#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/file-lock.mjs`, the one lock every state writer takes (the hook-state
 * counters and, through `failure-capture/ledger-lock.mjs`, the ledgers).
 *
 * THE STATE SPACE: the lock free / held young / held old with a live owner / old with a dead owner / old with no
 * owner (empty or naming no pid) / past the absolute ceiling with an owner that still answers; the `.breaker`
 * file free / held live / left by a dead breaker, young or old / replaced between its judgement and its removal;
 * a lock replaced between its judgement and its removal, by a live token or by an empty file of another
 * identity; every create failure (`EEXIST`, `EPERM`/`EBUSY` that clear, that persist, mixed with `EEXIST`, any
 * other code) and every removal failure; the release of a lock this process took, of one it never took, and of
 * one that now holds another token; work that returns and work that throws. The unit cases inject every option,
 * so nothing sleeps; the race cases run REAL child processes (`file-lock-contender.mjs`) on one lock and count
 * what the lock exists to prevent: two holders inside at once, a holder whose lock another process removed, and
 * two breakers at once.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `file-lock.mjs`, el único lock que toma todo escritor de estado. Espacio de
 * estados: el lock libre / ocupado joven / viejo con dueño vivo / viejo con dueño muerto / viejo sin dueño (vacío
 * o sin pid) / pasado el techo absoluto con un dueño que aún responde; el `.breaker` libre / ocupado vivo /
 * dejado por un rompedor muerto, joven o viejo / sustituido entre su juicio y su borrado; un lock sustituido entre
 * su juicio y su borrado, por un token vivo o por un vacío de otra identidad; cada fallo de creación y de borrado;
 * soltar un lock propio, uno nunca tomado y uno que ahora tiene otro token; trabajo que vuelve y que lanza. Las
 * unidades inyectan toda opción y nada duerme; las carreras lanzan procesos hijos REALES y cuentan lo que el lock
 * debe impedir: dos dueños dentro a la vez, un dueño cuyo lock borró otro proceso y dos rompedores a la vez.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as lock from './file-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENDER = path.join(HERE, 'file-lock-contender.mjs');
const scratch = mkdtempSync(path.join(tmpdir(), 'file-lock-selftest-'));

// Removed on every exit, a throw included. @es Se elimina en toda salida, también ante una excepción.
process.once('exit', () => rmSync(scratch, { recursive: true, force: true }));

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** The value of `action`, or `{ threw, message, code }` when it throws: a throw is a value, never a crash. @es El valor, o lo lanzado como valor. */
const outcomeOf = (action) => {
  try {
    return action();
  } catch (error) {
    return { threw: error?.name, message: String(error?.message), code: error?.cause?.code ?? error?.code, file: error?.file };
  }
};

const STALE = 60_000;
const file = (name) => path.join(scratch, `${name}.lock`);
const backdate = (target, at, ageMs) => utimesSync(target, (at - ageMs) / 1000, (at - ageMs) / 1000);

/** A lock made by the fixture (another writer's), holding `content`, `ageMs` old. @es Un lock del fixture, con `content`, de `ageMs` de edad. */
function held(name, content, ageMs, at = Date.now()) {
  const target = file(name);

  writeFileSync(target, content);
  if (ageMs > 0) backdate(target, at, ageMs);

  return target;
}

/** A failure with `code`, as `fs` throws it. @es Un fallo con `code`, como lo lanza `fs`. */
const failure = (code) => Object.assign(new Error(`${code}: injected`), { code });

/** What a file holds, `undefined` when it is gone: a missing file fails a check, never crashes the proof. @es Lo que tiene un fichero, `undefined` si no está. */
const contentOf = (target) => {
  try {
    return readFileSync(target, 'utf8');
  } catch {
    return undefined;
  }
};

/** The breaks journaled beside a lock. @es Las roturas registradas junto a un lock. */
const breaksOf = (target) => (existsSync(`${target}.breaks.jsonl`) ? readFileSync(`${target}.breaks.jsonl`, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []);

/** The pid of a process that exited and that no running process holds now. @es El pid de un proceso que terminó y que ningún proceso vivo tiene ahora. */
function confirmedDeadPid() {
  for (let tries = 0; tries < 20; tries += 1) {
    const { pid } = spawnSync(process.execPath, ['-e', '0']);

    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return pid;
    }
  }

  throw new Error('no dead pid could be confirmed. @es no se pudo confirmar ningún pid muerto.');
}

const AT = Date.now();
const options = (extra) => ({ attempts: 3, staleAfterMs: STALE, now: () => AT, wait: () => undefined, ...extra });
const deadPid = confirmedDeadPid();

/** A create that fails with each of `codes` in turn, then creates for real. @es Un create que falla con cada código y luego crea de verdad. */
const failing = (codes) => {
  const left = [...codes];

  return (target, token) => {
    if (left.length > 0) throw failure(left.shift());

    writeFileSync(target, token, { flag: 'wx' });
  };
};

// --- R: the live owner a READER sees (`liveOwnerOf`) ------------------------------------------------------------
{
  /** The reader's answer, a throw included as a value. @es La respuesta del lector, una excepción incluida como valor. */
  const ownerOf = (...args) => outcomeOf(() => lock.liveOwnerOf(...args));
  const reader = (extra) => ({ staleAfterMs: STALE, ceilingMs: STALE * 10, now: () => AT, ...extra });

  check('R1: a lock held by this live process names its pid', ownerOf(held('r-live', `${String(process.pid)}:x`, 0, AT), reader()), process.pid);
  check('R2: no lock file is no owner', ownerOf(file('r-none'), reader()), undefined);
  check('R3: a YOUNG lock whose pid is dead has no live owner (a reader must not wait on it)', ownerOf(held('r-dead', `${String(deadPid)}:x`, 0, AT), reader()), undefined);
  check('R4: an empty lock names no owner', ownerOf(held('r-empty', '', 0, AT), reader()), undefined);
  check('R5: a live pid past the ceiling is no owner (the pid may be reused)', ownerOf(held('r-ceiling', `${String(process.pid)}:x`, STALE * 10 + 1, AT), reader()), undefined);
  check('R6: a live pid just under the ceiling still owns it', ownerOf(held('r-at-ceiling', `${String(process.pid)}:x`, STALE * 10 - 1000, AT), reader()), process.pid);
  check('R7: the injected probe decides liveness', ownerOf(held('r-probe', '4242:x', 0, AT), reader({ isAlive: (pid) => pid === 4242 })), 4242);
  check('R8: the default ceiling is ten stale ages', ownerOf(held('r-default', `${String(process.pid)}:x`, STALE * 10 + 1, AT), { staleAfterMs: STALE, now: () => AT }), undefined);
  check('R9: under the default ceiling a live pid past one stale age still owns it', ownerOf(held('r-default-live', `${String(process.pid)}:x`, STALE * 2, AT), { staleAfterMs: STALE, now: () => AT }), process.pid);
}

// --- K-A: the owner token, and a release that removes only this process's own lock --------------------------
{
  const target = file('free');

  check('K-A: a free lock is taken', outcomeOf(() => lock.takeLock(target, options())), true);
  check('K-A: the lock holds this process\'s owner token, pid:random', /^\d+:[0-9a-f]{12}$/.test(String(contentOf(target))) && String(contentOf(target)).startsWith(`${String(process.pid)}:`), true);
  lock.releaseLock(target);
  check('K-A: releasing removes it, and releasing again is harmless', [existsSync(target), outcomeOf(() => lock.releaseLock(target))], [false, undefined]);

  lock.takeLock(target, options());
  writeFileSync(target, `${String(process.pid)}:somebody-else`);
  lock.releaseLock(target);
  check('K-A: a release never removes a lock that now holds another token', existsSync(target), true);
  rmSync(target, { force: true });

  const foreign = held('never-taken', `${String(process.pid)}:other`, 0);

  lock.releaseLock(foreign);
  check('K-A: a release of a lock this process never took leaves it alone', existsSync(foreign), true);

  const twice = file('two-tokens');

  lock.takeLock(twice, options());
  const one = contentOf(twice);

  lock.releaseLock(twice);
  lock.takeLock(twice, options());
  check('K-A: every take writes a fresh random token', [one !== undefined, contentOf(twice) !== one], [true, true]);
  lock.releaseLock(twice);
}

// --- holding: contention waits, bounded --------------------------------------------------------------------
{
  const target = held('held-young', `${String(deadPid)}:x`, 0, AT);
  let waits = 0;

  check('a held lock is not taken', outcomeOf(() => lock.takeLock(target, options({ wait: () => { waits += 1; } }))), false);
  check('waiting is bounded by the attempts, one wait per attempt', waits, 3);
  check('the holder keeps its lock', contentOf(target),`${String(deadPid)}:x`);
  check('zero attempts never takes a free lock, and creates nothing', [outcomeOf(() => lock.takeLock(file('zero'), options({ attempts: 0 }))), existsSync(file('zero'))], [false, false]);

  const released = held('released-meanwhile', 'x', 0, AT);

  check('a lock released while the taker waits is taken on the next attempt', outcomeOf(() => lock.takeLock(released, options({ wait: () => rmSync(released, { force: true }) }))), true);
  lock.releaseLock(released);
}

{
  const old = held('default-old', `${String(deadPid)}:x`, 2 * STALE);
  const recent = held('default-recent', `${String(deadPid)}:x`, STALE / 2);
  let waits = 0;

  check('by default a dead owner\'s lock two minutes old is taken', outcomeOf(() => lock.takeLock(old, { wait: () => undefined })), true);
  lock.releaseLock(old);
  check('...and one half a minute old is held for forty attempts', [outcomeOf(() => lock.takeLock(recent, { wait: () => { waits += 1; } })), waits], [false, 40]);
  check('the default stale age is one minute and the ceiling ten times it', [lock.STALE_AFTER_MS, lock.CEILING_FACTOR], [60_000, 10]);
}

// --- staleness: age AND a dead owner ---------------------------------------------------------------------
{
  const dead = held('old-dead', `${String(deadPid)}:x`, STALE + 10_000, AT);

  check('an old lock whose owner is dead is broken and taken', outcomeOf(() => lock.takeLock(dead, options())), true);
  check('...the lock is now this process\'s, no breaker is left, and the break is journaled with its reason, bilingual', [String(contentOf(dead)).startsWith(`${String(process.pid)}:`), existsSync(`${dead}.breaker`), breaksOf(dead).map((one) => [one.reason, one.token, one.ageMs, one.message.includes(String(deadPid)) && one.message.includes(' @es ')])], [true, false, [['dead-owner', `${String(deadPid)}:x`, STALE + 10_000, true]]]);
  lock.releaseLock(dead);

  const nearly = held('nearly-stale', `${String(deadPid)}:x`, STALE - 10_000, AT);

  check('NEAR MISS: a dead owner\'s lock just inside the stale age is still held', outcomeOf(() => lock.takeLock(nearly, options())), false);

  const slow = held('old-live', `${String(process.pid)}:x`, STALE + 10_000, AT);

  check('an old lock whose owner is alive is held, never robbed', [outcomeOf(() => lock.takeLock(slow, options())), contentOf(slow)], [false, `${String(process.pid)}:x`]);

  const system = held('old-system', `${String(process.platform === 'win32' ? 4 : 1)}:x`, STALE + 10_000, AT);

  check('an old lock of a process we may not signal (it exists) is held', outcomeOf(() => lock.takeLock(system, options())), false);
}

// --- K-C: an empty lock is live while young, and judged by age after ------------------------------------
{
  const empty = held('young-empty', '', 1_000, AT);

  check('K-C: a young empty lock (created, token not yet written) is live', [outcomeOf(() => lock.takeLock(empty, options())), contentOf(empty)], [false, '']);

  const oldEmpty = held('old-empty', '', STALE + 10_000, AT);

  check('K-C: an old empty lock is judged by its age and broken', [outcomeOf(() => lock.takeLock(oldEmpty, options())), breaksOf(oldEmpty).map((one) => one.reason)], [true, ['no-owner']]);
  lock.releaseLock(oldEmpty);

  const nearEmpty = held('near-empty', '', STALE - 10_000, AT);

  check('K-C: NEAR MISS: an empty lock just inside the stale age is still live', outcomeOf(() => lock.takeLock(nearEmpty, options())), false);

  const garbled = held('old-garbled', 'not a token', STALE + 10_000, AT);

  check('K-C: an old lock naming no pid is judged by its age, as one with no owner', [outcomeOf(() => lock.takeLock(garbled, options())), breaksOf(garbled).map((one) => one.reason)], [true, ['no-owner']]);
  lock.releaseLock(garbled);

  // A directory where the lock should be: it exists (so creating it is contention) but cannot be read.
  // @es Un directorio donde va el lock: existe (crearlo es contienda) pero no se puede leer.
  const unreadable = path.join(scratch, 'young-unreadable.lock');

  mkdirSync(unreadable);
  check('K-C: a young unreadable lock is live', [outcomeOf(() => lock.takeLock(unreadable, options({ now: () => Date.now() }))), existsSync(unreadable)], [false, true]);

  // The race K-C names: the empty lock was read and judged stale, then removed and replaced by a FRESH empty lock
  // (another writer between its create and its write) before the breaker re-read it: same empty token, another
  // identity. The clock is read after the lock, so the swap lands between the judgement and the break.
  // @es La carrera de K-C: el lock vacío se leyó y juzgó caducado, y otro lo sustituyó por un vacío NUEVO antes de
  // que el rompedor lo releyera: mismo token vacío, otra identidad.
  const replaced = held('empty-replaced', '', STALE + 10_000, AT);
  let reads = 0;
  const swap = () => {
    reads += 1;
    if (reads === 1) {
      rmSync(replaced, { force: true });
      writeFileSync(replaced, '');
    }

    return AT;
  };

  check('K-C: an empty lock replaced by another empty lock before the break is not removed', [outcomeOf(() => lock.takeLock(replaced, options({ attempts: 1, now: swap }))), existsSync(replaced), breaksOf(replaced)], [false, true, []]);
}

// --- K-D: the absolute ceiling over a reused pid ---------------------------------------------------------
{
  const reused = held('past-ceiling', `${String(process.pid)}:reused`, STALE * 10 + 1_000, AT);

  check('K-D: past the ceiling a lock is stale although its owner pid still answers', outcomeOf(() => lock.takeLock(reused, options())), true);
  check('K-D: ...and the journal says so, naming the ceiling and the pid, bilingual', breaksOf(reused).map((one) => [one.reason, one.ceilingMs, one.message.includes('past the absolute ceiling') && one.message.includes(String(process.pid)) && one.message.includes(' @es ')]), [['ceiling', STALE * 10, true]]);
  lock.releaseLock(reused);

  const under = held('under-ceiling', `${String(process.pid)}:x`, STALE * 10 - 1_000, AT);

  check('K-D: NEAR MISS: just under the ceiling a live owner keeps its lock', outcomeOf(() => lock.takeLock(under, options())), false);

  const custom = held('custom-ceiling', `${String(process.pid)}:x`, STALE + 2_000, AT);

  check('K-D: the ceiling is an option', outcomeOf(() => lock.takeLock(custom, options({ ceilingMs: STALE + 1_000 }))), true);
  lock.releaseLock(custom);
}

// --- K-B: the breaker, judged and re-checked like the lock -----------------------------------------------
{
  const target = held('breaker-live', `${String(deadPid)}:x`, STALE + 10_000, AT);

  writeFileSync(`${target}.breaker`, `${String(process.pid)}:breaker`);
  check('K-B: a stale lock is left alone while a live breaker is at work on it', [outcomeOf(() => lock.takeLock(target, options())), existsSync(target), existsSync(`${target}.breaker`)], [false, true, true]);
}

{
  const target = held('breaker-young-dead', `${String(deadPid)}:x`, STALE + 10_000, AT);

  writeFileSync(`${target}.breaker`, `${String(deadPid)}:breaker`);
  check('K-B: NEAR MISS: a dead breaker\'s file that is still young is left alone', [outcomeOf(() => lock.takeLock(target, options())), existsSync(`${target}.breaker`)], [false, true]);
}

{
  const target = held('breaker-dead', `${String(deadPid)}:x`, STALE + 10_000, AT);

  writeFileSync(`${target}.breaker`, `${String(deadPid)}:breaker`);
  backdate(`${target}.breaker`, AT, STALE + 10_000);
  check('K-B: a breaker left by a dead process does not wedge the lock', [outcomeOf(() => lock.takeLock(target, options({ attempts: 5 }))), existsSync(`${target}.breaker`)], [true, false]);
  check('K-B: ...and the dead breaker\'s removal is journaled too, naming the breaker', breaksOf(target).map((one) => [path.basename(one.file), one.reason]), [[`${path.basename(target)}.breaker`, 'dead-owner'], [path.basename(target), 'dead-owner']]);
  lock.releaseLock(target);
}

{
  // The breaker's race: its dead file was read and judged stale, then another process removed it and took the
  // breaker before this one re-read it. The live breaker must survive. The first liveness probe is the lock's own
  // judgement, the second the breaker's. @es La carrera del breaker: se leyó y juzgó muerto, y otro lo quitó y tomó
  // el breaker antes de releerlo; el breaker vivo debe sobrevivir. La primera sonda es la del lock, la segunda la del breaker.
  const target = held('breaker-replaced', `${String(deadPid)}:x`, STALE + 10_000, AT);
  const breaker = `${target}.breaker`;
  let probes = 0;

  writeFileSync(breaker, `${String(deadPid)}:breaker`);
  backdate(breaker, AT, STALE + 10_000);

  const isAlive = (pid) => {
    probes += 1;
    if (probes === 2) {
      rmSync(breaker, { force: true });
      writeFileSync(breaker, `${String(process.pid)}:live-breaker`);
    }

    return pid === process.pid;
  };

  check('K-B: a dead breaker replaced by a live one before its removal is not removed', [outcomeOf(() => lock.takeLock(target, options({ attempts: 1, isAlive }))), probes, contentOf(breaker)], [false, 2, `${String(process.pid)}:live-breaker`]);
}

{
  // The lock's race under the breaker: read and judged stale, then rewritten with a live token before the break.
  // Its time is put back, so only the token tells it apart. @es La carrera del lock bajo el breaker: leído y juzgado
  // caducado, y reescrito con un token vivo antes de romperlo; su fecha se repone, así que solo el token lo distingue.
  const target = held('replaced-before-break', `${String(deadPid)}:x`, STALE + 10_000, AT);
  let replaced = false;
  const isAlive = (pid) => {
    if (!replaced) {
      replaced = true;
      writeFileSync(target, `${String(process.pid)}:fresh`);
      backdate(target, AT, STALE + 10_000);
    }

    return pid === process.pid;
  };

  check('a stale lock replaced by a live one while it is being broken is not removed', [outcomeOf(() => lock.takeLock(target, options({ attempts: 1, isAlive }))), contentOf(target)], [false, `${String(process.pid)}:fresh`]);

  const vanishing = held('released-before-break', `${String(deadPid)}:x`, STALE + 10_000, AT);

  check('a stale lock that disappears before the breaker re-reads it is no error, and is taken', outcomeOf(() => lock.takeLock(vanishing, options({ isAlive: () => { rmSync(vanishing, { force: true }); return false; } }))), true);
  lock.releaseLock(vanishing);

  const gone = held('vanishing-while-judged', `${String(deadPid)}:x`, 0, AT);

  check('a lock that vanishes while it is being judged is no error, and is taken next', outcomeOf(() => lock.takeLock(gone, options({ now: () => { rmSync(gone, { force: true }); return AT; } }))), true);
  lock.releaseLock(gone);
}

// --- K-E: contention codes, faults, and the breaker path ---------------------------------------------------
{
  const target = file('contended');
  let waits = 0;

  check('K-E: a create refused twice with EPERM (delete pending) is taken on the third attempt', outcomeOf(() => lock.takeLock(target, options({ attempts: 5, create: failing(['EPERM', 'EPERM']) }))), true);
  lock.releaseLock(target);

  const persisted = outcomeOf(() => lock.takeLock(target, options({ attempts: 3, create: failing(['EBUSY', 'EPERM', 'EBUSY', 'EBUSY']), wait: () => { waits += 1; } })));

  check('K-E: EPERM/EBUSY through every attempt is a fault ("could not be created", bilingual), never "held"', [persisted.threw, /could not be created \(EBUSY\)/.test(persisted.message), / @es /.test(persisted.message), /not another writer/.test(persisted.message), persisted.code, waits], ['LockFault', true, true, true, 'EBUSY', 3]);
  check('K-E: ...and nothing was created', existsSync(target), false);

  const blocker = held('mixed', `${String(process.pid)}:x`, 0, AT);

  check('K-E: delete-pending mixed with a real holder is contention, not a fault', outcomeOf(() => lock.takeLock(blocker, options({ attempts: 3, create: failing(['EPERM', 'EBUSY']) }))), false);

  waits = 0;
  const denied = outcomeOf(() => lock.takeLock(file('denied'), options({ create: failing(['EACCES']), wait: () => { waits += 1; } })));

  check('K-E: any other create failure is a fault at once, bilingual, with its cause and the lock it is about', [denied.threw, denied.code, / @es /.test(denied.message), waits, denied.file], ['LockFault', 'EACCES', true, 0, file('denied')]);

  const missing = outcomeOf(() => lock.takeLock(path.join(scratch, 'no-such-dir', 'x.lock'), options()));

  check('K-E: a missing directory is a fault, not contention', [missing.threw, missing.code], ['LockFault', 'ENOENT']);
}

{
  let serial = 0;
  const stale = () => {
    serial += 1;

    return held(`breaker-fault-${String(serial)}`, `${String(deadPid)}:x`, STALE + 10_000, AT);
  };
  const breakerFails = (code) => (target, token) => {
    if (target.endsWith('.breaker')) throw failure(code);

    writeFileSync(target, token, { flag: 'wx' });
  };
  const broken = outcomeOf(() => lock.takeLock(stale(), options({ create: breakerFails('EACCES') })));

  check('K-E: a non-contention failure creating the breaker is rethrown, never a silent return', [broken.threw, broken.code, / @es /.test(broken.message), String(broken.file).endsWith('.lock.breaker')], ['LockFault', 'EACCES', true, true]);
  const breakerPendingTwice = (() => {
    let left = 2;

    return (target, token) => {
      if (target.endsWith('.breaker') && left > 0) {
        left -= 1;
        throw failure('EPERM');
      }

      writeFileSync(target, token, { flag: 'wx' });
    };
  })();
  const breakerTarget = stale();

  check('K-E: a breaker that is delete-pending is retried, and the lock is taken once it clears', outcomeOf(() => lock.takeLock(breakerTarget, options({ attempts: 5, create: breakerPendingTwice }))), true);
  lock.releaseLock(breakerTarget);

  // L1: a breaker that stays delete-pending through every attempt is a fault, never "another writer holds it".
  // @es L1: un breaker que sigue pendiente de borrado en todos los intentos es un fallo, nunca «otro escritor lo tiene».
  const breakerStuck = outcomeOf(() => lock.takeLock(stale(), options({ create: breakerFails('EPERM') })));

  check('L1: a breaker delete-pending through every attempt is a fault: "could not be broken", bilingual', [breakerStuck.threw, breakerStuck.code, /could not be broken \(EPERM\)/.test(breakerStuck.message), / @es /.test(breakerStuck.message)], ['LockFault', 'EPERM', true, true]);

  // L1: a stale lock whose removal stays delete-pending (Windows) is retried, and a fault once it persists.
  // @es L1: un lock caducado cuyo borrado sigue pendiente (Windows) se reintenta, y es un fallo si persiste.
  const removalFails = (code) => (target) => {
    if (!target.endsWith('.breaker')) throw failure(code);
    rmSync(target, { force: true });
  };
  let waitsOnStuck = 0;
  const stuck = outcomeOf(() => lock.takeLock(stale(), options({ platform: 'win32', remove: removalFails('EPERM'), wait: () => { waitsOnStuck += 1; } })));

  check('L1: on Windows a stale lock that cannot be deleted through every attempt is a fault, after retrying each attempt', [stuck.threw, stuck.code, /could not be broken \(EPERM\)/.test(stuck.message), / @es /.test(stuck.message), waitsOnStuck], ['LockFault', 'EPERM', true, true, 3]);

  const busyStuck = outcomeOf(() => lock.takeLock(stale(), options({ platform: 'linux', remove: removalFails('EBUSY') })));

  check('L1: EBUSY on a POSIX unlink is retried as well, and a fault once it persists', [busyStuck.threw, busyStuck.code], ['LockFault', 'EBUSY']);

  let waitsOnPosix = 0;
  const posix = outcomeOf(() => lock.takeLock(stale(), options({ platform: 'linux', remove: removalFails('EPERM'), wait: () => { waitsOnPosix += 1; } })));

  check('L1: on POSIX an unlink EPERM is a fault at once', [posix.threw, posix.code, waitsOnPosix], ['LockFault', 'EPERM', 0]);

  const once = stale();
  let failedOnce = false;
  const eperOnce = (target) => {
    if (!target.endsWith('.breaker') && !failedOnce) {
      failedOnce = true;
      throw failure('EPERM');
    }
    rmSync(target, { force: true });
  };

  check('L1: on Windows an EPERM that clears is retried and the lock taken', outcomeOf(() => lock.takeLock(once, options({ platform: 'win32', attempts: 5, remove: eperOnce }))), true);
  lock.releaseLock(once);

  const vanished = stale();
  const goneAtRemoval = (target) => {
    rmSync(target, { force: true });
    if (!target.endsWith('.breaker')) throw failure('ENOENT');
  };

  check('a stale lock already gone when its removal runs is no fault, and the lock is taken next', outcomeOf(() => lock.takeLock(vanished, options({ platform: 'linux', remove: goneAtRemoval }))), true);
  lock.releaseLock(vanished);

  // A break that failed once and then found a LIVE holder is contention, not a fault.
  // @es Una rotura que falló una vez y luego encontró un dueño VIVO es contienda, no un fallo.
  const relived = stale();
  let replacedByLive = false;
  const relive = () => {
    if (!replacedByLive) {
      replacedByLive = true;
      writeFileSync(relived, `${String(process.pid)}:live`);
      utimesSync(relived, AT / 1000, AT / 1000);
    }
  };

  check('L1: NEAR MISS: a failed break followed by a live holder is "held", not a fault', outcomeOf(() => lock.takeLock(relived, options({ platform: 'win32', remove: removalFails('EPERM'), wait: relive }))), false);

  const busy = stale();
  let removals = 0;
  const busyOnce = (target) => {
    removals += 1;
    if (removals === 1) throw failure('EBUSY');
    rmSync(target, { force: true });
  };

  check('K-E: a removal refused once with EBUSY while breaking is retried, not thrown', [outcomeOf(() => lock.takeLock(busy, options({ attempts: 6, remove: busyOnce }))), removals >= 2], [true, true]);
  lock.releaseLock(busy);

  const failsFor = (wanted) => (target) => {
    if (wanted(target)) throw failure('EIO');
    rmSync(target, { force: true });
  };
  const eio = outcomeOf(() => lock.takeLock(stale(), options({ remove: failsFor((target) => !target.endsWith('.breaker')) })));

  check('K-E: a removal of the stale lock that fails for another reason is a fault, bilingual', [eio.threw, eio.code, /could not be broken/.test(eio.message), / @es /.test(eio.message)], ['LockFault', 'EIO', true, true]);

  // The breaker's own release: retried in place while it may clear, and never failing a take whose stale lock is
  // already gone. @es El soltado del propio breaker: se reintenta mientras pueda pasar, y nunca hace fallar una toma
  // cuyo lock caducado ya no está.
  const breakerReports = [];
  const tellTo = (line) => breakerReports.push(line);
  const lockGoneBreakerFails = stale();
  const release = outcomeOf(() => lock.takeLock(lockGoneBreakerFails, options({ remove: failsFor((target) => target.endsWith('.breaker')), report: tellTo })));

  check('K-E: a breaker that cannot be released after the stale lock is gone does not fail the take: it is reported once, bilingual, naming the breaker', [release, breakerReports.length, /breaker .*could not be released \(EIO\)/.test(breakerReports[0] ?? ''), (breakerReports[0] ?? '').includes(`${lockGoneBreakerFails}.breaker`), / @es /.test(breakerReports[0] ?? '')], [true, 1, true, true, true]);
  lock.releaseLock(lockGoneBreakerFails);
  rmSync(`${lockGoneBreakerFails}.breaker`, { force: true });

  let transientWaits = 0;
  let breakerRefusals = 0;
  const breakerPendingOnce = (target) => {
    if (target.endsWith('.breaker') && breakerRefusals === 0) {
      breakerRefusals += 1;
      throw failure('EPERM');
    }
    rmSync(target, { force: true });
  };
  const transientTarget = stale();

  breakerReports.length = 0;
  check('K-E: on Windows a breaker release that is delete-pending once is retried in place: the lock is taken, the breaker is gone, nothing is reported (two waits: one retry, one pause of the take)', [outcomeOf(() => lock.takeLock(transientTarget, options({ platform: 'win32', remove: breakerPendingOnce, report: tellTo, wait: () => { transientWaits += 1; } }))), existsSync(`${transientTarget}.breaker`), breakerReports.length, transientWaits], [true, false, 0, 2]);
  lock.releaseLock(transientTarget);

  let persistentWaits = 0;
  const persistentTarget = stale();

  breakerReports.length = 0;
  check('K-E: on Windows a breaker release that stays delete-pending is tried three times, then reported once, and the take still succeeds (three waits: two retries, one pause of the take)', [outcomeOf(() => lock.takeLock(persistentTarget, options({ platform: 'win32', remove: (target) => { if (target.endsWith('.breaker')) throw failure('EPERM'); rmSync(target, { force: true }); }, report: tellTo, wait: () => { persistentWaits += 1; } }))), persistentWaits, breakerReports.length, /could not be released \(EPERM\)/.test(breakerReports[0] ?? '')], [true, 3, 1, true]);
  lock.releaseLock(persistentTarget);
  rmSync(`${persistentTarget}.breaker`, { force: true });

  let posixWaits = 0;
  const posixTarget = stale();

  breakerReports.length = 0;
  check('K-E: on POSIX a breaker release EPERM is not retried, and is reported once the stale lock is gone (one wait: the pause of the take only)', [outcomeOf(() => lock.takeLock(posixTarget, options({ platform: 'linux', remove: (target) => { if (target.endsWith('.breaker')) throw failure('EPERM'); rmSync(target, { force: true }); }, report: tellTo, wait: () => { posixWaits += 1; } }))), posixWaits, breakerReports.length], [true, 1, 1]);
  lock.releaseLock(posixTarget);
  rmSync(`${posixTarget}.breaker`, { force: true });

  // The stale lock still there (its own removal is pending) and the breaker cannot be released: the break did
  // nothing, so that is a fault. @es El lock caducado sigue (su borrado está pendiente) y el breaker no se suelta: la
  // rotura no hizo nada, así que es un fallo.
  const bothStuck = outcomeOf(() => lock.takeLock(stale(), options({ platform: 'win32', remove: (target) => { throw failure(target.endsWith('.breaker') ? 'EIO' : 'EPERM'); } })));

  check('K-E: a breaker that cannot be released while the stale lock is still there is a fault, bilingual', [bothStuck.threw, bothStuck.code, /could not be released/.test(bothStuck.message), / @es /.test(bothStuck.message)], ['LockFault', 'EIO', true, true]);

  // A break that faults keeps its own fault: a breaker that then cannot be released never replaces it.
  // @es Una rotura que falla conserva su propio fallo: un breaker que luego no se suelta nunca lo sustituye.
  const faultTarget = stale();

  breakerReports.length = 0;
  const kept = outcomeOf(() => lock.takeLock(faultTarget, options({ remove: () => { throw failure('EIO'); }, report: tellTo })));

  check('K-E: a break that faults is thrown as itself, about the stale lock, and the breaker failure is only reported', [kept.threw, /could not be broken/.test(kept.message), kept.file, breakerReports.length], ['LockFault', true, faultTarget, 1]);

  const gone = stale();
  breakerReports.length = 0;
  const already = outcomeOf(() => lock.takeLock(gone, options({ remove: (target) => { rmSync(target, { force: true }); if (target.endsWith('.breaker')) throw failure('ENOENT'); }, report: tellTo })));

  check('K-E: a breaker already gone at its release is no fault, and nothing is reported', [already, breakerReports.length], [true, 0]);
  lock.releaseLock(gone);
}

// --- withLock -------------------------------------------------------------------------------------------
{
  const target = file('with');

  check('work runs holding the lock and its value comes back', outcomeOf(() => lock.withLock(target, () => existsSync(target) && 42, options())), { held: true, value: 42 });
  check('the lock is gone after the work', existsSync(target), false);
  check('work that throws reaches the caller unchanged and still releases the lock', [outcomeOf(() => lock.withLock(target, () => { throw new Error('boom'); }, options())).message, existsSync(target)], ['boom', false]);

  const other = held('with-held', `${String(process.pid)}:x`, 0, AT);
  let ran = false;

  check('a held lock: the work does not run and the holder keeps its lock', [outcomeOf(() => lock.withLock(other, () => { ran = true; }, options())), ran, existsSync(other)], [{ held: false }, false, true]);

  // A shared wait budget that is spent stops the take at its next pause, and says so.
  // @es Un presupuesto de espera compartido que se agotó para la toma en su siguiente pausa, y lo dice.
  let spentWaits = 0;
  const afterOnePause = () => spentWaits >= 1;

  check('a take whose shared budget is spent stops at its next pause, the work does not run, and the outcome says the budget was spent', [outcomeOf(() => lock.withLock(other, () => { ran = true; }, options({ attempts: 5, wait: () => { spentWaits += 1; }, spent: afterOnePause }))), spentWaits, ran], [{ held: false, spent: true }, 1, false]);

  // A stale lock whose removal stays delete-pending, met with the budget already spent: the attempts it never made
  // never waited, so it is not-held, never "could not be broken". @es Un lock caducado cuyo borrado sigue pendiente,
  // con el presupuesto ya agotado: los intentos que no hizo nunca esperaron, así que no es «no se pudo romper».
  const pendingStale = held('spent-stale', `${String(deadPid)}:x`, STALE + 10_000, AT);
  const pendingRemoval = (target) => {
    if (!target.endsWith('.breaker')) throw failure('EPERM');
    rmSync(target, { force: true });
  };

  check('a stale lock still delete-pending when the budget is spent is not-held, never a "could not be broken" fault', outcomeOf(() => lock.takeLock(pendingStale, options({ platform: 'win32', attempts: 3, remove: pendingRemoval, spent: () => true }))), false);
  // A create that is delete-pending with the budget spent: the take stops, never "could not be created".
  // @es Una creación pendiente de borrado con el presupuesto agotado: la toma para, nunca «no se pudo crear».
  check('a create still delete-pending when the budget is spent is not-held, never a "could not be created" fault', outcomeOf(() => lock.takeLock(file('spent-create'), options({ attempts: 3, create: failing(['EPERM']), spent: () => true }))), false);
  check('NEAR MISS: the same stale lock with budget to spare is still the fault after every attempt', outcomeOf(() => lock.takeLock(pendingStale, options({ platform: 'win32', attempts: 3, remove: pendingRemoval }))).threw, 'LockFault');
}

// --- L2: a break journal that cannot be written never fails the take -------------------------------------
{
  const target = held('journal-unwritable', `${String(deadPid)}:x`, STALE + 10_000, AT);
  const reported = [];

  mkdirSync(`${target}.breaks.jsonl`);
  check('L2: a stale lock is still broken and taken when its break cannot be journaled', outcomeOf(() => lock.takeLock(target, options({ report: (line) => reported.push(line) }))), true);
  check('L2: ...and the failed journal is reported once, bilingual, naming the lock', [reported.length, /could not be journaled/.test(reported[0] ?? ''), (reported[0] ?? '').includes(target), / @es /.test(reported[0] ?? '')], [1, true, true, true]);
  lock.releaseLock(target);

  // Without a reporter, the report goes to the standard error of the process. @es Sin reportero, va a stderr.
  const lockPath = path.join(scratch, 'journal-stderr.lock');

  writeFileSync(lockPath, `${String(deadPid)}:x`);
  backdate(lockPath, Date.now(), STALE + 10_000);
  mkdirSync(`${lockPath}.breaks.jsonl`);

  const script = `import { takeLock } from ${JSON.stringify(new URL('./file-lock.mjs', import.meta.url).href)};
process.stdout.write(String(takeLock(${JSON.stringify(lockPath)}, { attempts: 3, wait: () => undefined })));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });

  check('L2: by default the failed break journal goes to stderr, and the lock is still taken', [child.status, child.stdout, /could not be journaled/.test(child.stderr), / @es /.test(child.stderr)], [0, 'true', true, true]);
}

// --- L3: a release that fails never masks the work, and never turns a finished work into a throw -----------
{
  const target = file('release-fails');
  const reported = [];
  const releaseFails = (one) => {
    if (one === target) throw failure('EIO');
    rmSync(one, { force: true });
  };
  const done = outcomeOf(() => lock.withLock(target, () => 42, options({ remove: releaseFails, report: (line) => reported.push(line) })));

  check('L3: a finished work whose release fails still returns its value', done, { held: true, value: 42 });
  check('L3: ...and the release failure is reported, bilingual', [reported.length, /could not be released \(EIO\)/.test(reported[0] ?? ''), / @es /.test(reported[0] ?? '')], [1, true, true]);
  rmSync(target, { force: true });

  const boom = new Error('boom');
  let thrown;

  reported.length = 0;
  try {
    lock.withLock(target, () => { throw boom; }, options({ remove: releaseFails, report: (line) => reported.push(line) }));
  } catch (error) {
    thrown = error;
  }

  check('L3: a work that throws reaches the caller as itself, with the release failure attached, and reported', [thrown === boom, thrown?.suppressed?.name, thrown?.suppressed?.cause?.code, reported.length], [true, 'LockFault', 'EIO', 1]);
  rmSync(target, { force: true });

  // A work error that cannot carry the failure is rethrown untouched: a frozen one (an assignment would throw a
  // TypeError that masks it), and one with its own `suppressed` chain (which is not overwritten). The failure is
  // still reported. @es Un error que no puede llevar el fallo se relanza intacto: uno congelado y uno con su propia
  // cadena `suppressed`; el fallo se informa igual.
  const thrownBy = (work) => {
    try {
      lock.withLock(target, work, options({ remove: releaseFails, report: (line) => reported.push(line) }));
    } catch (error) {
      return error;
    } finally {
      rmSync(target, { force: true });
    }

    return undefined;
  };
  const frozen = Object.freeze(new Error('frozen'));

  reported.length = 0;
  const frozenThrown = thrownBy(() => { throw frozen; });

  check('L3: a frozen work error reaches the caller as itself, untouched, and the release failure is reported', [frozenThrown === frozen, Object.hasOwn(frozen, 'suppressed'), reported.length], [true, false, 1]);

  const earlier = new Error('earlier');
  const chained = Object.assign(new Error('chained'), { suppressed: earlier });

  reported.length = 0;
  const chainedThrown = thrownBy(() => { throw chained; });

  check('L3: a work error with its own suppressed chain keeps it, and the release failure is reported', [chainedThrown === chained, chained.suppressed === earlier, reported.length], [true, true, 1]);

  // An inherited, non-writable `suppressed` cannot make the attachment throw either. @es Un `suppressed` heredado
  // y no escribible tampoco hace lanzar la asignación.
  const guarded = Object.create(Object.defineProperty({}, 'suppressed', { value: 'inherited', writable: false }));

  reported.length = 0;
  const guardedThrown = thrownBy(() => { throw guarded; });

  check('L3: a work error with an inherited read-only suppressed still carries the failure as its own', [guardedThrown === guarded, guarded.suppressed?.name], [true, 'LockFault']);

  // Without a reporter, the report goes to the standard error of the process. @es Sin reportero, el informe va a stderr.
  const script = `import { withLock } from ${JSON.stringify(new URL('./file-lock.mjs', import.meta.url).href)};
const target = ${JSON.stringify(path.join(scratch, 'release-stderr.lock'))};
const outcome = withLock(target, () => 7, { remove: (one) => { if (one === target) throw Object.assign(new Error('EIO: injected'), { code: 'EIO' }); } });
process.stdout.write(JSON.stringify(outcome));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });

  check('L3: by default the release failure goes to stderr, and the work still returns', [child.status, child.stdout, /could not be released \(EIO\)/.test(child.stderr), / @es /.test(child.stderr)], [0, '{"held":true,"value":7}', true, true]);
}

// --- real processes ---------------------------------------------------------------------------------------
/** How long one contender may run; every race here ends in a few seconds when the lock is right. @es Cuánto puede correr un contendiente. */
const RACE_DEADLINE_MS = 15_000;

/**
 * Runs contenders as real processes on one lock, each `{ holdMs, startAfterMs, judgeDelayMs }`, and returns what
 * they recorded, in entry order where it matters, and each exit code (3 is a contender that never held the lock).
 * @es Lanza contendientes como procesos reales sobre un lock y devuelve lo que registraron y cada código de salida.
 */
async function race(name, { contenders, staleAfterMs, attempts = 400, createDelayMs = 0, breakHoldMs = 0, breakerPid = 0, prepare = () => undefined }) {
  const dir = path.join(scratch, name);
  const target = path.join(dir, 'state.lock');

  mkdirSync(dir, { recursive: true });
  prepare(target);

  const errors = [];
  const run = ({ holdMs, startAfterMs = 0, judgeDelayMs = 0, breakerJudgeDelayMs = 0 }) => new Promise((resolve) => {
    setTimeout(() => {
      const child = spawn(process.execPath, [CONTENDER, target, dir, String(holdMs), String(staleAfterMs), String(attempts), String(judgeDelayMs), String(createDelayMs), String(breakHoldMs), String(breakerPid), String(breakerJudgeDelayMs)], { stdio: ['ignore', 'ignore', 'pipe'] });
      // A wedged contender is a failed check within the deadline, never a hung proof. @es Un contendiente atascado
      // es un check fallido dentro del plazo, nunca una prueba colgada.
      const deadline = setTimeout(() => child.kill(), RACE_DEADLINE_MS);

      child.stderr.on('data', (chunk) => errors.push(String(chunk).split('\n').find((line) => line.includes('Error')) ?? ''));
      child.on('exit', (code) => {
        clearTimeout(deadline);
        resolve(code);
      });
    }, startAfterMs);
  });
  const codes = await Promise.all(contenders.map(run));
  const lines = (one) => (existsSync(path.join(dir, one)) ? readFileSync(path.join(dir, one), 'utf8').split('\n').filter(Boolean).map(Number) : []);

  return { codes, entered: lines('entered.txt'), overlaps: lines('violations.txt').length, lost: lines('lost.txt'), breakers: lines('breakers.txt').length, lockLeft: existsSync(target), breakerLeft: existsSync(`${target}.breaker`), breaks: breaksOf(target).map((one) => one.reason), errors };
}

/** Makes `target` a lock of a dead owner holding `content`, two minutes old: past any ceiling the races use. @es Hace de `target` un lock de dueño muerto, de dos minutos: más allá de todo techo de las carreras. */
const prepareDead = (target, content) => {
  writeFileSync(target, content);
  backdate(target, Date.now(), 120_000);
};

{
  // A holder slower than the stale age is ALIVE and keeps its lock. @es Un dueño más lento que la edad límite sigue VIVO.
  const outcome = await race('slow-live-holder', { contenders: [0, 1, 2, 3].map(() => ({ holdMs: 200 })), staleAfterMs: 100 });

  check('race: four processes holding the lock longer than the stale age are never inside together, and leave nothing', [outcome.overlaps, outcome.codes, outcome.lockLeft, outcome.lost], [0, [0, 0, 0, 0], false, []]);
}

{
  // K-A: the first holder outlives the ceiling, so the second breaks its lock and takes it; when the first one
  // finishes, its release must not remove the second one's lock. @es El primero supera el techo, el segundo rompe su
  // lock y lo toma; al terminar, el primero no debe borrar el lock del segundo.
  const outcome = await race('release-own-token', { contenders: [{ holdMs: 900 }, { holdMs: 900, startAfterMs: 300 }], staleAfterMs: 20 });

  check('K-A race: a release removes only its own token: only the FIRST holder, whose lock the ceiling broke, lost it', [outcome.codes, outcome.entered.length, outcome.lost, outcome.breaks], [[0, 0], 2, outcome.entered.slice(0, 1), ['ceiling']]);
  check('K-A race: ...and nothing is left', outcome.lockLeft, false);
}

{
  // K-B: a dead owner's lock AND a dead breaker's file. Six processes read the dead breaker's file at about the
  // same moment and each takes its own time to judge it; the quickest removes it and takes the breaker, holding it a
  // while. Without the re-check a slower judge then removes that LIVE breaker, and a third takes the breaker too.
  // @es Lock y breaker de muertos. Seis procesos leen el breaker muerto casi a la vez y cada uno tarda lo suyo en
  // juzgarlo; el más rápido lo quita y toma el breaker un rato. Sin la relectura, uno más lento quita ese breaker
  // VIVO y un tercero lo toma también.
  const breakerPid = confirmedDeadPid();
  const outcome = await race('dead-breaker', {
    contenders: [0, 1, 2, 3, 4, 5].map((index) => ({ holdMs: 30, breakerJudgeDelayMs: 10 + index * 60 })),
    staleAfterMs: 100,
    breakHoldMs: 250,
    breakerPid,
    prepare: (target) => {
      prepareDead(target, `${String(confirmedDeadPid())}:x`);
      prepareDead(`${target}.breaker`, `${String(breakerPid)}:breaker`);
    }
  });

  check('K-B race: never two breakers at once, never two holders, every process holds the lock, nothing is left', [outcome.breakers, outcome.overlaps, outcome.codes, outcome.lockLeft, outcome.breakerLeft], [0, 0, [0, 0, 0, 0, 0, 0], false, false]);
}

{
  // K-C: a stale EMPTY lock, and every writer leaves its new lock empty for a while after creating it. A breaker
  // that re-checks the token alone takes a fresh empty lock for the stale one and removes it under its writer.
  // @es Un lock VACÍO caducado, y cada escritor deja vacío un rato su lock nuevo; quien relee solo el token confunde
  // un vacío nuevo con el viejo y lo borra bajo su escritor.
  const outcome = await race('empty-lock', { contenders: [0, 1, 2, 3, 4, 5].map((index) => ({ holdMs: 60, judgeDelayMs: 10 + index * 30 })), staleAfterMs: 300, createDelayMs: 100, prepare: (target) => prepareDead(target, '') });

  check('K-C race: a fresh empty lock is never removed as the stale one: no overlap, no lost lock, all held, nothing left', [outcome.overlaps, outcome.lost, outcome.codes, outcome.lockLeft], [0, [], [0, 0, 0, 0, 0, 0], false]);
}

{
  // J-5: the dead owner's pid is confirmed dead, and the lock is past the ceiling, so a pid reused meanwhile by a
  // contender cannot wedge it. @es El pid se confirma muerto y el lock pasa el techo: un pid reutilizado no lo bloquea.
  const outcome = await race('dead-holder-takeover', { contenders: [0, 1, 2, 3, 4, 5].map(() => ({ holdMs: 60 })), staleAfterMs: 100, prepare: (target) => prepareDead(target, `${String(confirmedDeadPid())}:fixture`) });

  check('race: six processes taking over a dead owner\'s lock are never inside together', [outcome.overlaps, outcome.codes, outcome.lockLeft], [0, [0, 0, 0, 0, 0, 0], false]);
}

if (failures.length > 0) {
  for (const one of failures) console.error(`FAIL: ${one}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
