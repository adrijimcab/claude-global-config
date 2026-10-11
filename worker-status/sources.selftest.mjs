#!/usr/bin/env node
/**
 * Proof of `processes.mjs` (injected process listing) and `worktree-git.mjs` (injected git runner plus a
 * constructed repository with a real origin).
 * @es Prueba de `processes.mjs` (listado inyectado) y `worktree-git.mjs` (ejecutor de git inyectado más un
 * repositorio construido con un origin real).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { listProcesses, processesNaming, rowsOfJson } from './processes.mjs';
import { gitState } from './worktree-git.mjs';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'worker-sources-'));
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

  check('processes: one PowerShell object is one row', attempt(() => rowsOfJson('{"ProcessId":7,"CommandLine":null}')), [{ pid: 7, commandLine: '' }]);
  check('processes: a PowerShell array keeps every row', attempt(() => rowsOfJson('[{"ProcessId":1,"CommandLine":"a"},{"ProcessId":2,"CommandLine":"b"}]')).length, 2);
  check('processes: empty output is no rows', attempt(() => rowsOfJson('')), []);

  // The real-OS listing runs with a PRIVATE profile inside this selftest's temp: PowerShell writes its profile
  // folders there, never into the home of whoever runs the proof. @es El listado real corre con un perfil
  // PRIVADO dentro del temporal de este selftest.
  const profile = path.join(scratch, 'profile');
  const roaming = path.join(profile, 'AppData', 'Roaming');
  const privateEnv = { ...process.env, USERPROFILE: profile, HOME: profile, APPDATA: roaming, LOCALAPPDATA: path.join(profile, 'AppData', 'Local') };

  mkdirSync(profile);

  const real = listProcesses(privateEnv);

  check('processes: the real listing is non-empty rows with numeric pid', real.length > 0 && real.every((row) => Number.isInteger(row.pid) && typeof row.commandLine === 'string'), true);
  check('processes: the real listing contains this very process', real.some((row) => row.pid === process.pid), true);

  check('processes: the listing tool ran inside the private profile', existsSync(roaming), process.platform === 'win32');

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
