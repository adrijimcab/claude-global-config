#!/usr/bin/env node
/**
 * Self-test for the full-chain runner (`run.mjs` and the domain, ports and adapters behind it). Real child
 * processes, real files; the shared state is redirected to a private directory first, so no live lock is touched.
 *
 * THE STATE SPACE, enumerated from the decisions:
 *   - EXIT CODE: the command's own is propagated exactly (0, 1, 7); a signal ends as `128 + number` (proved on
 *     the adapter with a fake process, because a Windows process cannot end by SIGTERM: a real one ends with 1);
 *     the runner's own codes are 2 usage, 70 fault, 75 wait expired, 127 not started.
 *   - CONTENTION: a second runner waits while the first holds, announces the holder bilingually, and runs only
 *     after the first ended; when its bounded wait expires it exits 75 and its command never ran.
 *   - RELEASE: the lock and the holder record are gone after success, after a non-zero exit, after a command that
 *     cannot start, and after a child port that throws.
 *   - STALE: a dead holder with an old lock is broken through the port; a dead holder with a FRESH lock is not;
 *     a LIVE holder with a lock older than the port's default ceiling is not broken (the adapter's ceiling).
 *   - NEVER UNLOCKED: a fault of the lock exits 70 and the command does not run.
 *   - THE HOLDER RECORD: session, project, chain, measured tree, pid, start time, command, readable while the chain
 *     runs; the session defaults to the harness's CLAUDE_CODE_SESSION_ID and the tree to the git top level of the cwd.
 *   - ARGUMENTS and LAUNCH: every usage problem; a Windows `.cmd` launcher is started through `cmd.exe` with
 *     quoted arguments, and an argument it cannot carry is refused; on Windows a real `.cmd` shim runs.
 *
 * @es Auto-test del runner de cadenas completas, con procesos hijos y ficheros reales y el estado compartido
 * redirigido a un directorio privado. Estados: CÓDIGO DE SALIDA (exacto; señal como 128+n; códigos propios),
 * CONTIENDA (el segundo espera, anuncia al dueño en dos idiomas y corre después; si caduca sale con 75 sin
 * ejecutar), SOLTAR (tras éxito, error, comando que no arranca y puerto hijo que lanza), CADUCADO (dueño muerto con
 * lock viejo se rompe; con lock fresco no; dueño vivo con lock más viejo que el techo por defecto no), NUNCA SIN
 * LOCK (un fallo sale con 70), REGISTRO DEL DUEÑO, ARGUMENTOS y ARRANQUE.
 */

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { LockFault } from '../hook-state/file-lock.mjs';
import { isolateState, stateDir } from '../hook-state/locations.mjs';
import { CommandNotStarted, DEFAULT_POLL_MS, DEFAULT_WAIT_SECONDS, EXIT, runChain } from './chain-runner.mjs';
import { childProcessAdapter } from './child-process-adapter.mjs';
import { parseArguments } from './cli-arguments.mjs';
import { fileLockAdapter } from './file-lock-adapter.mjs';
import { launchPlan } from './launch-plan.mjs';
import { LOCK_TOKEN_VARIABLE, tokenHoldsLock } from './lock-token.mjs';
import { measuredTree } from './measured-tree.mjs';
import { MESSAGES, speak } from './messages.mjs';
import { failureCode } from './run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.mjs');
const CHILD = path.join(HERE, 'chain-child.fixture.mjs');

isolateState('full-chain-lock');

const STATE = stateDir('full-chain-lock');
const LOCK = path.join(STATE, 'chain.lock');
const HOLDER = path.join(STATE, 'holder.json');
const SCRATCH = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'fcl-selftest-')));

process.on('exit', () => rmSync(SCRATCH, { recursive: true, force: true }));

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

/** Starts the runner as a real process. Resolves `{ code, stdout, stderr }`; `.child` is the process. @es Lanza el runner como proceso real. */
function startRunner(args, env = {}) {
  const child = spawn(process.execPath, [RUN, ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));

  const done = new Promise((resolve) => child.once('close', (code) => resolve({ code, stdout, stderr })));

  done.child = child;

  return done;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until `predicate()` holds, up to `ms`. @es Espera a que `predicate()` se cumpla, hasta `ms`. */
async function until(predicate, ms = 8000) {
  const end = Date.now() + ms;

  while (!predicate() && Date.now() < end) await sleep(25);

  return predicate();
}

const lines = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line !== '') : []);
const stamp = (log, entry) => Number(lines(log).find((line) => line.startsWith(entry))?.split(' ')[2]);
const holdArgs = (log, label, holdMs) => [CHILD, 'hold', log, label, String(holdMs)];
/** A JSON file read safely: its value, or `{}` when it is missing or not JSON, so a missing record fails a check instead of crashing. @es Un JSON leído sin riesgo: su valor, o `{}` si falta o no es JSON. */
function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

const lockFree = () => !existsSync(LOCK) && !existsSync(HOLDER);

/** Removes everything the lock left in the shared state. @es Quita todo lo que el lock dejó en el estado compartido. */
function clearState() {
  rmSync(STATE, { recursive: true, force: true });
}

/** A pid that no process holds: a child that ended. @es Un pid que ningún proceso tiene: el de un hijo que terminó. */
function deadPid() {
  return spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid;
}

/** Writes a lock held by `pid`, `ageMinutes` old. @es Escribe un lock de `pid` con `ageMinutes` de antigüedad. */
function plantLock(pid, ageMinutes) {
  mkdirSync(STATE, { recursive: true });
  writeFileSync(LOCK, `${String(pid)}:planted`);
  writeFileSync(HOLDER, JSON.stringify({ session: 'old', project: 'old-project', chain: 'old-chain', pid, startedAt: '2026-01-01T00:00:00.000Z', command: 'old' }));

  const then = new Date(Date.now() - ageMinutes * 60_000);

  utimesSync(LOCK, then, then);
}

