#!/usr/bin/env node
/**
 * The decisions of the DETACHED chain (`run.mjs --detach` and `--read`: argument parsing, run directory, launchers,
 * detached runner, the two commands, their words), each broken once, that `detach.selftest.mjs` must catch. A mutant
 * that only crashes the selftest counts as a survivor (`crashKills: 'fail'`).
 *
 * Not mutated, stated: the `0o600` mode of the job file (Windows has no such mode, and the file is deleted by the
 * runner once read), the `once('error')` listener of the spawn launcher (it only prevents a crash after a failed
 * start whose pid check already reports), the permission branch of the pid probe (`EPERM` cannot be provoked from an
 * unprivileged proof), the close of the output descriptor, and the write-then-rename of the verdict (a reader that
 * races a half-written file cannot be provoked deterministically).
 *
 * @es Las decisiones de la cadena DESACOPLADA (`run.mjs --detach` y `--read`), rotas una a una, que
 * `detach.selftest.mjs` debe detectar. Un mutante que solo hace caer el selftest cuenta como superviviente. No se
 * muta, dicho: el modo `0o600` del fichero del trabajo, el listener `once('error')` del lanzador, la rama de permisos
 * de la sonda de pid, el cierre del descriptor de salida y el escribir-y-renombrar del veredicto.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const X = 'full-chain-lock/cli-arguments.mjs';
const Y = 'full-chain-lock/run-directory.mjs';
const D = 'full-chain-lock/detach-chain.mjs';
const L = 'full-chain-lock/detach-launcher.mjs';
const J = 'full-chain-lock/detached-runner.mjs';
const N = 'full-chain-lock/run.mjs';
const M = 'full-chain-lock/messages.mjs';
const R = 'full-chain-lock/chain-runner.mjs';

const MUTANTS = [
  // --- the arguments
  ['--detach is not recognised', X, 'if (argv[index] === DETACH_FLAG) {', 'if (false) {'],
  ['the pairs after --detach are not realigned', X, '      index -= 1;\n', ''],
  ['--detach does not mark the request', X, '      detach = true;\n', ''],
  ['--run-dir is allowed without --detach', X, 'flags[\'--run-dir\'] !== undefined && !detach', 'false'],
  ['--run-dir is not a flag with a value', X, "'--tree', '--run-dir']", "'--tree']"],
  ['the run directory is not handed on', X, "runDir: flags['--run-dir']", 'runDir: undefined'],
  ['--read accepts extra words', X, 'argv.length !== 2', 'argv.length < 2'],
  ['--read accepts an empty directory', X, " || argv[1] === ''", ''],

  // --- the run directory
  ['the timestamp loses its separator', Y, ".replace('T', '-')", ".replace('T', '')"],
  ['the chain name is not reduced to plain characters', Y, 'chain.replace(UNSAFE_IN_NAME, \'-\')', 'chain'],
  ['a run of unsafe characters is not collapsed', Y, '/[^A-Za-z0-9_-]+/g', '/[^A-Za-z0-9_-]/g'],
  ['a verdict no longer wins over the pid', Y, "  if (verdict !== undefined) return { state: 'finished', verdict };\n", ''],
  ['a record with no pid counts as running', Y, 'Number.isInteger(pid) && isAlive(pid)', 'isAlive(pid)'],
  ['a dead pid counts as running', Y, 'Number.isInteger(pid) && isAlive(pid)', 'Number.isInteger(pid) && !isAlive(pid)'],
  ['a file that is not JSON reads as an empty object', Y, '    return undefined;\n  }\n}\n\n/** Whether', '    return {};\n  }\n}\n\n/** Whether'],

  // --- detaching
  ['a run directory that already holds a run is accepted', D, 'if (existsSync(path.join(runDir, RUN_FILES.run))) {', 'if (false) {'],
  ['an used run directory exits 0', D, '    return EXIT.usage;\n  }\n\n  const jobFile', '    return 0;\n  }\n\n  const jobFile'],
  ['the run directory option is ignored', D, 'path.resolve(request.runDir ?? defaultRunDirectory(runsRoot, request.chain, now()))', 'path.resolve(defaultRunDirectory(runsRoot, request.chain, now()))'],
  ['the run directory is not created recursively', D, 'mkdirSync(runDir, { recursive: true });', 'mkdirSync(runDir);'],
  ['the job loses the command', D, 'command: request.command, args:', "command: 'x', args:"],
  ['the job loses the arguments', D, 'args: request.args,', 'args: [],'],
  ['the job loses the environment', D, 'cwd, environment, chain:', 'cwd, environment: {}, chain:'],
  ['the job loses the working directory', D, 'cwd, environment, chain:', "cwd: '/', environment, chain:"],
  ['the job loses the chain', D, 'chain: request.chain, project:', "chain: 'x', project:"],
  ['the job loses the project', D, 'project: request.project,', "project: 'x',"],
  ['the job loses the session', D, 'session: request.session,', "session: 'x',"],
  ['the job loses the measured tree', D, 'tree: request.tree,', "tree: '/x',"],
  ['the job states the wait in milliseconds', D, 'waitSeconds: request.waitMs / 1000', 'waitSeconds: request.waitMs'],
  ['the job loses the poll interval', D, 'pollMs: request.pollMs }', 'pollMs: 1 }'],
  ['the launcher is told to run the wrong script', D, 'runnerPath: DETACHED_RUNNER', 'runnerPath: RUN'],
  ['the launcher is not told the node binary', D, 'nodePath: process.execPath', "nodePath: 'node'"],
  ['the run record loses the pid', D, 'JSON.stringify({ pid, chain', 'JSON.stringify({ pid: 0, chain'],
  ['the run record loses the arguments of the command', D, "command: [request.command, ...request.args].join(' '), startedAt", 'command: request.command, startedAt'],
  ['the read command does not quote the directory', D, '--read "${runDir}"', '--read ${runDir}'],
  ['the read command points at another script', D, 'node "${RUN}" --read', 'node "${DETACHED_RUNNER}" --read'],
  ['a failed launch leaves the job file with the environment', D, '    rmSync(jobFile, { force: true });\n', ''],
  ['a failed launch exits with the wrong code', D, '    return EXIT.detachFailed;', '    return 1;'],
  ['a failed launch is not told', D, "    say.complain('detach-failed', { detail: detailOf(error) });", '    void error;'],
  ['a failed launch is not told apart from success', D, '    return EXIT.detachFailed;', '    return 0;'],

  // --- reading
  ['a live runner reads as finished', D, '    return EXIT.running;', '    return 0;'],
  ['a lost run exits with the wrong code', D, '    return EXIT.usage;\n  }\n\n  const { verdict }', '    return 1;\n  }\n\n  const { verdict }'],
  ['a verdict with no code is read as finished', D, "typeof verdict.exitCode !== 'number'", 'false'],
  ['a run that never started exits with the wrong code', D, '    return EXIT.notStarted;', '    return 1;'],
  ['the reason of a run that never started is lost', D, 'verdict.error ?? `signal ${String(verdict.signal)}`', '`signal ${String(verdict.signal)}`'],
  ['a finished run exits 0 whatever the chain did', D, '  return verdict.exitCode;', '  return 0;'],
  ['the pid probe is not handed to the status', D, 'runStatus(runDir, { isAlive })', 'runStatus(runDir)'],

  // --- the launchers
  ['the WMI command line is not quoted', L, '.map(quoted)', '.map(String)'],
  ['a path with a double quote is let into the command line', L, "if (value.includes('\"'))", 'if (false)'],
  ['a failing PowerShell is not told', L, 'if (answer.status !== 0) throw', 'if (false) throw'],
  ['an unreadable WMI answer is not told', L, 'if (parsed === null) throw', 'if (false) throw'],
  ['a WMI refusal is taken for success', L, 'if (Number(parsed[1]) !== 0) throw', 'if (false) throw'],
  ['the WMI launcher answers the return value instead of the pid', L, 'return Number(parsed[2]);', 'return Number(parsed[1]);'],
  ['the working directory is not handed to WMI', L, '[WMI_ENVIRONMENT.directory]: cwd', "[WMI_ENVIRONMENT.directory]: ''"],
  ['the script creates nothing', L, 'MethodName Create', 'MethodName GetOwner'],
  ['the spawn launcher does not detach', L, '{ detached: true, stdio:', '{ detached: false, stdio:'],
  ['the spawn launcher keeps the stdio of its caller', L, "stdio: 'ignore', windowsHide: true, cwd }", "stdio: 'inherit', windowsHide: true, cwd }"],
  ['the spawn launcher shows a window', L, 'windowsHide: true, cwd }', 'windowsHide: false, cwd }'],
  ['the spawn launcher does not run in the directory', L, 'windowsHide: true, cwd }', 'windowsHide: true }'],
  ['the spawn launcher keeps the child tied to its caller', L, '      child.unref();\n', ''],
  ['a spawn with no pid is taken for success', L, 'if (child.pid === undefined) throw', 'if (false) throw'],
  ['Windows does not use WMI', L, "platform === 'win32' ? wmiLauncher() : spawnLauncher()", 'spawnLauncher()'],
  ['other platforms use WMI', L, "platform === 'win32' ? wmiLauncher() : spawnLauncher()", 'wmiLauncher()'],

  // --- the detached runner
  ['the job file with the environment is kept', J, '    rmSync(jobFile, { force: true });\n', ''],
  ['a missing job leaves no verdict', J, '    writeVerdict(runDir, verdict);\n\n    return verdict;\n  }\n\n  let ended;', '    return verdict;\n  }\n\n  let ended;'],
  ['the chain\'s exit code is not recorded', J, 'ended = { exitCode: code, signal };', 'ended = { exitCode: 0, signal };'],
  ['the signal is not recorded', J, 'ended = { exitCode: code, signal };', 'ended = { exitCode: code, signal: null };'],
  ['a chain that cannot start records an exit code', J, 'ended = { exitCode: null, signal: null, error:', 'ended = { exitCode: 1, signal: null, error:'],
  ['the verdict loses the arguments of the command', J, "[job.command, ...job.args].join(' ')", 'job.command'],
  ['the verdict ends when it starts', J, 'endedAt: now().toISOString(), command: commandText(job)', 'endedAt: startedAt, command: commandText(job)'],
  ['the chain does not run in the job\'s directory', J, 'cwd: job.cwd,', 'cwd: undefined,'],
  ['the chain does not get the job\'s environment', J, 'env: job.environment,', 'env: process.env,'],
  ['the chain\'s output is not kept', J, "stdio: ['ignore', output, output]", "stdio: 'ignore'"],
  ['the chain runs without the lock', J, "'--chain', job.chain, '--project'", "'--project'"],
  ['the chain measures the wrong tree', J, "'--tree', job.tree", "'--tree', job.cwd"],
  ['the chain forgets the wait', J, "String(job.waitSeconds)", "'1'"],
  ['the chain forgets the poll interval', J, "String(job.pollMs)", "'1'"],

  // --- the composition
  ['--read is not recognised', N, 'if (argv[0] === READ_FLAG) return', 'if (false) return'],
  ['--detach runs the chain in the foreground', N, 'if (request.detach) return', 'if (false) return'],
  ['a detached run is not rooted under the runs folder', N, 'path.join(stateDirectory, RUNS_FOLDER)', 'stateDirectory'],
  ['a detached run does not get the caller\'s environment', N, 'environment: process.env, cwd', 'environment: {}, cwd'],
  ['a detached run does not get the caller\'s directory', N, 'cwd: process.cwd() });\n', "cwd: '/' });\n"],
  ['a --read problem is not refused', N, 'if (parsed.problem !== undefined) return refuse(parsed.problem, say);\n\n  return readChain', 'return readChain'],
  ['the documented detach-failed code changes', R, 'detachFailed: 71,', 'detachFailed: 72,'],
  ['the documented running code changes', R, 'running: 76,', 'running: 77,'],

  // --- the words
  ['the detach message stops giving the read command', M, "'  {readCommand}'\n    ],\n    es: [", "''\n    ],\n    es: ["],
  ['the English running message stops saying RUNNING', M, 'FULL-CHAIN LOCK: RUNNING.', 'FULL-CHAIN LOCK: busy.'],
  ['the English lost message stops saying LOST', M, 'FULL-CHAIN LOCK: LOST.', 'FULL-CHAIN LOCK: gone.'],
  ['the finished message stops giving the exit code', M, 'FINISHED with exit {exitCode} at', 'FINISHED at'],
  ['the failed-launch message drops the reason', M, 'started detached: {detail} Nothing runs', 'started detached. Nothing runs'],
  ['the usage synopsis forgets --read', M, "      '                       node run.mjs --read <run dir>'\n", ''],
  ['the usage synopsis forgets --detach', M, '[--detach [--run-dir <dir>]] -- <command>', '-- <command>']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['full-chain-lock', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'full-chain-lock/detach.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
