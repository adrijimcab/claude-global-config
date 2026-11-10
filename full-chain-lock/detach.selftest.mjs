#!/usr/bin/env node
/**
 * Self-test for `run.mjs --detach` and `run.mjs --read`: a full chain started DETACHED from the calling session,
 * with its output in a run directory and its verdict in a file. Real processes, real files; the shared state is
 * redirected to a private directory first.
 *
 * THE STATE SPACE, enumerated from the decisions:
 *   - THE KILL: the whole process tree of the caller is killed while the detached chain runs, and the verdict still
 *     appears with the chain's exit code. The same proof with a plain `spawn({ detached: true })` must go red on
 *     Windows, which is what makes the first one discriminate.
 *   - THE VERDICT: written with the exit code, signal, start, end and command; an unstartable runner writes a verdict
 *     with a null exit code and the error; the job file (it carries the environment) is deleted once read.
 *   - THE SECRETS: the environment is in the job file; neither the WMI command line nor the PowerShell script has it.
 *   - THE LAUNCHERS: WMI on Windows, a detached spawn elsewhere; a refused launch tells why and leaves no job file.
 *   - THE READ: running, finished (the chain's exit code), finished without a code, lost.
 *   - ARGUMENTS and WORDS: `--detach`, `--run-dir`, `--read`, every usage problem, all bilingual.
 *
 * @es Auto-test de `run.mjs --detach` y `run.mjs --read`: una cadena completa iniciada DESACOPLADA de la sesión que
 * llama, con su salida en un directorio de corrida y su veredicto en un fichero. Estados: LA MUERTE (se mata todo el
 * árbol de quien llama y el veredicto aparece igual; con un `spawn` simple debe ponerse en rojo en Windows), EL
 * VEREDICTO, LOS SECRETOS (el entorno solo va en el fichero del trabajo), LOS LANZADORES, LA LECTURA (corriendo,
 * terminada, sin código, perdida) y ARGUMENTOS y TEXTOS, todos bilingües.
 */

import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState, stateDir } from '../hook-state/locations.mjs';
import { realTempRoot } from '../session-temp/session-temp.mjs';
import { EXIT } from './chain-runner.mjs';
import { parseArguments, parseReadArguments } from './cli-arguments.mjs';
import { detachChain, readChain } from './detach-chain.mjs';
import { WMI_ENVIRONMENT, WMI_SCRIPT, detachedLauncher, spawnLauncher, wmiLauncher } from './detach-launcher.mjs';
import { chainEnvironment, runJob } from './detached-runner.mjs';
import { CHAIN_TEMP_BUDGET, RUN_FILES, chainTempDir, defaultRunDirectory, runStatus } from './run-directory.mjs';
import { MESSAGES, speak } from './messages.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.mjs');
const CHILD = path.join(HERE, 'chain-child.fixture.mjs');
const KILL_FIXTURE = path.join(HERE, 'detach-kill.fixture.mjs');

isolateState('full-chain-lock');

const SCRATCH = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'fcl-detach-selftest-')));
const spawned = new Set();

process.on('exit', () => {
  for (const pid of spawned) killTree(pid);
  rmSync(SCRATCH, { recursive: true, force: true });
});

/**
 * The environment of every real process this proof starts that reaches PowerShell (the WMI launcher): PowerShell
 * creates `<USERPROFILE>\AppData\Roaming` on its first run and ignores APPDATA for it (measured), so the profile of
 * those processes is a folder this proof owns, inside its own scratch, and nothing lands in the home it was given.
 * @es El entorno de todo proceso real que esta prueba inicia y que llega a PowerShell (el lanzador WMI): PowerShell crea
 * `<USERPROFILE>\AppData\Roaming` en su primera corrida e ignora APPDATA para eso (medido), así que el perfil de esos
 * procesos es una carpeta de esta prueba, dentro de su propio scratch, y nada cae en el home que recibió.
 */
const PROFILE = path.join(SCRATCH, 'profile');
const ownedProfile = Object.fromEntries(Object.entries(process.env).filter(([name]) => !['USERPROFILE', 'HOME', 'APPDATA', 'LOCALAPPDATA'].includes(name.toUpperCase())));

