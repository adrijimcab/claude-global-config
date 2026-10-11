#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `sdd-attempt-cwd-guard`.
 *
 * THE STATE SPACE, each state built as a REAL repository with REAL linked worktrees (git sandbox):
 *   repository   main + worktree with commits / main + worktree with only uncommitted changes /
 *                main + worktree already integrated and clean / main + no worktree / a linked worktree as --cwd /
 *                a directory that is no repository / a missing directory
 *   verb         acquire settle begin record finish (refused) / status reset inspect (never)
 *   spelling     `--cwd v`, `--cwd=v`, relative cwd, `cd` before, quoted path with spaces, chains, subshell, PowerShell
 *   data         the command text inside a commit message, an echo, a heredoc body
 *   near misses  `sdd-attempts`, `sdd-attempt-status`, another executable, no `--cwd` at all
 *
 * @es PRUEBA DE DISCRIMINACIÓN. Cada estado se construye como un repositorio REAL con worktrees enlazados
 * REALES: con commits, solo con cambios sin commitear, integrado y limpio, sin worktrees, cwd enlazado, sin
 * repositorio, inexistente; cada verbo; cada grafía; los textos que son DATO; y los casi-aciertos.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isolateState, stateDir } from '../hook-state/locations.mjs';

isolateState('sdd-attempt-cwd-guard');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const load = (relative) => import(pathToFileURL(path.join(HERE, relative)).href);
const { payloadFor } = await load('../hook-payloads/payloads.mjs');
const { createGitSandbox } = await load('../selftest-fixtures/git-sandbox.mjs');
const { evaluate } = await load('guard.mjs');
const { dialectOfTool } = await load('../shell-command/shell-command.mjs');

let failures = 0;
let total = 0;

function report(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const slash = (value) => value.split('\\').join('/');
const cleanups = [];

// Every scratch directory is removed on EVERY exit, a failing or throwing run included.
// @es Todo directorio temporal se borra en CUALQUIER salida, también en una corrida que falla o lanza.
process.once('exit', () => {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      /* a cleanup that fails must not hide the verdict */
    }
  }
});

/** A repository with one commit; `git(args, cwd)` runs git inside the sandbox environment. @es Un repositorio con un commit. */
function repository(parent = tmpdir()) {
  const sandbox = createGitSandbox({ parent });

  cleanups.push(sandbox.cleanup);

  const run = (args, cwd = sandbox.repoDir) => {
    const result = sandbox.git(args, { cwd });

    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  };
  const commitFile = (cwd, name) => {
    writeFileSync(path.join(cwd, name), name);
    run(['add', name], cwd);
    run(['commit', '-q', '-m', name], cwd);
  };

  commitFile(sandbox.repoDir, 'base.txt');

  return { ...sandbox, run, commitFile, worktree: (name, branch) => {
    const target = path.join(sandbox.root, name);

    run(['worktree', 'add', '-q', '-b', branch, target]);

    return target;
  } };
}

const active = repository();
const activeWorktree = active.worktree('wt-active', 'feat-active');
active.commitFile(activeWorktree, 'work.txt');

const dirtyOnly = repository();
const dirtyWorktree = dirtyOnly.worktree('wt-dirty', 'feat-dirty');
writeFileSync(path.join(dirtyWorktree, 'uncommitted.txt'), 'x');

const integrated = repository();
const integratedWorktree = integrated.worktree('wt-integrated', 'feat-integrated');
integrated.commitFile(integratedWorktree, 'done.txt');
integrated.run(['merge', '-q', '--ff-only', 'feat-integrated']);

const idle = repository();
const idleWorktree = idle.worktree('wt-idle', 'feat-idle');

const lone = repository();

const pair = repository();
const pairFirst = pair.worktree('wt-first', 'feat-first');
const pairSecond = pair.worktree('wt-second', 'feat-second');
pair.commitFile(pairFirst, 'first.txt');
pair.commitFile(pairSecond, 'second.txt');

const dirtyMain = repository();
dirtyMain.worktree('wt-idle', 'feat-idle');
writeFileSync(path.join(dirtyMain.repoDir, 'main-dirt.txt'), 'x');

const spacedParent = mkdtempSync(path.join(tmpdir(), 'sdd cwd guard '));
const spaced = repository(spacedParent);

cleanups.push(() => rmdirSync(spacedParent));
const spacedWorktree = spaced.worktree('wt with space', 'feat-space');
spaced.commitFile(spacedWorktree, 'work.txt');

const notRepository = active.plainDir('plain');
const missing = path.join(active.root, 'does-not-exist');

