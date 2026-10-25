#!/usr/bin/env node
/**
 * Self-test for git-port/invocation-directory: the `-C` fold itself (relative, absolute, chained, `until`,
 * an unknown directory) and the PARITY of the three sites migrated onto it. The former inline folds are kept
 * here as references and driven over the same invocations as the migrated code; the three places where the
 * old folds were wrong against git are asserted explicitly, not left implicit.
 * @es Auto-test del pliegue de `-C` y de la PARIDAD de los tres sitios migrados: los pliegues en línea
 * anteriores se conservan como referencia y se ejecutan sobre las mismas invocaciones; las tres diferencias
 * en que el pliegue antiguo contradecía a git se afirman explícitamente.
 */

import path from 'node:path';

import { repositoryOptions } from '../fleet-kit/lib/invocation-repository.mjs';
import { addedWorktreePath } from '../integrated-worktree-guard/added-worktree-path.mjs';
import { pathsOf } from '../integrated-worktree-guard/session-repositories.mjs';
import { invocationDirectory } from './invocation-directory.mjs';

let failures = 0;
let total = 0;

function check(ok, line) {
  total += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`);
}

const base = path.resolve('/work/repo');
const abs = path.resolve('/elsewhere/repo');
const slashed = abs.replaceAll('\\', '/');
const fold = (directory, gitOptions, until) => invocationDirectory({ gitOptions, directory }, until);
const bashRecord = (command) => ({ cwd: base, message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });

// The fold / El pliegue
check(fold(base, []) === base, 'no -C: the directory of the line');
check(fold(base, ['-C', 'a']) === path.join(base, 'a'), 'a relative -C folds onto the directory');
check(fold(base, ['-C', abs]) === abs, 'an absolute -C replaces the directory');
check(fold(base, ['-C', 'a', '-C', 'b']) === path.join(base, 'a', 'b'), 'chained -C fold in order');
check(fold(base, ['-C', abs, '-C', 'b']) === path.join(abs, 'b'), 'a relative -C after an absolute one folds onto it');
check(fold(base, ['-C', 'a', '-C', 'b'], 1) === path.join(base, 'a'), 'until: only the options before the index apply');
check(fold(base, ['-C', 'a'], 0) === base, 'until 0: no option applies');
check(fold(base, ['--git-dir=x', '-C', 'a']) === path.join(base, 'a'), 'other options are skipped');
check(fold(base, ['-C']) === base, 'NEAR MISS: a dangling -C changes nothing');
check(fold(undefined, []) === undefined, 'an unknown directory with no -C stays unknown');
check(fold(undefined, ['-C', 'a']) === undefined, 'NEAR MISS: a relative -C on an unknown directory stays unknown');
check(fold(undefined, ['-C', abs]) === abs, 'an absolute -C on an unknown directory is known (git acts there)');
check(fold(undefined, ['-C', 'a', '-C', abs, '-C', 'b']) === path.join(abs, 'b'), 'an absolute -C recovers an unknown directory and later ones fold on it');

// The former inline folds, verbatim / Los pliegues en línea anteriores, tal cual
function formerDirectoryAt(invocation, until) {
  let directory = invocation.directory;

  for (let index = 0; index < until && directory !== undefined; index += 1) {
    if (invocation.gitOptions[index] === '-C') directory = path.resolve(directory, invocation.gitOptions[index + 1] ?? '.');
  }

  return directory;
}

function formerAddedBase({ gitOptions, directory }) {
  let current = directory;

  gitOptions.forEach((option, at) => {
    if (option === '-C' && typeof gitOptions[at + 1] === 'string') current = path.resolve(current, gitOptions[at + 1]);
  });

  return current;
}

function formerSessionTargets({ directory, gitOptions }) {
  const found = [];

  gitOptions.forEach((option, at) => {
    if (option === '-C' && typeof gitOptions[at + 1] === 'string') found.push(path.resolve(directory, gitOptions[at + 1]));
  });

  return found;
}

const OPTION_LISTS = [[], ['-C', 'a'], ['-C', 'a', '-C', 'b'], ['-C', abs], ['-C', abs, '-C', 'b'], ['-C'], ['-C', 'a', '--git-dir=g'], ['--git-dir=g', '-C', 'a']];
const single = OPTION_LISTS.filter((gitOptions) => gitOptions.filter((option) => option === '-C').length <= 1);

// Parity, directory known / Paridad con el directorio conocido
check(OPTION_LISTS.every((gitOptions) => [...gitOptions.keys(), gitOptions.length].every((until) => formerDirectoryAt({ directory: base, gitOptions }, until) === fold(base, gitOptions, until))), 'parity: directoryAt, every prefix of every option list');
check(OPTION_LISTS.every((gitOptions) => {
  const invocation = { subcommand: 'worktree', args: ['add', 'wt'], gitOptions, directory: base };

  return addedWorktreePath(invocation) === path.resolve(formerAddedBase(invocation), 'wt');
}), 'parity: addedWorktreePath, every option list');
check(single.every((gitOptions) => {
  const paths = pathsOf(bashRecord(`git ${gitOptions.filter((option) => option !== abs).join(' ')} status`)).map((one) => path.resolve(one));
  const expected = formerSessionTargets({ directory: base, gitOptions: gitOptions.filter((option) => option !== abs) }).map((one) => path.resolve(one));

  return expected.every((one) => paths.includes(one)) && paths.includes(base);
}), 'parity: pathsOf keeps the line directory and every single -C target of the former fold');

// Where the former folds contradicted git, decided / Donde el pliegue antiguo contradecía a git
const named = { text: 'git status', subcommand: 'status', args: [], gitOptions: ['-C', abs, '--git-dir=.git'], directory: undefined };

check(repositoryOptions(named, 'bash')[0] === `--git-dir=${path.resolve(abs, '.git')}`, 'DECIDED (repository): an absolute -C after an unfollowable cd resolves --git-dir against it');
check(addedWorktreePath({ subcommand: 'worktree', args: ['add', 'wt'], gitOptions: ['-C', abs], directory: undefined }) === path.join(abs, 'wt'), 'DECIDED (added worktree): an absolute -C after an unfollowable cd still resolves the created path');
check((() => {
  try {
    return addedWorktreePath({ subcommand: 'worktree', args: ['add', 'wt'], gitOptions: ['-C', 'a'], directory: undefined }) === undefined;
  } catch {
    return false;
  }
})(), 'NEAR MISS: a relative -C after an unfollowable cd creates a path nobody can name, and does not throw');
check(pathsOf(bashRecord(`cd ${slashed} && git status`)).map((one) => path.resolve(one)).includes(abs), 'the directory a git call runs in (after the line\'s own cd) is a path worked in');
check((() => {
  const paths = pathsOf(bashRecord(`git -C ${slashed} -C sub status`)).map((one) => path.resolve(one));

  return paths.includes(path.join(abs, 'sub')) && !paths.includes(path.join(base, 'sub'));
})(), 'DECIDED (session): chained -C name the directory git acts in, not each target against the line directory');
check(pathsOf(bashRecord(`cd "$UNKNOWN" && git -C ${slashed} status`)).map((one) => path.resolve(one)).includes(abs), 'DECIDED (session): an absolute -C after an unfollowable cd counts as a path worked in');

console.log(`\n${total - failures}/${total} checks passed.`);
process.exit(failures === 0 ? 0 : 1);