const bilingual = (text) => text.includes(' @es ') || text.includes('@es ');

/** A fake child process whose `close` event carries `(code, signal)`. @es Un proceso hijo falso cuyo `close` lleva `(code, signal)`. */
function fakeSpawn(code, signal) {
  return () => {
    const fake = new EventEmitter();

    fake.kill = () => undefined;
    setImmediate(() => fake.emit('close', code, signal));

    return fake;
  };
}

// ── The premise: the message table is bilingual ─────────────────────────────────────────────────────────────
check('the message table is bilingual', messageProblems(MESSAGES).length === 0, messageProblems(MESSAGES).join('; '));

// ── Exit codes ──────────────────────────────────────────────────────────────────────────────────────────────
for (const wanted of [0, 1, 7]) {
  clearState();

  const result = await startRunner(['--chain', 'code', '--', process.execPath, CHILD, 'exit', String(wanted)]);

  check(`the command's exit code ${String(wanted)} is propagated exactly`, result.code === wanted, `got ${String(result.code)}`);
  check(`the command's output reaches the terminal (${String(wanted)})`, result.stdout.includes(`child exiting with ${String(wanted)}`), result.stdout);
  check(`the lock is released after exit ${String(wanted)}`, lockFree());
}

clearState();

const killed = await startRunner(['--chain', 'sig', '--', process.execPath, CHILD, 'signal']);

check('a command ending by SIGTERM ends the run with the code the platform reports, and releases', killed.code === (process.platform === 'win32' ? 1 : 143) && lockFree(), `got ${String(killed.code)}`);
check('a child ended by a signal resolves 128 + the signal number', (await childProcessAdapter({ spawnProcess: fakeSpawn(null, 'SIGTERM') }).run(process.execPath, [])) === 143);
check('a child ended by SIGINT resolves 130', (await childProcessAdapter({ spawnProcess: fakeSpawn(null, 'SIGINT') }).run(process.execPath, [])) === 130);
check('a child that ends with code 5 resolves 5', (await childProcessAdapter({ spawnProcess: fakeSpawn(5, null) }).run(process.execPath, [])) === 5);

// ── Contention: the second waits and then runs ──────────────────────────────────────────────────────────────
{
  clearState();

  const log = path.join(SCRATCH, 'contention.log');
  const first = startRunner(['--chain', 'chain-a', '--project', 'proj-a', '--session', 'sess-a', '--', process.execPath, ...holdArgs(log, 'A', 1500)]);

  await until(() => existsSync(HOLDER));

  const holder = readJson(HOLDER);

  check('the holder record names session, project and chain', holder.session === 'sess-a' && holder.project === 'proj-a' && holder.chain === 'chain-a', JSON.stringify(holder));
  check('the holder record names the runner pid, the start time and the command', holder.pid === first.child.pid && !Number.isNaN(Date.parse(holder.startedAt)) && holder.command.includes('chain-child.fixture.mjs'), JSON.stringify(holder));

  const second = await startRunner(['--chain', 'chain-b', '--project', 'proj-b', '--session', 'sess-b', '--poll-ms', '100', '--', process.execPath, ...holdArgs(log, 'B', 200)]);
  const firstResult = await first;

  check('both contenders exit 0', firstResult.code === 0 && second.code === 0, `${String(firstResult.code)} ${String(second.code)}`);
  check('the second command started only after the first ended', stamp(log, 'B start') >= stamp(log, 'A end') && stamp(log, 'A end') > stamp(log, 'A start'), lines(log).join(' | '));
  check('the waiting runner prints the holder chain, project, session and pid', ['chain-a', 'proj-a', 'sess-a', String(first.child.pid)].every((part) => second.stderr.includes(part)), second.stderr);
  check('the waiting message is bilingual, English first', bilingual(second.stderr) && second.stderr.indexOf('FULL-CHAIN LOCK: waiting') < second.stderr.indexOf('@es'), second.stderr);
  check('the holder is announced once, not at every poll', second.stderr.split('FULL-CHAIN LOCK: waiting').length === 2, second.stderr);
  check('the lock is released after the second chain', lockFree());
}

// ── The wait expires ────────────────────────────────────────────────────────────────────────────────────────
{
  clearState();

  const log = path.join(SCRATCH, 'expiry.log');
  const first = startRunner(['--chain', 'long-chain', '--', process.execPath, ...holdArgs(log, 'A', 2500)]);

  await until(() => existsSync(HOLDER));

  const started = Date.now();
  const second = await startRunner(['--chain', 'late-chain', '--wait-seconds', '0.4', '--poll-ms', '100', '--', process.execPath, ...holdArgs(log, 'B', 10)]);

  check('an expired wait exits 75', second.code === EXIT.waitExpired, `got ${String(second.code)}`);
  check('the wait is bounded by --wait-seconds', Date.now() - started < 2200, `${String(Date.now() - started)} ms`);
  check('the expiry message is bilingual and names the holder and that nothing ran', bilingual(second.stderr) && second.stderr.includes('gave up after 0.4s') && second.stderr.includes('long-chain') && second.stderr.includes('did NOT run'), second.stderr);
  check('the command of the expired chain never ran', !lines(log).some((line) => line.startsWith('B ')));
  check('the expired chain did not take the first one\'s lock away', existsSync(LOCK));

  const firstResult = await first;

  check('the holder finished normally and released', firstResult.code === 0 && lockFree());
}

