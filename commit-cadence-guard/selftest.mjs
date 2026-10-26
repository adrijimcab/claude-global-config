#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `commit-cadence-guard`.
 *
 * Every state is a REAL repository with a REAL linked worktree (git sandbox) and a FAKE clock: the guard takes
 * its time from `deps.now`, files get the modification time the scenario needs, and a commit gets the committer
 * date the scenario needs, so a 31-minute-old change takes no 31 minutes.
 *
 *   age          fresh (silent) / 16 minutes (notice) / 31 minutes (refusal) / a commit resets it, and what the
 *                commit left behind starts a new clock
 *   caller       a delegated agent is judged, the orchestrator never
 *   place        a linked worktree found from a `file_path` although `cwd` is the main checkout (measured) / a
 *                main checkout and a directory that is no repository are silent
 *   refusal      Edit, Write, Agent, `npm test`, `git push` and a mixed line are denied; `git commit|add|status|
 *                diff|log` (Bash and PowerShell), Read, Grep, Glob, `cd` and SubagentHandback are allowed
 *   cost         git is asked once per window per agent; the window is honoured
 *   failure      a git error and a crash are journaled and allowed
 *   leftovers    a path older than the agent's arrival is not counted
 *
 * @es PRUEBA DE DISCRIMINACIÓN. Cada estado es un repositorio REAL con un worktree enlazado REAL y un reloj
 * FALSO: la guardia toma su hora de `deps.now`, los ficheros reciben el mtime del escenario y un commit la fecha
 * de commit del escenario. Cubre edad, quién llama, dónde, qué permite la negativa, el coste, los fallos y los
 * restos de un actor anterior.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';

isolateState('commit-cadence-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (relative) => import(pathToFileURL(path.join(HERE, relative)).href);
const { createGitSandbox } = await load('../selftest-fixtures/git-sandbox.mjs');
const { evaluate } = await load('guard.mjs');
const { DEFAULTS, loadConfig } = await load('config.mjs');
const { heldPaths, porcelainPaths } = await load('holding-age.mjs');
const { measureHeld } = await load('measure.mjs');
const { findLinkedWorktree } = await load('worktree-locator.mjs');
const { stateKey, readAgentState, mechanismStateDir } = await load('agent-state.mjs');

let failures = 0;
let total = 0;

function report(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const cleanups = [];

process.once('exit', () => {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      /* a cleanup that fails must not hide the verdict */
    }
  }
});

const MINUTE = 60_000;
const T0 = Date.now() + 60 * MINUTE;

/**
 * The one repository every scenario shares, with one commit: a scenario adds its own linked worktree on its own
 * branch, so the (slow) `init` and first commit are paid once.
 * @es El repositorio que comparten los escenarios, con un commit: cada escenario añade su worktree enlazado en su
 * propia rama, así el `init` y el primer commit (lentos) se pagan una vez.
 */
const shared = (() => {
  const sandbox = createGitSandbox();

  cleanups.push(sandbox.cleanup);
  writeFileSync(path.join(sandbox.repoDir, 'base.txt'), 'base');

  for (const args of [['add', 'base.txt'], ['commit', '-q', '-m', 'base']]) {
    const result = sandbox.git(args);

    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }

  return sandbox;
})();

/** A scenario: the shared repository and a linked worktree of its own. @es Un escenario: el repositorio compartido y un worktree enlazado propio. */
function scenario(name) {
  const sandbox = shared;
  const worktree = path.join(sandbox.root, `wt-${name}`);
  const added = sandbox.git(['worktree', 'add', '-q', '-b', `feat-${name}`, worktree]);

  if (added.status !== 0) throw new Error(`git worktree add failed: ${added.stderr}`);

  const write = (file, atMs) => {
    writeFileSync(path.join(worktree, file), file);
    utimesSync(path.join(worktree, file), new Date(atMs), new Date(atMs));
  };
  const commitAt = (args, atMs) => spawnSync('git', args, { cwd: worktree, env: { ...sandbox.env, GIT_COMMITTER_DATE: `${Math.floor(atMs / 1000)} +0000` }, encoding: 'utf8' });

  return { sandbox, worktree, main: sandbox.repoDir, write, commitAt, agent: `agent${name}` };
}

