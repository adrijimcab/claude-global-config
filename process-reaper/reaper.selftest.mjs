#!/usr/bin/env node
/**
 * Proof of the process reaper. Two halves. The DECISION half drives `reapAgentProcesses` over an injected
 * process listing and an injected killer: which command lines belong to the agent (its worktree, its id, its
 * scratch, with a boundary on both sides of each name), which are protected (this process and every ancestor
 * of it), which worktrees are refused (a main checkout), what is killed (the roots of the matched trees, once)
 * and what is reported (survivors measured by a second listing). The REAL half spawns processes the selftest
 * itself owns, names a CONSTRUCTED fixture worktree in their command lines, and proves with the real listing and
 * the real killer that the bash loop, the node process and their children die while a sibling worktree's
 * processes (one with a different name, one whose name only starts the same) survive. It kills nothing else:
 * every command line it can match holds a directory this run created.
 * @es Prueba del segador de procesos. Dos mitades. La de DECISIÓN maneja `reapAgentProcesses` sobre un listado
 * de procesos y un ejecutor de kill inyectados: qué líneas de comandos son del agente (su worktree, su id, su
 * scratch, con límite a ambos lados de cada nombre), cuáles se protegen (este proceso y todos sus ancestros),
 * qué worktrees se rechazan (un checkout principal), qué se mata (las raíces de los árboles, una vez) y qué se
 * informa (los supervivientes, medidos con un segundo listado). La mitad REAL lanza procesos propios del
 * selftest, que nombran un worktree CONSTRUIDO, y prueba con el listado y el kill reales que el bucle bash, el
 * proceso node y sus hijos mueren mientras los de un worktree hermano (uno de otro nombre, otro cuyo nombre solo
 * empieza igual) sobreviven. No mata nada más: toda línea que puede coincidir lleva un directorio creado aquí.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { createGitSandbox } from '../selftest-fixtures/git-sandbox.mjs';

isolateState('process-reaper');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { reapAgentProcesses } = await import(pathToFileURL(path.join(HERE, 'reaper.mjs')).href);
const { descendantsOf } = await import(pathToFileURL(path.join(HERE, 'process-tree.mjs')).href);
const { listProcesses } = await import(pathToFileURL(path.join(HERE, '..', 'worker-status', 'processes.mjs')).href);

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}
/** The value of `run`, or 'THROWS' so a crash is a failed check and not an aborted selftest. @es El valor, o 'THROWS'. */
const attempt = (run) => {
  try {
    return run();
  } catch {
    return 'THROWS';
  }
};

