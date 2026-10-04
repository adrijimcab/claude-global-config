#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `baseline-record/repos.mjs`: git tips, product-repo discovery, `git status
 * --porcelain` before-images and the `.claude/` inventory. Every case runs on repositories and directories
 * CONSTRUCTED in a temp directory, never on a real repository.
 *
 * THE STATE SPACE: tips (a repo with a commit, an external git dir with its own work tree, a repo with no
 * commit, a missing repo), discovery (a `.git` directory, a `.git` file, a plain directory, a directory with
 * only a `.gitignore`, a loose file, a nested repo, a name with a space), porcelain (clean, modified, staged,
 * untracked, a collapsed untracked directory, a pathspec, a non-repository, and that reading it never writes
 * the index), and the inventory (a file, a directory, a nested file, a link that must not be followed, a
 * missing directory).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `repos.mjs`: puntas de git, descubrimiento de repos de producto, la
 * imagen previa de `git status --porcelain` y el inventario de `.claude/`. Cada caso corre sobre repos y
 * directorios CONSTRUIDOS en un directorio temporal, nunca sobre un repositorio real. Espacio de estados:
 * puntas, descubrimiento, porcelain (incluido que leerlo nunca escribe el índice) e inventario (incluido un
 * enlace que no se debe seguir).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { dirInventory, gitTip, porcelainOf, productRepos } from './repos.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns; a throw is a failed check, never a crash of the selftest. @es Lo que devuelve `action`; un fallo es un check fallido. */
function attempt(action) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return {};
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'repos-selftest-'));
let counter = 0;

/** A fresh empty directory. @es Un directorio nuevo y vacío. */
function fresh() {
  counter += 1;
  const dir = path.join(scratch, `case-${counter}`);

  mkdirSync(dir, { recursive: true });

  return dir;
}

const git = (dir, ...args) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });

/** A repository on branch `main` with one commit of `a.txt`. @es Un repo en `main` con un commit de `a.txt`. */
function makeRepo() {
  const dir = fresh();

  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'first');

  return dir;
}

const sha1 = (file) => createHash('sha1').update(readFileSync(file)).digest('hex');

// --- tips ---
{
  const repo = makeRepo();
  const head = git(repo, 'rev-parse', 'HEAD').stdout.trim();
  const tip = attempt(() => gitTip({ name: 'r', worktree: repo, gitDir: path.join(repo, '.git') }));

  check('tip: the commit and the branch of a repo', [tip.name, tip.tip, tip.branch], ['r', head, 'main']);
  check('tip: the exit codes are recorded', [tip.tipExit, tip.branchExit], [0, 0]);
  check('tip: the commands are recorded verbatim', tip.commands, [`git --git-dir=${path.join(repo, '.git')} --work-tree=${repo} rev-parse HEAD`, `git --git-dir=${path.join(repo, '.git')} --work-tree=${repo} symbolic-ref --short -q HEAD`]);

  const bare = path.join(fresh(), 'external.git');
  const tree = fresh();

  spawnSync('git', ['init', '-q', '-b', 'trunk', '--bare', bare], { encoding: 'utf8' });
  writeFileSync(path.join(tree, 'f.txt'), 'x');
  spawnSync('git', [`--git-dir=${bare}`, `--work-tree=${tree}`, 'add', 'f.txt']);
  spawnSync('git', [`--git-dir=${bare}`, `--work-tree=${tree}`, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x']);

  const external = attempt(() => gitTip({ name: 'ext', worktree: tree, gitDir: bare }));

  check('tip: an external git dir is read through its own explicit paths', [external.branch, /^[0-9a-f]{40}$/.test(external.tip ?? '')], ['trunk', true]);

  const unborn = fresh();

  git(unborn, 'init', '-q', '-b', 'main');

  const empty = attempt(() => gitTip({ name: 'u', worktree: unborn, gitDir: path.join(unborn, '.git') }));

  check('tip: a repo with no commit has no tip, and says so by its exit code', [empty.tip, empty.tipExit !== 0, empty.branch], [undefined, true, 'main']);
  check('tip: the branch of a repo with no commit still has its own exit code', empty.branchExit, 0);

  const missing = attempt(() => gitTip({ name: 'm', worktree: fresh(), gitDir: path.join(scratch, 'none.git') }));

  check('tip: a missing repo has no tip and no branch', [missing.tip, missing.branch, missing.tipExit !== 0], [undefined, undefined, true]);
}

// --- discovery ---
{
  const root = fresh();
  const make = (name, ...files) => files.forEach((file) => (mkdirSync(path.dirname(path.join(root, name, file)), { recursive: true }), writeFileSync(path.join(root, name, file), 'x')));

  make('with-dir', '.git/HEAD');
  make('with-file', '.git');
  make('plain', 'readme.md');
  make('ignore-only', '.gitignore');
  make('has space', '.git/HEAD');
  make('outer/nested', '.git/HEAD');
  writeFileSync(path.join(root, 'loose.txt'), 'x');

  const found = attempt(() => productRepos(root));

  check('discovery: a `.git` directory or file marks a repo, a name with a space included', (Array.isArray(found) ? found : []).map((repo) => repo.name).sort(), ['has space', 'with-dir', 'with-file']);
  check('discovery: each repo carries its directory', (Array.isArray(found) ? found : []).find((repo) => repo.name === 'with-dir')?.dir, path.join(root, 'with-dir'));
  check('discovery: a missing root has no repos', attempt(() => productRepos(path.join(root, 'absent'))), []);
}

// --- porcelain ---
{
  const repo = makeRepo();
  const clean = attempt(() => porcelainOf({ name: 'r', dir: repo }));

  check('porcelain: a clean repo has no lines and exit 0', [clean.lines, clean.exitCode, clean.measured], [[], 0, true]);
  check('porcelain: the command is recorded verbatim', clean.command, `git -C ${repo} --no-optional-locks status --porcelain`);

  writeFileSync(path.join(repo, 'a.txt'), 'two\n');
  writeFileSync(path.join(repo, 'staged.txt'), 's\n');
  git(repo, 'add', 'staged.txt');
  writeFileSync(path.join(repo, 'new.txt'), 'n\n');
  mkdirSync(path.join(repo, 'dir'));
  writeFileSync(path.join(repo, 'dir', 'inside.txt'), 'i\n');

  const dirty = attempt(() => porcelainOf({ name: 'r', dir: repo }));

  check('porcelain: lines keep their two status columns, untracked directories collapsed', [...(dirty.lines ?? [])].sort(), [' M a.txt', '?? dir/', '?? new.txt', 'A  staged.txt']);

  const scoped = attempt(() => porcelainOf({ name: 'r', dir: repo, pathspec: 'dir/' }));

  check('porcelain: a pathspec restricts the status and is part of the command', [scoped.lines, scoped.command.endsWith('--porcelain -- dir/')], [['?? dir/'], true]);

  const plain = fresh();
  const notRepo = attempt(() => porcelainOf({ name: 'n', dir: plain }));

  check('porcelain: a directory that is not a repository is not a measurement', [notRepo.measured, notRepo.exitCode !== 0, notRepo.lines], [false, true, []]);

  // Reading the status must never write the index of a repository we do not own.
  // @es Leer el estado nunca debe escribir el índice de un repositorio que no es nuestro.
  const stale = makeRepo();
  const later = new Date(Date.now() + 60_000);

  utimesSync(path.join(stale, 'a.txt'), later, later);

  const indexBefore = sha1(path.join(stale, '.git', 'index'));

  attempt(() => porcelainOf({ name: 's', dir: stale }));
  check('porcelain: reading a repo whose stat data is stale leaves its index byte for byte unchanged', sha1(path.join(stale, '.git', 'index')), indexBefore);
}

// --- inventory ---
{
  const dir = fresh();
  const outside = fresh();

  writeFileSync(path.join(dir, 'CLAUDE.md'), 'twelve bytes');
  mkdirSync(path.join(dir, 'sub', 'deeper'), { recursive: true });
  writeFileSync(path.join(dir, 'sub', 'one.txt'), '123');
  writeFileSync(path.join(dir, 'sub', 'deeper', 'two.txt'), '45');
  writeFileSync(path.join(dir, 'sub', 'deeper', 'three.txt'), '6');
  writeFileSync(path.join(outside, 'a.txt'), 'x'.repeat(100));
  writeFileSync(path.join(outside, 'b.txt'), 'x'.repeat(100));
  symlinkSync(outside, path.join(dir, 'linked'), 'junction');
  symlinkSync(outside, path.join(dir, 'sub', 'inner-link'), 'junction');

  const inventory = attempt(() => dirInventory(dir));
  const byName = Object.fromEntries((inventory.entries ?? []).map((entry) => [entry.name, entry]));

  check('inventory: a top-level file is one file of its size', [byName['CLAUDE.md']?.kind, byName['CLAUDE.md']?.files, byName['CLAUDE.md']?.bytes], ['file', 1, 12]);
  check('inventory: a directory counts every file below it and their bytes', [byName.sub?.kind, byName.sub?.files, byName.sub?.bytes], ['dir', 3, 6]);
  check('inventory: a link below a directory is not followed either', byName.sub?.files, 3);
  check('inventory: a link is recorded and never followed', [byName.linked?.kind, byName.linked?.files, byName.linked?.bytes], ['link', 0, 0]);
  check('inventory: nothing else is listed', Object.keys(byName).sort(), ['CLAUDE.md', 'linked', 'sub']);
  check('inventory: the totals are the sums of the entries', [inventory.totalFiles, inventory.totalBytes], [4, 18]);
  check('inventory: a missing directory is reported as missing', attempt(() => dirInventory(path.join(dir, 'absent'))), { exists: false });
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