// ── An unreadable holder record while waiting ───────────────────────────────────────────────────────────────
{
  clearState();
  mkdirSync(STATE, { recursive: true });
  writeFileSync(LOCK, `${String(process.pid)}:planted`);

  const result = await startRunner(['--chain', 'x', '--wait-seconds', '0.3', '--poll-ms', '100', '--', process.execPath, CHILD, 'exit', '0']);

  check('a held lock with no readable record still waits, then expires with 75', result.code === EXIT.waitExpired, `got ${String(result.code)}`);
  check('that case says the record is not readable, in both languages', result.stderr.includes('its record is not readable yet') && result.stderr.includes('su registro aún no se puede leer'), result.stderr);
}

// ── Stale holders ───────────────────────────────────────────────────────────────────────────────────────────
{
  clearState();
  plantLock(deadPid(), 5);

  const log = path.join(SCRATCH, 'stale.log');
  const result = await startRunner(['--chain', 'after-dead', '--poll-ms', '100', '--', process.execPath, ...holdArgs(log, 'S', 10)]);

  check('a dead holder with an old lock is broken and the chain runs', result.code === 0 && lines(log).length === 2, `${String(result.code)} ${result.stderr}`);
  check('the break is journaled by the port with its reason', existsSync(`${LOCK}.breaks.jsonl`) && readFileSync(`${LOCK}.breaks.jsonl`, 'utf8').includes('dead-owner'));
  check('the lock is released after a broken-stale run', lockFree());
}

{
  clearState();
  plantLock(deadPid(), 0);

  const result = await startRunner(['--chain', 'too-soon', '--wait-seconds', '0.3', '--poll-ms', '100', '--', process.execPath, CHILD, 'exit', '0']);

  check('a dead holder with a FRESH lock is not broken (the port\'s stale age decides)', result.code === EXIT.waitExpired, `got ${String(result.code)}`);
}

{
  clearState();
  plantLock(process.pid, 30);

  const result = await startRunner(['--chain', 'respect-live', '--wait-seconds', '0.3', '--poll-ms', '100', '--', process.execPath, CHILD, 'exit', '0']);

  check('a LIVE holder is not broken at 30 minutes: a full chain may run longer than the port\'s default ceiling', result.code === EXIT.waitExpired && existsSync(LOCK), `got ${String(result.code)}`);
}

// ── Never unlocked ──────────────────────────────────────────────────────────────────────────────────────────
{
  clearState();
  mkdirSync(LOCK, { recursive: true });

  const log = path.join(SCRATCH, 'fault.log');
  const result = await startRunner(['--chain', 'faulty', '--', process.execPath, ...holdArgs(log, 'F', 10)]);

  check('a lock fault exits 70', result.code === EXIT.lockFault, `got ${String(result.code)}`);
  check('the command does not run when the lock cannot be taken', lines(log).length === 0);
  check('the fault message is bilingual and says it is a fault', bilingual(result.stderr) && result.stderr.includes('a fault, not because another chain holds it'), result.stderr);
}

// ── A command that cannot start ─────────────────────────────────────────────────────────────────────────────
{
  clearState();

  const result = await startRunner(['--chain', 'ghost', '--', 'no-such-program-for-the-full-chain-lock']);

  check('a command that cannot be started exits 127', result.code === EXIT.notStarted, `got ${String(result.code)}`);
  check('that failure is bilingual and says the lock was released', bilingual(result.stderr) && result.stderr.includes('The lock was released'), result.stderr);
  check('the lock is released after a command that cannot start', lockFree());
}

// ── The domain with ports: the child throws, the release fails ──────────────────────────────────────────────
const silent = { say: () => undefined, complain: () => undefined, line: () => '' };

{
  clearState();

  const lock = fileLockAdapter(STATE);
  const request = { chain: 'domain', project: 'p', session: 's', tree: '/measured/tree', command: 'c', args: ['a'], waitMs: 200, pollMs: 50 };
  const ports = (child) => ({ lock, child, clock: { now: () => Date.now(), sleep }, say: silent, processId: process.pid });
  let thrown;
  let recorded;

  await runChain(request, ports({ run: () => { recorded = lock.readHolder(); return Promise.resolve(0); } }));
  check('the holder record carries the measured tree of the request', recorded?.tree === '/measured/tree', JSON.stringify(recorded));

  try {
    await runChain(request, ports({ run: () => Promise.reject(new Error('boom')) }));
  } catch (error) {
    thrown = error;
  }

  check('a child port that throws propagates its own error', thrown?.message === 'boom', String(thrown));
  check('the lock and the holder record are released when the child throws', lockFree());

  let ran = 0;
  const code = await runChain(request, ports({ run: () => { ran += 1; return Promise.resolve(3); } }));

  check('the same lock is taken again after a throw, and the code is the command\'s', code === 3 && ran === 1);

  const notStarted = await runChain(request, ports({ run: () => Promise.reject(new CommandNotStarted('spawn-failed', { code: 'ENOENT', detail: 'x' })) }));

  check('CommandNotStarted ends the run with 127 and releases', notStarted === EXIT.notStarted && lockFree());
}

{
  const told = [];
  const say = { say: () => undefined, complain: (id, params) => told.push([id, params]), line: () => '' };
  let released = 0;
  const lock = { tryTake: () => true, readHolder: () => undefined, readToken: () => 'token', release: () => { released += 1; throw new Error('cannot remove'); } };
  const code = await runChain({ chain: 'c', project: 'p', session: 's', command: 'c', args: [], waitMs: 100, pollMs: 10 }, { lock, child: { run: () => Promise.resolve(9) }, clock: { now: () => 0, sleep }, say, processId: 1 }).catch(() => 'threw');

  check('a release that fails never changes the command\'s exit code', code === 9);
  check('a release that fails is reported with its id', told.some(([id, params]) => id === 'release-failed' && params.detail === 'cannot remove') && released === 1);
}