const subagentTranscript = (agent) => `C:/Users/x/.claude/projects/p/session/subagents/agent-${agent}.jsonl`;

/** The payload of a delegated agent's tool call; `cwd` is the MAIN checkout unless given, as measured. @es El payload de una llamada de un agente delegado. */
const call = (scene, tool, input, { cwd = scene.main, agent = scene.agent } = {}) => JSON.stringify({ session_id: 's', transcript_path: subagentTranscript(agent), cwd, hook_event_name: 'PreToolUse', agent_id: agent, tool_name: tool, tool_input: input });

const orchestratorCall = (scene, tool, input) => JSON.stringify({ session_id: 's', transcript_path: 'C:/Users/x/.claude/projects/p/session.jsonl', cwd: scene.main, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input });

/** `evaluate` at a fake time; a throw becomes a value no check accepts, so it fails a check instead of the run. @es `evaluate` a una hora falsa; un lanzamiento es un valor que ningún check acepta. */
const decide = (at, raw, deps = {}) => {
  try {
    return evaluate(raw, { now: () => at, ...deps });
  } catch (error) {
    return { threw: String(error) };
  }
};

const journalText = () => { try { return readFileSync(path.join(mechanismStateDir(), 'journal.jsonl'), 'utf8'); } catch { return ''; } };

const isDeny = (output) => output?.hookSpecificOutput?.permissionDecision === 'deny';
const noticeOf = (output) => output?.hookSpecificOutput?.additionalContext;
const reasonOf = (output) => output?.hookSpecificOutput?.permissionDecisionReason ?? '';

const edit = (scene, file = 'f.txt') => ({ file_path: path.join(scene.worktree, file), old_string: 'a', new_string: 'b' });

/** Arrives at T0 with a call that names the worktree, then writes `files` at T0+1s. @es Llega en T0 y luego escribe los ficheros. */
function arrive(scene, files = ['f.txt']) {
  const arrival = decide(T0, call(scene, 'Edit', edit(scene)));

  for (const file of files) scene.write(file, T0 + 1000);

  return arrival;
}

// --- age: fresh, notice, refusal, reset ---
{
  const scene = scenario('age');

  report(arrive(scene) === undefined, 'arrival: the first call of an agent is silent');
  report(decide(T0 + 90_000, call(scene, 'Read', { file_path: path.join(scene.worktree, 'f.txt') })) === undefined, 'a fresh dirty path (89 s old) is silent');

  const advised = decide(T0 + 16 * MINUTE, call(scene, 'Bash', { command: 'npm test' }));

  report(noticeOf(advised)?.includes('held uncommitted work for 15 minutes') === true, 'a 16-minute-old path is advised, naming the age');
  report(!isDeny(advised), 'the notice does not deny');
  report(noticeOf(advised)?.includes('f.txt') === true && noticeOf(advised)?.includes('git commit -m "<msg>" -- f.txt') === true, 'the notice names the path and the exact commit command');
  report(noticeOf(advised)?.includes('Commit now (git add any new file first): git commit') === true && noticeOf(advised)?.includes('Commitea ahora') === true, 'the notice tells the agent to commit now, in both languages');
  report(noticeOf(advised)?.includes('@es AVISO DE CADENCIA') === true,'the notice carries its Spanish mirror');
}

