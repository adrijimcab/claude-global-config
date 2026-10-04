#!/usr/bin/env node
/**
 * The decisions of `process-control/kill-tree.mjs`, each broken once, that `kill-tree.selftest.mjs` must
 * catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a
 * mutant that only crashes the selftest count as a survivor.
 *
 * Both directions: mutants that kill what must never be killed (a bad id, the caller, a process whose group
 * is gone) or stop short of the tree (no `/T`, no group), and mutants that report a healthy run as a failure.
 *
 * @es Las decisiones de `kill-tree.mjs`, rotas una a una, que `kill-tree.selftest.mjs` debe detectar. Ambas
 * direcciones: las que matan lo que nunca debe matarse o se quedan cortas del árbol, y las que informan de
 * un fallo donde todo fue bien. Un mutante que solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const K = 'process-control/kill-tree.mjs';

const MUTANTS = [
  // --- ids that are never signalled ---
  ['id 1 is signalled (the lower bound is loosened)', K, 'pid <= 1', 'pid <= 0'],
  ['id 2 is refused (the lower bound is tightened)', K, 'pid <= 1', 'pid <= 2'],
  ['a fractional, text or missing id is signalled (no integer check)', K, '!Number.isInteger(pid) || ', ''],
  ['the caller can kill itself (no own-pid refusal)', K, ' || pid === ownPid', ''],
  ['the caller own pid is taken from the parent, not from this process', K, 'ownPid = process.pid', 'ownPid = process.ppid'],
  ['a refused id is reported as a failure', K, "return { pid, outcome: 'refused', killed: [] };", "return { pid, outcome: 'failed', killed: [] };"],

  // --- the platform decision ---
  ['the platform branches are swapped', K, "platform === 'win32' ? killOnWindows(pid, taskkill) : killOnPosix(pid, signal)", "platform === 'win32' ? killOnPosix(pid, signal) : killOnWindows(pid, taskkill)"],
  ['the platform is never win32 by default', K, 'platform = process.platform, taskkill', "platform = 'linux', taskkill"],

  // --- the Windows branch ---
  ['taskkill is not asked for the tree (no /T)', K, "['/T', '/F', '/PID', String(pid)]", "['/F', '/PID', String(pid)]"],
  ['taskkill is not forced (no /F)', K, "['/T', '/F', '/PID', String(pid)]", "['/T', '/PID', String(pid)]"],
  ['taskkill is given the pid as a name filter', K, "['/T', '/F', '/PID', String(pid)]", "['/T', '/F', '/IM', String(pid)]"],
  ['taskkill output is not decoded', K, "{ encoding: 'utf8', windowsHide: true }", '{ windowsHide: true }'],
  ['a missing taskkill is not reported with its error', K, 'if (result.error !== undefined) return failed(pid, result.error.message);', 'if (false) return failed(pid, result.error.message);'],
  ['a missing taskkill detail is dropped', K, 'return failed(pid, result.error.message)', "return failed(pid, '')"],
  ['any status but not-found counts as killed', K, "if (result.status === 0) return { pid, outcome: 'killed'", "if (result.status !== TASKKILL_NOT_FOUND) return { pid, outcome: 'killed'"],
  ['not-found counts as a failure', K, "if (result.status === TASKKILL_NOT_FOUND) return { pid, outcome: 'already-dead', killed: [] };", "if (false) return { pid, outcome: 'already-dead', killed: [] };"],
  ['the not-found status is 1', K, 'const TASKKILL_NOT_FOUND = 128;', 'const TASKKILL_NOT_FOUND = 1;'],
  ['the failure detail ignores stderr', K, 'firstLine(result.stderr) || firstLine(result.stdout)', 'firstLine(result.stdout)'],
  ['the failure detail ignores stdout', K, 'firstLine(result.stderr) || firstLine(result.stdout)', 'firstLine(result.stderr)'],
  ['the failure detail is the second line', K, ".split('\\n')[0].trim()", ".split('\\n')[1].trim()"],
  ['the failure detail keeps its carriage return', K, ".split('\\n')[0].trim()", ".split('\\n')[0]"],
  ['a missing text is not tolerated', K, "(text ?? '').split", '(text).split'],
  ['a failure lists the root as killed', K, "outcome: 'failed', killed: [], detail }", "outcome: 'failed', killed: [pid], detail }"],
  ['the parent a line cites is listed too', K, '.slice(0, 1)', '.slice(0, 2)'],
  ['only the first digit of a pid is read', K, '/PID (\\d+)/g', '/PID (\\d)/g'],
  ['a listed pid stays text', K, 'Number(match[1])', 'match[1]'],
  ['unreadable output lists nothing', K, 'found.length > 0 ? found : [root]', 'found'],
  ['output lines are not read per line', K, "(output ?? '').split('\\n')", "[output ?? '']"],

  // --- the POSIX branch ---
  ['the group is never signalled', K, 'for (const target of [-pid, pid])', 'for (const target of [pid])'],
  ['the single process is signalled before the group', K, '[-pid, pid]', '[pid, -pid]'],
  ['a missing group is not retried on the process', K, '[-pid, pid]', '[-pid]'],
  ['the signal is SIGTERM, which a process can ignore', K, "signal(target, 'SIGKILL')", "signal(target, 'SIGTERM')"],
  ['every error counts as no such process', K, "if (error.code !== 'ESRCH') return failed(pid, error.message);", ''],
  ['a missing process is a failure', K, "\n\n  return { pid, outcome: 'already-dead', killed: [] };", "\n\n  return failed(pid, 'gone');"],
  ['the error message is dropped from a failure', K, 'return failed(pid, error.message)', "return failed(pid, '')"],
  ['a killed group lists nothing', K, "return { pid, outcome: 'killed', killed: [pid] };", "return { pid, outcome: 'killed', killed: [] };"],
  ['the signal sender swaps its arguments', K, 'process.kill(target, name)', 'process.kill(name, target)'],

  // --- the timeout runner ---
  ['the child leads a group on every platform', K, "detached: platform !== 'win32'", 'detached: true'],
  ['the child leads a group on no platform', K, "detached: platform !== 'win32'", 'detached: false'],
  ['a console window opens for the child', K, "windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']", "windowsHide: false, stdio: ['ignore', 'pipe', 'pipe']"],
  ['the working directory is not passed on', K, '{ cwd, env, detached', '{ env, detached'],
  ['the environment is not passed on', K, '{ cwd, env, detached', '{ cwd, detached'],
  ['no process tree is killed on a timeout by default', K, 'kill = killTree }', 'kill = () => undefined }'],
  ['the child inherits an open stdin', K, "stdio: ['ignore', 'pipe', 'pipe']", "stdio: ['pipe', 'pipe', 'pipe']"],
  ['output is collected as raw chunks, splitting a multi-byte character', K, "child.stdout?.setEncoding('utf8').on", 'child.stdout?.on'],
  ['stderr is collected into stdout', K, "child.stderr?.setEncoding('utf8').on('data', (chunk) => (result.stderr += chunk))", "child.stderr?.setEncoding('utf8').on('data', (chunk) => (result.stdout += chunk))"],
  ['the timeout is read as seconds', K, '}, timeoutMs);', '}, timeoutMs / 1000);'],
  ['a timer after the exit still kills', K, 'if (exited) return;', ''],
  ['the exit is never recorded', K, "child.on('exit', () => (exited = true));", "child.on('exit', () => {});"],
  ['the timeout is not reported', K, 'result.timedOut = true;', ''],
  ['the kill report is not kept', K, 'result.kill = kill(child.pid);', 'kill(child.pid);'],
  ['the output pipes are not cut after the kill', K, 'child.stdout?.destroy();\n      child.stderr?.destroy();', ''],
  ['the timer outlives a finished run', K, 'clearTimeout(timer);', ''],
  ['a start failure is not reported', K, 'result.error = error;', ''],
  ['the exit status is not kept', K, 'Object.assign(result, { status, signal });', 'Object.assign(result, { signal });'],
  ['the exit signal is not kept', K, 'Object.assign(result, { status, signal });', 'Object.assign(result, { status });'],

  // --- the command line ---
  ['hex, exponent and prefixed numbers are accepted as ids', K, '/^\\d+$/.test(argv[0]) ? Number(argv[0]) : Number.NaN', 'Number.parseFloat(argv[0])'],
  ['the end of the id is not anchored', K, '/^\\d+$/.test(argv[0])', '/^\\d+/.test(argv[0])'],
  ['the start of the id is not anchored', K, '/^\\d+$/.test(argv[0])', '/\\d+$/.test(argv[0])'],
  ['two arguments are not a usage error', K, 'argv.length !== 1', 'argv.length < 1'],
  ['no arguments are not a usage error', K, 'argv.length !== 1', 'argv.length > 1'],
  ['a refused id is printed as its number, not as typed', K, "say(out, 'refused', { pid: argv[0] })", "say(out, 'refused', { pid: report.pid })"],
  ['a refused id exits 1', K, "failed: 1, refused: 2", "failed: 1, refused: 1"],
  ['a failed kill exits 2', K, "failed: 1, refused: 2", "failed: 2, refused: 2"],
  ['a killed tree exits 1', K, "killed: 0, 'already-dead': 0", "killed: 1, 'already-dead': 0"],
  ['an already dead process exits 1', K, "killed: 0, 'already-dead': 0", "killed: 0, 'already-dead': 1"],
  ['the killed line lists pids without a separator', K, "report.killed.join(', ')", "report.killed.join('')"],
  ['the killed line counts the root only', K, 'count: report.killed.length', 'count: 1'],
  ['a failure is not printed', K, "if (report.outcome === 'failed') say(out, 'failed', { pid: report.pid, detail: report.detail });", ''],
  ['an already dead process is not printed', K, "if (report.outcome === 'already-dead') say(out, 'alreadyDead', { pid: report.pid });", ''],
  ['the program never runs when launched directly', K, 'if (process.argv[1] !== undefined && import.meta.url', 'if (false && import.meta.url'],
  ['the program exits 0 whatever the run returned', K, 'process.exit(run(process.argv.slice(2)))', 'process.exit((run(process.argv.slice(2)), 0))'],

  // --- the message table ---
  ['a printed line loses its Spanish half', K, 'out(`${fill(MESSAGES[id].en)} @es ${fill(MESSAGES[id].es)}`);', 'out(fill(MESSAGES[id].en));'],
  ['placeholders are not filled', K, 'String(params[name])', "'{' + name + '}'"],
  ['the Spanish half of the killed message loses its accent', K, 'Se terminó el árbol', 'Se termino el arbol'],
  ['the Spanish half of the refused message loses its accent', K, 'id de proceso válido', 'id de proceso valido'],
  ['the usage message loses its Spanish half', K, "es: 'Uso: kill-tree.mjs <pid>.'", "es: ''"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['process-control'],
  selftest: 'process-control/kill-tree.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