{
  const told = [];
  const say = { say: () => undefined, complain: (id) => told.push(id), line: () => '' };
  let ran = 0;
  const lock = { tryTake: () => { throw new LockFault('lock exploded'); }, readHolder: () => undefined, release: () => undefined };
  const code = await runChain({ chain: 'c', project: 'p', session: 's', command: 'c', args: [], waitMs: 100, pollMs: 10 }, { lock, child: { run: () => { ran += 1; return Promise.resolve(0); } }, clock: { now: () => 0, sleep }, say, processId: 1 });

  check('a lock fault at take time exits 70 without running the command', code === EXIT.lockFault && ran === 0 && told.includes('lock-fault'));
}

{
  const told = [];
  const say = { say: () => undefined, complain: (id, params) => told.push([id, params.holderPid ?? params.waitSeconds]), line: () => '' };
  const sleeps = [];
  let now = 0;
  let takes = 0;
  let holder = { chain: 'a', project: 'p', session: 's', pid: 1, startedAt: 't' };
  const lock = {
    tryTake: () => { takes += 1; return takes === 6; },
    readHolder: () => { if (takes === 4) holder = { ...holder, pid: 2 }; return holder; },
    readToken: () => 'token',
    release: () => undefined
  };
  const clock = { now: () => now, sleep: (ms) => { sleeps.push(ms); now += ms; return Promise.resolve(); } };

  await runChain({ chain: 'c', project: 'p', session: 's', command: 'c', args: [], waitMs: 5000, pollMs: 300 }, { lock, child: { run: () => Promise.resolve(0) }, clock, say, processId: 1 });

  check('a changed holder is announced again, an unchanged one is not', told.filter(([id]) => id === 'waiting').map(([, pid]) => pid).join(',') === '1,2', JSON.stringify(told));
  check('the poll pause is the poll interval', sleeps.every((ms) => ms === 300), sleeps.join(','));
}

{
  const told = [];
  const say = { say: () => undefined, complain: (id) => told.push(id), line: () => '' };
  let takes = 0;
  const lock = { tryTake: () => { takes += 1; return takes === 4; }, readHolder: () => (takes === 1 ? undefined : { chain: 'a', project: 'p', session: 's', pid: 1, startedAt: 't' }), readToken: () => 'token', release: () => undefined };

  await runChain({ chain: 'c', project: 'p', session: 's', command: 'c', args: [], waitMs: 5000, pollMs: 10 }, { lock, child: { run: () => Promise.resolve(0) }, clock: { now: () => 0, sleep }, say, processId: 1 });

  check('a record missing only at the first look is not announced as unreadable', told.join() === 'waiting', told.join());

  const stillTold = [];
  let looks = 0;
  const missing = { tryTake: () => { looks += 1; return looks === 4; }, readHolder: () => undefined, readToken: () => 'token', release: () => undefined };

  await runChain({ chain: 'c', project: 'p', session: 's', command: 'c', args: [], waitMs: 5000, pollMs: 10 }, { lock: missing, child: { run: () => Promise.resolve(0) }, clock: { now: () => 0, sleep }, say: { ...say, complain: (id) => stillTold.push(id) }, processId: 1 }).catch((error) => stillTold.push(`threw ${error.name}`));

  check('a record still missing at the second look is announced once as unreadable', stillTold.join() === 'waiting-unreadable', stillTold.join());
}

{
  let now = 0;
  let ran = 0;
  const sleeps = [];
  const told = [];
  const say = { say: () => undefined, complain: (id) => told.push(id), line: () => '' };
  const lock = { tryTake: () => false, readHolder: () => ({ chain: 'a', project: 'p', session: 's', pid: 1, startedAt: 't' }), release: () => { throw new Error('release of a lock never taken'); } };
  const code = await runChain({ chain: 'c', project: 'p', session: 's', command: 'c', args: [], waitMs: 250, pollMs: 100 }, { lock, child: { run: () => { ran += 1; return Promise.resolve(0); } }, clock: { now: () => now, sleep: (ms) => { sleeps.push(ms); now += ms; return Promise.resolve(); } }, say, processId: 1 });

  check('the command never runs when the lock is never taken', ran === 0);
  check('the last pause is shortened to the time left, then the wait expires', code === EXIT.waitExpired && sleeps.join(',') === '100,100,50', sleeps.join(','));
  check('a chain that never took the lock never releases one', !told.includes('release-failed'));
}

