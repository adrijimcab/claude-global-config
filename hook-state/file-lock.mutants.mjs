#!/usr/bin/env node
/**
 * The decisions of `hook-state/file-lock.mjs`, each broken once, that `file-lock.selftest.mjs` must catch. A
 * mutant that only crashes the selftest counts as a survivor (`crashKills: 'fail'`). Not mutated, stated: the
 * length of the default pause between attempts (50 ms), which changes only how long a taker waits, never what
 * it decides; the races run with it, and no assertion can tell 50 ms from 49 without measuring time.
 *
 * @es Las decisiones de `file-lock.mjs`, rotas una a una, que `file-lock.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente. No se muta, dicho: la duración de la pausa por
 * defecto entre intentos (50 ms), que cambia cuánto espera quien toma, nunca lo que decide.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'hook-state/file-lock.mjs';
const BREAKER_JUDGED = 'const dead = staleOf(breaker, settings);';
const LOCK_RECHECK = 'if (now === undefined || now.token !== judged.token || now.identity !== judged.identity) return false;';

const MUTANTS = [
  // --- K-A: the owner token and a release of one's own lock only
  ['the lock is created non-exclusively', L, "writeFileSync(file, token, { flag: 'wx' })", "writeFileSync(file, token, { flag: 'w' })"],
  ['the owner token is not written into the lock', L, "writeFileSync(file, token, { flag: 'wx' })", "writeFileSync(file, '', { flag: 'wx' })"],
  ['the token is not random', L, "randomBytes(6).toString('hex')", "'000000000000'"],
  ['the token does not name this process', L, '`${String(process.pid)}:${randomBytes(6)', '`0:${randomBytes(6)'],
  ['the token taken is not remembered', L, '      taken.set(lockFile, token);\n', ''],
  ['a release removes the file whatever token it now holds', L, '  if (readLock(file)?.token !== token) return;\n', ''],
  ['a release removes a lock this process never took', L, 'if (mine !== undefined) releaseToken(lockFile, mine, removeFile);', 'releaseToken(lockFile, readLock(lockFile)?.token, removeFile);'],
  ['a release does nothing', L, 'if (mine !== undefined) releaseToken(lockFile, mine, removeFile);', 'void mine;'],

  // --- staleness: age AND an owner that is gone
  ['K-C: a young lock is judged by its content', L, '  if (ageMs <= staleAfterMs) return undefined;\n', ''],
  ['the stale age is five seconds too short', L, 'if (ageMs <= staleAfterMs) return undefined;', 'if (ageMs <= staleAfterMs - 15_000) return undefined;'],
  ['K-C: an old lock with no owner is never stale', L, "if (pid === undefined) return stale('no-owner');", 'if (pid === undefined) return undefined;'],
  ['a dead owner\'s lock is never stale before the ceiling', L, "  if (!isAlive(pid)) return stale('dead-owner');\n", ''],
  ['a live owner\'s lock is stale', L, "return ageMs > ceilingMs ? stale('ceiling') : undefined;", "return stale('ceiling');"],
  ['K-D: there is no ceiling, so a reused pid wedges the lock', L, "return ageMs > ceilingMs ? stale('ceiling') : undefined;", 'return undefined;'],
  ['K-D: the ceiling is the stale age', L, 'ceilingMs = staleAfterMs * CEILING_FACTOR', 'ceilingMs = staleAfterMs'],
  ['K-D: the ceiling factor is a hundred', L, 'export const CEILING_FACTOR = 10;', 'export const CEILING_FACTOR = 100;'],
  ['the stale age shrinks to a millisecond', L, 'export const STALE_AFTER_MS = 60_000;', 'export const STALE_AFTER_MS = 1;'],
  ['the stale age grows past any real age', L, 'export const STALE_AFTER_MS = 60_000;', 'export const STALE_AFTER_MS = 600_000_000;'],
  ['a token with no pid is read as one with a pid', L, 'return Number.isInteger(pid) && pid > 0 ? pid : undefined;', 'return pid;'],
  ['a process we may not signal is taken for dead', L, "return error?.code === 'EPERM';", 'return false;'],
  ['every process is taken for alive', L, '    process.kill(pid, 0);\n\n    return true;', '    return true;'],
  ['a lock that vanishes while it is judged is an error', L, '  } catch {\n    return undefined;\n  }\n\n  let token;', '  } catch (error) {\n    throw error;\n  }\n\n  let token;'],
  ['K-C: an unreadable lock is an error', L, '  } catch {\n    token = undefined;\n  }', '  } catch (error) {\n    throw error;\n  }'],

  // --- breaking under the breaker, with the re-check
  ['a stale lock is recognised but not broken', L, '      if (judged !== undefined) breakStale(lockFile, judged, settings);\n', ''],
  ['the lock is removed without being re-read', L, LOCK_RECHECK, 'if (now === undefined) return false;'],
  ['the lock is re-checked by its identity alone, not its token', L, LOCK_RECHECK, 'if (now === undefined || now.identity !== judged.identity) return false;'],
  ['K-C: the lock is re-checked by its token alone, not its identity', L, LOCK_RECHECK, 'if (now === undefined || now.token !== judged.token) return false;'],
  ['the breaker file is not exclusive, so two breakers work at once', L, '    settings.create(breaker, token);', "    writeFileSync(breaker, token);"],
  ['K-B: a dead breaker is removed without being re-read', L, 'if (dead !== undefined && removeIfStill(breaker, dead, settings.remove))', 'if (dead !== undefined && (settings.remove(breaker), true))'],
  ['K-B: a dead breaker is never cleared', L, BREAKER_JUDGED, 'const dead = undefined;'],
  ['K-B: a live breaker is cleared as if dead', L, BREAKER_JUDGED, "const dead = { ...readLock(breaker), reason: 'dead-owner', ageMs: 0 };"],
  ['the breaker file is left behind after a break', L, '    releaseToken(breaker, token, settings.remove);\n', ''],

  // --- the break journal (K-D says so)
  ['a break is not journaled', L, 'if (removeIfStill(lockFile, judged, settings.remove)) recordBreak(lockFile, lockFile, judged, settings);', 'removeIfStill(lockFile, judged, settings.remove);'],
  ['the journal names one reason for every break', L, 'reason: judged.reason, token', "reason: 'dead-owner', token"],
  ['the journal loses the age', L, 'const ageMs = Math.round(judged.ageMs);', 'const ageMs = 0;'],
  ['the journal loses the ceiling', L, 'ageMs, ceilingMs, message })', 'ageMs, message })'],
  ['the journal message is the dead-owner one for every break', L, 'bilingual(`lock-broken-${judged.reason}`', "bilingual('lock-broken-dead-owner'"],

  // --- K-E: contention codes and faults
  ['EEXIST is not remembered as a holder', L, "if (error?.code === 'EEXIST') held = true;", "if (error?.code === 'EEXIST') held = false;"],
  ['delete-pending is a fault at once', L, 'else if (DELETE_PENDING.has(error?.code)) pending = error;', 'else if (false) pending = error;'],
  ['any other create failure is waited out as contention', L, "else throw fault('lock-create-fault', lockFile, error);", 'else held = true;'],
  ['a persisting delete-pending is reported as a held lock', L, 'if (!held && pending !== undefined) throw', 'if (false) throw'],
  ['a delete-pending mixed with a holder is a fault', L, 'if (!held && pending !== undefined) throw', 'if (pending !== undefined) throw'],
  ['EBUSY is not delete-pending', L, "new Set(['EPERM', 'EBUSY'])", "new Set(['EPERM'])"],
  ['a delete-pending breaker is a fault', L, '    if (DELETE_PENDING.has(error?.code)) return;\n', ''],
  ['K-E: a breaker that cannot be created for another reason returns silently', L, "    throw fault('lock-break-fault', breaker, error);", '    return;'],
  ['a busy removal while breaking is a fault', L, '    if (ALREADY_GOING.has(error?.code)) return false;\n', ''],
  ['any removal failure while breaking is swallowed', L, "    throw fault('lock-break-fault', file, error);", '    return false;'],
  ['a breaker release failure is swallowed', L, "if (error?.code !== 'ENOENT') throw fault('lock-release-fault', file, error);", 'void error;'],
  ['a breaker already gone at release is a fault', L, "if (error?.code !== 'ENOENT') throw fault('lock-release-fault', file, error);", "throw fault('lock-release-fault', file, error);"],
  ['K-F: a fault is not a LockFault', L, "    this.name = 'LockFault';\n", ''],
  ['a fault loses its cause', L, '{ cause: error });', '{});'],
  ['K-F: a fault message is its bare id, not the bilingual text', L, 'new LockFault(bilingual(id, {', 'new LockFault(id, ({'],

  // --- the attempts
  ['the taker never pauses between attempts', L, '      wait();\n', ''],
  ['one attempt too many is made', L, 'attempt < attempts', 'attempt <= attempts'],
  ['the default retry bound shrinks to one attempt', L, 'attempts = 40', 'attempts = 1'],

  // --- withLock
  ['the work runs even though the lock is held', L, '  if (!takeLock(lockFile, options)) return { held: false };', '  takeLock(lockFile, options);'],
  ['the lock is not released after the work', L, '  } finally {\n    releaseLock(lockFile);\n  }', '  } finally {\n  }'],
  ['the work value is lost', L, 'value: work()', 'value: undefined']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/file-lock.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
