/**
 * Where the repository a git invocation acts on keeps its worktree root, its git directory and its LIVE index,
 * read from the file system the way git finds them, without running git.
 *
 * HOW. The line's own `--git-dir`/`--work-tree` options win, then `GIT_DIR`/`GIT_WORK_TREE` from the line's
 * environment. With a git directory and no work tree, git works in the current directory, so that is the root.
 * Otherwise the directory and its parents are searched for `.git`: a directory is the git directory; a file (a
 * linked worktree, a submodule) names it on its `gitdir:` line, relative to the file. The live index is
 * `<git directory>/index`.
 *
 * WHY NOT GIT. The lexical rules run on every shell call of every worker; two `stat`s per parent are cheap and
 * cannot hang, while a git process costs tens of milliseconds and can time out. A value the line hides (a `$`
 * expansion) and a directory the line cannot follow make the layout unknown (`undefined`), and each rule states
 * what unknown means for it.
 *
 * LEFT OUT, stated: `core.worktree` and `GIT_CEILING_DIRECTORIES`, which only configuration shows.
 *
 * @es Dónde guarda el repositorio sobre el que actúa una invocación su raíz de worktree, su directorio de git y su
 * índice VIVO, leído del sistema de ficheros como los encuentra git, sin ejecutar git. Mandan `--git-dir` y
 * `--work-tree` de la línea, luego `GIT_DIR`/`GIT_WORK_TREE` de su entorno; con directorio de git y sin worktree, la
 * raíz es el directorio actual. Si no, se busca `.git` en el directorio y sus padres: un directorio es el directorio
 * de git; un fichero lo nombra en su línea `gitdir:`. El índice vivo es `<directorio de git>/index`. Un valor que la
 * línea oculta o un directorio que no se puede seguir dejan el diseño desconocido (`undefined`). QUEDAN FUERA
 * `core.worktree` y `GIT_CEILING_DIRECTORIES`, que solo muestra la configuración.
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** The marker line of a `.git` file. @es La línea marcadora de un fichero `.git`. */
const GITDIR_PREFIX = 'gitdir:';

/** Whether a word holds an expansion the line does not resolve. @es Si una palabra lleva una expansión sin resolver. */
export const isHidden = (word) => word.includes('$') || word.includes('%') || word.includes('`');

/** The last value of a git global option, separate or fused. @es El último valor de una opción global de git. */
function lastOption(gitOptions, name) {
  let value;

  for (let index = 0; index < gitOptions.length; index += 1) {
    if (gitOptions[index] === name) value = gitOptions[index + 1];
    else if (gitOptions[index].startsWith(`${name}=`)) value = gitOptions[index].slice(name.length + 1);
  }

  return value;
}

/** What `.git` is at `candidate`: a directory, a file, or nothing. @es Qué es `.git` en `candidate`. */
function kindOf(candidate) {
  try {
    const stats = statSync(candidate);

    return stats.isDirectory() ? 'directory' : 'file';
  } catch {
    return undefined;
  }
}

/** The git directory a `.git` file names, or `undefined`. @es El directorio de git que nombra un fichero `.git`. */
function gitDirOfFile(file) {
  try {
    const line = readFileSync(file, 'utf8').split('\n').find((candidate) => candidate.startsWith(GITDIR_PREFIX));

    return line === undefined ? undefined : path.resolve(path.dirname(file), line.slice(GITDIR_PREFIX.length).trim());
  } catch {
    return undefined;
  }
}

/** The nearest `.git` at or above `directory`: its root and git directory. @es El `.git` más cercano. */
function discovered(directory) {
  for (let current = directory; ; current = path.dirname(current)) {
    const candidate = path.join(current, '.git');
    const kind = kindOf(candidate);

    if (kind === 'directory') return { root: current, gitDir: candidate };
    if (kind === 'file') {
      const gitDir = gitDirOfFile(candidate);

      return gitDir === undefined ? undefined : { root: current, gitDir };
    }

    if (path.dirname(current) === current) return undefined;
  }
}

/**
 * @param {string | undefined} directory The directory the invocation runs in (after its `cd`s and `-C`).
 * @param {Map<string, string>} environment The environment the line gives it.
 * @param {string[]} gitOptions Its git global options.
 * @returns {{ root: string, gitDir: string, liveIndex: string } | undefined} The layout, or `undefined` when the
 *   line hides it or no repository is found.
 * @es El diseño del repositorio, o `undefined` si la línea lo oculta o no hay repositorio.
 */
export function repositoryLayout(directory, environment, gitOptions) {
  if (typeof directory !== 'string') return undefined;

  const gitDirValue = lastOption(gitOptions, '--git-dir') ?? environment.get('GIT_DIR');
  const workTreeValue = lastOption(gitOptions, '--work-tree') ?? environment.get('GIT_WORK_TREE');

  if ([gitDirValue, workTreeValue].some((value) => value !== undefined && isHidden(value))) return undefined;

  const found = gitDirValue === undefined ? discovered(directory) : { root: directory, gitDir: path.resolve(directory, gitDirValue) };

  if (found === undefined) return undefined;

  const root = workTreeValue === undefined ? found.root : path.resolve(directory, workTreeValue);

  return { root, gitDir: found.gitDir, liveIndex: path.join(found.gitDir, 'index') };
}

/**
 * The repository the line points git at, as environment variables for another git process (judge A, 2026-10-19:
 * a check that ignores them asks about another repository): `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE`, from
 * the line's options first and its environment after, resolved against `directory`; `undefined` when the line
 * hides one of them.
 * @es El repositorio al que la línea apunta git, como variables de entorno para otro proceso de git; `undefined`
 * si la línea esconde alguna.
 */
export function gitEnvironmentOf(directory, environment, gitOptions) {
  const values = {
    GIT_DIR: lastOption(gitOptions, '--git-dir') ?? environment.get('GIT_DIR'),
    GIT_WORK_TREE: lastOption(gitOptions, '--work-tree') ?? environment.get('GIT_WORK_TREE'),
    GIT_INDEX_FILE: environment.get('GIT_INDEX_FILE')
  };
  const forwarded = {};

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (isHidden(value)) return undefined;

    forwarded[name] = path.resolve(directory, value);
  }

  return forwarded;
}

/** Two paths compared as the platform's file system compares them. @es Dos rutas comparadas como las compara el sistema. */
export function samePath(first, second) {
  const normalize = (candidate) => {
    const resolved = path.resolve(candidate);

    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };

  return normalize(first) === normalize(second);
}

/**
 * Whether `inner` is `outer` itself or lies under it, compared by path segments, so `d/..env` is under `d`.
 * @es Si `inner` es `outer` o está debajo, comparado por segmentos de ruta, de modo que `d/..env` está bajo `d`.
 */
export function isWithin(outer, inner) {
  const relative = path.relative(process.platform === 'win32' ? outer.toLowerCase() : outer, process.platform === 'win32' ? inner.toLowerCase() : inner);

  return !path.isAbsolute(relative) && relative.split(/[\\/]/)[0] !== '..';
}