// ── Arguments ───────────────────────────────────────────────────────────────────────────────────────────────
{
  const defaults = { cwd: '/the/cwd', cwdName: 'cwd-name', sessionFromEnvironment: undefined };
  const problemOf = (argv) => parseArguments(argv, defaults).problem?.id;
  const ok = parseArguments(['--chain', 'c', '--', 'npm', 'run', 'x'], defaults).request;

  check('the command after -- is split into program and arguments', ok.command === 'npm' && ok.args.join(' ') === 'run x');
  check('the defaults are the cwd name, an unknown session and the bounded wait', ok.project === 'cwd-name' && ok.session === 'unknown' && ok.waitMs === DEFAULT_WAIT_SECONDS * 1000 && ok.pollMs === DEFAULT_POLL_MS);
  check('the session falls back to the environment', parseArguments(['--chain', 'c', '--', 'x'], { cwd: '/c', cwdName: 'n', sessionFromEnvironment: 'env-session' }).request.session === 'env-session');
  check('the measured tree defaults to the cwd', ok.tree === '/the/cwd', String(ok.tree));
  check('--tree names the measured tree', parseArguments(['--chain', 'c', '--tree', '/other/tree', '--', 'x'], defaults).request?.tree === '/other/tree');

  const flags = parseArguments(['--chain', 'c', '--project', 'p', '--session', 's', '--wait-seconds', '2.5', '--poll-ms', '40', '--', 'x', '--chain', 'inner'], defaults).request;

  check('every flag is read, and flags after -- belong to the command', flags.project === 'p' && flags.session === 's' && flags.waitMs === 2500 && flags.pollMs === 40 && flags.args.join(' ') === '--chain inner');
  check('only the FIRST -- separates: a later -- belongs to the command', parseArguments(['--chain', 'c', '--', 'x', '--', 'y'], defaults).request?.args.join(' ') === '-- y');
  check('no separator is a usage problem', problemOf(['--chain', 'c']) === 'usage-no-separator');
  check('an unknown flag is a usage problem', problemOf(['--bogus', '1', '--', 'x']) === 'usage-unknown-flag');
  check('a flag with no value is a usage problem', problemOf(['--chain', '--', 'x']) === 'usage-missing-value');
  check('a trailing flag with no value is a usage problem', problemOf(['--chain', 'c', '--project', '--', 'x']) === 'usage-missing-value');
  check('a non-positive or non-numeric wait is a usage problem', problemOf(['--chain', 'c', '--wait-seconds', '0', '--', 'x']) === 'usage-bad-number' && problemOf(['--chain', 'c', '--poll-ms', 'abc', '--', 'x']) === 'usage-bad-number');
  check('a missing or blank chain is a usage problem', problemOf(['--', 'x']) === 'usage-no-chain' && problemOf(['--chain', ' ', '--', 'x']) === 'usage-no-chain');
  check('an empty command is a usage problem', problemOf(['--chain', 'c', '--']) === 'usage-no-command' && problemOf(['--chain', 'c', '--', '']) === 'usage-no-command');

  const usage = await startRunner(['--chain', 'c']);

  check('the runner exits 2 on a usage problem, with a bilingual message and the synopsis', usage.code === EXIT.usage && bilingual(usage.stderr) && usage.stderr.includes('USO DEL LOCK'), usage.stderr);
  check('a usage problem takes no lock', lockFree());
}

// ── How a command is started ────────────────────────────────────────────────────────────────────────────────
{
  const exists = (file) => ['c:\\tools\\npm.cmd', 'c:\\tools\\node.exe'].includes(file.toLowerCase());
  const env = { PATH: 'C:\\nowhere;C:\\tools', PATHEXT: '.com;.exe;.bat;.cmd', ComSpec: 'C:\\Windows\\System32\\cmd.exe' };
  const win = (command, args) => launchPlan(command, args, { platform: 'win32', env, exists });
  const posix = launchPlan('npm', ['run', 'x'], { platform: 'linux' });
  const cmd = win('npm', ['run', 'build:ci-pr', 'two words', 'a=b']);
  const exe = win('node', ['x.mjs']);
  const refused = (argument) => { try { win('npm', [argument]); return false; } catch (error) { return error instanceof CommandNotStarted && error.messageId === 'unsafe-argument' && error.params.argument === argument; } };

  check('on POSIX the command and its arguments go through as an array, with no shell', posix.file === 'npm' && posix.args.join(' ') === 'run x' && posix.options.shell === false);
  check('on Windows a .cmd launcher found on PATH is started through cmd.exe', cmd.file === 'C:\\Windows\\System32\\cmd.exe' && cmd.args.slice(0, 3).join(' ') === '/d /s /c' && cmd.options.windowsVerbatimArguments === true);
  check('the .cmd line quotes the launcher and only the arguments that need it', cmd.args[3] === '"\"C:\\tools\\npm.cmd\" run build:ci-pr \"two words\" a=b"', cmd.args[3]);
  check('on Windows a real .exe found on PATH is started directly, as an array', exe.file === 'C:\\tools\\node.exe' && exe.args.join(' ') === 'x.mjs' && exe.options.windowsVerbatimArguments === undefined);
  check('on Windows a name found nowhere is started as given, so the failure is the system\'s ENOENT', win('ghost', []).file === 'ghost');
  check('an argument with a double quote is refused for a .cmd launcher', refused('a"b'));
  check('an argument with a percent sign is refused for a .cmd launcher', refused('50%'));
  check('a .bat launcher is started through cmd.exe too', launchPlan('build', ['x'], { platform: 'win32', env, exists: (file) => file.toLowerCase() === 'c:\\tools\\build.bat' }).file === 'C:\\Windows\\System32\\cmd.exe');
  check('a command given with a Windows directory is not searched on PATH', win('C:\\tools\\npm.cmd', ['x']).args[3] === '""C:\\tools\\npm.cmd" x"', win('C:\\tools\\npm.cmd', ['x']).args[3]);
  check('a command given with a POSIX-style directory is not searched on PATH', win('C:/tools/npm.cmd', ['x']).args[3] === '""C:/tools/npm.cmd" x"', win('C:/tools/npm.cmd', ['x']).args[3]);
  check('an empty argument is carried as a pair of quotes', win('npm', ['']).args[3] === '""C:\\tools\\npm.cmd" ""\"');
}

if (process.platform === 'win32') {
  clearState();

  const shimDir = path.join(SCRATCH, 'shim');

  mkdirSync(shimDir, { recursive: true });
  writeFileSync(path.join(shimDir, 'fcl-shim.cmd'), '@echo off\r\necho shim got [%~1] [%~2]\r\nexit /b 3\r\n');

  const result = await startRunner(['--chain', 'shim', '--', 'fcl-shim', 'plain', 'two words'], { PATH: `${shimDir};${process.env.PATH}` });

  check('on Windows a real .cmd launcher runs with its arguments and its exit code', result.code === 3 && result.stdout.includes('shim got [plain] [two words]'), `${String(result.code)} ${result.stdout}`);
  check('the lock is released after the .cmd launcher', lockFree());
}

