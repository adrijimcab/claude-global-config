#!/usr/bin/env node
/**
 * The decisions of the ledger lock adapter and of the fold that takes it, each broken once, that
 * `ledger-lock.selftest.mjs` must catch. The decisions of the lock itself live in `../hook-state/file-lock.mjs`
 * and are broken by `../hook-state/file-lock.mutants.mjs`. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`. A blind spot here lets two writers overwrite each other's ledger lines in
 * silence, or wedges every capture behind a lock nobody will ever release.
 *
 * @es Las decisiones del adaptador del lock del ledger y del pliegue que lo toma, rotas una a una. Las del lock
 * mismo viven en `../hook-state/file-lock.mjs` y las rompe `../hook-state/file-lock.mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const LOCK = 'failure-capture/ledger-lock.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  // --- the adapter: the same lock, said as the ledger's
  ['taking does not take the state lock', LOCK, '    return stateLock.takeLock(lockFile, options);', '    return true;'],
  ['the adapter drops the caller\'s options', LOCK, '    return stateLock.takeLock(lockFile, options);', '    return stateLock.takeLock(lockFile);'],
  ['the ledger stale age is not the state lock\'s', LOCK, 'export const STALE_AFTER_MS = stateLock.STALE_AFTER_MS;', 'export const STALE_AFTER_MS = 30_000;'],
  ['releasing does nothing', LOCK, 'export const { releaseLock } = stateLock;', 'export const releaseLock = () => undefined;'],
  ['withLock runs the work without the lock', LOCK, '    return stateLock.withLock(lockFile, work, options);', '    return { held: true, value: work() };'],
  ['a fault is not said as the ledger lock\'s', LOCK, "  if (!(error instanceof stateLock.LockFault) || (error.file !== lockFile && error.file !== `${lockFile}.breaker`)) return error;", '  return error;'],
  ['every failure of the work is rewritten as a lock fault', LOCK, "  if (!(error instanceof stateLock.LockFault) || (error.file !== lockFile && error.file !== `${lockFile}.breaker`)) return error;\n", ''],
  ['L4: a fault of any lock is said as the ledger lock\'s', LOCK, ' || (error.file !== lockFile && error.file !== `${lockFile}.breaker`)', ''],
  ['L4: a fault of the ledger lock\'s breaker is not said as the ledger lock\'s', LOCK, ' && error.file !== `${lockFile}.breaker`', ''],
  ['the ledger fault loses its Spanish half', LOCK, ' @es Falló el lock del ledger ${lockFile}: ${spanish}', ''],
  ['the ledger fault puts the English text in its Spanish half', LOCK, 'const [english, spanish = english] = error.message.split', 'const [spanish, english = spanish] = error.message.split'],
  ['the ledger fault loses its cause', LOCK, '{ cause: error.cause, file: error.file });', '{ file: error.file });'],
  ['the ledger fault loses the file it is about', LOCK, '{ cause: error.cause, file: error.file });', '{ cause: error.cause });'],
  ['takeLock lets a lock fault through unnamed', LOCK, '    return stateLock.takeLock(lockFile, options);\n  } catch (error) {\n    throw asLedgerFault(error, lockFile);', '    return stateLock.takeLock(lockFile, options);\n  } catch (error) {\n    throw error;'],
  ['withLock lets a lock fault through unnamed', LOCK, '    return stateLock.withLock(lockFile, work, options);\n  } catch (error) {\n    throw asLedgerFault(error, lockFile);', '    return stateLock.withLock(lockFile, work, options);\n  } catch (error) {\n    throw error;'],

  // --- the fold that takes it
  ['the fold takes some other lock, so a held ledger lock is ignored', COMMAND, 'const outcome = withLock(lockFile(), () => {', "const outcome = withLock(path.join(stateDirectory(), 'other.lock'), () => {"],
  ['a refused fold reports no waiting entries', COMMAND, ': { folded: [], deferred: pending.length };', ': { folded: [], deferred: 0 };'],
  ['a refused fold is reported as a fold that found nothing', COMMAND, 'return outcome.held ? { folded: outcome.value, deferred: 0 } : { folded: [], deferred: pending.length };', 'return { folded: outcome.value ?? [], deferred: 0 };'],
  ['the refusal to fold loses its Spanish half', COMMAND, "speaker.say('capture.deferred', { count: deferred });", "console.log('RECORDED (spooled) — the ledger is locked by another writer; ' + String(deferred) + ' entr(y/ies) will fold on the next capture. Nothing is lost.');"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state', 'config-sync-guard'],
  selftest: 'failure-capture/ledger-lock.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
