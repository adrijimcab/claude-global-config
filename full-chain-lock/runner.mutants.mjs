#!/usr/bin/env node
/**
 * The decisions of the full-chain RUNNER (domain, ports, adapters, argument parsing, messages), each broken once,
 * that `runner.selftest.mjs` must catch. A mutant that only crashes the selftest counts as a survivor
 * (`crashKills: 'fail'`). The runner and its rules (green baseline first, exactly-once targets, parse-checked
 * mutants) live in `../mutation-proof/run-mutants.mjs`.
 *
 * Not mutated, stated: the last-resort `process.on('exit')` release in `run.mjs` (it needs a process that exits
 * past its `finally`, which no real path produces), the 12-hour value of the ceiling beyond "longer than the port's
 * default" (the selftest proves 30 minutes survive, not the exact figure), and `attempts: 1` of the adapter (three
 * attempts with no pause decide the same).
 *
 * @es Las decisiones del RUNNER de cadenas completas, rotas una a una, que `runner.selftest.mjs` debe detectar.
 * Un mutante que solo hace caer el selftest cuenta como superviviente. No se muta, dicho: la liberación de último
 * recurso de `process.on('exit')`, la cifra exacta de 12 horas del techo y `attempts: 1`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'full-chain-lock/chain-runner.mjs';
const A = 'full-chain-lock/file-lock-adapter.mjs';
const L = 'full-chain-lock/launch-plan.mjs';
const C = 'full-chain-lock/child-process-adapter.mjs';
const X = 'full-chain-lock/cli-arguments.mjs';
const M = 'full-chain-lock/messages.mjs';
const N = 'full-chain-lock/run.mjs';
const T = 'full-chain-lock/measured-tree.mjs';
const K = 'full-chain-lock/lock-token.mjs';

const MUTANTS = [
  // --- the token the command is handed, and the port that says whether it holds the lock
  ['the command is given no token', R, '{ [LOCK_TOKEN_VARIABLE]: token }', '{}'],
  ['the command is given the token under another name', R, "export const LOCK_TOKEN_VARIABLE = 'FULL_CHAIN_LOCK_TOKEN';", "export const LOCK_TOKEN_VARIABLE = 'FULL_CHAIN_LOCK_TOKEN_X';"],
  ['a holder id that cannot be read back still runs the command', R, 'if (token === undefined) {', 'if (false) {'],
  ['a holder id that cannot be read back exits with another code', R, "say.complain('token-unreadable');\n\n      return EXIT.lockFault;", "say.complain('token-unreadable');\n\n      return 1;"],
  ['a holder id that cannot be read back is not told', R, "say.complain('token-unreadable');", 'void say;'],
  ['the child adapter drops the variables it is given', C, 'env: { ...process.env, ...environment }', 'env: { ...process.env }'],
  ['the child adapter starts the child with only the variables it is given', C, 'env: { ...process.env, ...environment }', 'env: { ...environment }'],
  ['the child adapter does not pass an environment at all', C, '{ ...plan.options, env: { ...process.env, ...environment } }', 'plan.options'],
  ['the token read is not the lock file content', A, "return readFileSync(lockFile, 'utf8');", 'return undefined;'],
  ['an absent lock file throws when its token is read', A, '      } catch {\n        return undefined;\n      }\n    },\n\n    /**\n     * Whether', '      } catch (error) {\n        throw error;\n      }\n    },\n\n    /**\n     * Whether'],
  ['any token holds the lock while a chain runs', A, 'return this.readToken() === token && this.liveHolder() !== undefined;', 'return this.liveHolder() !== undefined;'],
  ['the right token holds the lock with no chain running', A, 'return this.readToken() === token && this.liveHolder() !== undefined;', 'return this.readToken() === token;'],
  ['the port answers about another token than the one it was given', K, 'return lock.holdsToken(token);', 'return lock.holdsToken(undefined);'],
  ['the port answers true whatever the lock says', K, 'return lock.holdsToken(token);', 'return true;'],
  ['the port reads the state of another mechanism', K, "stateDir('full-chain-lock')", "stateDir('other-mechanism')"],
  ['the token refusal stops saying the command did not run', M, 'Your command did NOT run (a full chain never runs unlocked); the lock was released.', 'The lock was released.'],
  ['the Spanish token refusal stops saying the lock was released', M, 'el lock se soltó.', 'listo.'],

  // --- the domain: the lock is taken before the command, and given back on every path
  ['the command runs without the lock having been taken', R, '    if (taken) break;', '    break;'],
  ['the lock is never given back', R, '    giveBack(lock, say);\n', ''],
  ['a fault of the lock lets the command run anyway', R, "say.complain('lock-fault', { detail: faultDetail(error) });\n\n      return EXIT.lockFault;", "say.complain('lock-fault', { detail: faultDetail(error) });\n\n      taken = true;"],
  ['a fault of the lock exits with the wrong code', R, "say.complain('lock-fault', { detail: faultDetail(error) });\n\n      return EXIT.lockFault;", "say.complain('lock-fault', { detail: faultDetail(error) });\n\n      return 1;"],
  ['an expired wait exits 0', R, '      return EXIT.waitExpired;\n    }\n\n    await', '      return 0;\n    }\n\n    await'],
  ['the holder is announced at every poll', R, 'if (settled && identity !== announced) {', 'if (true) {'],
  ['a record missing at the first look is announced as unreadable at once', R, 'const settled = holder !== undefined || looked;', 'const settled = true;'],
  ['a record missing at every look is never announced', R, 'const settled = holder !== undefined || looked;', 'const settled = holder !== undefined;'],
  ['a changed holder is never announced again', R, 'announced = identity;', 'announced = announced ?? identity;'],
  ['the last pause is not shortened to the time left', R, 'await clock.sleep(Math.min(request.pollMs, left));', 'await clock.sleep(request.pollMs);'],
  ['an unreadable holder is described with a record that is not there', R, "if (holder === undefined) say.complain('wait-expired-unreadable', { waitSeconds });", "if (false) say.complain('wait-expired-unreadable', { waitSeconds });"],
  ['the first announcement ignores an unreadable holder', R, "if (holder === undefined) say.complain('waiting-unreadable', { waitSeconds });", "if (false) say.complain('waiting-unreadable', { waitSeconds });"],
  ['a command that cannot start is not told apart from a defect', R, 'if (!(error instanceof CommandNotStarted)) throw error;', 'if (false) throw error;'],
  ['a command that cannot start exits with the wrong code', R, '    return EXIT.notStarted;', '    return 1;'],
  ['a defect of the child port is swallowed', R, 'if (!(error instanceof CommandNotStarted)) throw error;', 'if (!(error instanceof CommandNotStarted)) return 1;'],
  ['a failed release is not reported', R, "    say.complain('release-failed', { detail: faultDetail(error) });", '    void error;'],
  ['a failed release is thrown over the command\'s exit code', R, "    say.complain('release-failed', { detail: faultDetail(error) });", '    throw error;'],
  ['the record does not carry the runner pid', R, 'pid: processId,', 'pid: 0,'],
  ['the record does not carry the session', R, 'session: request.session,', "session: 'unknown',"],
  ['the record does not carry the project', R, 'project: request.project,', "project: 'unknown',"],
  ['the record does not carry the chain', R, 'chain: request.chain,', "chain: 'unknown',"],
  ['the record does not carry the measured tree', R, 'tree: request.tree,', 'tree: undefined,'],
  ['the wait is announced in milliseconds', R, 'const waitSeconds = request.waitMs / 1000;', 'const waitSeconds = request.waitMs;'],
  ['the documented usage code changes', R, 'usage: 2,', 'usage: 3,'],
  ['the documented wait-expired code changes', R, 'waitExpired: 75,', 'waitExpired: 76,'],
  ['the default wait changes', R, 'export const DEFAULT_WAIT_SECONDS = 3600;', 'export const DEFAULT_WAIT_SECONDS = 60;'],

  // --- the lock adapter
  ['the holder record is never written', A, '        renameSync(partial, holderFile);', '        void partial;'],
  ['a failed record write leaves its partial record', A, '        rmSync(partial, { force: true });\n', ''],
  ['the partial record is never renamed into place', A, '        renameSync(partial, holderFile);', '        writeFileSync(holderFile, JSON.stringify(record));'],
  ['a failed record write keeps the lock', A, '        releaseLock(lockFile);\n\n        throw error;', '        throw error;'],
  ['the lock ceiling is the port\'s default, so a long chain\'s live lock is broken', A, 'const LOCK_AGES = Object.freeze({ staleAfterMs: STALE_AFTER_MS, ceilingMs: CEILING_MS });', 'const LOCK_AGES = Object.freeze({ staleAfterMs: STALE_AFTER_MS });'],
  ['the taken pid is not remembered, so the lock is never released', A, '      mine = record.pid;\n', ''],
  ['a release removes the record of whoever holds it now', A, 'if (this.readHolder()?.pid === pid) rmSync(holderFile, { force: true });', 'rmSync(holderFile, { force: true });'],
  ['a release leaves its own record behind', A, 'if (this.readHolder()?.pid === pid) rmSync(holderFile, { force: true });', 'void pid;'],
  ['the lock file is never released once the record is removed', A, '      } finally {\n        releaseLock(lockFile);\n      }', '      } finally {\n        void lockFile;\n      }'],
  ['a record that is not an object is returned as the holder', A, "return holder !== null && typeof holder === 'object' ? holder : undefined;", 'return holder;'],
  ['a running holder ignores the lock owner, so a dead chain still counts', A, 'return holder !== undefined && holder.pid === owner ? holder : undefined;', 'return holder;'],
  ['a running holder matches any record whose pid is unset', A, 'return holder !== undefined && holder.pid === owner ? holder : undefined;', 'return holder?.pid === owner ? holder ?? null : undefined;'],
  ['a running holder uses the port\'s default ceiling', A, 'liveOwnerOf(lockFile, { ...LOCK_AGES, ...lockOptions })', 'liveOwnerOf(lockFile, { ...lockOptions })'],
  ['a running holder ignores the injected lock options', A, 'liveOwnerOf(lockFile, { ...LOCK_AGES, ...lockOptions })', 'liveOwnerOf(lockFile, { ...LOCK_AGES })'],
  ['an unreadable record throws instead of reading as none', A, '      } catch {\n        return undefined;\n      }\n    },\n\n    /**\n     * The holder id', '      } catch (error) {\n        throw error;\n      }\n    },\n\n    /**\n     * The holder id'],

  // --- how a command is started
  ['a non-Windows platform is treated as Windows', L, "if (platform !== 'win32') return direct;", 'if (false) return direct;'],
  ['a double quote in an argument is carried to cmd.exe', L, 'const UNSAFE = new Set(\'"%\');', "const UNSAFE = new Set('%');"],
  ['a percent sign in an argument is carried to cmd.exe', L, 'const UNSAFE = new Set(\'"%\');', "const UNSAFE = new Set('\"');"],
  ['an empty argument is left bare, so cmd.exe drops it', L, 'PLAIN.has(character)) && argument !== \'\' ?', 'PLAIN.has(character)) ?'],
  ['an argument with a space is left unquoted', L, '[...argument].every((character) => PLAIN.has(character))', 'true'],
  ['a .bat launcher is started directly', L, "const CMD_EXTENSIONS = new Set(['.cmd', '.bat']);", "const CMD_EXTENSIONS = new Set(['.cmd']);"],
  ['a command with a Windows directory is searched on PATH', L, "const hasDirectory = command.includes('/') || command.includes('\\\\');", "const hasDirectory = command.includes('/');"],
  ['a command with a POSIX-style directory is searched on PATH', L, "const hasDirectory = command.includes('/') || command.includes('\\\\');", "const hasDirectory = command.includes('\\\\');"],
  ['cmd.exe is started without verbatim arguments, so the line is re-quoted', L, 'windowsVerbatimArguments: true', 'windowsVerbatimArguments: false'],
  ['cmd.exe is found by name instead of the ComSpec of the environment', L, "file: env.ComSpec ?? 'cmd.exe'", "file: 'cmd.exe'"],
  ['cmd.exe keeps its AutoRun scripts', L, "['/d', '/s', '/c',", "['/s', '/c',"],
  ['the command runs through a shell on POSIX', L, "shell: false,", 'shell: true,'],
  ['the child does not share the terminal', L, "stdio: 'inherit',", "stdio: 'pipe',"],

  // --- the child process
  ['a signal exit is the bare signal number', C, 'const codeOfSignal = (signal) => 128 + (constants.signals[signal] ?? 0);', 'const codeOfSignal = (signal) => constants.signals[signal] ?? 0;'],
  ['a signal exit is read as the exit code', C, 'resolve(signal === null ? (code ?? 1) : codeOfSignal(signal));', 'resolve(code ?? 1);'],
  ['a child that ends with an exit code resolves a signal code', C, 'resolve(signal === null ? (code ?? 1) : codeOfSignal(signal));', 'resolve(codeOfSignal(signal));'],
  ['SIGINT is not forwarded', C, "const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'];", "const FORWARDED = ['SIGTERM', 'SIGHUP'];"],
  ['SIGTERM is not forwarded', C, "const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'];", "const FORWARDED = ['SIGINT', 'SIGHUP'];"],
  ['SIGHUP is not forwarded', C, "const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'];", "const FORWARDED = ['SIGINT', 'SIGTERM'];"],
  ['the forwarders are left installed after the child ends', C, "        child.once('close', (code, signal) => {\n          stopForwarding();", "        child.once('close', (code, signal) => {\n          void stopForwarding;"],
  ['the forwarders are left installed after a spawn error', C, "        child.once('error', (error) => {\n          stopForwarding();", "        child.once('error', (error) => {\n          void stopForwarding;"],
  ['a spawn error loses the system code', C, "code: String(error.code ?? 'unknown')", "code: 'unknown'"],

  // --- the command line
  ['a zero wait is accepted', X, 'number <= 0', 'number < 0'],
  ['a non-numeric wait is accepted', X, '!Number.isFinite(number) || ', ''],
  ['the wait is not converted to milliseconds', X, '* 1000,', '* 1,'],
  ['the command is split at the LAST separator', X, "const separator = argv.indexOf('--');", "const separator = argv.lastIndexOf('--');"],
  ['an unknown flag is accepted', X, 'if (!TEXT_FLAGS.has(flag) && !NUMBER_FLAGS.has(flag))', 'if (false)'],
  ['a flag with no value is accepted', X, 'if (index + 1 >= separator)', 'if (false)'],
  ['a blank chain is accepted', X, "flags['--chain'].trim() === ''", 'false'],
  ['an empty command is accepted', X, "command.length === 0 || command[0] === ''", 'false'],
  ['the session of the environment is ignored', X, "flags['--session'] ?? sessionFromEnvironment ?? 'unknown'", "flags['--session'] ?? 'unknown'"],
  ['the project defaults to a constant', X, "project: flags['--project'] ?? cwdName,", "project: flags['--project'] ?? 'unknown',"],
  ['the measured tree ignores --tree', X, "tree: flags['--tree'] ?? cwd,", 'tree: cwd,'],
  ['the measured tree has no default', X, "tree: flags['--tree'] ?? cwd,", "tree: flags['--tree'],"],
  ['--tree is not a known flag', X, "'--session', '--tree', '--run-dir']);", "'--session', '--run-dir']);"],
  ['the poll interval flag is ignored', X, "pollMs: flags['--poll-ms'] ?? DEFAULT_POLL_MS", 'pollMs: DEFAULT_POLL_MS'],

  // --- the composition root
  ['the state is kept under another mechanism', N, "stateDir('full-chain-lock')", "stateDir('other-mechanism')"],
  ['the project defaults to a constant directory name', N, 'cwdName: path.basename(process.cwd())', "cwdName: 'cwd'"],
  ['the environment session is not read', N, 'sessionFromEnvironment: process.env.CLAUDE_CODE_SESSION_ID', 'sessionFromEnvironment: undefined'],
  ['the session is read from a variable the harness does not export', N, 'sessionFromEnvironment: process.env.CLAUDE_CODE_SESSION_ID', 'sessionFromEnvironment: process.env.CLAUDE_SESSION_ID'],
  ['the measured tree is not resolved to its top level', N, 'tree: measuredTree(parsed.request.tree)', 'tree: parsed.request.tree'],
  ['the cwd is not handed to the arguments', N, '{ cwd: process.cwd(), cwdName:', '{ cwd: undefined, cwdName:'],
  ['a usage problem does not exit with the usage code', N, '  return EXIT.usage;', '  return 1;'],
  ['a usage problem does not print the synopsis', N, "  say.complain('usage');", '  void say;'],
  ['a defect of a port exits 0', N, '  return EXIT.lockFault;\n}', '  return 0;\n}'],

  // --- the measured tree
  ['the top level is never asked', T, 'return topLevelOf(absolute) ?? absolute;', 'return absolute;'],
  ['the directory is not made absolute', T, 'const absolute = path.resolve(directory);', 'const absolute = directory;'],
  ['outside git, the git error output is taken as the tree', T, "const top = run.status === 0 ? run.stdout.trim() : '';", "const top = run.stdout.trim() || run.stderr.trim();"],

  // --- the words
  ['the expiry message stops saying the command did not run', M, 'Your command did NOT run (a full chain never runs unlocked). Retry when that chain ends', 'Retry when that chain ends'],
  ['the Spanish unreadable-record message loses its words', M, 'su registro aún no se puede leer', 'su registro aún no existe'],
  ['the spawn-failure message stops saying the lock was released', M, 'The lock was released.\',\n    es: \'LOCK DE CADENAS COMPLETAS: no se pudo iniciar', 'Done.\',\n    es: \'LOCK DE CADENAS COMPLETAS: no se pudo iniciar'],
  ['the fault message stops saying it is a fault', M, 'because of a fault, not because another chain holds it: {detail}', 'because of an error: {detail}']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['full-chain-lock', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'full-chain-lock/runner.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