// ── What the documentation promises ─────────────────────────────────────────────────────────────────────────
check('the exit codes the runner documents are 2, 70, 75 and 127', EXIT.usage === 2 && EXIT.lockFault === 70 && EXIT.waitExpired === 75 && EXIT.notStarted === 127, JSON.stringify(EXIT));
check('the default wait is an hour and the poll two seconds', DEFAULT_WAIT_SECONDS === 3600 && DEFAULT_POLL_MS === 2000);

{
  const told = [];
  const code = failureCode(new Error('port defect'), { complain: (id, params) => told.push([id, params.detail]) });

  check('a defect of a port ends with 70 and says so, bilingual id and detail', code === 70 && told.length === 1 && told[0][0] === 'run-failed' && told[0][1] === 'port defect');
  check('a thrown value that is not an Error is still told', (() => { const more = []; failureCode('plain text', { complain: (id, params) => more.push(params.detail) }); return more[0] === 'plain text'; })());
}

// ── The measured tree ──────────────────────────────────────────────────────────────────────────────────────────
{
  check('a directory in no git tree is its own measured tree, made absolute', measuredTree('rel/dir', { topLevelOf: () => undefined }) === path.resolve('rel/dir'));
  check('a directory in a git tree is measured as the top level of that tree', measuredTree('/x/y', { topLevelOf: () => '/x' }) === '/x');
  check('the git question is asked of the absolute directory', (() => { let asked; measuredTree('rel', { topLevelOf: (dir) => { asked = dir; return undefined; } }); return asked === path.resolve('rel'); })());
}

// ── The default project and session of the holder record ────────────────────────────────────────────────────
{
  clearState();

  const cwd = path.join(SCRATCH, 'some-project');

  mkdirSync(cwd, { recursive: true });

  const child = spawn(process.execPath, [RUN, '--chain', 'defaults', '--', process.execPath, CHILD, 'hold', path.join(SCRATCH, 'defaults.log'), 'D', '700'], { cwd, env: { ...process.env, CLAUDE_CODE_SESSION_ID: 'env-session-7', CLAUDE_SESSION_ID: 'not-the-harness-variable' }, stdio: 'ignore', windowsHide: true });
  const ended = new Promise((resolve) => child.once('close', resolve));

  await until(() => existsSync(HOLDER));

  const holder = readJson(HOLDER);

  await ended;

  check('with no --project the record names the directory the chain runs in', holder.project === 'some-project', JSON.stringify(holder));
  check('with no --session the record names the session the harness exports (CLAUDE_CODE_SESSION_ID)', holder.session === 'env-session-7', JSON.stringify(holder));
  check('with no --tree, outside any git tree, the record names the absolute directory the chain runs in', holder.tree === cwd, JSON.stringify(holder));
}

// ── The measured tree of a chain started in a subdirectory of a git tree ────────────────────────────────────
{
  clearState();

  const repo = path.join(SCRATCH, 'measured-repo');
  const sub = path.join(repo, 'deep', 'sub');
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

  mkdirSync(sub, { recursive: true });
  execFileSync('git', ['init', '--quiet', repo], { env: cleanEnv, stdio: 'ignore', windowsHide: true });

  const child = spawn(process.execPath, [RUN, '--chain', 'tree', '--session', 'tree-session', '--', process.execPath, CHILD, 'hold', path.join(SCRATCH, 'tree.log'), 'T', '700'], { cwd: sub, env: cleanEnv, stdio: 'ignore', windowsHide: true });
  const ended = new Promise((resolve) => child.once('close', resolve));

  await until(() => existsSync(HOLDER));

  const holder = readJson(HOLDER);

  await ended;

  check('a chain started in a subdirectory of a git tree records the top level of that tree', holder.tree === repo, JSON.stringify(holder));
  check('an explicit --session wins over the environment', holder.session === 'tree-session', JSON.stringify(holder));
}

// ── The lock adapter: whose record is removed, what a garbage record reads as ───────────────────────────────
{
  clearState();

  const lock = fileLockAdapter(STATE);
  const successor = { session: 'next', project: 'next', chain: 'next', pid: process.pid + 1, startedAt: 't', command: 'c' };

  check('the adapter takes the lock and writes its record', lock.tryTake({ session: 's', project: 'p', chain: 'c', pid: process.pid, startedAt: 't', command: 'c' }) && lock.readHolder()?.session === 's');
  check('the record is renamed into place: no partial record is left beside it', readdirSync(STATE).every((name) => !name.endsWith('.partial')), readdirSync(STATE).join(', '));

  writeFileSync(HOLDER, JSON.stringify(successor));
  lock.release();

  check('a release leaves the record of a successor alone: a lock broken under us is no longer ours', lock.readHolder()?.session === 'next' && !existsSync(LOCK));

  for (const garbage of ['null', '42', '"text"', 'not json', '']) {
    writeFileSync(HOLDER, garbage);
    check(`a record that is ${JSON.stringify(garbage)} reads as no record`, (() => { try { return lock.readHolder() === undefined; } catch { return false; } })());
  }

  clearState();
  mkdirSync(HOLDER, { recursive: true });

  const unwritable = (() => { try { lock.tryTake({ session: 's', project: 'p', chain: 'c', pid: process.pid, startedAt: 't', command: 'c' }); return false; } catch { return true; } })();

  check('a take whose record cannot be written fails and does not keep the lock', unwritable && !existsSync(LOCK));
  check('a failed record write leaves no partial record behind', readdirSync(STATE).every((name) => !name.endsWith('.partial')), readdirSync(STATE).join(', '));

  clearState();
  check('with no record file there is no holder', (() => { try { return lock.readHolder() === undefined; } catch { return false; } })());
  check('a release with nothing taken does nothing', (() => { lock.release(); return lockFree(); })());
}