const payloadAt = (tool, cwd, command) => JSON.stringify({ ...payloadFor(tool, command, { sessionId: 'selftest' }), cwd });
const bash = (cwd, command) => payloadAt('Bash', slash(cwd), command);
const acquire = (target) => `gentle-ai sdd-attempt acquire --cwd ${target} --max-changed-lines 200`;

function run(input) {
  let output = '';

  try {
    output = execFileSync('node', [path.join(HERE, 'guard.mjs')], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch (error) {
    output = `CRASH ${error.status}`;
  }

  return output;
}

const cases = [
  // --- the incident shape and what is refused.
  ['deny', bash(slash(active.root), acquire(slash(active.repoDir))), 'REAL CASE: acquire --cwd main checkout while a worktree carries commits', activeWorktree],
  ['deny', bash(slash(dirtyOnly.root), acquire(slash(dirtyOnly.repoDir))), 'main checkout, the worktree has only UNCOMMITTED changes'],
  ['deny', bash(slash(active.repoDir), 'gentle-ai sdd-attempt acquire --cwd .'), 'relative --cwd . resolved against the command cwd'],
  ['deny', bash(slash(active.root), 'gentle-ai sdd-attempt acquire --cwd repo'), 'relative --cwd resolved against the payload cwd'],
  ['deny', bash(slash(tmpdir()), `cd "${slash(active.root)}" && gentle-ai sdd-attempt acquire --cwd repo`), 'relative --cwd resolved through the line\'s own cd'],
  ['deny', bash(slash(active.root), `gentle-ai sdd-attempt acquire --cwd="${slash(active.repoDir)}"`), 'the fused --cwd=<value> spelling'],
  ['deny', bash(slash(active.root), `gentle-ai.exe sdd-attempt acquire --cwd "${slash(active.repoDir)}"`), 'gentle-ai.exe'],
  ['deny', bash(slash(active.root), `git status && ${acquire(slash(active.repoDir))} && echo ok`), 'inside a && chain'],
  ['deny', bash(slash(active.root), `( ${acquire(slash(active.repoDir))} )`), 'inside a subshell'],
  ['deny', bash(slash(active.root), `bash -c '${acquire(slash(active.repoDir))}'`), 'inside bash -c'],
  ['deny', bash(slash(spaced.root), `gentle-ai sdd-attempt acquire --cwd "${slash(spaced.repoDir)}"`), 'quoted main checkout path WITH SPACES', spacedWorktree],
  ['deny', payloadAt('PowerShell', active.root, `gentle-ai sdd-attempt acquire --cwd "${active.repoDir}"`), 'PowerShell spelling, backslash path'],
  ['deny', payloadAt('PowerShell', active.root, `Set-Location repo; gentle-ai sdd-attempt settle --cwd .`), 'PowerShell Set-Location then a relative --cwd'],

  // --- every verb that binds the ledger.
  ...['acquire', 'settle', 'begin', 'record', 'finish'].map((verb) => ['deny', bash(slash(active.root), `gentle-ai sdd-attempt ${verb} --cwd "${slash(active.repoDir)}"`), `verb ${verb}`]),

  // --- verbs that never bind a tree.
  ...['status', 'reset', 'inspect'].map((verb) => ['allow', bash(slash(active.root), `gentle-ai sdd-attempt ${verb} --cwd "${slash(active.repoDir)}"`), `verb ${verb} is none of this guard's business`]),

  // --- what is allowed.
  ['allow', bash(slash(active.root), acquire(slash(activeWorktree))), 'the REMEDY: --cwd is the unit\'s own linked worktree'],
  ['allow', bash(slash(spaced.root), `gentle-ai sdd-attempt acquire --cwd "${slash(spacedWorktree)}"`), 'linked worktree path with spaces'],
  ['allow', bash(slash(integrated.root), acquire(slash(integrated.repoDir))), 'main checkout whose only worktree is already integrated and clean'],
  ['allow', bash(slash(idle.root), acquire(slash(idle.repoDir))), 'main checkout whose worktree is idle (no commits, clean)'],
  ['allow', bash(slash(pair.root), acquire(slash(pairFirst))), 'a linked worktree as --cwd while a SIBLING worktree carries work'],
  ['allow', bash(slash(dirtyMain.root), acquire(slash(dirtyMain.repoDir))), 'the MAIN checkout own uncommitted changes are not work elsewhere'],
  ['allow', bash(slash(lone.root), acquire(slash(lone.repoDir))), 'main checkout with no linked worktree'],

  // --- data, not command.
  ['allow', bash(slash(active.root), `git commit -m "docs: never run gentle-ai sdd-attempt acquire --cwd ${slash(active.repoDir)}"`), 'the command text inside a commit message'],
  ['allow', bash(slash(active.root), `echo "${acquire(slash(active.repoDir))}"`), 'the command text inside an echo'],
  ['allow', bash(slash(active.root), `cat <<'EOF' > note.txt\n${acquire(slash(active.repoDir))}\nEOF`), 'the command text inside a heredoc body'],

  // --- near misses.
  ['allow', bash(slash(active.root), `gentle-ai sdd-attempts acquire --cwd "${slash(active.repoDir)}"`), 'NEAR MISS: sdd-attempts'],
  ['allow', bash(slash(active.root), `gentle-ai sdd-attempt-status acquire --cwd "${slash(active.repoDir)}"`), 'NEAR MISS: sdd-attempt-status'],
  ['allow', bash(slash(active.root), `other-tool sdd-attempt acquire --cwd "${slash(active.repoDir)}"`), 'NEAR MISS: another executable'],
  ['allow', bash(slash(active.root), 'gentle-ai sdd-attempt acquire'), 'no --cwd at all'],
  ['allow', bash(slash(active.root), 'gentle-ai sdd-attempt acquire --cwd'), '--cwd with no value'],

  // --- not a shell command, and its own failures.
  ['allow', JSON.stringify({ tool_name: 'NotAShellTool', session_id: 'selftest', tool_input: { command: acquire(slash(active.repoDir)) }, cwd: slash(active.root) }), 'a tool with no shell dialect, even carrying a refused-shaped `command` field'],
  ['allow', 'NOT JSON AT ALL', 'garbage payload'],
  ['allow', '', 'empty payload'],
  ['allow', bash(slash(active.root), acquire(slash(notRepository))), 'FAIL-OPEN: --cwd is no repository'],
  ['allow', bash(slash(active.root), acquire(slash(missing))), 'FAIL-OPEN: --cwd does not exist']
];

for (const [expected, input, label, mustName] of cases) {
  const output = run(input);
  const actual = output.includes('"deny"') ? 'deny' : 'allow';
  const named = mustName === undefined || output.includes(slash(mustName)) || output.includes(mustName);

  report(actual === expected && !output.startsWith('CRASH') && named, `expected=${expected} actual=${actual}  ${label}${named ? '' : `  [never named ${mustName}]`}`);
}

// The refusal names the worktrees with their work, in both languages.
{
  const denied = run(bash(slash(active.root), acquire(slash(active.repoDir))));

  report(denied.includes('SDD-ATTEMPT-CWD GUARD REFUSED') && denied.includes('@es SDD-ATTEMPT-CWD GUARD RECHAZÓ'), 'the refusal carries English and its @es mirror with correct accents');
  report(denied.includes('1 commit(s) ahead'), 'the refusal says how many commits the worktree has');
  report(denied.includes("--cwd <the unit's own worktree>") && denied.includes('--cwd <el worktree propio de la unidad>'), 'the refusal says what to pass, once per language');
  report(run(bash(slash(dirtyOnly.root), acquire(slash(dirtyOnly.repoDir)))).includes('uncommitted changes'), 'a dirty worktree is described as having uncommitted changes');
}

// Fail-open is JOURNALED, not silent.
{
  const before = (() => { try { return readFileSync(path.join(stateDir('sdd-attempt-cwd-guard'), 'journal.jsonl'), 'utf8'); } catch { return ''; } })();

  try {
    evaluate(bash(slash(active.root), acquire(slash(notRepository))));

    const after = readFileSync(path.join(stateDir('sdd-attempt-cwd-guard'), 'journal.jsonl'), 'utf8');

    report(after.length > before.length && after.includes('"verdict":"fail-open"'), 'an unreadable repository is allowed AND journaled as fail-open');
  } catch (error) {
    report(false, `an unreadable repository must not throw out of evaluate(): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}

// The wiring: the registration names only tools the decision knows a dialect for, and the manifest lists the guard.
try {
  const declaration = JSON.parse(readFileSync(path.join(HERE, 'guard.mjs.hook-registration.json'), 'utf8'));
  const tools = String(declaration.registrations.find((one) => one.event === 'PreToolUse')?.matcher ?? '').split('|');
  const manifest = JSON.parse(readFileSync(path.join(HERE, '..', 'hook-dispatch', 'manifests', 'pretooluse-shell.json'), 'utf8'));

  for (const tool of tools) report(dialectOfTool(tool) !== undefined, `the registration names ${tool}, which the decision knows a dialect for`);
  report(manifest.guards.includes('../../sdd-attempt-cwd-guard/guard.mjs'), 'the PreToolUse shell manifest lists this guard');
} catch (error) {
  report(false, `the wiring is unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

console.log(`\n${total - failures}/${total} passed`);
process.exit(failures === 0 ? 0 : 1);
