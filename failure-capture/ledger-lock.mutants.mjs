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
  ['taking is not exclusive, so a second writer is let in', LOCK, "openSync(lockFile, 'wx')", "openSync(lockFile, 'w')"],
  ['every lock is stale, so a live holder is robbed', LOCK, 'return now() - statSync(lockFile).mtimeMs > staleAfterMs;', 'return true;'],
  ['no lock is ever stale, so a dead writer wedges every later one', LOCK, 'return now() - statSync(lockFile).mtimeMs > staleAfterMs;', 'return false;'],
  ['a stale lock is recognised but not broken', LOCK, 'if (isStale(lockFile, staleAfterMs, now)) releaseLock(lockFile);', 'if (false) releaseLock(lockFile);'],
  ['a lock that vanishes while it is examined is an error', LOCK, '} catch {\n    return false;', '} catch (error) {\n    throw error;'],
  ['the stale limit shrinks to a millisecond, so a fresh lock reads as dead', LOCK, 'export const STALE_AFTER_MS = 60_000;', 'export const STALE_AFTER_MS = 1;'],
  ['the stale limit grows past any real age, so a dead lock is never broken', LOCK, 'export const STALE_AFTER_MS = 60_000;', 'export const STALE_AFTER_MS = 600_000_000;'],
  ['one attempt too many is made', LOCK, 'attempt < attempts', 'attempt <= attempts'],
  ['a failure other than "already exists" is waited out as if another writer held the lock', LOCK, "if (error?.code !== 'EEXIST') throw new Error(", "if (false) throw new Error("],
  ['contention is thrown as a fault instead of waited out', LOCK, "error?.code !== 'EEXIST'", "error?.code === 'EEXIST'"],
  ['the fault refusal loses its Spanish half', LOCK, '. @es no se pudo crear el lock del ledger', '. no se pudo crear el lock del ledger'],
  ['the taker never pauses between attempts', LOCK, '      wait();', '      '],
  ['the default retry bound shrinks to one attempt', LOCK, 'attempts = 40', 'attempts = 1'],

  // --- releasing
  ['releasing does nothing, so a lock outlives its writer', LOCK, 'rmSync(lockFile, { force: true });', 'void lockFile;'],
  ['releasing a lock that is already gone is an error', LOCK, 'rmSync(lockFile, { force: true });', 'rmSync(lockFile);'],

  // --- withLock: the work runs only under the lock, and the lock is always given back
  ['the work runs even though the lock is held', LOCK, REFUSE_HELD, 'takeLock(lockFile, options);'],
  ['a refused writer removes the holder\'s lock', LOCK, REFUSE_HELD, 'if (!takeLock(lockFile, options)) { releaseLock(lockFile); return { held: false }; }'],
  ['the lock is not released when the work fails', LOCK, RELEASE_ALWAYS, '} catch (error) {\n    throw error;\n  } finally {\n  }'],
  ['the lock is released only when the work fails', LOCK, RELEASE_ALWAYS, '} catch (error) {\n    releaseLock(lockFile);\n    throw error;\n  }'],

  // --- the fold that takes it
  ['the fold takes some other lock, so a held ledger lock is ignored', COMMAND, 'const outcome = withLock(LOCK_FILE, () => {', "const outcome = withLock(path.join(STATE_DIR, 'other.lock'), () => {"],
  ['a refused fold reports no waiting entries', COMMAND, ': { folded: [], deferred: pending.length };', ': { folded: [], deferred: 0 };'],
  ['a refused fold is reported as a fold that found nothing', COMMAND, 'return outcome.held ? { folded: outcome.value, deferred: 0 } : { folded: [], deferred: pending.length };', 'return { folded: outcome.value ?? [], deferred: 0 };'],
  ['the refusal to fold loses its Spanish half', COMMAND, "speaker.say('capture.deferred', { count: deferred });", "console.log('RECORDED (spooled) — the ledger is locked by another writer; ' + String(deferred) + ' entr(y/ies) will fold on the next capture. Nothing is lost.');"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/ledger-lock.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