// --- refusal and its allowances ---
{
  const scene = scenario('refuse');

  arrive(scene);
  scene.write('g.txt', T0 + 2000);

  const at = T0 + 31 * MINUTE;
  const denied = decide(at, call(scene, 'Edit', edit(scene)));

  report(isDeny(denied), 'a 31-minute-old path denies an Edit');
  report(reasonOf(denied).includes('TO UNBLOCK') && reasonOf(denied).includes('git commit -m "<msg>" -- f.txt g.txt'), 'the refusal says exactly how to unblock');
  report(reasonOf(denied).includes('@es COMMIT-CADENCE GUARD RECHAZÓ') && reasonOf(denied).includes('PARA DESBLOQUEAR'), 'the refusal carries its Spanish mirror');
  report(reasonOf(denied).includes('Read, Grep, Glob') && reasonOf(denied).includes('SubagentHandback') && !reasonOf(denied).includes('more'), 'the refusal says what stays allowed and the exit hatch, and counts no hidden paths when none are hidden');
  report(reasonOf(denied).includes('report that blocker with SubagentHandback') && reasonOf(denied).includes('TO UNBLOCK: commit'), 'the refusal names the exit hatch and the unblock step in English');
  report(journalText().includes('"verdict":"deny"'), 'a refusal is journaled');
  decide(T0, call(scene, 'Edit', edit(scene), { agent: '../evil' }));
  report(decide(at, call(scene, 'Edit', edit(scene), { agent: '../evil' })) === undefined, 'an agent id that is not a plain name is not judged (and cannot climb out of the state directory)');

  const denies = {
    Write: ['Write', { file_path: path.join(scene.worktree, 'x.txt'), content: 'x' }],
    MultiEdit: ['MultiEdit', { file_path: path.join(scene.worktree, 'f.txt'), edits: [] }],
    Agent: ['Agent', { prompt: 'p' }],
    'npm test': ['Bash', { command: 'npm test' }],
    'git push': ['Bash', { command: 'git push origin main' }],
    'git stash': ['Bash', { command: 'git stash' }],
    'a mixed line': ['Bash', { command: 'git status && npm test' }],
    'a commit chained with a forbidden command': ['Bash', { command: 'git commit -m x -- f.txt && npm test' }],
    'allowed git then a forbidden git': ['Bash', { command: 'git status && git push' }],
    'a piped line': ['Bash', { command: 'git log | head -3' }],
    'PowerShell Remove-Item': ['PowerShell', { command: 'Remove-Item f.txt' }]
  };

  for (const [label, [tool, input]] of Object.entries(denies)) report(isDeny(decide(at, call(scene, tool, input))), `denied under the refusal: ${label}`);

  const allows = {
    Read: ['Read', { file_path: path.join(scene.worktree, 'f.txt') }],
    Grep: ['Grep', { pattern: 'x' }],
    Glob: ['Glob', { pattern: '*.txt' }],
    'git add': ['Bash', { command: 'git add f.txt g.txt' }],
    'git status': ['Bash', { command: 'git status --short' }],
    'git diff': ['Bash', { command: 'git diff' }],
    'git log': ['Bash', { command: 'git log --oneline -3' }],
    'cd then git status': ['Bash', { command: `cd ${path.join(scene.worktree).split('\\').join('/')} && git status` }],
    'PowerShell git status': ['PowerShell', { command: 'git status' }],
    SubagentHandback: ['SubagentHandback', { message: 'blocked' }]
  };

  for (const [label, [tool, input]] of Object.entries(allows)) report(decide(at, call(scene, tool, input)) === undefined, `allowed under the refusal: ${label}`);

  report(decide(at, call(scene, 'Bash', { command: 'git commit -m "wip" -- f.txt' })) === undefined, 'allowed under the refusal: git commit');
  report(isDeny(decide(at + 1000, call(scene, 'Edit', edit(scene)))), 'a commit that has not landed lifts nothing: the next Edit is still denied');

  // The commit lands at T0+31min+5s; only f.txt is in it.
  const landed = scene.commitAt(['add', 'f.txt'], at + 5000);
  const committed = scene.commitAt(['commit', '-q', '-m', 'f', '--', 'f.txt'], at + 5000);

  report(landed.status === 0 && committed.status === 0, `the real commit landed (exit ${committed.status})`);
  report(decide(at + 62_000, call(scene, 'Edit', edit(scene))) === undefined, 'a denial measured just before the commit lands lifts within one window (62 s), the bounded staleness');
  report(decide(at + 14 * MINUTE, call(scene, 'Edit', edit(scene))) === undefined, 'what the commit left behind (g.txt) starts a new clock: silent at 14 minutes');
  report(noticeOf(decide(at + 16 * MINUTE, call(scene, 'Edit', edit(scene))))?.includes('g.txt') === true, 'g.txt is advised 16 minutes after the commit, not 47 minutes after its mtime');
}

