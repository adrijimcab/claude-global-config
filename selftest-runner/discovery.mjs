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

/** Runs git and returns its stdout, or throws a bilingual DiscoveryError. @es Ejecuta git o lanza DiscoveryError. */
function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
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
 * @param {string} root any directory inside a repository, absolute or relative to the process cwd
 * @returns {{ root: string, entries: { path: string, untracked: boolean }[] }} paths relative to the top level, posix separators
 * @es Devuelve la raíz real del repo y sus selftests (ruta relativa a la raíz, separadores posix).
 */
export function discoverSelftests(root) {
  const top = git(path.resolve(root), 'rev-parse', '--show-toplevel').trim();
  const listed = entriesOf(git(top, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'));
  const tracked = listed
    .filter((entry) => isSelftestName(path.posix.basename(entry)) && isRegularOrMissing(top, entry))
    .map((entry) => ({ path: entry, untracked: false }));

  const ignored = entriesOf(git(top, 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'));
  const direct = ignored
    .filter((entry) => entry.endsWith('/'))
    .flatMap((directory) =>
      readdirSync(path.join(top, directory))
        .filter((name) => isSelftestName(name) && isRegularOrMissing(top, directory + name))
        .map((name) => ({ path: directory + name, untracked: true })),
    );

  const entries = [...tracked, ...direct].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { root: top, entries };
}