// ── The lock adapter: which holder is a RUNNING chain ───────────────────────────────────────────────────────────
{
  clearState();

  const record = { session: 's', project: 'p', chain: 'c', tree: '/t', pid: process.pid, startedAt: 't', command: 'c' };
  const live = fileLockAdapter(STATE);

  check('with no lock there is no running holder', live.liveHolder() === undefined);
  live.tryTake(record);
  check('a lock this live process holds names its record as the running holder', live.liveHolder()?.tree === '/t', JSON.stringify(live.liveHolder()));
  check('a holder whose pid the probe calls dead is no running chain', fileLockAdapter(STATE, { isAlive: () => false }).liveHolder() === undefined);
  check('a lock past this adapter\'s twelve-hour ceiling is no running chain', fileLockAdapter(STATE, { now: () => Date.now() + 12 * 60 * 60 * 1000 + 60_000 }).liveHolder() === undefined);
  check('a lock past the port\'s ten-minute default ceiling but under twelve hours is still a running chain', fileLockAdapter(STATE, { now: () => Date.now() + 30 * 60 * 1000 }).liveHolder()?.pid === process.pid);
  writeFileSync(HOLDER, JSON.stringify({ ...record, pid: process.pid + 1 }));
  check('a record of another process than the lock\'s owner is no running chain', live.liveHolder() === undefined);
  writeFileSync(HOLDER, JSON.stringify(record));
  live.release();
  check('after the release there is no running holder', live.liveHolder() === undefined);
}

// ── Signals reach the child while it runs, and only while it runs ───────────────────────────────────────────
{
  const before = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [signal, process.listenerCount(signal)]));
  const kills = [];
  let fake;
  const spawnProcess = () => {
    fake = new EventEmitter();
    fake.kill = (signal) => kills.push(signal);

    return fake;
  };
  const running = childProcessAdapter({ spawnProcess }).run(process.execPath, []);
  const during = Object.fromEntries(Object.keys(before).map((signal) => [signal, process.listenerCount(signal)]));

  for (const signal of Object.keys(before)) process.emit(signal);

  fake.emit('close', 0, null);
  await running;

  const after = Object.fromEntries(Object.keys(before).map((signal) => [signal, process.listenerCount(signal)]));

  check('SIGINT, SIGTERM and SIGHUP received by the runner are forwarded to the child', kills.join(',') === 'SIGINT,SIGTERM,SIGHUP', kills.join(','));
  check('a forwarder is installed for each signal while the child runs', Object.keys(before).every((signal) => during[signal] === before[signal] + 1));
  check('the forwarders are removed when the child ends', Object.keys(before).every((signal) => after[signal] === before[signal]));

  const failing = childProcessAdapter({ spawnProcess: () => { fake = new EventEmitter(); fake.kill = () => undefined; setImmediate(() => fake.emit('error', Object.assign(new Error('spawn x ENOENT'), { code: 'ENOENT' }))); return fake; } });
  const outcome = await failing.run(process.execPath, []).catch((error) => error);

  check('a spawn error rejects with CommandNotStarted carrying the system code', outcome instanceof CommandNotStarted && outcome.messageId === 'spawn-failed' && outcome.params.code === 'ENOENT');
  check('the forwarders are removed after a spawn error too', Object.keys(before).every((signal) => process.listenerCount(signal) === before[signal]));
}

// ── The lock token: handed to the command, and which values hold the lock ──────────────────────────────────────
{
  const told = [];
  const given = [];
  let released = 0;
  const say = { say: () => undefined, complain: (id) => told.push(id), line: () => '' };
  const fakeLock = (token) => ({ tryTake: () => true, readHolder: () => undefined, readToken: () => token, release: () => { released += 1; } });
  const request = { chain: 'c', project: 'p', session: 's', command: 'cmd', args: ['a'], waitMs: 100, pollMs: 10 };
  const clock = { now: () => 0, sleep };
  const code = await runChain(request, { lock: fakeLock('holder-id'), child: { run: (...call) => { given.push(call); return Promise.resolve(4); } }, clock, say, processId: 1 });

  check('the command is handed the holder id the lock port holds, under FULL_CHAIN_LOCK_TOKEN, and nothing else', code === 4 && JSON.stringify(given) === JSON.stringify([['cmd', ['a'], { FULL_CHAIN_LOCK_TOKEN: 'holder-id' }]]), JSON.stringify(given));
  check('the variable name the runner hands out is FULL_CHAIN_LOCK_TOKEN', LOCK_TOKEN_VARIABLE === 'FULL_CHAIN_LOCK_TOKEN');

  const before = released;
  let ran = 0;
  const unreadable = await runChain(request, { lock: fakeLock(undefined), child: { run: () => { ran += 1; return Promise.resolve(0); } }, clock, say, processId: 1 });

  check('a holder id that cannot be read back exits 70 and the command does not run', unreadable === EXIT.lockFault && ran === 0);
  check('that refusal is told with its own id and gives the lock back', told.includes('token-unreadable') && released === before + 1);

  const unreadableText = speak({ log: () => undefined, error: () => undefined }).line('token-unreadable');

  check('that refusal says, in both languages, that the command did not run and the lock was released', unreadableText.includes('did NOT run') && unreadableText.includes('the lock was released') && unreadableText.includes(' @es ') && unreadableText.includes('NO se ejecutó') && unreadableText.includes('el lock se soltó'), unreadableText);
}