// --- the reset is immediate when nothing is measured between the allowed commit and its landing ---
{
  const scene = scenario('reset');

  arrive(scene);

  const at = T0 + 31 * MINUTE;

  report(isDeny(decide(at, call(scene, 'Edit', edit(scene)))), 'reset: a 31-minute-old path is denied');
  report(decide(at + 1000, call(scene, 'Bash', { command: 'git add f.txt && git commit -m f -- f.txt' })) === undefined, 'reset: the commit line is allowed');
  report(scene.commitAt(['add', 'f.txt'], at + 2000).status === 0 && scene.commitAt(['commit', '-q', '-m', 'f', '--', 'f.txt'], at + 2000).status === 0, 'reset: the real commit landed');
  report(decide(at + 3000, call(scene, 'Edit', edit(scene))) === undefined, 'reset: the very next Edit is allowed, the age is gone');
}

// --- the cost window ---
{
  const scene = scenario('cost');
  let measurements = 0;
  const counting = { measure: (...args) => { measurements += 1; return measureHeld(...args); } };

  decide(T0, call(scene, 'Edit', edit(scene)), counting);
  scene.write('f.txt', T0 + 1000);
  measurements = 0;

  decide(T0 + 61_000, call(scene, 'Read', { file_path: 'x' }), counting);
  const afterFirst = measurements;

  decide(T0 + 70_000, call(scene, 'Read', { file_path: 'x' }), counting);
  decide(T0 + 119_000, call(scene, 'Read', { file_path: 'x' }), counting);
  const insideWindow = measurements;

  decide(T0 + 122_000, call(scene, 'Read', { file_path: 'x' }), counting);

  report(afterFirst === 1, 'the first call after a window measures git once');
  report(insideWindow === 1, 'calls inside the 60 s window do not ask git again');
  report(measurements === 2, 'the first call after the window measures again');
  report(isDeny(decide(T0 + 40 * MINUTE, call(scene, 'Edit', edit(scene)), counting)) && measurements === 3, 'inside a window the stored start still lets the age cross the refusal (one measurement per window)');
}

// --- the caller ---
{
  const scene = scenario('caller');
  const raw = orchestratorCall(scene, 'Edit', edit(scene));

  decide(T0, raw);
  arrive(scene);

  report(decide(T0 + 31 * MINUTE, raw) === undefined, 'the orchestrator is never judged, even with a 31-minute-old dirty worktree');
  report(readAgentState('agentcaller') !== undefined && readAgentState('agentcaller').worktree !== undefined, 'the delegated agent was judged: its state holds the worktree');
}

// --- the place ---
{
  const scene = scenario('place');

  writeFileSync(path.join(scene.main, 'm.txt'), 'm');
  utimesSync(path.join(scene.main, 'm.txt'), new Date(T0 + 1000), new Date(T0 + 1000));

  const mainEdit = { file_path: path.join(scene.main, 'm.txt'), old_string: 'a', new_string: 'b' };

  decide(T0, call(scene, 'Edit', mainEdit));
  report(decide(T0 + 31 * MINUTE, call(scene, 'Edit', mainEdit)) === undefined, 'a main checkout (not a linked worktree) is silent');

  const plain = scene.sandbox.plainDir('plain');

  report(decide(T0 + 31 * MINUTE, call(scene, 'Edit', { file_path: path.join(plain, 'a.txt') }, { cwd: plain, agent: 'agentplain' })) === undefined, 'a directory that is no repository is silent');
  report(readAgentState('agentplace')?.worktree === undefined, 'no worktree is remembered for an agent that works in the main checkout');

  const found = scenario('found');

  arrive(found);
  report(readAgentState('agentfound')?.worktree !== undefined, 'the worktree is found from a file_path although cwd is the main checkout');
  report(isDeny(decide(T0 + 31 * MINUTE, call(found, 'Bash', { command: 'npm test' }))), 'and it is remembered: a later call with cwd on the main checkout is still judged');

  const byCommand = scenario('bycommand');

  decide(T0, call(byCommand, 'Bash', { command: `cd ${byCommand.worktree.split('\\').join('/')} && git status` }));
  report(readAgentState('agentbycommand')?.worktree !== undefined, 'the worktree is found from the directory a shell line cd-es into');
}

