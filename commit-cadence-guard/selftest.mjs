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

import { isolateState, stateDir } from '../hook-state/locations.mjs';

isolateState('commit-cadence-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (relative) => import(pathToFileURL(path.join(HERE, relative)).href);
const { createGitSandbox } = await load('../selftest-fixtures/git-sandbox.mjs');
const { evaluate } = await load('guard.mjs');
const { DEFAULTS, loadConfig } = await load('config.mjs');
const { heldPaths, porcelainPaths } = await load('holding-age.mjs');
const { measureHeld } = await load('measure.mjs');
const { stateKey, readAgentState, MECHANISM } = await load('agent-state.mjs');

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

/** A repository with one commit and one linked worktree. @es Un repositorio con un commit y un worktree enlazado. */
function scenario(name) {
  const sandbox = createGitSandbox();

  cleanups.push(sandbox.cleanup);

  const git = (args, cwd = sandbox.repoDir) => {
    const result = sandbox.git(args, { cwd });

    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  };

  writeFileSync(path.join(sandbox.repoDir, 'base.txt'), 'base');
  git(['add', 'base.txt']);
  git(['commit', '-q', '-m', 'base']);

  const worktree = path.join(sandbox.root, `wt-${name}`);

  git(['worktree', 'add', '-q', '-b', `feat-${name}`, worktree]);

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

const decide = (at, raw, deps = {}) => evaluate(raw, { now: () => at, ...deps });

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
  report(noticeOf(advised)?.includes('@es AVISO DE CADENCIA') === true, 'the notice carries its Spanish mirror');
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
  report(reasonOf(denied).includes('@es COMMIT-CADENCE GUARD RECHAZÓ'), 'the refusal carries its Spanish mirror');

  const denies = {
    Write: ['Write', { file_path: path.join(scene.worktree, 'x.txt'), content: 'x' }],
    MultiEdit: ['MultiEdit', { file_path: path.join(scene.worktree, 'f.txt'), edits: [] }],
    Agent: ['Agent', { prompt: 'p' }],
    'npm test': ['Bash', { command: 'npm test' }],
    'git push': ['Bash', { command: 'git push origin main' }],
    'git stash': ['Bash', { command: 'git stash' }],
    'a mixed line': ['Bash', { command: 'git status && npm test' }],
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

  arrive(scene);

  const raw = orchestratorCall(scene, 'Edit', edit(scene));

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

  const journalFile = path.join(stateDir(MECHANISM), 'journal.jsonl');
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

// --- pure parts ---
{
  const text = ' M a.txt\0?? b dir/c.txt\0R  new.txt\0old.txt\0A  d.txt\0';

  report(JSON.stringify(porcelainPaths(text)) === JSON.stringify(['a.txt', 'b dir/c.txt', 'new.txt', 'd.txt']), 'porcelain -z: modified, untracked with a space, a rename reported by its new path (origin skipped), added');
  report(porcelainPaths('').length === 0 && porcelainPaths('\0').length === 0, 'porcelain -z: nothing dirty is nothing');

  const held = heldPaths([{ path: 'before', modifiedMs: 50 }, { path: 'none', modifiedMs: undefined }, { path: 'late', modifiedMs: 500 }, { path: 'mid', modifiedMs: 150 }], { arrivalMs: 100, lastCommitMs: 200 });

  report(JSON.stringify(held) === JSON.stringify([{ path: 'mid', sinceMs: 200 }, { path: 'late', sinceMs: 500 }]), 'held paths: before arrival and undated are skipped, older-than-commit is clamped to the commit, oldest first');

  report(stateKey('abc-DEF_09') === 'abc-DEF_09' && stateKey('../x') === undefined && stateKey('') === undefined && stateKey(7) === undefined && stateKey('a/b') === undefined, 'state keys: plain names only, so an id cannot climb out of the state directory');

  const dir = scenario('config').sandbox.plainDir('cfg');
  const writeConfig = (name, body) => { const file = path.join(dir, name); writeFileSync(file, body); return file; };

  report(JSON.stringify(loadConfig(path.join(dir, 'missing.json'))) === JSON.stringify({ noticeMs: DEFAULTS.noticeMinutes * MINUTE, refuseMs: DEFAULTS.refuseMinutes * MINUTE, remeasureMs: DEFAULTS.remeasureSeconds * 1000 }), 'config: a missing file gives the defaults (15 min, 30 min, 60 s)');
  report(loadConfig(writeConfig('own.json', '{"noticeMinutes":1,"refuseMinutes":2,"remeasureSeconds":5}')).refuseMs === 2 * MINUTE, 'config: the file sets the windows');
  report(loadConfig(writeConfig('inverted.json', '{"noticeMinutes":9,"refuseMinutes":3}')).refuseMs === DEFAULTS.refuseMinutes * MINUTE, 'config: a notice window that is not shorter than the refusal falls back to the defaults');
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
  mkdirSync(stateDir(MECHANISM), { recursive: true });
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
