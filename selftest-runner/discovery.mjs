/**
 * Decides which files are the repository's selftests. Derived from the tree through git, never from a
 * hand-kept list. `fleet-kit/selftest-all.mjs` matches neither name pattern: it is an aggregator, not a
 * selftest, and is therefore not run twice.
 *
 * A selftest is a regular file named `selftest.mjs` or `*.selftest.mjs` that is tracked, or untracked and
 * not ignored, PLUS the ones held directly by an ignored directory (labelled untracked): the repository is
 * an allowlist, so a new mechanism directory is ignored until re-included, and it must not go unrun.
 *
 * @es Decide qué ficheros son los selftests del repositorio, derivados del árbol vía git y nunca de una
 * lista a mano. `fleet-kit/selftest-all.mjs` no cumple ningún patrón de nombre: es un agregador. Un selftest
 * es un fichero regular `selftest.mjs` o `*.selftest.mjs`, seguido o sin seguir y no ignorado, MÁS los que
 * cuelgan directamente de un directorio ignorado (marcados sin seguir): el repo es una lista de permitidos
 * y un mecanismo nuevo no debe quedar sin ejecutar.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SUFFIX = '.selftest.mjs';
const BARE_NAME = 'selftest.mjs';

/** Raised when the population cannot be measured. @es Se lanza cuando no se puede medir la población. */
export class DiscoveryError extends Error {}

/**
 * True for the two selftest file names: `selftest.mjs` and `<anything>.selftest.mjs`.
 * @es Verdadero para los dos nombres de selftest: `selftest.mjs` y `<algo>.selftest.mjs`.
 * @param {string} name
 */
function isSelftestName(name) {
  return name === BARE_NAME || name.endsWith(SUFFIX);
}

/**
 * Runs git against a repository and returns its stdout, or throws a bilingual DiscoveryError. `repository` is
 * `['-C', <dir>]` for a checkout, or `['--git-dir', <dir>, '--work-tree', <tree>]` for a tree whose repository
 * lives elsewhere; `root` only names the tree in the error. @es Ejecuta git contra un repositorio o lanza DiscoveryError.
 */
function git(repository, root, ...args) {
  const result = spawnSync('git', [...repository, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const reason = (result.error?.message ?? result.stderr ?? '').trim();
    throw new DiscoveryError(
      `Cannot list the repository files with git in ${root}: ${reason} @es No se pueden listar los ficheros del repositorio con git en ${root}: ${reason}`,
    );
  }
  return result.stdout;
}

/** NUL-separated git output as entries. @es Salida de git separada por NUL, como entradas. */
function entriesOf(output) {
  return output.split('\0').filter((entry) => entry !== '');
}

/**
 * True unless the path exists and is not a regular file: a missing tracked file stays, to be reported RED.
 * @es Verdadero salvo que la ruta exista y no sea un fichero regular: un fichero seguido ausente se
 * conserva para informarlo ROJO.
 */
function isRegularOrMissing(root, relative) {
  try {
    return statSync(path.join(root, relative)).isFile();
  } catch {
    return true;
  }
}

/**
 * Names of the selftests that sit DIRECTLY inside an ignored directory, never deeper: a deeper copy is a
 * sandbox or a scratch clone, not the mechanism that owns the directory. The listing is the one place that
 * decides how deep to look; the name test reads the last path segment, so it judges a file and not where the
 * listing found it.
 * @es Nombres de los selftests que están DIRECTAMENTE en un directorio ignorado, nunca más abajo: una copia
 * más profunda es un sandbox o un clon de trabajo, no el mecanismo dueño del directorio. El listado es el
 * único lugar que decide la profundidad; la prueba de nombre lee el último segmento de la ruta.
 * @param {string} top repository top level @es raíz del repositorio
 * @param {string} directory ignored directory with trailing slash @es directorio ignorado con barra final
 */
function selftestsHeldDirectlyBy(top, directory) {
  return readdirSync(path.join(top, directory)).filter(
    (name) => isSelftestName(path.basename(name)) && isRegularOrMissing(top, directory + name),
  );
}

/**
 * With `gitDir`, the tree at `root` is the work tree of the repository at `gitDir` (a tooling tree that its code
 * repository ignores and that is versioned elsewhere, like b100-am-ui's `.claude`): that repository, its index and
 * its own ignore rules decide the population, and `root` is the top level. Walking such a tree instead would sweep
 * in every scratch copy its ignore rules exclude (measured on b100-am-ui's `.claude`: 511 selftest files on disk
 * against the 55 its repository holds).
 * @es Con `gitDir`, el árbol en `root` es el árbol de trabajo del repositorio en `gitDir` (un árbol de tooling que
 * su repo de código ignora y que se versiona aparte, como el `.claude` de b100-am-ui): ese repositorio, su índice
 * y sus propias reglas de ignorado deciden la población, y `root` es el nivel superior. Recorrer ese árbol
 * arrastraría cada copia de trabajo que sus reglas excluyen (medido: 511 ficheros en disco frente a 55).
 * @param {string} root any directory inside a repository, absolute or relative to the process cwd
 * @param {{ gitDir?: string }} [options]
 * @returns {{ root: string, entries: { path: string, untracked: boolean }[] }} paths relative to the top level, posix separators
 * @es Devuelve la raíz real del repo y sus selftests (ruta relativa a la raíz, separadores posix).
 */
export function discoverSelftests(root, { gitDir } = {}) {
  const resolved = path.resolve(root);
  const top = gitDir === undefined ? git(['-C', resolved], resolved, 'rev-parse', '--show-toplevel').trim() : resolved;
  const repository = gitDir === undefined ? ['-C', top] : ['--git-dir', path.resolve(gitDir), '--work-tree', top];
  const listed = entriesOf(git(repository, top, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'));
  const tracked = listed
    .filter((entry) => isSelftestName(path.posix.basename(entry)) && isRegularOrMissing(top, entry))
    .map((entry) => ({ path: entry, untracked: false }));

  const ignored = entriesOf(git(repository, top, 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'));
  const direct = ignored
    .filter((entry) => entry.endsWith('/'))
    .flatMap((directory) => selftestsHeldDirectlyBy(top, directory).map((name) => ({ path: directory + name, untracked: true })));

  const entries = [...tracked, ...direct].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { root: top, entries };
}
