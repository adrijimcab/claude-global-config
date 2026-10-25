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
const LOCK_RECHECK = 'if (now === undefined || now.token !== judged.token || now.identity !== judged.identity) return { removed: false };';
const RELEASE_REPORT = '      report(error instanceof Error ? error.message : String(error));\n\n      return error;';

const MUTANTS = [
  // --- K-A: the owner token and a release of one's own lock only
  ['the lock is created non-exclusively', L, "writeFileSync(file, token, { flag: 'wx' })", "writeFileSync(file, token, { flag: 'w' })"],
  ['the owner token is not written into the lock', L, "writeFileSync(file, token, { flag: 'wx' })", "writeFileSync(file, '', { flag: 'wx' })"],
  ['the token is not random', L, "randomBytes(6).toString('hex')", "'000000000000'"],
  ['the token does not name this process', L, '`${String(process.pid)}:${randomBytes(6)', '`0:${randomBytes(6)'],
  ['the token taken is not remembered', L, '      taken.set(lockFile, token);\n', ''],
  ['a release removes the file whatever token it now holds', L, '  if (readLock(file)?.token !== token) return;\n', ''],
  ['a release removes a lock this process never took', L, 'if (mine !== undefined) releaseToken(lockFile, mine, remove);', 'releaseToken(lockFile, readLock(lockFile)?.token, remove);'],
  ['a release does nothing', L, 'if (mine !== undefined) releaseToken(lockFile, mine, remove);', 'void mine;'],

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
  ['a stale lock is recognised but not broken', L, 'const failedBreak = judged === undefined ? undefined : breakStale(lockFile, judged, settings);', 'const failedBreak = undefined;'],
  ['the lock is removed without being re-read', L, LOCK_RECHECK, 'if (now === undefined) return { removed: false };'],
  ['the lock is re-checked by its identity alone, not its token', L, LOCK_RECHECK, 'if (now === undefined || now.identity !== judged.identity) return { removed: false };'],
  ['K-C: the lock is re-checked by its token alone, not its identity', L, LOCK_RECHECK, 'if (now === undefined || now.token !== judged.token) return { removed: false };'],
  ['the breaker file is not exclusive, so two breakers work at once', L, '    settings.create(breaker, token);', "    writeFileSync(breaker, token);"],
  ['K-B: a dead breaker is removed without being re-read', L, 'const outcome = removeIfStill(breaker, dead, settings);', 'const outcome = (settings.remove(breaker), { removed: true });'],
  ['K-B: a dead breaker is never cleared', L, BREAKER_JUDGED, 'const dead = undefined;'],
  ['K-B: a live breaker is cleared as if dead', L, BREAKER_JUDGED, "const dead = { ...readLock(breaker), reason: 'dead-owner', ageMs: 0 };"],
  ['the breaker file is left behind after a break', L, '  releaseBreaker(breaker, token, !outcome.removed, settings);\n', ''],
  ['a breaker release is never retried', L, ' && attempt < BREAKER_RELEASE_ATTEMPTS)', ' && false)'],
  ['a breaker release is retried without the take\'s pause', L, '        wait();\n        continue;', '        continue;'],
  ['a breaker release is retried whatever its failure', L, 'if (removalPending(platform).has(error?.cause?.code) && attempt', 'if (true && attempt'],
  ['a breaker release is tried once more than its bound', L, 'const BREAKER_RELEASE_ATTEMPTS = 3;', 'const BREAKER_RELEASE_ATTEMPTS = 4;'],
  ['a breaker that cannot be released fails a take whose stale lock is gone', L, 'releaseBreaker(breaker, token, !outcome.removed, settings);', 'releaseBreaker(breaker, token, true, settings);'],
  ['a breaker that cannot be released never escalates, even with the stale lock still there', L, 'releaseBreaker(breaker, token, !outcome.removed, settings);', 'releaseBreaker(breaker, token, false, settings);'],
  ['a breaker release failure replaces the fault of the break', L, '    releaseBreaker(breaker, token, false, settings);\n\n    throw error;', '    releaseBreaker(breaker, token, true, settings);\n\n    throw error;'],
  ['a breaker release failure is not reported', L, "      report(bilingual('lock-breaker-release-fault'", "      void (bilingual('lock-breaker-release-fault'"],
  ['the breaker release is not given the take\'s wait', L, 'remove, platform, report, wait };', 'remove, platform, report, wait: () => undefined };'],

  // --- the break journal (K-D says so)
  ['a break is not journaled', L, '  if (outcome.removed) recordBreak(lockFile, lockFile, judged, settings);\n', ''],
  ['the removal of a dead breaker is not journaled', L, '      if (outcome.removed) recordBreak(lockFile, breaker, dead, settings);\n', ''],
  ['L2: a break journal that cannot be written fails the take', L, "  } catch (error) {\n    report(bilingual('lock-break-journal-fault'", "  } catch (error) {\n    throw error; report(bilingual('lock-break-journal-fault'"],
  ['L2: a break journal that cannot be written is not reported', L, "    report(bilingual('lock-break-journal-fault', {", "    void (bilingual('lock-break-journal-fault', {"],
  ['L2: the default reporter of a take prints nothing', L, 'platform = process.platform, report = toStderr, spent', 'platform = process.platform, report = () => undefined, spent'],
  ['the reporter writes nothing to stderr', L, "const toStderr = (line) => process.stderr.write(`${line}\\n`);", 'const toStderr = (line) => void line;'],
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
  ['a delete-pending breaker is a fault at once', L, '    if (DELETE_PENDING.has(error?.code)) return error;\n', ''],
  ['L1: a delete-pending breaker never escalates', L, '    if (DELETE_PENDING.has(error?.code)) return error;', '    if (DELETE_PENDING.has(error?.code)) return undefined;'],
  ['K-E: a breaker that cannot be created for another reason returns silently', L, "    throw fault('lock-break-fault', breaker, error);", '    return undefined;'],
  ['a pending removal while breaking is a fault at once', L, '    if (removalPending(platform).has(error?.code)) return { removed: false, pending: error };\n', ''],
  ['L1: a pending removal while breaking never escalates', L, 'return { removed: false, pending: error };', 'return { removed: false };'],
  ['L1: on POSIX an unlink EPERM is retried as if delete-pending', L, "(platform === 'win32' ? DELETE_PENDING : new Set(['EBUSY']))", '(DELETE_PENDING)'],
  ['L1: on Windows an unlink EPERM is a fault at once', L, "(platform === 'win32' ? DELETE_PENDING : new Set(['EBUSY']))", "(new Set(['EBUSY']))"],
  ['L1: the platform is never the given one', L, 'const settings = { staleAfterMs, ceilingMs, now, isAlive, create, remove, platform, report, wait };', 'const settings = { staleAfterMs, ceilingMs, now, isAlive, create, remove, platform: process.platform, report, wait };'],
  ['a file already gone at its removal is a fault', L, "    if (error?.code === 'ENOENT') return { removed: false };\n", ''],
  ['any removal failure while breaking is swallowed', L, "    throw fault('lock-break-fault', file, error);", '    return { removed: false };'],
  ['L1: a stale lock that cannot be broken in any attempt is reported as held', L, 'if (attempts > 0 && failedBreaks === attempts) throw', 'if (false) throw'],
  ['L1: zero attempts read as every break failed', L, 'if (attempts > 0 && failedBreaks === attempts) throw', 'if (failedBreaks === attempts) throw'],
  ['L1: one failed break is a fault', L, 'if (attempts > 0 && failedBreaks === attempts) throw', 'if (failedBreaks > 0) throw'],
  ['L1: a failed break is not counted', L, '        failedBreaks += 1;\n', ''],
  ['a breaker release failure is swallowed', L, "if (error?.code !== 'ENOENT') throw fault('lock-release-fault', file, error);", 'void error;'],
  ['a breaker already gone at release is a fault', L, "if (error?.code !== 'ENOENT') throw fault('lock-release-fault', file, error);", "throw fault('lock-release-fault', file, error);"],
  ['K-F: a fault is not a LockFault', L, "    this.name = 'LockFault';\n", ''],
  ['L4: a fault does not say which lock it is about', L, '    this.file = options?.file;\n', ''],
  ['L4: a fault is not given its lock', L, '{ cause: error, file });', '{ cause: error });'],
  ['a fault loses its cause', L, '{ cause: error, file });', '{ file });'],
  ['K-F: a fault message is its bare id, not the bilingual text', L, 'new LockFault(bilingual(id, {', 'new LockFault(id, ({'],

  // --- the attempts
  ['the taker never pauses between attempts', L, '      wait();\n      if (spent()) return false;', '      if (spent()) return false;'],
  ['one attempt too many is made', L, 'attempt < attempts', 'attempt <= attempts'],
  ['the default retry bound shrinks to one attempt', L, 'attempts = 40', 'attempts = 1'],

  // --- withLock
  ['the work runs even though the lock is held', L, '  if (!takeLock(lockFile, options)) return options.spent?.() === true ? { held: false, spent: true } : { held: false };', '  takeLock(lockFile, options);'],
  ['a take whose budget is spent is reported as plainly held', L, 'options.spent?.() === true ? { held: false, spent: true } : { held: false };', '{ held: false };'],
  ['every take that is not held is reported as spent', L, 'options.spent?.() === true ? { held: false, spent: true } : { held: false };', '{ held: false, spent: true };'],
  ['a take never stops when its budget is spent', L, '      if (spent()) return false;\n', ''],
  ['a take whose budget is spent goes on to the fault of a lock that could not be broken', L, '      if (spent()) return false;', '      if (spent()) break;'],
  ['a take with no budget is spent at once', L, 'report = toStderr, spent = () => false } = {}', 'report = toStderr, spent = () => true } = {}'],
  ['the lock is not released after a finished work', L, '  release();\n\n  return { held: true, value };', '  return { held: true, value };'],
  ['the lock is not released after a failed work', L, '    const failure = release();', '    const failure = undefined;'],
  ['the work value is lost', L, '  return { held: true, value };', '  return { held: true, value: undefined };'],
  ['L3: a release failure after a finished work throws', L, RELEASE_REPORT, '      throw error;'],
  ['L3: a release failure is not reported', L, '      report(error instanceof Error ? error.message : String(error));\n', ''],
  ['L3: a release failure masks the work\'s own error', L, '    throw error;\n  }\n\n  release();', '    throw failure ?? error;\n  }\n\n  release();'],
  ['L3: a release failure is not attached to the work\'s error', L, "if (failure !== undefined && canCarry(error)) Object.defineProperty(error, 'suppressed',", "if (false) Object.defineProperty(error, 'suppressed',"],
  ['L3: a frozen work error is written to anyway, and the TypeError masks it', L, '&& Object.isExtensible(error) &&', '&&'],
  ['L3: an own suppressed chain of the work error is overwritten', L, " && !Object.hasOwn(error, 'suppressed');", ';'],
  ['L3: the failure is attached by assignment, which an inherited read-only suppressed refuses', L, "Object.defineProperty(error, 'suppressed', { value: failure, writable: true, configurable: true, enumerable: true });", 'error.suppressed = failure;'],
  ['L3: withLock releases with the default removal, not the given one', L, '      releaseLock(lockFile, options);', '      releaseLock(lockFile);'],
  ['L3: withLock reports nowhere by default', L, 'const report = options.report ?? toStderr;', 'const report = options.report ?? (() => undefined);']
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
