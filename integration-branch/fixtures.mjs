/**
 * Owns the CONSTRUCTED repositories the integration-branch selftests run against: a bare remote holding
 * `main`, `feature/meet` and `develop`, a clone of it whose origin/HEAD is `main`, and the helpers to write a
 * file or run git there. Everything lives in one temporary directory and is never a real clone.
 *
 * @es Es dueño de los repositorios CONSTRUIDOS contra los que corren los selftests de rama de integración:
 * un remoto bare con `main`, `feature/meet` y `develop`, un clon suyo cuyo origin/HEAD es `main`, y los
 * ayudantes para escribir un fichero o ejecutar git ahí. Todo vive en un directorio temporal y nunca es un clon real.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHILD_TIMEOUT_MS = 60_000;

/** Runs git in `cwd` and returns its trimmed stdout; a failure throws. @es Ejecuta git en `cwd` y devuelve su stdout; un fallo lanza. */
export function git(cwd, ...args) {
  const run = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${run.stderr}`);
  return run.stdout.trim();
}

/** Writes `content` at `relative` under `base`, creating folders. @es Escribe `content` en `relative` bajo `base`, creando carpetas. */
export function put(base, relative, content) {
  mkdirSync(path.dirname(path.join(base, relative)), { recursive: true });
  writeFileSync(path.join(base, relative), content, 'utf8');
}

/**
 * A temporary world: `repository(declared)` builds a bare remote and its clone (declaring `declared` as the
 * integration branches in fleet-kit when given), `directory(content)` a plain folder holding one file, and
 * `dispose()` removes everything.
 * @es Un mundo temporal: `repository(declared)` construye un remoto bare y su clon; `directory` una carpeta simple con un fichero; `dispose()` lo borra todo.
 */
export function makeWorld() {
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'integration-branch-')));
  let counter = 0;

  return {
    root,
    repository(declared) {
      counter += 1;
      const home = path.join(root, `case-${counter}`);
      const remote = path.join(home, 'remote.git');
      const seed = path.join(home, 'seed');
      const clone = path.join(home, 'clone');
      mkdirSync(home);
      git(home, 'init', '-q', '--bare', '-b', 'main', remote);
      git(home, 'init', '-q', '-b', 'main', seed);
      git(seed, 'config', 'user.email', 't@example.invalid');
      git(seed, 'config', 'user.name', 'tester');
      put(seed, 'a.txt', 'a\n');
      git(seed, 'add', '.');
      git(seed, 'commit', '-q', '-m', 'seed');
      git(seed, 'remote', 'add', 'origin', remote);
      for (const branch of ['feature/meet', 'develop']) git(seed, 'branch', branch);
      git(seed, 'push', '-q', 'origin', 'main', 'feature/meet', 'develop');
      git(home, 'clone', '-q', remote, clone);
      if (declared !== undefined) put(clone, '.claude/fleet-kit.json', JSON.stringify({ integrationBranches: declared }));
      return { home, remote, clone };
    },
    directory(relative, content) {
      counter += 1;
      const dir = path.join(root, `directory-${counter}`);
      put(dir, relative, content);
      return dir;
    },
    dispose() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}
