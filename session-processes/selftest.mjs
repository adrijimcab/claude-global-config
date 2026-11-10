#!/usr/bin/env node
/**
 * Selftest of session-processes: the end-of-session sweep ends the processes a session left alive and nothing else.
 *
 * THE STATE SPACE, from the decisions: WHICH processes belong to the session (own, own orphan, other session, no TEMP,
 * unreadable, the hook's own chain, a detached chain, spelling variants, prefixes); HOW each is ended (alone or as a
 * tree, only when nothing foreign is below it); the PORTS (the table parser, the single-process end); the HOOK (its
 * lines, its failures, its silence on stdout); and the LIVE flow on real processes, where an owned orphan and an owned
 * child die while a foreign-marked process and a detached full chain survive. Every ordering here is a condition the
 * proof controls (an exit event, a release file, a verdict), never an elapsed-time bound; the only wait is a condition
 * with a failure fence.
 *
 * @es Selftest de session-processes: el barrido de fin de sesión termina los procesos que una sesión dejó vivos y nada
 * más. ESTADOS: QUÉ procesos son de la sesión, CÓMO se termina cada uno, los PUERTOS, el HOOK y el flujo VIVO sobre
 * procesos reales, donde un huérfano propio y un hijo propio mueren mientras sobreviven un proceso con marcador ajeno y
 * una cadena completa desacoplada. Todo orden es una condición que la prueba controla, nunca un tope de tiempo.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isAlive, killTree } from '../process-control/process-port.mjs';
import { sessionTempOf } from '../session-temp/session-temp.mjs';
import { chainTempDir } from '../full-chain-lock/run-directory.mjs';
import { evaluate } from './end.mjs';
import { killProcess } from './kill-process.mjs';
import { processesToEnd } from './ownership.mjs';
import { parseRows, readEnvironments } from './process-table.mjs';
import { sweepSession } from './sweep.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOLDER = path.join(HERE, 'holder.fixture.mjs');
const MAKER = path.join(HERE, 'orphan-maker.fixture.mjs');
const PROBE = path.join(HERE, 'environment-reader.probe.mjs');
const WRAPPER = path.join(HERE, 'chain-wrapper.fixture.mjs');
const RUN = path.join(HERE, '..', 'full-chain-lock', 'run.mjs');

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${label}${detail === '' ? '' : `: ${detail}`}`);
  }
}

/** A call whose throw becomes a value, so a broken decision fails a check instead of crashing the proof. @es Una llamada cuyo throw se vuelve un valor. */
const safely = (call) => {
  try {
    return call();
  } catch (error) {
    return `threw: ${error.message}`;
  }
};