// --- failure ---
{
  const scene = scenario('failure');

  arrive(scene);

  const journalFile = path.join(mechanismStateDir(), 'journal.jsonl');
  const journalText = () => { try { return readFileSync(journalFile, 'utf8'); } catch { return ''; } };
  const before = journalText().length;
  const gitFails = { measure: () => ({ ok: false, reason: 'git status exit 128: boom' }) };

  report(decide(T0 + 31 * MINUTE, call(scene, 'Edit', edit(scene)), gitFails) === undefined, 'a git error allows the call');
  report(journalText().length > before && journalText().includes('boom') && journalText().includes('fail-open'), 'a git error is journaled as fail-open with its reason');

  const crashing = scenario('crash');

  arrive(crashing);
  report(decide(T0 + 31 * MINUTE, call(crashing, 'Edit', edit(crashing)), { measure: () => { throw new Error('kaboom'); } }) === undefined, 'a crash inside the measurement allows the call');
  report(journalText().includes('kaboom'), 'a crash is journaled');

  const timedOut = measureHeld(scene.worktree, T0, { ask: () => ({ status: null, stdout: '', stderr: '', timedOut: true }) });

  report(timedOut.ok === false && timedOut.reason.includes('timed out'), 'a git timeout is a value (ok false, "timed out"), not a throw');
}

// --- leftovers of an earlier actor ---
{
  const scene = scenario('leftover');

  scene.write('old.txt', T0 - 3 * 60 * MINUTE);
  arrive(scene, []);
  report(decide(T0 + 31 * MINUTE, call(scene, 'Edit', edit(scene))) === undefined, 'a path older than the agent arrival (left by someone else) is not counted');
  scene.write('mine.txt', T0 + 5000);
  report(isDeny(decide(T0 + 33 * MINUTE, call(scene, 'Edit', edit(scene)))), 'a path the agent wrote after arriving is counted');
}

// --- the exact windows ---
{
  const scene = scenario('edge');

  arrive(scene);

  const justBefore = decide(T0 + 1000 + 15 * MINUTE - 1, call(scene, 'Bash', { command: 'npm test' }));

  report(justBefore === undefined, 'one millisecond before the notice window nothing is said');

  const scene2 = scenario('edge2');

  arrive(scene2);
  report(noticeOf(decide(T0 + 1000 + 15 * MINUTE, call(scene2, 'Bash', { command: 'npm test' }))) !== undefined, 'at exactly 15 minutes the notice is given');

  const scene3 = scenario('edge3');

  arrive(scene3);
  report(!isDeny(decide(T0 + 1000 + 30 * MINUTE - 1, call(scene3, 'Bash', { command: 'npm test' }))), 'one millisecond before the refusal window nothing is denied');

  const scene4 = scenario('edge4');

  arrive(scene4);
  report(isDeny(decide(T0 + 1000 + 30 * MINUTE, call(scene4, 'Bash', { command: 'npm test' }))), 'at exactly 30 minutes the call is denied');

  const scene5 = scenario('once');

  arrive(scene5);
  report(noticeOf(decide(T0 + 16 * MINUTE, call(scene5, 'Read', {}))) !== undefined, 'the notice is given on the call that measures');
  report(decide(T0 + 16 * MINUTE + 10_000, call(scene5, 'Read', {})) === undefined, 'the notice is not repeated from the stored measurement inside the window');
  report(noticeOf(decide(T0 + 17 * MINUTE + 5000, call(scene5, 'Read', {}))) !== undefined, 'it is given again at the next measurement');
}

// --- the oldest path sets the age, not the newest ---
{
  const scene = scenario('oldest');

  arrive(scene);
  scene.write('late.txt', T0 + 20 * MINUTE);
  report(isDeny(decide(T0 + 31 * MINUTE, call(scene, 'Edit', edit(scene)))), 'two paths of 30 and 11 minutes: the oldest one sets the age');
}

