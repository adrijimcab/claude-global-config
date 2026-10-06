#!/usr/bin/env node
/**
 * The decisions of `baseline-record/repos.mjs`, each broken once, that `repos.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `repos.mjs`, rotas una a una, que `repos.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const R = 'baseline-record/repos.mjs';

const MUTANTS = [
  // --- the git command ---
  ['the recorded command loses its separators', R, "command: `git ${args.join(' ')}`", "command: `git ${args.join('')}`"],
  ['the recorded command loses git itself', R, "command: `git ${args.join(' ')}`", "command: args.join(' ')"],
  ['the exit code is not recorded', R, 'exitCode: run.status, command', 'exitCode: 0, command'],

  // --- tips ---
  ['the git dir is not passed', R, '[`--git-dir=${gitDir}`, `--work-tree=${worktree}`]', '[`--work-tree=${worktree}`]'],
  ['the work tree is not passed', R, '[`--git-dir=${gitDir}`, `--work-tree=${worktree}`]', '[`--git-dir=${gitDir}`]'],
  ['the tip is the abbreviated branch', R, "runGit([...base, 'rev-parse', 'HEAD'])", "runGit([...base, 'rev-parse', '--abbrev-ref', 'HEAD'])"],
  ['the tip keeps its trailing newline', R, 'tip.exitCode === 0 ? tip.stdout.trim() : undefined', 'tip.exitCode === 0 ? tip.stdout : undefined'],
  ['a repo with no commit reports the word HEAD as its tip', R, 'tip.exitCode === 0 ? tip.stdout.trim() : undefined', 'tip.stdout.trim()'],
  ['the branch is the full ref', R, "'symbolic-ref', '--short', '-q', 'HEAD'", "'symbolic-ref', '-q', 'HEAD'"],
  ['a missing repo reports an empty branch', R, 'branch.exitCode === 0 ? branch.stdout.trim() : undefined', 'branch.stdout.trim()'],
  ['the tip exit code is the branch exit code', R, 'tipExit: tip.exitCode', 'tipExit: branch.exitCode'],
  ['the branch exit code is the tip exit code', R, 'branchExit: branch.exitCode', 'branchExit: tip.exitCode'],
  ['the branch command is not recorded', R, 'commands: [tip.command, branch.command]', 'commands: [tip.command]'],
  ['the commands are recorded in the wrong order', R, 'commands: [tip.command, branch.command]', 'commands: [branch.command, tip.command]'],

  // --- discovery ---
  ['a missing root throws', R, 'if (!existsSync(root)) return [];', ''],
  ['any directory is a repo', R, "existsSync(path.join(root, name, '.git'))", 'true'],
  ['a .gitignore marks a repo', R, "existsSync(path.join(root, name, '.git'))", "existsSync(path.join(root, name, '.gitignore'))"],
  ['a repo is looked for one level too deep', R, "existsSync(path.join(root, name, '.git'))", "existsSync(path.join(root, name, name, '.git'))"],
  ['the repo directory is its name only', R, '({ name, dir: path.join(root, name) })', '({ name, dir: name })'],

  // --- porcelain ---
  ['status may refresh the index of a repo we do not own', R, "'--no-optional-locks', ", ''],
  ['status prints the human form', R, "'status', '--porcelain'", "'status', '--short'"],
  ['status runs in the caller directory', R, "['-C', dir, ", '['],
  ['the pathspec is ignored', R, "...(pathspec === undefined ? [] : ['--', pathspec])", ''],
  ['the pathspec is always added', R, 'pathspec === undefined ? [] :', 'false ? [] :'],
  ['a failed status is a measurement', R, 'measured: run.exitCode === 0', 'measured: true'],
  ['the empty last line is kept as a line', R, ".filter((line) => line !== '')", ''],
  ['status lines lose their leading column', R, "run.stdout.split('\\n')", "run.stdout.trimStart().split('\\n')"],
  ['a failed status keeps its partial lines', R, "lines: run.exitCode === 0 ? run.stdout.split('\\n').filter((line) => line !== '') : []", "lines: run.stdout.split('\\n').filter((line) => line !== '').concat(run.exitCode === 0 ? [] : ['git failed'])"],

  // --- the inventory ---
  ['a missing directory is an empty inventory', R, 'if (!existsSync(dir)) return { exists: false };', ''],
  ['a link is followed as a directory', R, "if (entry.isDirectory()) return { name: entry.name, kind: 'dir', ...treeSize(full) };", "if (entry.isDirectory() || entry.isSymbolicLink()) return { name: entry.name, kind: 'dir', ...treeSize(full) };"],
  ['a link below a directory counts as a file', R, 'return entry.isFile() ? { files: total.files + 1, bytes: total.bytes + lstatSync(full).size } : total;', 'return { files: total.files + 1, bytes: total.bytes + lstatSync(full).size };'],
  ['files below a directory are not counted', R, 'files: total.files + inner.files', 'files: total.files'],
  ['bytes below a directory are not counted', R, 'bytes: total.bytes + inner.bytes', 'bytes: total.bytes'],
  ['a file counts one byte', R, 'bytes: total.bytes + lstatSync(full).size }', 'bytes: total.bytes + 1 }'],
  ['a top-level file has no size', R, "kind: 'file', files: 1, bytes: lstatSync(full).size", "kind: 'file', files: 1, bytes: 0"],
  ['a top-level file counts as a directory', R, "kind: 'file', files: 1", "kind: 'dir', files: 1"],
  ['a link is listed as a file', R, "kind: 'link', files: 0", "kind: 'file', files: 0"],
  ['the total counts entries, not files', R, 'sum + entry.files, 0)', 'sum + 1, 0)'],
  ['the byte total counts entries, not bytes', R, 'sum + entry.bytes, 0)', 'sum + 1, 0)'],
  ['the directory walk starts above zero', R, '{ files: 0, bytes: 0 });', '{ files: 1, bytes: 0 });']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['baseline-record', 'hook-state', 'bilingual-output'],
  selftest: 'baseline-record/repos.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