/** A condition awaited until it holds; the ceiling only fences a failure, it decides nothing. @es Una condición esperada hasta que se cumple; el tope solo acota un fallo, no decide nada. */
async function until(condition, ceilingMs = 30_000) {
  const fence = Date.now() + ceilingMs;

  while (!condition()) {
    if (Date.now() > fence) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return true;
}

const SESSION = 'C:/tmp/claude/session-tmp/session-a';
const OTHER = 'C:/tmp/claude/session-tmp/session-b';
const row = (pid, parentPid, name, temp) => ({ pid, parentPid, name, temp });
const decide = (rows, hookPid = 9000, sessionTemp = SESSION) => safely(() => processesToEnd({ rows, sessionTemp, hookPid }));
const pidsOf = (result) => (Array.isArray(result) ? result.map((entry) => entry.pid) : result);
const HOOK = [row(9000, 8000, 'node', SESSION), row(8000, 7000, 'claude', SESSION), row(7000, 1, 'WindowsTerminal', '')];

// ── WHICH processes belong to the session ─────────────────────────────────────────────────────────────────────
{
  const own = decide([...HOOK, row(100, 8000, 'node', SESSION)]);
  check('a process carrying the session TEMP is ended', JSON.stringify(pidsOf(own)) === '[100]', JSON.stringify(own));
  check('a process of the session is ended as a tree when everything below it is the session\'s', own[0]?.tree === true && own[0]?.name === 'node', JSON.stringify(own));

  const orphan = decide([...HOOK, row(101, 424242, 'node', SESSION)]);
  check('an orphan (its parent is no longer in the table) carrying the session TEMP is ended', JSON.stringify(pidsOf(orphan)) === '[101]', JSON.stringify(orphan));

  check('a process of another session is never ended', JSON.stringify(pidsOf(decide([...HOOK, row(102, 8000, 'node', OTHER)]))) === '[]');
  check('a process with no TEMP is never ended', JSON.stringify(pidsOf(decide([...HOOK, row(103, 8000, 'node', '')]))) === '[]');
  check('a process whose environment could not be read is never ended', JSON.stringify(pidsOf(decide([...HOOK, row(104, 8000, 'node', undefined)]))) === '[]');
  check('a TEMP that only STARTS with the session folder is another folder', JSON.stringify(pidsOf(decide([...HOOK, row(105, 8000, 'node', `${SESSION}/sub`), row(106, 8000, 'node', `${SESSION}x`)]))) === '[]');
  check('a TEMP spelled with backslashes, capitals and a trailing separator is the same folder', JSON.stringify(pidsOf(decide([...HOOK, row(107, 8000, 'node', 'C:\\TMP\\Claude\\Session-Tmp\\SESSION-A\\')]))) === '[107]');
  check('an empty session folder matches nothing, not every process with no TEMP', JSON.stringify(pidsOf(decide([...HOOK, row(108, 8000, 'node', '')], 9000, ''))) === '[]');

  const chain = decide([...HOOK, row(110, 424242, 'node', 'C:/state/runs/chain-1/temp'), row(111, 110, 'node', 'C:/state/runs/chain-1/temp')]);
  check('a detached chain, which carries its own TEMP, is never ended', JSON.stringify(pidsOf(chain)) === '[]');
}

// ── The hook's own chain is never ended ─────────────────────────────────────────────────────────────────────
{
  const rows = [...HOOK, row(9100, 9000, 'powershell', SESSION), row(9200, 9100, 'conhost', SESSION), row(120, 8000, 'node', SESSION)];
  const ended = decide(rows);

  check('the hook itself, its ancestors (the session\'s claude included) and its descendants are spared even when they carry the session TEMP', JSON.stringify(pidsOf(ended)) === '[120]', JSON.stringify(ended));
  const asIfHook120 = pidsOf(decide(rows, 120));

  check('the spared chain follows the hook pid given, not a name: for another hook pid its own chain is spared and the former one is not', !asIfHook120.includes(120) && !asIfHook120.includes(8000) && asIfHook120.includes(9000), JSON.stringify(asIfHook120));
}

// ── HOW each process is ended ───────────────────────────────────────────────────────────────────────────────
{
  const nested = decide([...HOOK, row(130, 8000, 'cmd', SESSION), row(131, 130, 'node', SESSION), row(132, 131, 'conhost', SESSION)]);
  check('a marked tree is ended once, from its root', JSON.stringify(nested) === JSON.stringify([{ pid: 130, name: 'cmd', tree: true }]), JSON.stringify(nested));

  const mixed = decide([...HOOK, row(140, 8000, 'cmd', SESSION), row(141, 140, 'node', OTHER), row(142, 140, 'node', SESSION), row(143, 141, 'node', SESSION)]);
  check('a tree with a foreign process below is NOT ended as a tree: only its marked members, one by one', JSON.stringify(mixed) === JSON.stringify([{ pid: 140, name: 'cmd', tree: false }, { pid: 142, name: 'node', tree: true }, { pid: 143, name: 'node', tree: true }]), JSON.stringify(mixed));
  check('the foreign process below a marked one is never listed', !pidsOf(mixed).includes(141));

  const unreadableBelow = decide([...HOOK, row(150, 8000, 'cmd', SESSION), row(151, 150, 'svc', undefined)]);
  check('an unreadable process below is unknown, so it is not taken down with a tree', JSON.stringify(unreadableBelow) === JSON.stringify([{ pid: 150, name: 'cmd', tree: false }]), JSON.stringify(unreadableBelow));

  const cycle = decide([...HOOK, row(160, 161, 'node', SESSION), row(161, 160, 'node', SESSION)]);
  check('two marked processes that are each other\'s parent (a reused pid) are both still ended', JSON.stringify(pidsOf(cycle)) === '[160,161]', JSON.stringify(cycle));

  const unsorted = decide([...HOOK, row(172, 424242, 'node', SESSION), row(170, 424242, 'node', SESSION), row(171, 424242, 'node', SESSION)]);
  check('the list is ordered by pid', JSON.stringify(pidsOf(unsorted)) === '[170,171,172]', JSON.stringify(unsorted));
  check('a table with only foreign processes yields an empty list', JSON.stringify(pidsOf(decide([]))) === '[]');
}

// ── The sweep, over ports ───────────────────────────────────────────────────────────────────────────────────
{
  const calls = [];
  let reads = 0;
  const table = [...HOOK, row(200, 8000, 'cmd', SESSION), row(201, 200, 'node', OTHER), row(210, 424242, 'node', SESSION)];
  const report = safely(() => sweepSession({
    sessionTemp: SESSION,
    hookPid: 9000,
    readEnvironments: () => ((reads += 1), table),
    killTree: (pid) => (calls.push(['tree', pid]), { pid, outcome: 'killed', killed: [pid] }),
    killProcess: (pid) => (calls.push(['one', pid]), { pid, outcome: 'failed', detail: 'access denied' })
  }));

  check('the table is read once, before anything is ended', reads === 1);
  check('a tree entry goes to the tree port and a single entry to the single port, in pid order', JSON.stringify(calls) === JSON.stringify([['one', 200], ['tree', 210]]), JSON.stringify(calls));
  check('the report carries each outcome and the failure detail', JSON.stringify(report) === JSON.stringify([{ pid: 200, name: 'cmd', tree: false, outcome: 'failed', detail: 'access denied' }, { pid: 210, name: 'node', tree: true, outcome: 'killed' }]), JSON.stringify(report));
}

// ── The single-process end ──────────────────────────────────────────────────────────────────────────────────
{
  const signals = [];
  const answer = (error) => safely(() => killProcess(500, { ownPid: 1, signal: (pid, name) => { signals.push([pid, name]); if (error !== undefined) throw error; } }));

  check('ending a process signals it with SIGKILL and says killed', JSON.stringify(answer()) === '{"pid":500,"outcome":"killed"}' && JSON.stringify(signals) === '[[500,"SIGKILL"]]', JSON.stringify(signals));
  check('a process already gone is a normal answer, not an error', answer(Object.assign(new Error('no such process'), { code: 'ESRCH' })).outcome === 'already-dead');

  const denied = answer(Object.assign(new Error('access denied'), { code: 'EPERM' }));

  check('any other failure is reported with its reason', denied.outcome === 'failed' && denied.detail === 'access denied', JSON.stringify(denied));
  check('a thrown value that is not an Error still gives a reason', killProcess(500, { ownPid: 1, signal: () => { throw 'plain text'; } }).detail === 'plain text');

  const before = signals.length;

  for (const refused of [1, 0, -5, 2.5, Number.NaN, 77]) check(`the id ${String(refused)} is refused and never signalled`, killProcess(refused, { ownPid: 77, signal: () => signals.push(['no']) }).outcome === 'refused');
  check('a refused id sent no signal', signals.length === before);
}

// ── The table: parsing and the platform ─────────────────────────────────────────────────────────────────────────
{
  const rows = parseRows('10\t4\tnode\tC:/a\r\n11\t10\tcmd\t\n12\t10\tsvc\t?\nnot a row\n13\tx\tnode\tC:/a\nx\t4\tnode\tC:/a\n14\t10\tnode\tC:/a\textra\n15\t10\tnode\n');

  check('a line gives pid, parent, name and TEMP; a CRLF ending is accepted', JSON.stringify(rows[0]) === '{"pid":10,"parentPid":4,"name":"node","temp":"C:/a"}', JSON.stringify(rows));
  check('an empty TEMP is the empty text and an unreadable one is undefined', rows[1]?.temp === '' && rows[2]?.temp === undefined && rows.length === 3, JSON.stringify(rows));
  check('a line that does not fit (words, a non-number parent, an extra column, a missing one) is dropped', rows.every((entry) => [10, 11, 12].includes(entry.pid)));
  check('reading on another platform throws, bilingual, instead of answering an empty list', /not on linux/.test(String(safely(() => readEnvironments({ platform: 'linux' })))) && /@es/.test(String(safely(() => readEnvironments({ platform: 'linux' })))));
  check('a reader that fails throws with its reason', /exit 3.*boom/.test(String(safely(() => readEnvironments({ platform: 'win32', runReader: () => ({ status: 3, stdout: '', stderr: 'boom' }) })))));
  check('a reader that cannot start throws with its reason', /cannot spawn/.test(String(safely(() => readEnvironments({ platform: 'win32', runReader: () => ({ status: null, stdout: '', stderr: '', error: new Error('cannot spawn') }) })))));
  check('a good run is parsed', safely(() => readEnvironments({ platform: 'win32', runReader: () => ({ status: 0, stdout: '1\t0\tx\tC:/t\n', stderr: '' }) }))[0]?.temp === 'C:/t');
}

// ── The hook, over ports ────────────────────────────────────────────────────────────────────────────────────
{
  const root = 'C:/tmp';
  const lines = [];
  const ports = (table) => ({ root, hookPid: 9000, readEnvironments: () => table, killTree: (pid) => ({ pid, outcome: 'killed', killed: [pid] }), killProcess: (pid) => ({ pid, outcome: 'killed' }), record: (line) => lines.push(line) });
  const table = [...HOOK, row(300, 424242, 'node', SESSION)];
  const returned = evaluate(JSON.stringify({ session_id: 'session-a' }), ports(table));

  check('the hook returns nothing for stdout', returned === undefined);
  check('it says, bilingual, what it ended and how', lines.length === 1 && /killed node 300 with everything below it/.test(lines[0]) && /@es/.test(lines[0]), lines.join('\n'));

  lines.length = 0;
  evaluate(JSON.stringify({ session_id: 'session-a' }), { ...ports(table), killTree: (pid) => ({ pid, outcome: 'failed', detail: 'denied' }) });
  check('a process that could not be ended is reported as such, with its reason, bilingual', lines.length === 1 && /could not end node 300: denied/.test(lines[0]) && /@es/.test(lines[0]), lines.join('\n'));

  lines.length = 0;
  evaluate(JSON.stringify({ session_id: 'session-a' }), { ...ports(table), readEnvironments: () => { throw new Error('table unreadable'); } });
  check('a sweep that fails says so, bilingual, and does not throw', lines.length === 1 && /the sweep failed/.test(lines[0]) && /table unreadable/.test(lines[0]) && /@es/.test(lines[0]), lines.join('\n'));

  lines.length = 0;
  let read = false;
  for (const raw of [JSON.stringify({}), JSON.stringify({ session_id: '../x' }), 'not json']) evaluate(raw, { ...ports(table), readEnvironments: () => ((read = true), table) });
  check('a payload with no usable session id sweeps nothing and reads nothing', !read && lines.length === 0);
  check('the hook computes the session folder with session-temp\'s own function', sessionTempOf('session-a', root) === SESSION.replace('C:/tmp', root));
}

// ── The live flow, on real processes ────────────────────────────────────────────────────────────────────────
const scratch = realpathSync.native(mkdtempSync(path.join(tmpdir(), 'session-processes-selftest-')));
const owned = new Set();
const startedAt = Date.now();
const withTemp = (value, extra = {}) => ({ ...process.env, TEMP: value, TMP: value, TMPDIR: value, ...extra });

try {
  const probe = spawnSync(process.execPath, [PROBE], { encoding: 'utf8', windowsHide: true });

  check('the live probe of the environment reader passes (child, orphan, foreign marker)', probe.status === 0 && !probe.stdout.includes('FAIL'), probe.stdout);

  const sessionId = `sweep-selftest-${String(process.pid)}-${String(startedAt)}`;
  const otherId = `${sessionId}-other`;
  const sessionTemp = sessionTempOf(sessionId);
  const otherTemp = sessionTempOf(otherId);
  const release = path.join(scratch, 'release');

  mkdirSync(sessionTemp, { recursive: true });
  mkdirSync(otherTemp, { recursive: true });

  const exited = new Map();
  const start = (temp, ...extra) => {
    const child = spawn(process.execPath, [HOLDER, release, ...extra], { env: withTemp(temp), stdio: 'ignore', windowsHide: true });

    owned.add(child.pid);
    child.once('exit', (code) => exited.set(child.pid, code));

    return child;
  };
  const ownChild = start(sessionTemp, 'with-child');
  const foreign = start(otherTemp);
  const made = spawnSync(process.execPath, [MAKER, sessionTemp, release], { encoding: 'utf8', windowsHide: true });
  const orphan = Number(made.stdout.trim());

  owned.add(orphan);

  // A detached full chain started FROM a process carrying the session TEMP, as a Bash command of the session would.
  // @es Una cadena completa desacoplada iniciada DESDE un proceso con el TEMP de la sesión, como lo haría un comando Bash.
  const runDir = path.join(scratch, 'chain-run');
  const stateHome = path.join(scratch, 'state');
  const detach = spawnSync(process.execPath, [RUN, '--detach', '--run-dir', runDir, '--chain', 'sweep-proof', '--project', 'sweep-proof', '--session', 'sweep-proof', '--tree', scratch, '--', process.execPath, HOLDER, release], { encoding: 'utf8', windowsHide: true, cwd: scratch, env: withTemp(sessionTemp, { HOOK_STATE_DIR: stateHome }) });
  const chainTemp = chainTempDir(runDir).split('\\').join('/');
  const ofChain = () => readEnvironments().filter((entry) => entry.temp?.split('\\').join('/') === chainTemp);
  // The chain's runner and its holder are two node processes carrying the chain's TEMP. @es El runner de la cadena y su holder son dos procesos node con el TEMP de la cadena.
  const chainUp = await until(() => ofChain().filter((entry) => entry.name === 'node').length >= 2);
  const chainPids = ofChain().map((entry) => entry.pid);

  check('the detached chain started and runs with a TEMP of its own, outside its run directory', detach.status === 0 && chainUp, `${String(detach.status)} ${detach.stdout}${detach.stderr}`);
  // The owned child has a holder of its own below it: a tree, ended with everything below it. @es El hijo propio tiene un holder debajo: un árbol, terminado con todo lo de abajo.
  const belowFound = await until(() => readEnvironments().some((entry) => entry.parentPid === ownChild.pid && entry.temp === sessionTemp));
  const grandchild = readEnvironments().find((entry) => entry.parentPid === ownChild.pid && entry.name === 'node')?.pid;

  check('the owned child has a process below it carrying the session TEMP', belowFound && grandchild !== undefined);
  check('the orphan and the owned child are alive before the sweep, carrying the session TEMP', isAlive(orphan) && isAlive(ownChild.pid) && readEnvironments().filter((entry) => entry.temp === sessionTemp).length >= 2);

  // The hook runs under the session TEMP too, as it does after a resume: it must not end itself or its reader.
  // @es El hook corre también bajo el TEMP de la sesión, como tras un resume: no debe terminarse a sí mismo ni a su lector.
  // A wrapper between the test and the hook carries the session TEMP too: an ancestor of the hook that must be spared.
  // @es Un wrapper entre la prueba y el hook lleva también el TEMP de la sesión: un ancestro del hook que debe respetarse.
  const wrapped = spawnSync(process.execPath, [WRAPPER], { input: JSON.stringify({ hook_event_name: 'SessionEnd', session_id: sessionId }), encoding: 'utf8', windowsHide: true, env: withTemp(sessionTemp) });
  const hook = wrapped.status === 0 ? JSON.parse(wrapped.stdout) : { status: `wrapper ${String(wrapped.status)}`, stdout: wrapped.stdout, stderr: wrapped.stderr };

  check('the wrapper that is an ancestor of the hook, carrying the session TEMP, was spared and exited 0', wrapped.status === 0, `${String(wrapped.status)} ${wrapped.stdout}${wrapped.stderr}`);
  check('the hook exits 0 and prints nothing on stdout, even running under the session TEMP', hook.status === 0 && hook.stdout === '', `${String(hook.status)} ${hook.stdout}${hook.stderr}`);
  check('it says it ended the orphan and the owned child', hook.stderr.includes(`node ${String(orphan)}`) && hook.stderr.includes(`node ${String(ownChild.pid)}`), hook.stderr);
  check('the orphan is dead', await until(() => !isAlive(orphan)));
  check('the owned child died, ended by the sweep and never released', (await until(() => exited.has(ownChild.pid))) && exited.get(ownChild.pid) !== 0 && !existsSync(release));
  check('the process below the owned child died with it, ended as a tree', await until(() => !isAlive(grandchild)));
  check('the foreign-marked process is alive after the sweep', isAlive(foreign.pid) && !exited.has(foreign.pid));
  check('every process of the detached chain is alive after the sweep', chainPids.length >= 2 && chainPids.every((pid) => isAlive(pid)), JSON.stringify(chainPids));

  writeFileSync(release, 'x');
  check('the foreign-marked process was alive until released: it exits 0, not killed', (await until(() => exited.has(foreign.pid))) && exited.get(foreign.pid) === 0, String(exited.get(foreign.pid)));

  const verdictFile = path.join(runDir, 'verdict.json');

  check('the detached chain ended on its own: its verdict says exit 0, so it was never killed', (await until(() => existsSync(verdictFile))) && JSON.parse(readFileSync(verdictFile, 'utf8')).exitCode === 0, existsSync(verdictFile) ? readFileSync(verdictFile, 'utf8') : 'no verdict');
} finally {
  writeFileSync(path.join(scratch, 'release'), 'x');
  for (const pid of owned) killTree(pid);
  rmSync(scratch, { recursive: true, force: true });
  // Only the two folders this proof made; their parents may be a live harness's. @es Solo las dos carpetas que hizo esta prueba; sus padres pueden ser de un harness vivo.
  rmSync(sessionTempOf(`sweep-selftest-${String(process.pid)}-${String(startedAt)}`), { recursive: true, force: true });
  rmSync(sessionTempOf(`sweep-selftest-${String(process.pid)}-${String(startedAt)}-other`), { recursive: true, force: true });
}

console.log(`session-processes selftest: ${String(passed)}/${String(passed + failed)} assertions passed @es aserciones superadas`);
process.exit(failed === 0 ? 0 : 1);
