/**
 * Shared selftest scaffolding: an assertion collector that never throws (one failed case must not hide
 * the rest), and CONSTRUCTED git repositories under the OS temp dir — never a live branch, never a
 * repository whose state legitimately changes.
 *
 * @es Andamiaje compartido de selftests: un colector de aserciones que nunca lanza, y repositorios git
 * CONSTRUIDOS bajo el directorio temporal del sistema, nunca una rama viva.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** An assertion collector: `check(label, actual, expected)`, then `finish(name)` sets the exit code. @es Un colector de aserciones. */
export function suite() {
  const failures = [];
  let passed = 0;

  const check = (label, actual, expected) => {
    const actualText = JSON.stringify(actual);
    const expectedText = JSON.stringify(expected);

    if (actualText === expectedText) passed += 1;
    else failures.push(`${label}: expected ${expectedText}, got ${actualText}`);
  };

  const finish = (name) => {
    for (const failure of failures) process.stdout.write(`FAIL ${failure}\n`);
    process.stdout.write(`${name}: ${passed}/${passed + failures.length} passed\n`);
    process.exitCode = failures.length === 0 ? 0 : 1;
  };

  return { check, finish };
}

/** Runs git in `directory`, throwing on failure: a fixture that cannot be built is not a test. @es Corre git; un fixture que no se construye no es un test. */
export function git(directory, ...args) {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true });

  if (result.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed: ${result.stderr}`);

  return result.stdout.trim();
}

/** A fresh temp directory (real path), removed by `cleanup()`. @es Un directorio temporal nuevo. */
export function tempDir(prefix) {
  return realpathSync.native(mkdtempSync(path.join(os.tmpdir(), `fleet-kit-${prefix}-`)));
}

export const cleanup = (directory) => rmSync(directory, { recursive: true, force: true });

/** Writes `content` at `relative` inside `root`, creating folders. @es Escribe un fichero creando carpetas. */
export function writeFile(root, relative, content) {
  const file = path.join(root, relative);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);

  return file;
}

/**
 * A new repository with one commit on `develop`, identity and hooks isolated from the machine's.
 * @returns the repository path.
 * @es Un repositorio nuevo con un commit en `develop`, identidad y hooks aislados de la máquina.
 */
export function makeRepository(root, name = 'repo') {
  const repository = path.join(root, name);

  mkdirSync(repository, { recursive: true });
  git(repository, 'init', '--quiet', '--initial-branch=develop');
  git(repository, 'config', 'user.email', 'fixture@example.invalid');
  git(repository, 'config', 'user.name', 'Fixture');
  git(repository, 'config', 'core.hooksPath', path.join(root, 'no-hooks'));
  git(repository, 'config', 'commit.gpgsign', 'false');
  // The real repositories exclude `.claude/` through `.git/info/exclude`; the fixtures do the same.
  writeFile(repository, path.join('.git', 'info', 'exclude'), '.claude/\n');
  writeFile(repository, 'README.md', 'fixture\n');
  git(repository, 'add', '-A');
  git(repository, 'commit', '--quiet', '-m', 'chore: initial');

  return repository;
}

/** Writes files and commits them. @returns the new commit sha. @es Escribe ficheros y los commitea. */
export function commitFiles(repository, files, message = 'feat: change') {
  for (const [relative, content] of Object.entries(files)) writeFile(repository, relative, content);
  git(repository, 'add', '-A');
  git(repository, 'commit', '--quiet', '-m', message);

  return git(repository, 'rev-parse', 'HEAD');
}

/** A minimal valid config, overridable per test. @es Una config mínima válida. */
export function baseConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    integrationBranches: ['develop'],
    worktreeRoot: '.claude/worktrees',
    unitSuite: { npmScript: 'test', cwd: '' },
    coverage: {
      runner: 'karma',
      projects: [{ name: 'app', sourceRoot: 'src/', extensions: ['.ts'], excludeSuffixes: ['.spec.ts'], excludeSegments: ['/testing/'], karma: { workspace: '', ngProject: 'app', baseConfig: 'angular-builtin' } }]
    },
    landingGuard: { mode: 'enforce' },
    handback: { coverage: 'refuse' },
    ...overrides
  };
}

/** Writes a config at `<projectDir>/.claude/fleet-kit.json`. @es Escribe una config. */
export const writeConfig = (projectDir, config) => writeFile(projectDir, path.join('.claude', 'fleet-kit.json'), `${JSON.stringify(config, null, 2)}\n`);
