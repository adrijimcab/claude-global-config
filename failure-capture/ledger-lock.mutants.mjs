#!/usr/bin/env node
/**
 * The decisions of the ledger lock and of the fold that takes it, each broken once, that
 * `ledger-lock.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 * A blind spot here lets two writers overwrite each other's ledger lines in silence, or wedges every capture
 * behind a lock nobody will ever release.
 *
 * @es Las decisiones del lock del ledger y del pliegue que lo toma, rotas una a una. Un punto ciego aquí deja
 * que dos escritores se pisen líneas del ledger en silencio, o bloquea toda captura tras un lock que nadie
 * soltará.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const LOCK = 'failure-capture/ledger-lock.mjs';
const COMMAND = 'failure-capture/capture.mjs';
const REFUSE_HELD = 'if (!takeLock(lockFile, options)) return { held: false };';
const RELEASE_ALWAYS = '} finally {\n    releaseLock(lockFile);\n  }';

const MUTANTS = [
  // --- taking: exclusive, bounded, and never stealing a live lock
  ['taking is not exclusive, so a second writer is let in', LOCK, "openSync(file, 'wx')", "openSync(file, 'w')"],
  ['age is ignored, so a young lock of a dead owner is robbed', LOCK, 'if (now() - statSync(lockFile).mtimeMs <= staleAfterMs) return undefined;', ''],
  ['the owner is ignored, so a slow but live holder is robbed', LOCK, 'return owner.pid !== undefined && isAlive(owner.pid) ? undefined : owner.token;', 'return owner.token;'],
  ['no lock is ever stale, so a dead writer wedges every later one', LOCK, 'return owner.pid !== undefined && isAlive(owner.pid) ? undefined : owner.token;', 'return undefined;'],
  ['a lock with no readable owner is taken for a live one, so a crash between create and write wedges it', LOCK, 'return owner.pid !== undefined && isAlive(owner.pid) ? undefined : owner.token;', 'return owner.pid === undefined || isAlive(owner.pid) ? undefined : owner.token;'],
  ['a process we may not signal is taken for dead, so its lock is robbed', LOCK, "return error?.code === 'EPERM';", 'return false;'],
  ['a stale lock is recognised but not broken', LOCK, '      breakStale(lockFile, { staleAfterMs, now, isAlive, remove });', ''],
  ['a lock that vanishes while it is examined is an error', LOCK, '} catch {\n    return undefined;\n  }\n\n  const owner = ownerOf(lockFile);', '} catch (error) {\n    throw error;\n  }\n\n  const owner = ownerOf(lockFile);'],
  ['a lock that vanishes while its owner is read is an error', LOCK, '} catch {\n    return undefined;\n  }\n\n  const pid', '} catch (error) {\n    throw error;\n  }\n\n  const pid'],
  ['the breaker file is not exclusive, so two breakers work at once', LOCK, "openSync(breaker, 'wx')", "openSync(breaker, 'w')"],
  ['the breaker removes the lock without checking it is still the one judged stale', LOCK, 'if (ownerOf(lockFile)?.token === judged) removeQuietly(lockFile, options);', 'removeQuietly(lockFile, options);'],
  ['the breaker file is left behind after a break', LOCK, '} finally {\n    removeQuietly(breaker, options);', '} finally {\n    void breaker;'],
  ['a breaker file of a dead breaker is never cleared', LOCK, "error?.code === 'EEXIST' && staleToken(breaker, options) !== undefined", "error?.code === 'EEXIST' && false"],
  ['a live breaker file is cleared as if its owner were dead', LOCK, "error?.code === 'EEXIST' && staleToken(breaker, options) !== undefined", "error?.code === 'EEXIST'"],
  ['the owner token is never written into the lock', LOCK, 'writeSync(fd, token);', 'void token;'],
  ['the token taken is not remembered, so a release cannot find it', LOCK, 'taken.set(lockFile, token);', 'void token;'],
  ['the stale limit shrinks to a millisecond, so a fresh lock reads as dead', LOCK, 'export const STALE_AFTER_MS = 60_000;', 'export const STALE_AFTER_MS = 1;'],
  ['the stale limit grows past any real age, so a dead lock is never broken', LOCK, 'export const STALE_AFTER_MS = 60_000;', 'export const STALE_AFTER_MS = 600_000_000;'],
  ['one attempt too many is made', LOCK, 'attempt < attempts', 'attempt <= attempts'],
  ['a failure other than "already exists" is waited out as if another writer held the lock', LOCK, "if (!CONTENTION.has(error?.code)) throw new Error(", "if (false) throw new Error("],
  ['contention is thrown as a fault instead of waited out', LOCK, "if (!CONTENTION.has(error?.code)) throw new Error(", "if (CONTENTION.has(error?.code)) throw new Error("],
  ['a file being deleted or busy (Windows EPERM, EBUSY) is a fault instead of contention', LOCK, "new Set(['EEXIST', 'EPERM', 'EBUSY'])", "new Set(['EEXIST'])"],
  ['a busy file while breaking a stale lock is a fault instead of a retry', LOCK, 'if (!CONTENTION.has(error?.code)) throw error;', 'throw error;'],
  ['any failure while breaking a stale lock is swallowed', LOCK, 'if (!CONTENTION.has(error?.code)) throw error;', ''],
  ['the fault refusal loses its Spanish half', LOCK, '. @es no se pudo crear el lock del ledger', '. no se pudo crear el lock del ledger'],
  ['the taker never pauses between attempts', LOCK, '      wait();', '      '],
  ['the default retry bound shrinks to one attempt', LOCK, 'attempts = 40', 'attempts = 1'],

  // --- releasing
  ['releasing does nothing, so a lock outlives its writer', LOCK, 'if (mine !== undefined && ownerOf(lockFile)?.token === mine) rmSync(lockFile, { force: true });', 'void mine;'],
  ['releasing removes a lock another process now holds', LOCK, 'if (mine !== undefined && ownerOf(lockFile)?.token === mine) rmSync(lockFile, { force: true });', 'if (mine !== undefined) rmSync(lockFile, { force: true });'],
  ['releasing removes a lock this process never took', LOCK, 'if (mine !== undefined && ownerOf(lockFile)?.token === mine) rmSync(lockFile, { force: true });', 'rmSync(lockFile, { force: true });'],

  // --- withLock: the work runs only under the lock, and the lock is always given back
  ['the work runs even though the lock is held', LOCK, REFUSE_HELD, 'takeLock(lockFile, options);'],
  // (A refused writer that released anyway is no longer a defect worth a mutant: a release removes only the lock
  // whose token this process took, and a refused writer took none; "releasing removes a lock this process never
  // took" above is the mutant that guards it.) @es (Un escritor rechazado que soltara igual ya no es un defecto
  // con mutante propio: soltar borra solo el lock cuyo token tomó este proceso, y el rechazado no tomó ninguno.)
  ['the lock is not released when the work fails', LOCK, RELEASE_ALWAYS, '} catch (error) {\n    throw error;\n  } finally {\n  }'],
  ['the lock is released only when the work fails', LOCK, RELEASE_ALWAYS, '} catch (error) {\n    releaseLock(lockFile);\n    throw error;\n  }'],

  // --- the fold that takes it
  ['the fold takes some other lock, so a held ledger lock is ignored', COMMAND, 'const outcome = withLock(lockFile(), () => {', "const outcome = withLock(path.join(stateDirectory(), 'other.lock'), () => {"],
  ['a refused fold reports no waiting entries', COMMAND, ': { folded: [], deferred: pending.length };', ': { folded: [], deferred: 0 };'],
  ['a refused fold is reported as a fold that found nothing', COMMAND, 'return outcome.held ? { folded: outcome.value, deferred: 0 } : { folded: [], deferred: pending.length };', 'return { folded: outcome.value ?? [], deferred: 0 };'],
  ['the refusal to fold loses its Spanish half', COMMAND, "speaker.say('capture.deferred', { count: deferred });", "console.log('RECORDED (spooled) — the ledger is locked by another writer; ' + String(deferred) + ' entr(y/ies) will fold on the next capture. Nothing is lost.');"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'],
  selftest: 'failure-capture/ledger-lock.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
