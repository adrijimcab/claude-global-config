/**
 * A throwaway git repository for a selftest that runs git, and the guarantee that git never leaves it.
 *
 * Why not `mkdtemp` and `git init`: git discovers its repository by climbing from the working directory, so a
 * fixture directory that happens to sit under ANOTHER repository (a temp dir inside a checkout, a home that is
 * itself a repository) finds that one and a `git add` or `git commit` lands in the real history. The sandbox
 * sets `GIT_CEILING_DIRECTORIES` to its parent, spelled as the REAL path: git compares it with the real current
 * directory, so a parent reached through a junction, a symlink or a Windows short name (`ADRIAN~1.JIM`) would
 * otherwise not match and the ceiling would silently do nothing. It also drops the variables that select a
 * repository (a git hook exports them), never reads the user or system configuration, and fixes the identity
 * and the initial branch, so a fixture commits the same way on every machine.
 *
 * `cleanup()` removes the sandbox WITHOUT following links: a fixture may plant a junction to a directory it
 * must keep, and a recursive delete that follows it destroys that directory.
 *
 * @es Un repositorio git desechable para un selftest que corre git, y la garantía de que git no sale de él.
 * Git descubre su repositorio subiendo desde el directorio de trabajo, así que un directorio bajo OTRO
 * repositorio encuentra ese y un `git commit` cae en la historia real. El sandbox fija
 * `GIT_CEILING_DIRECTORIES` al padre, escrito como ruta REAL (git la compara con el directorio real, así que
 * un junction, un symlink o un nombre corto de Windows no coincidirían y el techo no haría nada). Quita las
 * variables que eligen repositorio (un hook las exporta), no lee la configuración de usuario ni de sistema y
 * fija identidad y rama inicial. `cleanup()` borra SIN seguir enlaces: un junction a algo que debe conservarse
 * se quitaría entero con un borrado recursivo que lo siga.
 */

import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, mkdirSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Every text this module throws, in both languages. @es Cada texto que lanza este módulo, en los dos idiomas. */
export const MESSAGES = {
  parentMissing: { en: 'The parent directory {parent} does not exist, so no sandbox can be created in it.', es: 'El directorio padre {parent} no existe, no se puede crear un sandbox en él.' },
  initFailed: { en: 'git init failed in {dir}: {detail}.', es: 'git init falló en {dir}: {detail}.' }
};

/** The variables that make git pick a repository instead of discovering one. @es Las variables que hacen que git elija repositorio. */
const REPOSITORY_SELECTORS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR'];

const IDENTITY = { name: 'Git Sandbox', email: 'git-sandbox@example.test' };

const runSpawnedGit = (args, { cwd, env }) => spawnSync('git', args, { cwd, env, encoding: 'utf8', windowsHide: true });

/** An error whose text is `English @es Español`, like every printed line of the house. @es Un error con el texto en la forma de la casa. */
function bilingualError(id, params) {
  const fill = (text) => text.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));

  return new Error(`${fill(MESSAGES[id].en)} @es ${fill(MESSAGES[id].es)}`);
}

/**
 * Deletes a directory tree. A link or junction is unlinked, never entered, so what it points at survives.
 * @returns how many links were unlinked. @es Cuántos enlaces se desenlazaron sin entrar en ellos.
 */
function removeTree(directory) {
  let links = 0;

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isSymbolicLink()) {
      unlinkSync(entryPath);
      links += 1;
    } else if (entry.isDirectory()) {
      links += removeTree(entryPath);
    } else {
      unlinkSync(entryPath);
    }
  }

  rmdirSync(directory);

  return links;
}

/** The environment of every git the sandbox runs. @es El entorno de cada git que corre el sandbox. */
function sandboxEnvironment(root, ceiling) {
  const env = { ...process.env };

  for (const name of REPOSITORY_SELECTORS) delete env[name];

  writeFileSync(path.join(root, 'gitconfig'), '');

  return {
    ...env,
    GIT_CEILING_DIRECTORIES: ceiling,
    GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: IDENTITY.name,
    GIT_AUTHOR_EMAIL: IDENTITY.email,
    GIT_COMMITTER_NAME: IDENTITY.name,
    GIT_COMMITTER_EMAIL: IDENTITY.email
  };
}

/**
 * @param options.parent The directory the sandbox is created in (the system temp directory by default).
 * @param options.runGit Runs git as `(args, { cwd, env })` and returns a `spawnSync` result; injected by proofs.
 * @returns `{ root, repoDir, env, git(args, { cwd }), plainDir(name), cleanup() }`: `root` holds `repoDir` (an
 *   initialised repository) and any `plainDir` (a directory that is NOT a repository); `cleanup()` returns the
 *   number of links it unlinked. Throws a bilingual error if the parent is missing or `git init` fails (and
 *   leaves nothing behind in that case).
 * @es Crea el sandbox; `cleanup()` devuelve cuántos enlaces desenlazó. Lanza un error bilingüe si falta el padre o falla `git init`, sin dejar nada.
 */
export function createGitSandbox({ parent = tmpdir(), runGit = runSpawnedGit } = {}) {
  let ceiling;

  try {
    ceiling = realpathSync.native(parent);
  } catch {
    throw bilingualError('parentMissing', { parent });
  }

  const root = mkdtempSync(path.join(ceiling, 'git-sandbox-'));
  const repoDir = path.join(root, 'repo');
  const env = sandboxEnvironment(root, ceiling);
  const init = runGit(['init', '-q', '-b', 'main', repoDir], { cwd: root, env });

  if (init.status !== 0) {
    removeTree(root);

    throw bilingualError('initFailed', { dir: repoDir, detail: init.error?.message ?? (init.stderr ?? '').split('\n')[0].trim() });
  }

  return {
    root,
    repoDir,
    env,
    git: (args, { cwd = repoDir } = {}) => runGit(args, { cwd, env }),
    plainDir: (name) => {
      mkdirSync(path.join(root, name));

      return path.join(root, name);
    },
    cleanup: () => (lstatSync(root, { throwIfNoEntry: false }) === undefined ? 0 : removeTree(root))
  };
}