// --- the cost of the cache, the commit and the discovery ---
{
  const scene = scenario('cache');
  let measurements = 0;
  let searches = 0;
  const counting = { measure: (...args) => { measurements += 1; return measureHeld(...args); } };

  arrive(scene);
  measurements = 0;
  decide(T0 + 61_000, call(scene, 'Read', {}), counting);
  decide(T0 + 62_000, call(scene, 'Bash', { command: 'git add f.txt' }), counting);
  decide(T0 + 63_000, call(scene, 'Bash', { command: 'git status' }), counting);

  report(measurements === 1, 'git add and git status do not drop the stored measurement');
  decide(T0 + 64_000, call(scene, 'Bash', { command: 'git commit -m x -- f.txt' }), counting);
  decide(T0 + 65_000, call(scene, 'Read', {}), counting);
  report(measurements === 2, 'a git commit drops it, so the next call measures again');

  const lonely = scenario('search');
  const locate = () => { searches += 1; return undefined; };
  let measured = 0;
  const measure = () => { measured += 1; return { ok: true, held: [] }; };
  const mainFile = { file_path: path.join(lonely.main, 'base.txt') };

  decide(T0, call(lonely, 'Edit', mainFile, { agent: 'agentsearch' }), { locate, measure });
  decide(T0 + 10_000, call(lonely, 'Edit', mainFile, { agent: 'agentsearch' }), { locate, measure });
  report(searches === 1, 'an agent whose worktree is not found is searched for once per window');
  report(measured === 0, 'and git is never measured for an agent that has no worktree');
  decide(T0 + 61_000, call(lonely, 'Edit', mainFile, { agent: 'agentsearch' }), { locate });
  report(searches === 2, 'and again after the window');
  report(readAgentState('agentsearch')?.arrivalMs === T0, 'the arrival time survives calls that found no worktree');

  const later = scenario('later');

  decide(T0, call(later, 'Edit', { file_path: path.join(later.main, 'base.txt') }, { agent: 'agentlater' }));
  report(readAgentState('agentlater')?.worktree === undefined, 'before it names the worktree an agent has none');
  decide(T0 + 70_000, call(later, 'Edit', edit(later), { agent: 'agentlater' }));
  report(readAgentState('agentlater')?.worktree !== undefined && readAgentState('agentlater').arrivalMs === T0, 'it is found once a call names it, keeping the first arrival');

  const broken = scenario('broken');
  let broke = 0;

  arrive(broken);
  broken.write('f.txt', T0 + 1000);
  decide(T0 + 31 * MINUTE, call(broken, 'Edit', edit(broken)), { measure: () => { broke += 1; return { ok: false, reason: 'git status exit 128: gone' }; } });
  decide(T0 + 31 * MINUTE + 5000, call(broken, 'Edit', edit(broken)), { measure: () => { broke += 1; return { ok: false, reason: 'git status exit 128: gone' }; } });
  report(broke === 1, 'a failed measurement is stored for the window: git is not hammered');
  report(readAgentState('agentbroken')?.worktree === undefined, 'and the worktree is forgotten so the next window looks again');
}

// --- where the call points ---
{
  const grep = scenario('grep');

  decide(T0, call(grep, 'Grep', { pattern: 'x', path: grep.worktree }, { agent: 'agentgrep' }));
  report(readAgentState('agentgrep')?.worktree !== undefined, 'a Grep path inside the worktree finds it');

  const notebook = scenario('notebook');

  decide(T0, call(notebook, 'NotebookEdit', { notebook_path: path.join(notebook.worktree, 'n.ipynb') }, { agent: 'agentnotebook' }));
  report(readAgentState('agentnotebook')?.worktree !== undefined, 'a notebook_path inside the worktree finds it');

  const many = scenario('many');

  decide(T0, call(many, 'Bash', { command: `cd ${many.main.split('\\').join('/')}; cd ${many.sandbox.root.split('\\').join('/')}; cd ${many.sandbox.root.split('\\').join('/')}/..; cd ${many.sandbox.root.split('\\').join('/')}/../..; cd /; cd /c/Windows; cd ${many.worktree.split('\\').join('/')}; git status` }, { agent: 'agentmany' }));
  report(readAgentState('agentmany')?.worktree === undefined, 'discovery tries a bounded number of directories per call');
}

