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
 * Only `.mjs` modules count, `.git`, `node_modules` and `worktrees` are not trees of the reference
 * fleet, and a symbolic link in it is never followed (the walk reads directory entries, which do not resolve
 * links).
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
 * `.git`, `node_modules` y `worktrees` no son árboles de la flota de referencia y un enlace simbólico de ella
 * no se sigue.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { sha256Of } from './provenance.mjs';

/** The file name every provenance record carries. @es El nombre de fichero de todo registro de procedencia. */
export const RECORD_FILE_NAME = 'PROVENANCE.json';

const MODULE_EXTENSION = '.mjs';
/** Folders that are not trees of the reference fleet. @es Carpetas que no son árboles de la flota de referencia. */
const NOT_ITS_TREE = new Set(['.git', 'node_modules', 'worktrees']);

/** Every regular file under `root`, relative with forward slashes; links and the untracked trees are not entered. @es Cada fichero regular bajo `root`, relativo y con barras normales. */
function filesUnder(root, folder = '') {
  const found = [];

  for (const entry of readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const relative = folder === '' ? entry.name : `${folder}/${entry.name}`;

    if (entry.isDirectory() && !NOT_ITS_TREE.has(entry.name)) found.push(...filesUnder(root, relative));
    else if (entry.isFile()) found.push(relative);
  }

  return found;
}

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
 * @param walk Replaces the directory walk (a test seam: the order a file system lists in is its own).
 * @es Las rutas relativas de los duplicados sin declarar, ordenadas. Se recorre la flota de referencia: la
 * instalación es un `~/.claude/` entero, que guarda mucho más que módulos. `walk` sustituye al recorrido
 * (punto de prueba: el orden en que un sistema de ficheros lista es cosa suya).
 */
export function undeclaredDuplicates({ installRoot, sourceRoot, declared, walk = filesUnder }) {
  if (!existsSync(sourceRoot)) return [];

  return walk(sourceRoot)
    .filter((relative) => relative.endsWith(MODULE_EXTENSION) && !declared.includes(relative))
    .filter((relative) => existsSync(path.join(installRoot, relative)) && sha256Of(path.join(installRoot, relative)) === sha256Of(path.join(sourceRoot, relative)))
    .filter((relative) => !isPinnedElsewhere(installRoot, relative))
    .sort();
}

/** The finding line for one undeclared duplicate. @es La línea de hallazgo de un duplicado sin declarar. */
export const duplicateFinding = (relative) =>
  `DUPLICATED WITHOUT PROVENANCE  ${relative} — declare it vendored or make the copies diverge on purpose @es DUPLICADO SIN PROCEDENCIA: declararlo vendorizado o hacer que las copias diverjan a propósito`;