const fixtureRoot = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'process-reaper-')));
// A REAL repository (git sandbox, so git never climbs out of it) whose linked worktrees are real too: what makes a
// directory a linked worktree is git's answer, not the shape of a file. @es Un repositorio REAL, con worktrees reales.
const sandbox = createGitSandbox({ parent: fixtureRoot });
const runGit = (args, cwd) => {
  const result = sandbox.git(args, { cwd });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
};
writeFileSync(path.join(sandbox.repoDir, 'base.txt'), 'base');
runGit(['add', 'base.txt'], sandbox.repoDir);
runGit(['commit', '-q', '-m', 'base'], sandbox.repoDir);
const linkedWorktree = (name) => {
  const directory = path.join(fixtureRoot, name);
  runGit(['worktree', 'add', '-q', '-b', name, directory], sandbox.repoDir);
  return directory;
};
const forward = (value) => value.split('\\').join('/');
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// ---------------------------------------------------------------------------------------------------------------
// DECISION half: injected listing and killer. @es Mitad de DECISIÓN: listado y ejecutor inyectados.
// ---------------------------------------------------------------------------------------------------------------
const AGENT = 'a83a72cee352af81b';
const WT = 'C:/fx/.claude-wt/wt-a';
const row = (pid, parentPid, commandLine) => ({ pid, parentPid, commandLine });
const world = [
  row(1, 0, 'init'),
  row(100, 1, `bash -c until [ -f ${WT}/reports/mutation.json ]; do sleep 15; done`),
  row(101, 100, 'sleep 15'),
  row(102, 100, 'node C:\\fx\\.claude-wt\\WT-A\\worker.mjs'),
  row(103, 102, 'node grandchild.mjs'),
  row(200, 1, 'node C:/fx/.claude-wt/wt-b/other.mjs'),
  row(201, 1, `node C:/fx/.claude-wt/wt-ab/prefix.mjs`),
  row(202, 1, 'node xC:/fx/.claude-wt/wt-a/embedded.mjs'),
  row(300, 1, `node status.mjs agent-${AGENT}`),
  row(301, 1, `sh C:/p/.claude/fleet-env/scratch/${AGENT}/watch.sh`),
  row(302, 1, `node ${AGENT}x/not-the-id.mjs`),
  row(303, 1, `node x${AGENT}/not-the-id.mjs`),
  row(304, 1, 'node eight888 z.mjs'),
  row(305, 1, 'node seven77 y.mjs'),
  row(400, 900, `node land.mjs --worktree ${WT}`),
  row(900, 1, `bash -c node land.mjs --worktree ${WT}`)
];
// A crash of the reaper is a failed check, not an aborted selftest: it comes back as an outcome that matches nothing.
// @es Un crash del segador es un check fallido, no un selftest abortado: vuelve como un resultado que no coincide con nada.
const CRASHED = { refused: 'THREW', matched: [], protected: [], killed: [], survivors: [], lines: [''] };
const reaperRun = (ownership, options) => {
  try {
    return runReaper(ownership, options);
  } catch {
    return { outcome: CRASHED, killed: [] };
  }
};
const runReaper = (ownership, { rows = world, after = (killed) => rows.filter((entry) => ![...killed].some((pid) => pid === entry.pid || descendantsOf(rows, pid).some((below) => below.pid === entry.pid))), self = 400, ...options } = {}) => {
  const killed = [];
  let listed = 0;
  const outcome = reapAgentProcesses(ownership, {
    list: () => (listed++ === 0 ? rows : after(new Set(killed))),
    kill: (pid) => {
      killed.push(pid);
      return true;
    },
    selfPid: self,
    ...options
  });
  return { outcome, killed };
};
const killedOf = (ownership, options) => reaperRun(ownership, options).killed;

check('the worktree names the loop, the other-slash spelling and nothing else; roots only', killedOf({ worktree: WT }), [100]);
check('every tree member is reported killed, the unnamed children included', reaperRun({ worktree: WT }).outcome.killed.map((entry) => entry.pid).sort((a, b) => a - b), [100, 101, 102, 103]);
check('the case and slash spellings of the worktree match', killedOf({ worktree: 'c:\\FX\\.claude-wt\\wt-a' }), [100]);
check('a sibling worktree whose name only starts the same is not matched', killedOf({ worktree: 'C:/fx/.claude-wt/wt-a' }).includes(201), false);
check('a path that merely ends with the worktree path after more characters is not matched', killedOf({ worktree: WT }).includes(202), false);
check('the agent id (with the agent- prefix) matches its status command and its scratch', killedOf({ agentId: `agent-${AGENT}` }), [300, 301]);
check('the agent id without the prefix matches the same', killedOf({ agentId: AGENT }), [300, 301]);
check('an id embedded in a longer name is not matched', killedOf({ agentId: AGENT }).some((pid) => pid === 302 || pid === 303), false);
check('a scratch path matches its own processes only', killedOf({ scratch: `C:/p/.claude/fleet-env/scratch/${AGENT}` }), [301]);
check('worktree, id and scratch together are the union', killedOf({ worktree: WT, agentId: AGENT, scratch: `C:/p/.claude/fleet-env/scratch/${AGENT}` }), [100, 300, 301]);
check('this process and its ancestors are never killed, whatever names them', killedOf({ worktree: WT }).some((pid) => pid === 400 || pid === 900), false);
check('the protected ancestors are reported', reaperRun({ worktree: WT }).outcome.protected.map((entry) => entry.pid).sort((a, b) => a - b), [400, 900]);