mkdirSync(PROFILE, { recursive: true });
Object.assign(ownedProfile, { USERPROFILE: PROFILE, HOME: PROFILE, APPDATA: path.join(PROFILE, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(PROFILE, 'AppData', 'Local') });

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}\n`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, ms = 20_000) {
  const end = Date.now() + ms;

  while (!predicate() && Date.now() < end) await sleep(50);

  return predicate();
}

/** A JSON file read safely: its value, or `{}`. @es Un JSON leído sin riesgo: su valor, o `{}`. */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Kills a process and everything below it. @es Mata un proceso y todo lo que cuelga de él. */
function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

let counter = 0;
const CHAIN_TEMP = path.join(SCRATCH, 'chain-temp');
const freshDir = () => path.join(SCRATCH, `run-${String(counter++)}`);

/** A sink that remembers what is printed. @es Un sumidero que recuerda lo impreso. */
function capture() {
  const out = [];
  const err = [];

  return { out, err, say: speak({ log: (text) => out.push(text), error: (text) => err.push(text) }) };
}

const isBilingual = (text) => text.includes('@es');
const defaults = { cwd: '/w', cwdName: 'w', sessionFromEnvironment: undefined };

// ── Arguments ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const plain = parseArguments(['--chain', 'c', '--', 'x'], defaults);
  const detached = parseArguments(['--detach', '--chain', 'c', '--', 'x', '--detach'], defaults);
  const middle = parseArguments(['--chain', 'c', '--detach', '--run-dir', '/r', '--', 'x'], defaults);

  check('a run without --detach is not detached and has no run directory', plain.request.detach === false && plain.request.runDir === undefined);
  check('--detach before the separator marks the request detached and leaves the command words alone', detached.request?.detach === true && detached.request.chain === 'c' && detached.request.args.join(',') === '--detach', JSON.stringify(detached));
  check('--detach between pairs keeps the pairs aligned and --run-dir is read', middle.request?.detach === true && middle.request.runDir === '/r' && middle.request.chain === 'c', JSON.stringify(middle));
  check('--run-dir without --detach is a usage problem', parseArguments(['--chain', 'c', '--run-dir', '/r', '--', 'x'], defaults).problem?.id === 'usage-run-dir-without-detach');
  check('--read takes exactly one directory', parseReadArguments(['--read', '/d']).runDir === '/d');
  check('--read with no directory is a usage problem', parseReadArguments(['--read']).problem?.id === 'usage-read');
  check('--read with two directories is a usage problem', parseReadArguments(['--read', '/a', '/b']).problem?.id === 'usage-read');
  check('--read with an empty directory is a usage problem', parseReadArguments(['--read', '']).problem?.id === 'usage-read');
}

// ── The run directory ───────────────────────────────────────────────────────────────────────────────────────
{
  const named = defaultRunDirectory('/root', 'my chain//x', new Date(Date.UTC(2026, 10, 5, 12, 3, 4, 56)));

  check('the default run directory is named by timestamp and chain, under the runs root', path.relative('/root', named) === '20261105-120304056-my-chain-x', named);

  const dir = freshDir();

  mkdirSync(dir, { recursive: true });
  check('a directory with no run record is lost', runStatus(dir).state === 'lost');
  writeFileSync(path.join(dir, RUN_FILES.run), '{}');
  check('a run record with no pid is lost even if the probe says alive', runStatus(dir, { isAlive: () => true }).state === 'lost');
  writeFileSync(path.join(dir, RUN_FILES.verdict), 'not json {');
  check('a verdict that is not JSON is no verdict', runStatus(dir, { isAlive: () => false }).state === 'lost');
  rmSync(path.join(dir, RUN_FILES.verdict));
  writeFileSync(path.join(dir, RUN_FILES.run), JSON.stringify({ pid: process.pid }));
  check('a live pid with no verdict is running', runStatus(dir).state === 'running');
  check('a pid the probe calls dead with no verdict is lost', runStatus(dir, { isAlive: () => false }).state === 'lost');
  writeFileSync(path.join(dir, RUN_FILES.verdict), JSON.stringify({ exitCode: 3, signal: null }));
  check('a verdict wins over a live pid: finished with its exit code', runStatus(dir).state === 'finished' && runStatus(dir).verdict.exitCode === 3);
  check('a verdict wins over a dead pid too', runStatus(dir, { isAlive: () => false }).state === 'finished');
}

// ── The read command ────────────────────────────────────────────────────────────────────────────────────────
{
  const dir = freshDir();

  mkdirSync(dir, { recursive: true });

  const read = (probe) => {
    const sink = capture();
    const code = readChain(dir, { say: sink.say, isAlive: probe });

    return { code, text: [...sink.out, ...sink.err].join('\n') };
  };

  const lost = read(() => false);

  check('a run with no pid and no verdict is reported lost, bilingual, exit 2', lost.code === EXIT.usage && isBilingual(lost.text) && lost.text.includes('LOST'), lost.text);
  writeFileSync(path.join(dir, RUN_FILES.run), JSON.stringify({ pid: process.pid }));

  const running = read(() => true);

  check('a live runner is reported running, bilingual, with its own exit code', running.code === EXIT.running && isBilingual(running.text) && running.text.includes('RUNNING'), running.text);
  check('the pid probe handed to the read decides: a pid it calls dead is lost, not running', read(() => false).code === EXIT.usage);
  writeFileSync(path.join(dir, RUN_FILES.verdict), JSON.stringify({ exitCode: 7, signal: null, startedAt: 'a', endedAt: 'b', command: 'c' }));

  const finished = read(() => true);

  check('a finished run is reported with its exit code and the process exits with that code', finished.code === 7 && finished.text.includes('exit 7') && isBilingual(finished.text), finished.text);
  writeFileSync(path.join(dir, RUN_FILES.verdict), JSON.stringify({ exitCode: 0, signal: null }));
  check('a chain that succeeded reads as exit 0', read(() => true).code === 0);
  writeFileSync(path.join(dir, RUN_FILES.verdict), JSON.stringify({ exitCode: null, signal: null, error: 'boom' }));

  const unstarted = read(() => true);

  check('a verdict with no exit code is reported as not started, with the error, and exits 127', unstarted.code === EXIT.notStarted && unstarted.text.includes('boom') && isBilingual(unstarted.text), unstarted.text);
}

// ── Detaching: the job file, the launcher, the words ────────────────────────────────────────────────────────
{
  const dir = freshDir();
  const calls = [];
  const launcher = { kind: 'fake', launch: (launch) => (calls.push(launch), 4242) };
  const sink = capture();
  const request = { chain: 'c1', project: 'p', session: 's', tree: '/t', command: 'the-command', args: ['a b', '--x'], waitMs: 90_000, pollMs: 300, detach: true, runDir: dir };
  const code = detachChain(request, { launcher, say: sink.say, runsRoot: path.join(SCRATCH, 'unused'), environment: { SECRET_TOKEN: 'sekret-value-123', PATH: 'p' }, cwd: '/the/cwd' });
  const job = readJson(path.join(dir, RUN_FILES.job));
  const record = readJson(path.join(dir, RUN_FILES.run));
  const printed = sink.out.join('\n');

  check('detaching returns 0 at once', code === 0);
  check('the job file carries the command, its arguments, the directory and the lock settings', job.command === 'the-command' && job.args.join('|') === 'a b|--x' && job.cwd === '/the/cwd' && job.chain === 'c1' && job.project === 'p' && job.session === 's' && job.tree === '/t' && job.waitSeconds === 90 && job.pollMs === 300, JSON.stringify(job));
  check('the job file carries the environment', job.environment?.SECRET_TOKEN === 'sekret-value-123');
  check('the job file carries the chain TEMP the caller decided for that run directory', job.tempDir === chainTempDir(dir), String(job.tempDir));
  check('the launcher is told the node binary, the runner script and the run directory, and nothing of the environment', calls.length === 1 && calls[0].nodePath === process.execPath && calls[0].runnerPath === path.join(HERE, 'detached-runner.mjs') && calls[0].runDir === dir && !JSON.stringify(calls[0]).includes('sekret'), JSON.stringify(calls));
  check('the run record names the detached pid, the chain and the command', record.pid === 4242 && record.chain === 'c1' && record.command === 'the-command a b --x', JSON.stringify(record));
  check('the output names the run directory, the pid and the exact read command, bilingual', printed.includes(dir) && printed.includes('4242') && printed.includes(`--read "${dir}"`) && printed.includes(RUN) && isBilingual(printed), printed);

  const second = capture();
  const again = detachChain(request, { launcher, say: second.say, runsRoot: SCRATCH, environment: {}, cwd: '/c' });

  check('a run directory that already holds a run is refused, bilingual, and launches nothing', again === EXIT.usage && calls.length === 1 && isBilingual(second.err.join('\n')), second.err.join('\n'));

  const failing = capture();
  const dir2 = freshDir();
  const failed2 = detachChain({ ...request, runDir: dir2 }, { launcher: { kind: 'fake', launch: () => { throw new Error('wmi said no'); } }, say: failing.say, runsRoot: SCRATCH, environment: { SECRET_TOKEN: 'x' }, cwd: '/c' });

  check('a refused launch exits 71, tells why bilingual, and leaves no job file with the environment', failed2 === EXIT.detachFailed && failing.err.join('\n').includes('wmi said no') && isBilingual(failing.err.join('\n')) && !existsSync(path.join(dir2, RUN_FILES.job)), failing.err.join('\n'));

  const defaultRoot = path.join(SCRATCH, 'default-root');
  const viaDefault = capture();

  detachChain({ ...request, runDir: undefined }, { launcher, say: viaDefault.say, runsRoot: defaultRoot, environment: {}, cwd: '/c', now: () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5, 6)) });
  check('with no --run-dir the run lives under the runs root, named by timestamp and chain', existsSync(path.join(defaultRoot, '20260102-030405006-c1', RUN_FILES.run)));
}

// ── The launchers ───────────────────────────────────────────────────────────────────────────────────────────
{
  const asked = [];
  const ok = wmiLauncher({ runPowershell: (call) => (asked.push(call), { status: 0, stdout: '0 31337\r\n', stderr: '' }) });
  const pid = ok.launch({ nodePath: 'C:\\Program Files\\nodejs\\node.exe', runnerPath: 'C:\\x\\detached-runner.mjs', runDir: 'C:\\r\\run', cwd: 'C:\\w' });
  const commandLine = asked[0].environment[WMI_ENVIRONMENT.commandLine];

  check('the WMI launcher answers the pid WMI printed', pid === 31337);
  check('the command line is quoted and names node, the runner and the run directory only', commandLine === '"C:\\Program Files\\nodejs\\node.exe" "C:\\x\\detached-runner.mjs" "C:\\r\\run"', commandLine);
  check('the working directory travels by variable', asked[0].environment[WMI_ENVIRONMENT.directory] === 'C:\\w');
  check('the PowerShell script is the static one and holds none of the values', asked[0].script === WMI_SCRIPT && !WMI_SCRIPT.includes('node.exe') && !WMI_SCRIPT.includes('detached-runner'));
  check('the script reads the command line and the directory from the environment and creates a Win32_Process', WMI_SCRIPT.includes(`$env:${WMI_ENVIRONMENT.commandLine}`) && WMI_SCRIPT.includes(`$env:${WMI_ENVIRONMENT.directory}`) && WMI_SCRIPT.includes('Win32_Process'));
  check('the WMI environment holds nothing of the chain\'s own', !Object.keys(asked[0].environment).includes('SECRET_TOKEN'));

  const throws = (launch) => {
    try {
      launch();

      return '';
    } catch (error) {
      return error.message;
    }
  };
  const base = { nodePath: 'n', runnerPath: 'r', runDir: 'd', cwd: 'c' };

  check('a non-zero WMI return value is a failure naming it', throws(() => wmiLauncher({ runPowershell: () => ({ status: 0, stdout: '9 0', stderr: '' }) }).launch(base)).includes('9'));
  check('a failing PowerShell is a failure naming its output', throws(() => wmiLauncher({ runPowershell: () => ({ status: 1, stdout: '', stderr: 'denied here' }) }).launch(base)).includes('denied here'));
  check('an unreadable answer is a failure naming it', throws(() => wmiLauncher({ runPowershell: () => ({ status: 0, stdout: 'nonsense', stderr: '' }) }).launch(base)).includes('nonsense'));
  check('the script calls the Create method of Win32_Process', WMI_SCRIPT.includes('Win32_Process -MethodName Create'));
  check('the documented exit codes of detach and read are 71 and 76', EXIT.detachFailed === 71 && EXIT.running === 76);
  check('a path with a double quote is refused before PowerShell runs', throws(() => wmiLauncher({ runPowershell: () => { throw new Error('must not run'); } }).launch({ ...base, runDir: 'a"b' })).includes('"'));

  const spawnCalls = [];
  let unref = 0;
  const viaSpawn = spawnLauncher({ spawnProcess: (...call) => (spawnCalls.push(call), { pid: 555, unref: () => (unref += 1), once: () => undefined }) });

  check('the spawn launcher answers the child pid', viaSpawn.launch({ nodePath: 'n', runnerPath: 'r', runDir: 'd', cwd: 'c' }) === 555);
  check('the spawn launcher detaches the child, drops its stdio, hides the window and lets go of it', spawnCalls[0][0] === 'n' && spawnCalls[0][1].join(',') === 'r,d' && spawnCalls[0][2].detached === true && spawnCalls[0][2].stdio === 'ignore' && spawnCalls[0][2].windowsHide === true && spawnCalls[0][2].cwd === 'c' && unref === 1, JSON.stringify(spawnCalls));
  check('a spawn that gave no pid is a failure', throws(() => spawnLauncher({ spawnProcess: () => ({ pid: undefined, unref: () => undefined, once: () => undefined }) }).launch(base)) !== '');
  check('Windows picks WMI and every other platform the detached spawn', detachedLauncher('win32').kind === 'wmi' && detachedLauncher('linux').kind === 'spawn' && detachedLauncher('darwin').kind === 'spawn');
}

// ── The detached runner ─────────────────────────────────────────────────────────────────────────────────────
{
  const dir = freshDir();

  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, RUN_FILES.job), JSON.stringify({ command: process.execPath, args: [CHILD, 'exit', '7'], cwd: SCRATCH, environment: { ...process.env, DETACH_PROOF_VARIABLE: 'reached-the-chain' }, tempDir: CHAIN_TEMP, chain: 'runner-proof', project: 'p', session: 's', tree: SCRATCH, waitSeconds: 30, pollMs: 100 }));

  const verdict = await runJob(dir);
  const written = readJson(path.join(dir, RUN_FILES.verdict));

  check('the runner returns and writes the verdict with the chain\'s exit code', verdict.exitCode === 7 && written.exitCode === 7, JSON.stringify(written));
  check('the verdict carries signal, start, end and command', written.signal === null && Date.parse(written.startedAt) <= Date.parse(written.endedAt) && written.command === [process.execPath, CHILD, 'exit', '7'].join(' '), JSON.stringify(written));
  check('the chain\'s output goes to output.log', readFileSync(path.join(dir, RUN_FILES.output), 'utf8').includes('child exiting with 7'));
  check('the job file, which carries the environment, is deleted once read', !existsSync(path.join(dir, RUN_FILES.job)));

  const envDir = freshDir();

  mkdirSync(envDir, { recursive: true });
  writeFileSync(path.join(envDir, RUN_FILES.job), JSON.stringify({ command: process.execPath, args: ['-e', 'process.stdout.write(String(process.env.DETACH_PROOF_VARIABLE))'], cwd: SCRATCH, environment: { ...process.env, DETACH_PROOF_VARIABLE: 'reached-the-chain' }, tempDir: CHAIN_TEMP, chain: 'runner-proof', project: 'p', session: 's', tree: SCRATCH, waitSeconds: 30, pollMs: 100 }));
  await runJob(envDir);
  check('the environment of the job reaches the chain', readFileSync(path.join(envDir, RUN_FILES.output), 'utf8').includes('reached-the-chain'));

  // The chain owns its TEMP: the session's private TEMP in the job is replaced, so the end-of-session sweep
  // (`session-processes/`) never sees the chain as the session's. @es La cadena es dueña de su TEMP: el TEMP privado
  // de la sesión que trae el trabajo se reemplaza, así el barrido de fin de sesión nunca ve la cadena como de la sesión.
  const tempDir = freshDir();
  const sessionTemp = path.join(SCRATCH, 'claude', 'session-tmp', 'session-under-sweep');

  mkdirSync(tempDir, { recursive: true });
  writeFileSync(path.join(tempDir, RUN_FILES.job), JSON.stringify({ command: process.execPath, args: ['-e', 'process.stdout.write([process.env.TEMP, process.env.TMP, process.env.TMPDIR, require("fs").existsSync(process.env.TEMP)].join("|"))'], cwd: SCRATCH, environment: { ...process.env, TEMP: sessionTemp, TMP: sessionTemp, TMPDIR: sessionTemp }, tempDir: CHAIN_TEMP, chain: 'runner-proof', project: 'p', session: 's', tree: SCRATCH, waitSeconds: 30, pollMs: 100 }));
  await runJob(tempDir);

  const ownTemp = CHAIN_TEMP;

  check('the chain runs with TEMP, TMP and TMPDIR of its own, never the session\'s', readFileSync(path.join(tempDir, RUN_FILES.output), 'utf8').includes([ownTemp, ownTemp, ownTemp, 'true'].join('|')), readFileSync(path.join(tempDir, RUN_FILES.output), 'utf8'));
  check('the chain\'s own TEMP folder is removed once the chain ended', !existsSync(ownTemp));
  // The chain TEMP the caller decides. @es El TEMP de cadena que decide quien llama.
  const realisticRunDir = 'C:\\Users\\adrian.jimenez\\.claude\\full-chain-lock\\state\\runs\\20261110-104750250--claude-integrate-integrate-mjs';
  const decided = chainTempDir(realisticRunDir);
  const decidedAt = (root) => chainTempDir(realisticRunDir, root);

  check('the chain TEMP is <shared temp root>/fcl/<8 hex>', path.relative(realTempRoot(), decided).split(path.sep).join('/').match(/^fcl\/[0-9a-f]{8}$/) !== null, decided);
  check('the chain TEMP is outside the run directory (a git repository) and outside any session-tmp folder', !decided.startsWith(realisticRunDir) && !decided.split(path.sep).includes('session-tmp') && !decided.includes('claude'.concat(path.sep, 'session-tmp')), decided);
  check('two run directories get two chain TEMP folders and one run directory always the same', chainTempDir(path.join(SCRATCH, 'a')) !== chainTempDir(path.join(SCRATCH, 'b')) && chainTempDir(path.join(SCRATCH, 'a')) === chainTempDir(path.join(SCRATCH, 'a')));
  check('the run directory name is kept out of the chain TEMP', !decided.includes('integrate') && !decided.includes('20261110'), decided);
  check(`the chain TEMP of a realistic run directory under a realistic user TEMP is at most ${String(CHAIN_TEMP_BUDGET)} characters (b100's integrate fixture adds ~110 to it and git fails past a 176-character staging budget)`, decidedAt('C:\\Users\\adrian.jimenez\\AppData\\Local\\Temp').length <= CHAIN_TEMP_BUDGET && CHAIN_TEMP_BUDGET === 70, decidedAt('C:\\Users\\adrian.jimenez\\AppData\\Local\\Temp'));
  check('chainEnvironment keeps every other variable and replaces the three', JSON.stringify(chainEnvironment({ A: '1', TEMP: 'x' }, '/t')) === '{"A":"1","TEMP":"/t","TMP":"/t","TMPDIR":"/t"}', JSON.stringify(chainEnvironment({ A: '1', TEMP: 'x' }, '/t')));

  const fakeDir = freshDir();
  const calls = [];
  const fakeJob = { command: 'cmd', args: ['a', 'b'], cwd: SCRATCH, environment: { ONLY_THIS: '1' }, tempDir: CHAIN_TEMP, chain: 'runner-proof', project: 'p', session: 's', tree: '/the/tree', waitSeconds: 30, pollMs: 100 };

  mkdirSync(fakeDir, { recursive: true });
  writeFileSync(path.join(fakeDir, RUN_FILES.job), JSON.stringify(fakeJob));

  const instants = [new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:09.000Z')];
  const faked = await runJob(fakeDir, {
    now: () => instants.shift(),
    spawnProcess: (...call) => {
      const child = new EventEmitter();

      calls.push(call);
      setImmediate(() => child.emit('close', null, 'SIGTERM'));

      return child;
    }
  });

  check('the chain is started as the normal locked run with every setting of the job', JSON.stringify(calls[0][1].slice(1)) === JSON.stringify(['--chain', 'runner-proof', '--project', 'p', '--session', 's', '--tree', '/the/tree', '--wait-seconds', '30', '--poll-ms', '100', '--', 'cmd', 'a', 'b']) && calls[0][1][0] === RUN && calls[0][0] === process.execPath, JSON.stringify(calls[0][1]));
  check('it runs in the job\'s directory with the job\'s environment, stdin closed and output on a file', calls[0][2].cwd === SCRATCH && JSON.stringify(calls[0][2].env) === JSON.stringify({ ONLY_THIS: '1', TEMP: CHAIN_TEMP, TMP: CHAIN_TEMP, TMPDIR: CHAIN_TEMP }) && calls[0][2].stdio[0] === 'ignore' && typeof calls[0][2].stdio[1] === 'number' && calls[0][2].stdio[1] === calls[0][2].stdio[2]);
  check('a chain ended by a signal is a verdict with the signal and no code', faked.exitCode === null && faked.signal === 'SIGTERM' && readJson(path.join(fakeDir, RUN_FILES.verdict)).signal === 'SIGTERM');
  check('the verdict carries the instants the clock gave, start first and end last', faked.startedAt === '2026-01-01T00:00:00.000Z' && faked.endedAt === '2026-01-01T00:00:09.000Z', JSON.stringify(faked));

  const brokenDir = freshDir();

  mkdirSync(brokenDir, { recursive: true });
  writeFileSync(path.join(brokenDir, RUN_FILES.job), JSON.stringify({ command: 'x', args: [], cwd: SCRATCH, environment: {}, tempDir: CHAIN_TEMP, chain: 'c', project: 'p', session: 's', tree: SCRATCH, waitSeconds: 1, pollMs: 100 }));

  const unstarted = await runJob(brokenDir, { spawnProcess: () => { throw new Error('cannot start here'); } });

  check('a runner that cannot start the chain writes a verdict with a null exit code and the error', unstarted.exitCode === null && readJson(path.join(brokenDir, RUN_FILES.verdict)).error.includes('cannot start here'), JSON.stringify(unstarted));

  const missing = freshDir();

  mkdirSync(missing, { recursive: true });

  const noJob = await runJob(missing);

  check('a run directory with no job file still ends in a verdict naming the problem', noJob.exitCode === null && typeof readJson(path.join(missing, RUN_FILES.verdict)).error === 'string');
}

// ── The command line: usage, detach, read ───────────────────────────────────────────────────────────────────
{
  const cli = (args) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8', windowsHide: true, env: ownedProfile });
  const usage = cli(['--run-dir', '/r', '--chain', 'c', '--', 'x']);
  const readUsage = cli(['--read']);

  const errorLines = (result) => result.stderr.split('\n').map((line) => line.trim());

  check('--run-dir without --detach exits 2 and says so in two languages', usage.status === 2 && isBilingual(usage.stderr), usage.stderr);
  check('the synopsis names --detach with its --run-dir', errorLines(usage).some((line) => line.startsWith('FULL-CHAIN LOCK usage') && line.includes('[--detach [--run-dir <dir>]]')), usage.stderr);
  check('--read with no directory exits 2 and prints the synopsis in two languages', readUsage.status === 2 && isBilingual(readUsage.stderr), readUsage.stderr);
  check('the synopsis has the --read line', errorLines(readUsage).some((line) => line.startsWith('node run.mjs --read <run dir>')), readUsage.stderr);

  const dir = freshDir();
  // The chain ends only when the proof writes this file, so "returned before the chain ended" is a condition, not a clock.
  // @es La cadena termina solo cuando la prueba escribe este fichero: «volvió antes de que terminara» es una condición, no un reloj.
  const releaseDir = freshDir();
  mkdirSync(releaseDir, { recursive: true });
  const release = path.join(releaseDir, 'release');
  const detach = cli(['--detach', '--run-dir', dir, '--chain', 'cli-proof', '--tree', SCRATCH, '--', process.execPath, CHILD, 'gate-exit', release, '5', '120000']);
  const pid = readJson(path.join(dir, RUN_FILES.run)).pid;
  const verdictBeforeRelease = existsSync(path.join(dir, RUN_FILES.verdict));

  spawned.add(pid);
  check('the command returns before the chain ends, exit 0', detach.status === 0 && !verdictBeforeRelease, `status ${String(detach.status)}, verdict before release ${String(verdictBeforeRelease)}\n${detach.stderr}`);
  check('it prints the run directory, the pid and the read command in two languages', detach.stdout.includes(dir) && detach.stdout.includes(String(pid)) && detach.stdout.includes('--read') && isBilingual(detach.stdout), detach.stdout);
  check('while the chain runs, --read says running', cli(['--read', dir]).status === EXIT.running);
  writeFileSync(release, '');
  check('the verdict appears with the chain\'s exit code', await until(() => existsSync(path.join(dir, RUN_FILES.verdict))) && readJson(path.join(dir, RUN_FILES.verdict)).exitCode === 5);
  check('--read then exits with the chain\'s code and says finished', (() => { const r = cli(['--read', dir]); return r.status === 5 && r.stdout.includes('exit 5'); })());
  check('the output of the chain is in output.log', readFileSync(path.join(dir, RUN_FILES.output), 'utf8').includes('gate-exit end'));

  const workDir = path.join(SCRATCH, 'caller-directory');

  mkdirSync(workDir, { recursive: true });

  const byDefault = spawnSync(process.execPath, [RUN, '--detach', '--chain', 'cli-default', '--tree', SCRATCH, '--', process.execPath, CHILD, 'cwd'], { encoding: 'utf8', windowsHide: true, cwd: workDir, env: ownedProfile });
  const printedDir = /Run directory: (.+)/.exec(byDefault.stdout)?.[1]?.trim() ?? '';

  spawned.add(readJson(path.join(printedDir, RUN_FILES.run)).pid);
  check('with no --run-dir the run directory is under the runs folder of the lock\'s state', printedDir !== '' && path.relative(path.join(stateDir('full-chain-lock'), 'runs'), printedDir).split(path.sep).length === 1 && !path.relative(path.join(stateDir('full-chain-lock'), 'runs'), printedDir).startsWith('..'), byDefault.stdout);
  check('the chain runs in the directory its caller was in', await until(() => existsSync(path.join(printedDir, RUN_FILES.verdict))) && readFileSync(path.join(printedDir, RUN_FILES.output), 'utf8').includes(`cwd ${workDir}`), printedDir);
}

// ── THE KILL: the caller's whole tree dies, the chain does not ──────────────────────────────────────────────
/** Starts the fixture caller, kills its tree once the run record exists, and waits for the verdict. @es Inicia al llamador de prueba, mata su árbol cuando existe el registro de la corrida y espera el veredicto. */
async function killedCaller(adapter, exitCode) {
  const dir = freshDir();
  const caller = spawn(process.execPath, [KILL_FIXTURE, adapter, dir, String(exitCode), '3000'], { stdio: 'ignore', detached: process.platform !== 'win32', windowsHide: true, env: ownedProfile });

  spawned.add(caller.pid);
  caller.once('error', () => undefined);

  const recorded = await until(() => existsSync(path.join(dir, RUN_FILES.run)));
  const detachedPid = readJson(path.join(dir, RUN_FILES.run)).pid;

  if (detachedPid !== undefined) spawned.add(detachedPid);

  await sleep(500);
  killTree(caller.pid);

  const verdict = await until(() => existsSync(path.join(dir, RUN_FILES.verdict)), 12_000);

  return { recorded, verdict, exitCode: readJson(path.join(dir, RUN_FILES.verdict)).exitCode, detachedPid };
}

{
  const real = await killedCaller('real', 9);

  check('the caller started the detached chain', real.recorded);
  check('after the caller\'s whole tree was killed, the verdict still appears with the chain\'s exit code', real.verdict && real.exitCode === 9, JSON.stringify(real));

  if (process.platform === 'win32') {
    const plain = await killedCaller('plain', 9);

    check('the same proof with a plain detached spawn is RED: the chain dies with its caller and no verdict appears', plain.recorded && !plain.verdict, JSON.stringify(plain));
  }
}

check('every message of the detach table is bilingual', ['detached', 'read-running', 'read-finished', 'read-lost', 'read-unstarted', 'detach-failed', 'run-dir-used', 'usage-read', 'usage-run-dir-without-detach'].every((id) => isBilingual(speak({ log: () => undefined, error: () => undefined }).line(id, Object.fromEntries(([].concat(MESSAGES[id].en).join('\n').split('{').slice(1)).map((part) => [part.split('}')[0], 'x']))))));

process.stdout.write(`\n${String(passed)} passed, ${String(failed)} failed\n`);
process.exit(failed === 0 ? 0 : 1);