// --- a known worktree is not searched again; a clean run journals nothing; a corrupt state is a fresh agent ---
{
  const scene = scenario('known');
  let searches = 0;
  const counting = { locate: (payload) => { searches += 1; return findLinkedWorktree(payload); } };
  const journalFile = path.join(mechanismStateDir(), 'journal.jsonl');
  const journalSize = () => { try { return readFileSync(journalFile, 'utf8').length; } catch { return 0; } };
  const before = journalSize();

  decide(T0, call(scene, 'Edit', edit(scene)), counting);
  decide(T0 + 5000, call(scene, 'Read', {}), counting);
  decide(T0 + 120_000, call(scene, 'Read', {}), counting);
  report(searches === 1, 'once the worktree is known no later call searches for it');
  report(journalSize() === before, 'a clean run journals nothing (no silent fail-open)');

  const corrupt = scenario('corrupt');
  const stateFile = path.join(mechanismStateDir(), 'agents', 'agentcorrupt.json');

  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, '7');
  report(readAgentState('agentcorrupt') === undefined, 'a state file that is not an object reads as no state');
  decide(T0, call(corrupt, 'Edit', edit(corrupt)));
  report(readAgentState('agentcorrupt')?.arrivalMs === T0, 'and the agent starts afresh from it');
}

// --- a real measurement, nested and spaced paths ---
{
  const scene = scenario('measure');

  mkdirSync(path.join(scene.worktree, 'sub', 'deeper'), { recursive: true });
  writeFileSync(path.join(scene.worktree, 'sub', 'deeper', 'n.txt'), 'n');
  writeFileSync(path.join(scene.worktree, 'a b.txt'), 'ab');

  const answer = measureHeld(scene.worktree, 0);

  report(answer.ok && answer.held.map((one) => one.path).sort().join('|') === 'a b.txt|sub/deeper/n.txt', 'a measurement lists each untracked FILE by its path (not the directory), spaces included');
  report(answer.held.every((one) => one.sinceMs > 0), 'and dates each one');

  const many = scenario('lots');

  arrive(many, Array.from({ length: 10 }, (_, index) => `p${index}.txt`));

  const refused = reasonOf(decide(T0 + 31 * MINUTE, call(many, 'Edit', edit(many))));

  report(refused.includes('+2 more') && refused.includes('p7.txt') && !refused.includes('p8.txt'), 'a message lists at most 8 paths and counts the rest');
  report(decide(T0 + 31 * MINUTE + 1000, call(many, 'Bash', { command: '' })) !== undefined, 'an empty shell command is not allowed under the refusal');
}