const nothingGiven = (ownership) => killedOf(ownership);
check('an empty worktree matches nothing', nothingGiven({ worktree: '' }), []);
check('a blank worktree matches nothing', nothingGiven({ worktree: '   ' }), []);
check('an undefined ownership matches nothing', nothingGiven({}), []);
check('an empty id matches nothing', nothingGiven({ agentId: '' }), []);
check('the bare agent- prefix matches nothing', nothingGiven({ agentId: 'agent-' }), []);
check('an id too short to be an identity matches nothing', nothingGiven({ agentId: 'status' }), []);
check('a seven-character id is still too short', nothingGiven({ agentId: 'seven77' }), []);
check('an eight-character id is an identity', killedOf({ agentId: 'eight888' }), [304]);
check('an id with a space in it is no identity', nothingGiven({ agentId: 'node status' }), []);
check('an empty scratch matches nothing', nothingGiven({ scratch: '' }), []);
check('with nothing to match the outcome says so', reaperRun({}).outcome.refused, 'no-markers');

const outcomeLines = reaperRun({ worktree: WT }).outcome.lines;
check('every reported line is bilingual', outcomeLines.length > 0 && outcomeLines.every((line) => line.includes('@es')), true);
check('the report names what it killed', outcomeLines.some((line) => line.includes('100')), true);
check('the report names what it left alone', outcomeLines.some((line) => line.includes('Left alone 400')), true);
check('the first line counts the processes and the trees', outcomeLines[0], 'Reaped 4 process(es) of the closed agent in 1 tree(s). @es Segados 4 proceso(s) del agente cerrado en 1 árbol(es).');
check('nothing to reap says so', reaperRun({ worktree: 'C:/fx/.claude-wt/never-used' }).outcome.lines[0].startsWith('No live process belongs to the closed agent.'), true);
check('a name that occurs twice is matched on its bounded occurrence', killedOf({ worktree: WT }, { rows: [row(710, 1, `node x${WT}/a ${WT}/b`)], self: 1 }), [710]);
check('a trailing slash on the worktree still matches', killedOf({ worktree: `${WT}/` }, { rows: [row(700, 1, `sh watch.sh ${WT}`)] }), [700]);
check('a child with a lower pid than its matched parent is not a second root', killedOf({ worktree: WT }, { rows: [row(810, 1, `bash ${WT}/a.sh`), row(805, 810, `bash ${WT}/b.sh`)], self: 1 }), [810]);

const afterNothingDies = () => world;
const stubborn = reaperRun({ worktree: WT }, { after: afterNothingDies }).outcome;
check('a process still alive after the kill is a survivor', stubborn.survivors.map((entry) => entry.pid).sort((a, b) => a - b), [100, 101, 102, 103]);
check('survivors are not reported killed', stubborn.killed, []);
check('a survivor is announced in both languages', stubborn.lines.some((line) => line.includes('@es') && line.includes('100')), true);
const reused = reaperRun({ worktree: WT }, { after: (killed) => [...world.filter((entry) => !killed.has(entry.pid)), row(100, 1, 'a different program on a reused pid')] }).outcome;
check('a reused pid with another command line is not a survivor', reused.survivors.map((entry) => entry.pid).includes(100), false);
check('a failing killer leaves its tree reported as survivors', reaperRun({ worktree: WT }, { kill: () => false, after: afterNothingDies }).outcome.survivors.length, 4);

const cycle = [row(500, 501, `node ${WT}/a.mjs`), row(501, 500, `node ${WT}/b.mjs`)];
check('a parent cycle in the listing terminates and kills something', attempt(() => killedOf({ worktree: WT }, { rows: cycle, self: 1, after: () => [] }).length > 0), true);

