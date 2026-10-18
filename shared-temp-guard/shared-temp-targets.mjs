/**
 * Which write targets sit in the SHARED TEMP root of the machine, outside the Claude session tree.
 *
 * WHAT COUNTS. A target inside the root `os.tmpdir()` names (or equal to it), under ANY of its spellings, except
 * a target inside `<tmp>/claude/`, where each session keeps its scratchpad. A target that does not resolve is
 * skipped: `shell-writes.mjs` states that tradeoff for every caller.
 *
 * EVERY SPELLING OF ONE PLACE. Windows names the same directory many ways, and a guard that compared strings
 * would let the second spelling through: backslash and forward slash, upper and lower case (the file system is
 * case-insensitive), the 8.3 short form (`ADRIAN~1.JIM` for `adrian.jimenez`, which is what `os.tmpdir()` itself
 * returns on the owner's machine) and the long form, and Git Bash's `/tmp`, which a shell word reaches this
 * module as `<drive>:/tmp/...`. So both the target and the root are brought to ONE canonical form before they
 * are compared: the longest existing ancestor is resolved by the file system (`realpath.native` expands 8.3
 * names and fixes case), the rest is appended, separators become `/`, and case is folded on Windows.
 *
 * A PATH BOUNDARY. Containment is `equal` or `starts with root + '/'`, never a bare prefix, so `Temp-other` or
 * `Temp2` is not inside `Temp`.
 *
 * @es Qué destinos de escritura están en la raíz TEMP COMPARTIDA de la máquina, fuera del árbol de sesiones de
 * Claude. CUENTA: un destino dentro de la raíz que nombra `os.tmpdir()` (o igual a ella), bajo CUALQUIER grafía,
 * salvo dentro de `<tmp>/claude/`, donde cada sesión guarda su scratchpad. Un destino sin resolver se omite.
 * UNA GRAFÍA POR LUGAR: Windows nombra un directorio de muchas formas (barras, mayúsculas, forma corta 8.3 —la
 * que devuelve `os.tmpdir()` aquí—, forma larga y el `/tmp` de Git Bash, que llega como `<unidad>:/tmp/...`),
 * así que destino y raíz se llevan a UNA forma canónica antes de compararse. LÍMITE DE RUTA: la contención es
 * igualdad o prefijo `raíz + '/'`, nunca un prefijo desnudo.
 */

import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The directory under the root that belongs to the Claude sessions. @es El directorio bajo la raíz que pertenece a las sesiones de Claude. */
const SESSION_TREE = 'claude';

/** Git Bash's spelling of the shared root. @es La grafía de Git Bash de la raíz compartida. */
const GIT_BASH_TMP = '/tmp';

/** Windows paths ignore case; POSIX ones do not. @es Las rutas de Windows ignoran mayúsculas; las POSIX no. */
const foldsCase = process.platform === 'win32';

/**
 * One canonical spelling of `target`: resolved against the file system as far as it exists, `/` separators, case
 * folded where the file system folds it.
 * @es Una grafía canónica de `target`: resuelta por el sistema de ficheros hasta donde existe.
 */
function canonical(target) {
  let head = path.resolve(target);
  const tail = [];

  for (;;) {
    try {
      head = realpathSync.native(head);
      break;
    } catch {
      const parent = path.dirname(head);

      if (parent === head) break;

      tail.unshift(path.basename(head));
      head = parent;
    }
  }

  const joined = path.join(head, ...tail).split('\\').join('/');

  return foldsCase ? joined.toLowerCase() : joined;
}

/**
 * The shared TEMP roots of this machine, as `os.tmpdir()` spells them (compared in canonical form).
 * @es Las raíces TEMP compartidas de esta máquina, como las escribe `os.tmpdir()` (se comparan en forma canónica).
 */
export function sharedTempRoots() {
  return [os.tmpdir()];
}

/** Whether `candidate` is `root` or lies inside it, on a path boundary. @es Si `candidate` es `root` o está dentro, con límite de ruta. */
const isWithin = (candidate, root) => candidate === root || candidate.startsWith(`${root}/`);

/** Whether `candidate` is STRICTLY inside `<root>/claude/` (the `claude` entry itself is not a session tree). @es Si `candidate` está ESTRICTAMENTE dentro de `<root>/claude/`. */
const isInSessionTree = (candidate, root) => candidate.startsWith(`${root}/${SESSION_TREE}/`);

/**
 * Every canonical spelling a target can have under `root`: its own, plus — when it is `<drive>:/tmp/...`, how
 * Git Bash's `/tmp` arrives — the same place rebased onto the root.
 * @es Cada grafía canónica que puede tener un destino bajo `root`: la propia y, si es `<unidad>:/tmp/...`
 * (cómo llega el `/tmp` de Git Bash), el mismo lugar reubicado sobre la raíz.
 */
function spellingsUnder(target, root) {
  const own = canonical(target);
  const withoutDrive = own.charAt(1) === ':' ? own.slice(2) : own;

  return isWithin(withoutDrive, GIT_BASH_TMP) ? [own, `${root}${withoutDrive.slice(GIT_BASH_TMP.length)}`] : [own];
}

/**
 * @param {Array<{ path: string | undefined }>} targets Every write target of a tool call.
 * @param {string[]} roots Shared TEMP roots in any spelling (`sharedTempRoots()`); each is made canonical here.
 * @returns {Array<{ path: string }>} The targets inside a root and outside its session tree, in order.
 * @es Los destinos dentro de una raíz y fuera de su árbol de sesiones, en orden.
 */
export function sharedTempOffenders(targets, roots) {
  return targets.filter((target) => {
    if (typeof target.path !== 'string') return false;

    return roots.map(canonical).some((root) => spellingsUnder(target.path, root).some((spelling) => isWithin(spelling, root) && !isInSessionTree(spelling, root)));
  });
}
