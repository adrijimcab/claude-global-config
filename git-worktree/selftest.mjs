#!/usr/bin/env node
/**
 * Proof of the one question `linked-worktree.mjs` owns: is a directory inside a LINKED worktree or a main checkout?
 * Every state is a REAL repository built in a git sandbox: a main checkout and a linked worktree, each asked at its
 * root and from a nested directory; a submodule (its git directory is its common one, so it is a main checkout);
 * a directory that is no repository and one that does not exist (both throw, so the caller decides); and a process
 * whose environment selects ANOTHER repository, as a git hook's does (the answer must stay about the directory).
 *
 * @es Prueba de la pregunta que posee `linked-worktree.mjs`: ¿un directorio está dentro de un worktree ENLAZADO o
 * de un checkout principal? Cada estado es un repositorio REAL construido en un sandbox de git: un checkout
 * principal y un worktree enlazado, cada uno preguntado en su raíz y desde un directorio anidado; un submódulo (su
 * directorio git es el común, así que es un checkout principal); un directorio que no es repositorio y uno que no
 * existe (ambos lanzan); y un proceso cuyo entorno elige OTRO repositorio, como el de un hook de git.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { createGitSandbox } from '../selftest-fixtures/git-sandbox.mjs';

isolateState('git-worktree');

const { isLinkedWorktree } = await import(pathToFileURL(path.join(import.meta.dirname, 'linked-worktree.mjs')).href);

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

const sandbox = createGitSandbox();
process.once('exit', () => sandbox.cleanup());

/** Runs git in the sandbox and throws on failure. @es Corre git en el sandbox y lanza si falla. */
function git(args, cwd = sandbox.repoDir) {
  const result = sandbox.git(args, { cwd });

  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

writeFileSync(path.join(sandbox.repoDir, 'base.txt'), 'base');
git(['add', 'base.txt']);
git(['commit', '-q', '-m', 'base']);

const linked = path.join(sandbox.root, 'linked');
git(['worktree', 'add', '-q', '-b', 'unit', linked]);

const nestedInMain = path.join(sandbox.repoDir, 'deep', 'er');
const nestedInLinked = path.join(linked, 'deep', 'er');
mkdirSync(nestedInMain, { recursive: true });
mkdirSync(nestedInLinked, { recursive: true });

check('a main checkout root is not a linked worktree', attempt(() => isLinkedWorktree(sandbox.repoDir)), false);
check('a directory nested in a main checkout is not a linked worktree', attempt(() => isLinkedWorktree(nestedInMain)), false);
check('a linked worktree root is a linked worktree', attempt(() => isLinkedWorktree(linked)), true);
check('a directory nested in a linked worktree is a linked worktree', attempt(() => isLinkedWorktree(nestedInLinked)), true);

const library = createGitSandbox({ parent: sandbox.root });
process.once('exit', () => library.cleanup());
writeFileSync(path.join(library.repoDir, 'lib.txt'), 'lib');
library.git(['add', 'lib.txt']);
library.git(['commit', '-q', '-m', 'lib']);
git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', library.repoDir, 'vendor']);
check('a submodule checkout is not a linked worktree', attempt(() => isLinkedWorktree(path.join(sandbox.repoDir, 'vendor'))), false);

check('a directory that is no repository throws', attempt(() => isLinkedWorktree(sandbox.plainDir('plain'))), 'THROWS');
check('a directory that does not exist throws', attempt(() => isLinkedWorktree(path.join(sandbox.root, 'missing'))), 'THROWS');

const inherited = { GIT_DIR: process.env.GIT_DIR, GIT_COMMON_DIR: process.env.GIT_COMMON_DIR, GIT_WORK_TREE: process.env.GIT_WORK_TREE };
process.env.GIT_DIR = path.join(sandbox.repoDir, '.git');
process.env.GIT_WORK_TREE = sandbox.repoDir;
process.env.GIT_COMMON_DIR = path.join(sandbox.repoDir, '.git');
check('an environment that selects the main checkout does not change the answer about a linked worktree', attempt(() => isLinkedWorktree(linked)), true);

for (const [name, value] of Object.entries(inherited)) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const passed = results.filter(Boolean).length;

console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
