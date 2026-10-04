#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `process-control/kill-tree.mjs`. Every case runs on processes CONSTRUCTED by this
 * file (sleepers of 60 s that it kills itself at the end), never on a real process of the machine.
 *
 * THE STATE SPACE: a tree whose grandchild is a plain child and one whose grandchild broke away from the
 * job object (the shape that survives a plain `child.kill()` on Windows), a root that is already dead, a pid
 * that never existed, ids that must never be signalled (0, 1, negative, fractional, the caller's own), the
 * Windows branch (taskkill answering success, "not found", failure, absence), the POSIX branch (group kill,
 * fallback to the single process, already dead, no permission, other errors), the timeout runner (finishes
 * in time, exits non-zero, cannot start, times out, output before the timeout, the exit-to-close gap), and
 * the language of every printed line.
 *
 * The liveness oracle is `tasklist` on Windows and `kill(pid, 0)` elsewhere, and is itself proven first:
 * a check that cannot see a live process would pass every "is dead" assertion below.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `kill-tree.mjs`. Cada caso corre sobre procesos CONSTRUIDOS aquí (durmientes
 * de 60 s que este fichero mata al final), nunca sobre un proceso real de la máquina. Espacio de estados:
 * nieto normal y nieto que se salió del job object, raíz ya muerta, pid inexistente, ids que nunca deben
 * señalizarse, la rama Windows, la rama POSIX, el ejecutor con timeout y el idioma de cada línea impresa. El
 * oráculo de vida (`tasklist` o `kill(pid, 0)`) se prueba primero: uno que no ve un proceso vivo daría por
 * buenas todas las aserciones «está muerto».
 */

import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { killTree, MESSAGES, run, runWithTimeout } from './kill-tree.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(path.join(tmpdir(), 'kill-tree-selftest-'));
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const SLEEPER = 'setTimeout(() => {}, 60000)';
const toKill = [];

/**
 * Ends the run: removes what the cases started and reports. A throw inside a case is a FAILED check, never an
 * uncaught crash: a mutant that only makes the selftest crash would otherwise not be told from a missing check.
 * @es Termina la corrida. Un throw dentro de un caso es un check FALLIDO, nunca un crash sin capturar.
 */
function finish() {
  for (const pid of toKill) spawnSync(process.platform === 'win32' ? 'taskkill' : 'kill', process.platform === 'win32' ? ['/T', '/F', '/PID', String(pid)] : ['-9', String(pid)]);

  rmSync(scratch, { recursive: true, force: true });

  if (failures.length > 0) {
    console.error(`kill-tree selftest FAILED (${failures.length}/${passed + failures.length}):\n${failures.join('\n')}`);
    process.exit(1);
  }

  console.log(`kill-tree selftest: ${passed} checks passed`);
}

process.on('uncaughtException', (error) => {
  failures.push(`threw — ${error.message}`);
  finish();
});

/** Whether a process is alive, asked of the operating system. @es Si un proceso vive, preguntado al sistema operativo. */
function isAlive(pid) {
  if (process.platform === 'win32') return spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' }).stdout.includes(`"${pid}"`);

  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Polls until the pid is dead or the deadline passes; returns whether it died in time. @es Espera a que muera el pid. */
async function diesWithin(pid, milliseconds) {
  for (const deadline = Date.now() + milliseconds; Date.now() < deadline; await sleep(100)) if (!isAlive(pid)) return true;

  return !isAlive(pid);
}

/** A node process that spawns a grandchild sleeping 60 s, writes its pid to a file, and sleeps too. @es Un proceso node con un nieto durmiente de 60 s. */
function treeFixture(name, breakaway, grandchildStdio = 'ignore') {
  const pidFile = path.join(scratch, `${name}.pid`);
  const code = `const { spawn } = require('node:child_process');
const grandchild = spawn(process.execPath, ['-e', ${JSON.stringify(SLEEPER)}], { stdio: ${JSON.stringify(grandchildStdio)}, detached: ${breakaway} });
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid));
${breakaway ? 'grandchild.unref();' : ''}
${SLEEPER};`;

  return { args: ['-e', code], grandchildPid: () => (existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : undefined) };
}

/** A live sleeper the selftest owns. @es Un durmiente vivo que posee el selftest. */
function startSleeper() {
  const child = spawn(process.execPath, ['-e', SLEEPER], { stdio: 'ignore', detached: process.platform !== 'win32' });

  toKill.push(child.pid);

  return child;
}

// --- the oracle itself: it must see a live process and a dead one ---
const probe = startSleeper();

await sleep(300);
check('oracle: sees a live process', isAlive(probe.pid), true);
probe.kill();
check('oracle: sees a dead process', await diesWithin(probe.pid, 2000), true);

// --- H8-b: the timeout kills the child AND its grandchild, within 2 s, for both shapes ---
for (const [shape, breakaway] of [['plain grandchild', false], ['grandchild broken away from the job', true]]) {
  const fixture = treeFixture(breakaway ? 'away' : 'plain', breakaway);
  const started = Date.now();
  const result = await runWithTimeout({ command: process.execPath, args: fixture.args, timeoutMs: 3000 });
  const grandchild = fixture.grandchildPid();

  if (grandchild !== undefined) toKill.push(grandchild);

  check(`timeout (${shape}): the fixture started its grandchild before the timeout`, grandchild !== undefined, true);
  check(`timeout (${shape}): it reports the timeout`, result.timedOut, true);
  check(`timeout (${shape}): it returns long before the 60 s sleepers end`, Date.now() - started < 15_000, true);
  check(`timeout (${shape}): the child is dead within 2 s`, await diesWithin(result.pid, 2000), true);
  check(`timeout (${shape}): the grandchild is dead within 2 s`, grandchild !== undefined && (await diesWithin(grandchild, 2000)), true);
  check(`timeout (${shape}): the report says a tree was killed`, result.kill?.outcome, 'killed');
  check(`timeout (${shape}): the report names the child`, result.kill?.killed.includes(result.pid), true);
}

// --- a survivor that holds the output pipes open must not hold the runner: the streams are cut after the kill ---
const holder = treeFixture('holder', true, 'inherit');
const holderStarted = Date.now();
const heldOpen = await runWithTimeout({ command: process.execPath, args: holder.args, timeoutMs: 3000, kill: (pid) => process.kill(pid) });
const holderPid = holder.grandchildPid();

if (holderPid !== undefined) toKill.push(holderPid);

check('pipes held by a survivor: the runner still returns within seconds, not when the survivor ends', [heldOpen.timedOut, Date.now() - holderStarted < 20_000], [true, true]);

// --- the runner when nothing times out ---
const quick = await runWithTimeout({ command: process.execPath, args: ['-e', "process.stdout.write('out'); process.stderr.write('err')"], timeoutMs: 20_000 });

check('quick: no timeout', quick.timedOut, false);
check('quick: exit status 0', quick.status, 0);
check('quick: stdout and stderr captured', [quick.stdout, quick.stderr], ['out', 'err']);
check('quick: nobody was killed', quick.kill, undefined);

const failing = await runWithTimeout({ command: process.execPath, args: ['-e', 'process.exit(3)'], timeoutMs: 20_000 });

check('exit status: a non-zero status is passed through', [failing.status, failing.timedOut], [3, false]);

const placed = await runWithTimeout({ command: process.execPath, args: ['-e', 'process.stdout.write(process.cwd() + "|" + process.env.KT_MARK)'], timeoutMs: 20_000, cwd: scratch, env: { ...process.env, KT_MARK: 'seen' } });

check('cwd and env: the child runs where it was told, with the environment it was given', [realpathSync.native(placed.stdout.split('|')[0]) === realpathSync.native(scratch), placed.stdout.split('|')[1]], [true, 'seen']);

const unstartable = await runWithTimeout({ command: 'kill-tree-selftest-no-such-command', timeoutMs: 20_000 });

check('cannot start: no throw, the error is reported, nothing was killed', [unstartable.error?.code, unstartable.timedOut, unstartable.kill], ['ENOENT', false, undefined]);

const partial = await runWithTimeout({ command: process.execPath, args: ['-e', `process.stdout.write('before'); ${SLEEPER}`], timeoutMs: 2500 });

check('partial output: what the child printed before the timeout is kept', [partial.stdout, partial.timedOut], ['before', true]);

// --- the options handed to the child ---
for (const platform of ['win32', 'linux']) {
  let seen;
  const spy = (command, args, options) => {
    seen = options;

    return spawn(command, args, { ...options, detached: false });
  };

  await runWithTimeout({ command: process.execPath, args: ['-e', ''], timeoutMs: 20_000, platform, spawnProcess: spy });
  check(`options (${platform}): the child leads a process group only where groups are the kill unit`, seen?.detached, platform !== 'win32');
  check(`options (${platform}): no console window, stdin closed, output piped`, [seen?.windowsHide, seen?.stdio], [true, ['ignore', 'pipe', 'pipe']]);
}

// --- the exit-to-close gap: a process that already exited is never killed by a late timer ---
const gap = new EventEmitter();

gap.pid = 4242;
gap.stdout = new PassThrough();
gap.stderr = new PassThrough();

const killed = [];
const pending = runWithTimeout({ command: 'x', timeoutMs: 100, spawnProcess: () => gap, kill: (pid) => killed.push(pid) });

gap.emit('exit', 0, null);
await sleep(300);
gap.emit('close', 0, null);

const afterGap = await pending;

check('exit gap: a timer firing after the exit kills nothing', [killed, afterGap.timedOut], [[], false]);

// --- a fake child whose output arrives in pieces and which closes with a signal, never exiting first ---
const fake = new EventEmitter();

fake.pid = 4343;
fake.stdout = new PassThrough();
fake.stderr = new PassThrough();

const killedLater = [];
const closing = runWithTimeout({ command: 'x', timeoutMs: 100, spawnProcess: () => fake, kill: (pid) => killedLater.push(pid) });

fake.stdout.write(Buffer.from([0xc3]));
fake.stdout.write(Buffer.from([0xb1]));
fake.stderr.write('warn');
await sleep(20);
fake.emit('close', null, 'SIGKILL');

const closed = await closing;

await sleep(300);
check('close: a multi-byte character split across chunks is decoded whole', [closed.stdout, closed.stderr], ['ñ', 'warn']);
check('close: the status and the signal are both reported', [closed.status, closed.signal], [null, 'SIGKILL']);
check('close: a closed process is never killed by its timer, even without an exit event', killedLater, []);

// --- killTree: the already-dead and the never-existing ---
const dead = startSleeper();

await sleep(300);
dead.kill();
await diesWithin(dead.pid, 2000);

const afterDeath = killTree(dead.pid);

check('already dead: no throw, reported as already dead, nothing killed', [afterDeath.outcome, afterDeath.killed], ['already-dead', []]);
check('never existed: reported as already dead', killTree(2_147_483_000).outcome, 'already-dead');

// --- killTree: a live process is killed and reported ---
const live = startSleeper();

await sleep(300);

const liveReport = killTree(live.pid);

check('live: reported as killed with its pid', [liveReport.outcome, liveReport.killed.includes(live.pid)], ['killed', true]);
check('live: it is dead within 2 s', await diesWithin(live.pid, 2000), true);

// --- killTree: ids that are never signalled ---
const signals = [];
const taskkills = [];
const recorders = { signal: (target, name) => signals.push([target, name]), taskkill: (args) => (taskkills.push(args), { status: 0, stdout: '' }) };

for (const [label, pid] of [['zero', 0], ['one', 1], ['negative', -5], ['fractional', 12.5], ['a string', '123'], ['undefined', undefined], ['NaN', Number.NaN]]) {
  check(`refused (${label}): outcome refused, nothing signalled`, [killTree(pid, { ...recorders, ownPid: 99 }).outcome, signals.length + taskkills.length], ['refused', 0]);
}

check('refused (own pid): the caller is never killed', [killTree(99, { ...recorders, ownPid: 99 }).outcome, signals.length + taskkills.length], ['refused', 0]);

const askedItself = spawnSync(process.execPath, ['--input-type=module', '-e', `import { killTree } from ${JSON.stringify(pathToFileURL(path.join(here, 'kill-tree.mjs')).href)}; console.log(killTree(process.pid).outcome);`], { encoding: 'utf8' });

check('refused (own pid, real default): a process asked to kill itself survives and says refused', [askedItself.status, askedItself.stdout.trim()], [0, 'refused']);

const byDefaultSignal = startSleeper();

await sleep(300);
check('posix path with the real signal sender kills a live process', [killTree(byDefaultSignal.pid, { platform: 'linux' }).outcome, await diesWithin(byDefaultSignal.pid, 2000)], ['killed', true]);
check('accepted (pid 2): the smallest killable id passes the refusal', killTree(2, { ...recorders, ownPid: 99, platform: 'linux' }).outcome, 'killed');

// --- killTree: the Windows branch ---
const win = (status, extra = {}) => ({ platform: 'win32', ownPid: 99, taskkill: (args) => (taskkills.push(args), { status, ...extra }) });

taskkills.length = 0;
check('win32: success is killed, listing the pid of each line, not the parent it cites', killTree(500, win(0, { stdout: 'SUCCESS: The process with PID 700 (child process of PID 500) has been terminated.\r\nCorrecto: se terminó el proceso con PID 500 (proceso secundario de PID 99).\r\n' })).killed, [700, 500]);
check('win32: taskkill is asked for the whole tree, forced, by pid', taskkills.at(-1), ['/T', '/F', '/PID', '500']);
check('win32: success with unreadable output still names the root', killTree(500, win(0, { stdout: '' })).killed, [500]);
check('win32: status 128 is already dead', killTree(500, win(128)).outcome, 'already-dead');
check('win32: any other status is a failure with its first line', [killTree(500, win(1, { stderr: 'ERROR: denied\r\nsecond' })).outcome, killTree(500, win(1, { stderr: 'ERROR: denied\r\nsecond' })).detail], ['failed', 'ERROR: denied']);
const missing = killTree(500, { ...win(0), taskkill: () => ({ status: null, error: new Error('spawn taskkill ENOENT') }) });

check('win32: taskkill missing is a failure with its error, not a throw', [missing.outcome, missing.detail], ['failed', 'spawn taskkill ENOENT']);
check('win32: a failure with only stdout falls back to its first line', killTree(500, win(1, { stdout: 'only on stdout\r\nmore' })).detail, 'only on stdout');
check('win32: a failure with no text at all has an empty detail, not a throw', killTree(500, win(1)).detail, '');
check('win32: a failure lists nothing as killed', killTree(500, win(1, { stderr: 'x' })).killed, []);

// --- killTree: the POSIX branch ---
const posix = (signal) => ({ platform: 'linux', ownPid: 99, signal });
const calls = [];
const recording = (behaviour) => (target, name) => {
  calls.push([target, name]);

  return behaviour(target);
};
const gone = Object.assign(new Error('no such process'), { code: 'ESRCH' });
const denied = Object.assign(new Error('not permitted'), { code: 'EPERM' });

const groupKill = killTree(500, posix(recording(() => undefined)));

check('posix: the group is signalled first, with SIGKILL', [groupKill.outcome, calls[0]], ['killed', [-500, 'SIGKILL']]);
check('posix: the pid is listed as killed', groupKill.killed, [500]);
calls.length = 0;
check('posix: a missing group falls back to the single process', [killTree(500, posix(recording((target) => { if (target < 0) throw gone; }))).outcome, calls], ['killed', [[-500, 'SIGKILL'], [500, 'SIGKILL']]]);
calls.length = 0;
check('posix: neither group nor process is already dead, and nothing is listed as killed', [killTree(500, posix(recording(() => { throw gone; }))).outcome, calls.length, killTree(500, posix(() => { throw gone; })).killed], ['already-dead', 2, []]);
calls.length = 0;
check('posix: no permission is a failure, not "already dead", and stops at once', [killTree(500, posix(recording(() => { throw denied; }))).outcome, calls.length], ['failed', 1]);
check('posix: another error is a failure with its message', [killTree(500, posix(() => { throw new Error('boom'); })).outcome, killTree(500, posix(() => { throw new Error('boom'); })).detail], ['failed', 'boom']);

// --- language: every printed line carries its Spanish half ---
const printed = [];
const surviving = startSleeper();

await sleep(300);

const cli = (argv, deps) => {
  const lines = [];
  const exit = run(argv, (line) => lines.push(line), deps);

  printed.push(...lines);

  return { lines, exit };
};
const killedByCli = cli([String(surviving.pid)]);
const deadByCli = cli(['2147483000']);
const refusedByCli = cli(['abc']);
const noArguments = cli([]);

// The ids below are decimal-looking or hex-looking forms of numbers no machine has as a pid, so a mutant that
// accepts them cannot signal a real process. @es Ids que ninguna máquina tiene como pid: aceptarlos no mata nada real.
const hexByCli = cli(['0x7FFFFFF0']);
const exponentByCli = cli(['2e9']);
const suffixedByCli = cli(['2147483000abc']);
const twoArguments = cli(['1', '2']);
const withTwoPids = cli(['500'], { platform: 'win32', ownPid: 99, taskkill: () => ({ status: 0, stdout: 'SUCCESS: The process with PID 700 (child process of PID 500) has been terminated.\nSUCCESS: The process with PID 500 (child process of PID 99) has been terminated.\n' }) });
const failedByCli = cli(['500'], { platform: 'linux', ownPid: 99, signal: () => { throw denied; } });

check('cli: killing a live process exits 0 and says so', [killedByCli.exit, killedByCli.lines.length], [0, 1]);
check('cli: an already dead pid exits 0 with its own line', [deadByCli.exit, deadByCli.lines[0].startsWith(`Process 2147483000 was already dead`)], [0, true]);
check('cli: a refused id exits 2', refusedByCli.exit, 2);
check('cli: only a plain decimal is an id (hex, exponent and a numeric prefix are refused, the original text is printed)', [hexByCli.exit, exponentByCli.exit, suffixedByCli.exit, hexByCli.lines[0].includes('0x7FFFFFF0'), hexByCli.lines[0].startsWith('REFUSED')], [2, 2, 2, true, true]);
check('cli: two arguments exit 2 with the usage', [twoArguments.exit, twoArguments.lines[0].startsWith('Usage:')], [2, true]);
check('cli: no arguments exits 2 with the usage', [noArguments.exit, noArguments.lines[0].startsWith('Usage:')], [2, true]);
check('cli: the killed line names the pid and the count', [killedByCli.lines[0].includes(String(surviving.pid)), killedByCli.lines[0].includes('1 processes')], [true, true]);
check('cli: the killed line lists every pid, comma separated', [withTwoPids.exit, withTwoPids.lines[0].includes('2 processes: 700, 500')], [0, true]);
check('cli: a failed kill exits 1 and says why', [failedByCli.exit, failedByCli.lines[0].startsWith('FAILED'), failedByCli.lines[0].includes('not permitted')], [1, true, true]);

const launched = spawnSync(process.execPath, [path.join(here, 'kill-tree.mjs'), '2147483000'], { encoding: 'utf8' });
const launchedRefused = spawnSync(process.execPath, [path.join(here, 'kill-tree.mjs'), 'abc'], { encoding: 'utf8' });

check('cli: launched as a program it exits with the run status and prints', [launched.status, launched.stdout.trim().length > 0, launchedRefused.status], [0, true, 2]);
check('language: something was printed on every path', printed.length >= 9, true);
check('language: every printed line has its @es half', printed.filter((line) => !line.includes(' @es ')), []);
check('language: every message of the table has both halves', Object.entries(MESSAGES).filter(([, { en, es }]) => !en || !es).map(([id]) => id), []);
check('language: the Spanish halves keep their accents', [MESSAGES.killed.es.includes('terminó'), MESSAGES.refused.es.includes('válido'), MESSAGES.usage.es.includes('Uso')], [true, true, true]);

finish();
