/**
 * The modules that sit byte-identical at the same relative path under BOTH roots (the install under
 * `~/.claude/` and the reference fleet under `~/Desktop/Projects/b100-am-ui/.claude/`) and that nobody
 * declared: a copy with no provenance. `vendored.mjs check` fails on each one.
 *
 * WHY. `VENDORED` is the list of copies this install keeps in step with their owner. A module that is
 * identical on both sides but absent from that list is a copy nobody keeps in step: the first time the
 * owner changes it the two silently diverge, and no check ever said they were once the same file. The
 * answer to a finding is one of two decisions, never silence: declare it in `VENDORED` (the owner keeps it,
 * `sync` copies it) or make the copies diverge on purpose.
 *
 * WHAT IS EXCLUDED, through data and never a hand list:
 *   - what `VENDORED` declares (the caller passes it: the list stays owned by `vendored.mjs`);
 *   - what ANOTHER provenance record already pins. Any other `PROVENANCE.json` under the install (none today:
 *     `fleet-kit/vendor/` was folded into this one) names its files relative to ITS OWN folder, so a file such as
 *     `<kit>/vendor/shell-command/shell-command.mjs` would already have its provenance there. This check's own
 *     record names its files relative to the install root, so read relative to ITS folder it pins nothing:
 *     the derived echo of `VENDORED` can never be a way to silence a finding.
 * Only `.mjs` modules count, `node_modules` and `worktrees` are not trees of the reference fleet, and a
 * symbolic link in it is never followed (only regular files are read). The reference fleet is read through
 * its git index (`trackedFiles` of `hook-state/census.mjs`), never by walking the directory: a walk entered
 * job scratch and mirrors of hundreds of thousands of files and overflowed the stack (2026-10-11).
 *
 * @es Los módulos que están idénticos byte a byte en la misma ruta relativa bajo AMBAS raíces (la
 * instalación de `~/.claude/` y la flota de referencia de b100-am-ui) y que nadie declaró: una copia sin
 * procedencia. `vendored.mjs check` falla por cada uno. `VENDORED` lista las copias que esta instalación
 * mantiene al día con su dueño; un módulo idéntico en ambos lados pero ausente de esa lista es una copia que
 * nadie mantiene al día: en cuanto el dueño lo cambie divergen en silencio. La respuesta es una de dos
 * decisiones, nunca el silencio: declararlo en `VENDORED` o hacer que las copias diverjan a propósito. SE
 * EXCLUYE, por datos y nunca por lista a mano, lo que `VENDORED` declara y lo que OTRO registro de
 * procedencia ya fija (cada `PROVENANCE.json` ajeno nombra sus ficheros relativos a SU carpeta); el registro
 * propio de esta comprobación nombra los suyos relativos a la raíz, así que leído relativo a SU carpeta no
 * fija nada: el eco derivado de `VENDORED` nunca silencia un hallazgo. Solo cuentan los `.mjs`;
 * `node_modules` y `worktrees` no son árboles de la flota de referencia y un enlace simbólico de ella no se
 * sigue. La flota de referencia se lee por su índice git (`trackedFiles` de `hook-state/census.mjs`), nunca
 * recorriendo el directorio: el recorrido entraba en scratch y espejos de cientos de miles de ficheros y
 * desbordaba la pila (2026-10-11).
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { trackedFiles } from '../hook-state/census.mjs';
import { sha256Of } from './provenance.mjs';

/** The file name every provenance record carries. @es El nombre de fichero de todo registro de procedencia. */
export const RECORD_FILE_NAME = 'PROVENANCE.json';

const MODULE_EXTENSION = '.mjs';
/** Folders that are not trees of the reference fleet. @es Carpetas que no son árboles de la flota de referencia. */
const NOT_ITS_TREE = new Set(['node_modules', 'worktrees']);

/** Whether `relative` lies inside a folder that is not a tree of the reference fleet. @es Si `relative` está dentro de una carpeta que no es un árbol de la flota de referencia. */
const isInsideUnwalkedFolder = (relative) => relative.split('/').some((segment) => NOT_ITS_TREE.has(segment));

