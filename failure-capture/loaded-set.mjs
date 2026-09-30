/**
 * The instruction files Claude Code loads at session start for a home and a project root, in load order, each
 * with its raw length and its harness-counted length: `loadedSet`. Nothing is written.
 * Read on 2026-09-30 from the installed 2.1.286 binary: the user's `.claude/CLAUDE.md`, the user's
 * `.claude/rules/` (recursive, `.md` files that do not name `paths:`), then for each directory from the top
 * down to the project root (the filesystem root excluded): `CLAUDE.md`, `.claude/CLAUDE.md`,
 * `.claude/rules/`, `CLAUDE.local.md`. Each loaded file is followed at once by its imports (depth-first; the
 * top file is level 0 and a file at level 5 is not loaded), every path is loaded once, a file with no content
 * is not listed and its imports are not followed, and a missing import is reported, never fatal.
 * Differences from the harness: a rules directory is read in code-unit order of names (the harness uses the
 * filesystem's order, which only changes the order of the report, not the set); the `paths:` value is read
 * from its inline or list form, not with a full YAML parser; managed policy files, the approval flag for
 * imports outside the project and additional directories are not modelled. `ceiling` (default: the
 * filesystem root) is the highest directory walked, so a test never reaches the real home.
 *
 * @es Los ficheros de instrucciones que Claude Code carga al iniciar sesión para un home y una raíz de
 * proyecto, en orden de carga, cada uno con su largo crudo y su largo contado por el harness: `loadedSet`. No
 * se escribe nada. Leído el 2026-09-30 del binario instalado 2.1.286: el `.claude/CLAUDE.md` del usuario, su
 * `.claude/rules/` (recursivo, ficheros `.md` que no nombran `paths:`), y luego, por cada directorio desde
 * arriba hasta la raíz del proyecto (sin la raíz del sistema de ficheros): `CLAUDE.md`, `.claude/CLAUDE.md`,
 * `.claude/rules/`, `CLAUDE.local.md`. Cada fichero cargado va seguido de inmediato por sus imports
 * (profundidad primero; el fichero superior es el nivel 0 y uno en el nivel 5 no se carga), cada ruta se
 * carga una vez, un fichero sin contenido no se lista ni se siguen sus imports, y un import ausente se
 * informa, nunca es fatal. Diferencias con el harness: un directorio de reglas se lee en orden de unidades
 * de código de los nombres (el harness usa el orden del sistema de ficheros, que solo cambia el orden del
 * informe, no el conjunto); el valor de `paths:` se lee en su forma en línea o en lista, sin un parser YAML
 * completo; no se modelan los ficheros de política gestionada, la bandera de aprobación de imports fuera del
 * proyecto ni los directorios adicionales. `ceiling` (por omisión, la raíz del sistema de ficheros) es el
 * directorio más alto que se recorre, para que una prueba nunca llegue al home real.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { countedLength, frontmatterOf, instructionContent } from './harness-count.mjs';
import { importTargets } from './instruction-imports.mjs';

const MAX_DEPTH = 5;
const PATHS_KEY = 'paths:';
const ALL_PATHS = '**';
const ALL_BELOW = '/**';

/** The key a path is remembered by: case-insensitive where the filesystem is. @es La clave con que se recuerda una ruta: sin distinguir mayúsculas donde el sistema de ficheros no las distingue. */
const keyOf = (file) => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file));

/** The text of a file, or `undefined` when it cannot be read as a file. @es El texto de un fichero, o `undefined` si no se puede leer como fichero. */
function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** A `paths:` entry as a glob: quotes removed, a trailing `/**` dropped. @es Una entrada de `paths:` como glob: sin comillas, sin un `/**` final. */
function globOf(entry) {
  const trimmed = entry.trim();
  const quoted = trimmed.length >= 2 && '"\''.includes(trimmed[0]) && trimmed.endsWith(trimmed[0]);
  const bare = quoted ? trimmed.slice(1, -1) : trimmed;

  return bare.endsWith(ALL_BELOW) ? bare.slice(0, -ALL_BELOW.length) : bare;
}

/** Whether a rule's frontmatter names `paths:` other than everywhere: such a rule loads only when a matching file is open. @es Si el frontmatter de una regla nombra `paths:` distintos de "todo": esa regla solo carga al abrir un fichero que coincide. */
function isPathScoped(text) {
  const entries = [];
  let listing = false;

  for (const line of frontmatterOf(text).split('\n')) {
    const item = line.trim();

    if (line.startsWith(PATHS_KEY)) {
      entries.push(...line.slice(PATHS_KEY.length).split(','));
      listing = true;
    } else if (listing && item.startsWith('- ')) {
      entries.push(item.slice(2));
    } else {
      listing = false;
    }
  }

  const globs = entries.map(globOf).filter((glob) => glob !== '');

  return globs.some((glob) => glob !== ALL_PATHS);
}

/** The `.md` files under a rules directory, recursive, names in code-unit order; none when it cannot be read. @es Los ficheros `.md` bajo un directorio de reglas, recursivo, nombres en orden de unidades de código; ninguno si no se puede leer. */
function rulesIn(directory) {
  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => (left.name < right.name ? -1 : 1));
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) return rulesIn(full);

    return entry.isFile() && entry.name.endsWith('.md') ? [full] : [];
  });
}

/** The directories from `ceiling` (or the filesystem root, excluded) down to `root`. @es Los directorios desde `ceiling` (o la raíz del sistema de ficheros, excluida) hasta `root`. */
function directoriesFrom(root, ceiling) {
  const chain = [];

  for (let directory = path.resolve(root); directory !== path.parse(directory).root; directory = path.dirname(directory)) {
    chain.unshift(directory);

    if (keyOf(directory) === keyOf(ceiling)) break;
  }

  return chain;
}

/** The instruction files loaded for `home` and `projectRoot`, `{ files, missing, rawTotal, countedTotal }`. @es Los ficheros de instrucciones cargados para `home` y `projectRoot`. */
export function loadedSet({ home, projectRoot, ceiling = path.parse(path.resolve(projectRoot)).root }) {
  const seen = new Set();
  const files = [];
  const missing = [];

  const load = (file, depth, importedBy) => {
    const key = keyOf(file);

    if (seen.has(key) || depth >= MAX_DEPTH) return;

    seen.add(key);

    const text = readText(file);

    if (text === undefined) {
      if (importedBy !== undefined) missing.push({ file, importedBy });

      return;
    }

    if (instructionContent(text).trim() === '') return;

    files.push({ path: file, raw: text.length, counted: countedLength(text) });

    for (const target of importTargets(text, file, home)) load(target, depth + 1, file);
  };

  const loadRules = (directory) => {
    for (const rule of rulesIn(directory)) {
      const text = readText(rule);

      if (!isPathScoped(text ?? '')) load(rule, 0);
    }
  };

  load(path.join(home, '.claude', 'CLAUDE.md'), 0);
  loadRules(path.join(home, '.claude', 'rules'));

  for (const directory of directoriesFrom(projectRoot, ceiling)) {
    load(path.join(directory, 'CLAUDE.md'), 0);
    load(path.join(directory, '.claude', 'CLAUDE.md'), 0);
    loadRules(path.join(directory, '.claude', 'rules'));
    load(path.join(directory, 'CLAUDE.local.md'), 0);
  }

  return {
    files,
    missing,
    rawTotal: files.reduce((sum, file) => sum + file.raw, 0),
    countedTotal: files.reduce((sum, file) => sum + file.counted, 0),
  };
}