// --- pure parts ---
{
  report(porcelainPaths('ab \0 M x\0').join('|') === 'x', 'porcelain -z: an entry shorter than status plus a path is ignored');
  report(porcelainPaths('?? x\0').join('|') === 'x', 'porcelain -z: a one-character path is kept');
  report(porcelainPaths('C  copy.txt\0orig.txt\0 M z.txt\0').join('|') === 'copy.txt|z.txt', 'porcelain -z: a copy is reported by its new path, its origin skipped');
  report(porcelainPaths(' R moved.txt\0was.txt\0 M z.txt\0').join('|') === 'moved.txt|z.txt', 'porcelain -z: a rename in the worktree column skips its origin too');
  report(heldPaths([{ path: 'edge', modifiedMs: 100 }], { arrivalMs: 100, lastCommitMs: 0 }).length === 1, 'held paths: a path modified at the very moment of arrival counts');
  report(stateKey('azAZ09-_') === 'azAZ09-_' && stateKey(`a${'b'.repeat(127)}`) !== undefined && stateKey('a'.repeat(129)) === undefined && stateKey('a b') === undefined && stateKey('a.b') === undefined, 'state keys: the whole alphabet, 128 characters at most');
  const text = ' M a.txt\0?? b dir/c.txt\0R  new.txt\0old.txt\0A  d.txt\0';

  report(JSON.stringify(porcelainPaths(text)) === JSON.stringify(['a.txt', 'b dir/c.txt', 'new.txt', 'd.txt']), 'porcelain -z: modified, untracked with a space, a rename reported by its new path (origin skipped), added');
  report(porcelainPaths('').length === 0 && porcelainPaths('\0').length === 0, 'porcelain -z: nothing dirty is nothing');

  const held = heldPaths([{ path: 'before', modifiedMs: 50 }, { path: 'none', modifiedMs: undefined }, { path: 'late', modifiedMs: 500 }, { path: 'mid', modifiedMs: 150 }], { arrivalMs: 100, lastCommitMs: 200 });

  report(JSON.stringify(held) === JSON.stringify([{ path: 'mid', sinceMs: 200 }, { path: 'late', sinceMs: 500 }]), 'held paths: before arrival and undated are skipped, older-than-commit is clamped to the commit, oldest first');

  const keyOf = (id) => { try { return stateKey(id); } catch { return 'THREW'; } };

  report(keyOf('abc-DEF_09') === 'abc-DEF_09' && keyOf('../x') === undefined && keyOf('') === undefined && keyOf(7) === undefined && keyOf(undefined) === undefined && stateKey('a/b') === undefined, 'state keys: plain names only, so an id cannot climb out of the state directory');

  const dir = scenario('config').sandbox.plainDir('cfg');
  const writeConfig = (name, body) => { const file = path.join(dir, name); writeFileSync(file, body); return file; };

  report(JSON.stringify(loadConfig(path.join(dir, 'missing.json'))) === JSON.stringify({ noticeMs: DEFAULTS.noticeMinutes * MINUTE, refuseMs: DEFAULTS.refuseMinutes * MINUTE, remeasureMs: DEFAULTS.remeasureSeconds * 1000 }), 'config: a missing file gives the defaults (15 min, 30 min, 60 s)');
  report(loadConfig(writeConfig('own.json', '{"noticeMinutes":1,"refuseMinutes":2,"remeasureSeconds":5}')).refuseMs === 2 * MINUTE && loadConfig(path.join(dir, 'own.json')).noticeMs === MINUTE && loadConfig(path.join(dir, 'own.json')).remeasureMs === 5000, 'config: the file sets the windows');
  report(loadConfig(writeConfig('inverted.json', '{"noticeMinutes":9,"refuseMinutes":3}')).refuseMs === DEFAULTS.refuseMinutes * MINUTE, 'config: a notice window that is not shorter than the refusal falls back to the defaults');
  report(JSON.stringify(loadConfig(path.join(dir, 'missing.json'))) === '{"noticeMs":900000,"refuseMs":1800000,"remeasureMs":60000}', 'config: the defaults are 15 minutes, 30 minutes and 60 seconds, literally');
  report(loadConfig(writeConfig('infinite.json', '{"noticeMinutes":5,"refuseMinutes":1e999}')).refuseMs === 30 * MINUTE, 'config: a window that is not a finite number falls back to the defaults');
  report(loadConfig(writeConfig('equal.json', '{"noticeMinutes":3,"refuseMinutes":3}')).refuseMs === DEFAULTS.refuseMinutes * MINUTE, 'config: equal windows fall back to the defaults');
  report(loadConfig(writeConfig('junk.json', '{"noticeMinutes":"x","refuseMinutes":-1,"remeasureSeconds":0}')).remeasureMs === DEFAULTS.remeasureSeconds * 1000, 'config: non-positive or non-numeric values fall back to the defaults');
  report(loadConfig(writeConfig('broken.json', '{not json')).noticeMs === DEFAULTS.noticeMinutes * MINUTE, 'config: unparseable JSON falls back to the defaults');
}

// --- the real process and the wiring ---
{
  const scene = scenario('process');
  const run = (input) => spawnSync('node', [path.join(HERE, 'guard.mjs')], { input, encoding: 'utf8' });
  const orchestrator = run(orchestratorCall(scene, 'Bash', { command: 'npm test' }));
  const unreadable = run('not json');

  report(orchestrator.status === 0 && orchestrator.stdout === '', 'as a process: the orchestrator payload prints nothing (exit 0)');
  report(unreadable.status === 0 && unreadable.stdout === '', 'as a process: an unreadable payload prints nothing (exit 0)');

  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-language.json'), 'utf8'));
  const settings = JSON.parse(readFileSync(path.join(HERE, '..', 'settings.json'), 'utf8'));
  const entry = settings.hooks.PreToolUse.find((one) => String(one.hooks?.[0]?.command).includes('pretooluse-language.json'));

  report(declaration.registrations.every((one) => one.event === 'PreToolUse' && one.matcher === undefined), 'the registration is PreToolUse with no matcher (every tool)');
  report(manifest.guards.includes('../../commit-cadence-guard/guard.mjs'), 'the PreToolUse manifest that settings.json wires without a matcher lists this guard');
  report(entry !== undefined && entry.matcher === undefined, 'settings.json wires that manifest with no matcher, so every tool reaches the guard');
  mkdirSync(mechanismStateDir(), { recursive: true });
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