/** Whether `file` is a regular file on disk, never a link or a folder. @es Si `file` es un fichero regular en disco, nunca un enlace ni una carpeta. */
const isRegularFile = (file) => {
  try {
    return lstatSync(file).isFile();
  } catch {
    return false;
  }
};

/** Whether the record in `folder` (relative, `.` for the root) lists `rest`, a path relative to that folder; a record that cannot be read pins nothing. @es Si el registro de `folder` lista `rest`, una ruta relativa a esa carpeta; un registro ilegible no fija nada. */
function recordPins(root, folder, rest) {
  try {
    const { files } = JSON.parse(readFileSync(path.join(root, folder, RECORD_FILE_NAME), 'utf8'));

    return files.some((entry) => entry?.path === rest);
  } catch {
    return false;
  }
}

/** Whether a record in a folder above `relative` pins it, each record naming its files relative to its own folder. @es Si un registro en una carpeta sobre `relative` lo fija, nombrando cada registro sus ficheros relativos a su carpeta. */
function isPinnedElsewhere(root, relative) {
  const parts = relative.split('/');

  for (let depth = 0; depth < parts.length - 1; depth += 1) {
    if (recordPins(root, parts.slice(0, depth).join('/'), parts.slice(depth).join('/'))) return true;
  }

  return false;
}

/**
 * The relative paths of the undeclared duplicates, sorted.
 * @param installRoot The install the copies live in.
 * @param sourceRoot The reference fleet (an absent one has no duplicates). It is the tree walked: the install
 *   is a whole `~/.claude/`, which holds far more than modules.
 * @param declared The relative paths `VENDORED` declares.
 * @param walk Lists the reference fleet's files (default: the files its git index TRACKS, never a walk of the
 *   directory, so job scratch and mirrors the repository does not hold are never read). A test seam.
 * @es Las rutas relativas de los duplicados sin declarar, ordenadas. Se recorre la flota de referencia: la
 * instalación es un `~/.claude/` entero, que guarda mucho más que módulos. `walk` sustituye al recorrido
 * (punto de prueba). Por defecto son los ficheros que su índice git RASTREA, nunca un recorrido del directorio:
 * el scratch de trabajos y los espejos que el repositorio no guarda no se leen. Lanza, bilingüe, si la
 * flota de referencia no es un repositorio git.
 */
export function undeclaredDuplicates({ installRoot, sourceRoot, declared, walk = trackedFiles }) {
  if (!existsSync(sourceRoot)) return [];

  return walk(sourceRoot)
    .filter((relative) => relative.endsWith(MODULE_EXTENSION) && !declared.includes(relative) && !isInsideUnwalkedFolder(relative) && isRegularFile(path.join(sourceRoot, relative)))
    .filter((relative) => existsSync(path.join(installRoot, relative)) && sha256Of(path.join(installRoot, relative)) === sha256Of(path.join(sourceRoot, relative)))
    .filter((relative) => !isPinnedElsewhere(installRoot, relative))
    .sort();
}

/** The finding line for one undeclared duplicate. @es La línea de hallazgo de un duplicado sin declarar. */
export const duplicateFinding = (relative) =>
  `DUPLICATED WITHOUT PROVENANCE  ${relative} — declare it vendored or make the copies diverge on purpose @es DUPLICADO SIN PROCEDENCIA: declararlo vendorizado o hacer que las copias diverjan a propósito`;

/**
 * The finding lines for the undeclared duplicates, or the one line saying the reference fleet could not be
 * listed (not a git repository): a tree that cannot be read is a failure to report, never a crash and never
 * an empty tree.
 * @es Las líneas de hallazgo de los duplicados sin declarar, o la línea que dice que la flota de referencia no
 * se pudo listar (no es un repositorio git): un árbol ilegible es un fallo a informar, nunca un crash ni un
 * árbol vacío.
 */
export function duplicateFindings(options) {
  try {
    return undeclaredDuplicates(options).map(duplicateFinding);
  } catch (error) {
    return [`DUPLICATES NOT CHECKED  ${error.message}`];
  }
}