{
  let seen;
  const adapter = childProcessAdapter({ spawnProcess: (file, args, options) => { seen = { file, args, options }; const fake = new EventEmitter(); fake.kill = () => undefined; setImmediate(() => fake.emit('close', 0, null)); return fake; } });

  await adapter.run(process.execPath, ['x'], { FULL_CHAIN_LOCK_TOKEN: 'abc' });
  check('the child adapter adds the given variables to the environment the child starts with', seen.options.env.FULL_CHAIN_LOCK_TOKEN === 'abc' && seen.options.env.PATH === process.env.PATH && seen.options.stdio === 'inherit', JSON.stringify(Object.keys(seen.options)));

  await adapter.run(process.execPath, ['x']);
  check('with no variables given the child starts with the caller\'s own environment', !('FULL_CHAIN_LOCK_TOKEN' in seen.options.env) && seen.options.env.PATH === process.env.PATH);
}

{
  clearState();

  const record = { session: 's', project: 'p', chain: 'c', tree: '/t', pid: process.pid, startedAt: 't', command: 'c' };
  const lock = fileLockAdapter(STATE);

  check('with no lock file there is no token and nothing holds the lock', lock.readToken() === undefined && lock.holdsToken('anything') === false);
  lock.tryTake(record);

  const token = lock.readToken();

  check('the token is what the lock port wrote into chain.lock, owned by this process', typeof token === 'string' && token.startsWith(`${String(process.pid)}:`), String(token));
  check('the live holder\'s own token holds the lock', lock.holdsToken(token) === true);
  check('a forged token does not hold it', lock.holdsToken(`${String(process.pid)}:forged`) === false);
  check('an empty, missing or non-text token does not hold it', ['', undefined, null, 42, {}].every((value) => lock.holdsToken(value) === false));
  check('the right token with a holder the probe calls dead does not hold it', fileLockAdapter(STATE, { isAlive: () => false }).holdsToken(token) === false);
  writeFileSync(HOLDER, JSON.stringify({ ...record, pid: process.pid + 1 }));
  check('the right token with a record of another process than the lock\'s owner does not hold it', lock.holdsToken(token) === false);
  writeFileSync(HOLDER, JSON.stringify(record));
  lock.release();
  check('after the release the same token no longer holds the lock, and no token is readable', lock.holdsToken(token) === false && lock.readToken() === undefined);

  lock.tryTake(record);
  check('a token copied from a finished chain does not hold the next chain\'s lock, which has its own', lock.readToken() !== token && lock.holdsToken(token) === false && lock.holdsToken(lock.readToken()) === true);
  lock.release();

  const dead = deadPid();

  plantLock(dead, 5);
  check('a stale lock (dead owner, old) is held by nobody, its own token included', fileLockAdapter(STATE).holdsToken(`${String(dead)}:planted`) === false);
  clearState();
}

{
  const asked = [];
  const answers = tokenHoldsLock('value', { lock: { holdsToken: (token) => { asked.push(token); return true; } } });

  check('the port asks the lock about exactly the token it was given and answers the lock\'s answer', answers === true && asked.join() === 'value');

  clearState();

  const lock = fileLockAdapter(STATE);

  check('over the shared state directory the port answers false while no chain holds the lock', tokenHoldsLock('x') === false);
  lock.tryTake({ session: 's', project: 'p', chain: 'c', tree: '/t', pid: process.pid, startedAt: 't', command: 'c' });
  check('over the shared state directory the port answers true for the holder\'s token', tokenHoldsLock(lock.readToken()) === true);
  lock.release();
  clearState();
}

// ── End to end: the real runner gives its command a token the real port accepts ─────────────────────────────────
{
  clearState();

  const result = await startRunner(['--chain', 'token', '--project', 'p', '--', process.execPath, CHILD, 'token-holds']);

  check('the command started by the real runner is given a token that holds the lock while it runs', result.code === 0 && result.stdout.includes('holds=true'), `${String(result.code)} ${result.stdout}`);
  check('the lock is released afterwards', lockFree());

  clearState();

  const named = await startRunner(['--chain', 'token', '--project', 'p', '--', process.execPath, CHILD, 'env', LOCK_TOKEN_VARIABLE]);
  const value = /FULL_CHAIN_LOCK_TOKEN=(\S+)/.exec(named.stdout)?.[1];

  check('the variable the command sees carries a holder id of this machine\'s lock format (pid:random)', value !== undefined && /^\d+:[0-9a-f]+$/.test(value), named.stdout);

  const stale = await startRunner(['--chain', 'token', '--project', 'p', '--', process.execPath, CHILD, 'env', LOCK_TOKEN_VARIABLE], { FULL_CHAIN_LOCK_TOKEN: 'inherited-and-stale' });

  check('a token already in the caller\'s environment is replaced by the lock\'s own', !stale.stdout.includes('inherited-and-stale') && /FULL_CHAIN_LOCK_TOKEN=\d+:/.test(stale.stdout), stale.stdout);
}

// ── The real speaker ────────────────────────────────────────────────────────────────────────────────────────
const placeholdersOf = (message) => [].concat(message.en).join('\n').split('{').slice(1).map((part) => part.split('}')[0]);
const renders = (id) => speak({ log: () => undefined, error: () => undefined }).line(id, Object.fromEntries(placeholdersOf(MESSAGES[id]).map((name) => [name, 'x']))).includes('@es');

check('every message of the table renders with its own placeholders, bilingual', Object.keys(MESSAGES).every(renders));

process.stdout.write(`\n${String(passed)} passed, ${String(failed)} failed\n`);
process.exit(failed === 0 ? 0 : 1);