// A main checkout is never reaped: its directory holds .git as a directory. @es Un checkout principal nunca se siega.
const mainCheckout = sandbox.repoDir;
const mainRun = reaperRun({ worktree: mainCheckout }, { rows: [row(600, 1, `node ${forward(mainCheckout)}/x.mjs`)] });
check('a main checkout is refused', mainRun.outcome.refused, 'not-a-linked-worktree');
check('a refused main checkout kills nothing', mainRun.killed, []);
const plain = sandbox.plainDir('plain-directory');
check('a directory that is no git checkout at all is refused', reaperRun({ worktree: plain }, { rows: [row(601, 1, `node ${forward(plain)}/x.mjs`)] }).outcome.refused, 'not-a-linked-worktree');
const gone = path.join(fixtureRoot, 'removed-worktree');
check('a worktree already removed is reaped by name', killedOf({ worktree: gone }, { rows: [row(602, 1, `sh ${forward(gone)}/watch-branches.sh`)], after: () => [] }), [602]);
check('a refused worktree refuses even when an id is also given', reaperRun({ worktree: mainCheckout, agentId: AGENT }).outcome.refused, 'not-a-linked-worktree');

// ---------------------------------------------------------------------------------------------------------------
// REAL half. @es Mitad REAL.
// ---------------------------------------------------------------------------------------------------------------
const profile = path.join(fixtureRoot, 'profile');
mkdirSync(profile);
const privateEnv = { ...process.env, USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(profile, 'AppData', 'Local') };
const realList = () => listProcesses(privateEnv);

const target = linkedWorktree('target');
const siblingOther = linkedWorktree('other');
const siblingPrefix = linkedWorktree('target-two');
const spawned = [];
const launch = (command, args) => {
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
  spawned.push(child);
  return child;
};
const GRANDCHILD_PARENT = "const { spawn } = require('node:child_process'); spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000);";

try {
  const loop = launch('bash', ['-c', `until [ -f "${forward(target)}/reports/mutation.json" ]; do sleep 15; done`]);
  const holder = launch(process.execPath, ['-e', GRANDCHILD_PARENT, target]);
  const other = launch(process.execPath, ['-e', 'setInterval(() => {}, 1000)', siblingOther]);
  const prefix = launch(process.execPath, ['-e', 'setInterval(() => {}, 1000)', siblingPrefix]);

  await wait(2500);
  const before = realList();
  const childrenOf = (parent) => before.filter((entry) => entry.parentPid === parent.pid).map((entry) => entry.pid);
  const sleepers = childrenOf(loop);
  const grandchildren = childrenOf(holder);

  check('precondition: the bash loop is running and names the worktree', before.some((entry) => entry.pid === loop.pid && forward(entry.commandLine).includes(forward(target))), true);
  check('precondition: the loop has a sleeping child that does not name the worktree', sleepers.length > 0 && before.filter((entry) => sleepers.includes(entry.pid)).every((entry) => !forward(entry.commandLine).includes(forward(target))), true);
  check('precondition: the node process has a child that does not name the worktree', grandchildren.length > 0, true);
  check('precondition: the sibling processes are running', [other, prefix].every((child) => before.some((entry) => entry.pid === child.pid)), true);

  let real = CRASHED;
  try {
    real = reapAgentProcesses({ worktree: target }, { list: realList });
  } catch {
    /* the crash stays the CRASHED outcome, which fails the checks below @es el crash queda como CRASHED y hace fallar los checks siguientes */
  }
  await wait(1500);
  const after = realList();
  const present = (pid) => after.some((entry) => entry.pid === pid);

  check('the real reap is not refused', real.refused, undefined);
  check('the bash loop is dead', present(loop.pid), false);
  check('the loop\'s sleeping child is dead with its tree', sleepers.some(present), false);
  check('the node process is dead', present(holder.pid), false);
  check('the node process\'s child is dead with its tree', grandchildren.some(present), false);
  check('nothing is reported as surviving', real.survivors, []);
  check('the sibling with a different worktree survives', present(other.pid), true);
  check('the sibling whose worktree name only starts the same survives', present(prefix.pid), true);
  check('the real reap reported the loop and the node process', [loop.pid, holder.pid].every((pid) => real.killed.some((entry) => entry.pid === pid)), true);
} finally {
  for (const child of spawned) {
    try {
      process.kill(child.pid);
    } catch {
      /* already gone @es ya muerto */
    }
  }
  await wait(300);
  rmSync(fixtureRoot, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
