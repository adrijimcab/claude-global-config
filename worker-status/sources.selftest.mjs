#!/usr/bin/env node
/**
 * Proof of `processes.mjs` (matching over an injected listing; the listing itself is proven in
 * `process-control/process-port.selftest.mjs`) and `worktree-git.mjs` (injected git runner plus a
 * constructed repository with a real origin).
 * @es Prueba de `processes.mjs` (coincidencia sobre un listado inyectado; el listado se prueba en
 * `process-control/process-port.selftest.mjs`) y `worktree-git.mjs` (ejecutor de git inyectado más un
 * repositorio construido con un origin real).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { listProcesses as portListProcesses, rowsOfListing as portRowsOfListing } from '../process-control/process-port.mjs';
import { listProcesses, processesNaming, rowsOfListing } from './processes.mjs';
import { gitState } from './worktree-git.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'worker-sources-'));
const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);

  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

try {
  // ── processes: injected listing ──
  const listing = [
    { pid: 11, commandLine: 'node C:\\Users\\me\\.claude-wt\\feat-one\\run.mjs' },
    { pid: 12, commandLine: 'node c:/users/me/.claude-wt/FEAT-ONE/other.mjs' },
    { pid: 13, commandLine: 'node C:/Users/me/.claude-wt/feat-two/run.mjs' },
    { pid: process.pid, commandLine: 'node C:/Users/me/.claude-wt/feat-one/self.mjs' }
  ];
  const naming = (worktree) => processesNaming(worktree, () => listing).map((entry) => entry.pid);

  check('processes: backslash and slash spellings both match', naming('C:/Users/me/.claude-wt/feat-one'), [11, 12]);
  check('processes: matching ignores case', naming('c:\\USERS\\me\\.claude-wt\\Feat-One'), [11, 12]);
  check('processes: another worktree is not named', naming('C:/Users/me/.claude-wt/feat-two'), [13]);
  check('processes: nothing names an unknown worktree', naming('C:/nowhere'), []);
  check('processes: the caller itself is never reported', naming('C:/Users/me/.claude-wt/feat-one').includes(process.pid), false);

  // The old import path keeps working: the same functions the port owns, not copies.
  // @es La ruta de importación antigua sigue funcionando: las mismas funciones del puerto, no copias.
  check('processes: listProcesses is still importable from here, and is the port one', listProcesses === portListProcesses, true);
  check('processes: rowsOfListing is still importable from here, and is the port one', rowsOfListing === portRowsOfListing, true);

  // ── gitState: injected runner ──
  const scripted = (answers) => (args) => answers[args.join(' ')] ?? { status: 1, stdout: '' };
  const base = {
    'rev-parse --abbrev-ref HEAD': { status: 0, stdout: 'feat/x' },
    'log -1 --format=%h %s': { status: 0, stdout: 'abc1234 subject' },
    'status --porcelain': { status: 0, stdout: ' M a\n?? b\n?? c' }
  };
  const withUpstream = { ...base, 'rev-parse --abbrev-ref @{upstream}': { status: 0, stdout: 'origin/feat/x' }, 'rev-list --count origin/feat/x..HEAD': { status: 0, stdout: '3' } };
  const withDefault = { ...base, 'symbolic-ref --short refs/remotes/origin/HEAD': { status: 0, stdout: 'origin/master' }, 'rev-list --count origin/master..HEAD': { status: 0, stdout: '2' } };

  check('git: upstream is the base and ahead is counted', gitState('x', scripted(withUpstream)), { branch: 'feat/x', head: 'abc1234 subject', base: 'origin/feat/x', ahead: 3, dirty: 3 });
  check('git: without upstream the base is the origin default', gitState('x', scripted(withDefault)).base, 'origin/master');
  check('git: ahead against the origin default', gitState('x', scripted(withDefault)).ahead, 2);
  check('git: no base at all leaves base and ahead undefined', [gitState('x', scripted(base)).base, gitState('x', scripted(base)).ahead], [undefined, undefined]);
  check('git: a failing rev-list is unknown, never 0', gitState('x', scripted({ ...withDefault, 'rev-list --count origin/master..HEAD': { status: 128, stdout: '' } })).ahead, undefined);
  check('git: clean tree counts 0 dirty', gitState('x', scripted({ ...withUpstream, 'status --porcelain': { status: 0, stdout: '' } })).dirty, 0);
  check('git: not a checkout is undefined', gitState('x', scripted({})), undefined);

  // ── gitState: a constructed repository with a real origin ──
  const git = (cwd, ...args) => {
    const run = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' });

    if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  };
  const origin = path.join(scratch, 'origin');
  const clone = path.join(scratch, 'clone');

  mkdirSync(origin);
  git(origin, 'init', '-b', 'main');
  writeFileSync(path.join(origin, 'a.txt'), 'a');
  git(origin, 'add', 'a.txt');
  git(origin, 'commit', '-m', 'root');
  spawnSync('git', ['clone', origin, clone], { encoding: 'utf8' });
  git(clone, 'checkout', '-b', 'feat/real');
  for (const name of ['b', 'c']) {
    writeFileSync(path.join(clone, `${name}.txt`), name);
    git(clone, 'add', `${name}.txt`);
    git(clone, 'commit', '-m', `add ${name}`);
  }
  writeFileSync(path.join(clone, 'dirty1.txt'), 'x');
  writeFileSync(path.join(clone, 'dirty2.txt'), 'x');

  const state = gitState(clone);

  check('real repo: branch', state.branch, 'feat/real');
  check('real repo: head carries the subject', state.head.endsWith('add c'), true);
  check('real repo: base falls back to the origin default branch', state.base, 'origin/main');
  check('real repo: two commits ahead', state.ahead, 2);
  check('real repo: two untracked files are two dirty', state.dirty, 2);

  git(clone, 'push', '-u', 'origin', 'feat/real');
  check('real repo: after a push the upstream is the base with 0 ahead', [gitState(clone).base, gitState(clone).ahead], ['origin/feat/real', 0]);
  check('real repo: a plain directory is not a checkout', gitState(scratch), undefined);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const failed = results.filter((ok) => !ok).length;

console.log(`\n${results.length - failed}/${results.length} cases green`);
process.exit(failed === 0 ? 0 : 1);
