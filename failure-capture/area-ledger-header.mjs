/**
 * The HEADER capture.mjs writes at the top of an area ledger, and the recognition of that header: the `paths:`
 * frontmatter that makes the harness load the file only when a matching file is read, then the title and what the
 * area is about. A file that begins with exactly this header is an area ledger capture.mjs owns; a hand-written
 * rules file of the same name (a list of links, a task list) is not. Pure: text in, text out, no I/O, and nothing it
 * imports reads the project, so `project.mjs` can recognise an area ledger without depending on the ledger router.
 *
 * @es El ENCABEZADO que capture.mjs escribe al inicio de un ledger de área, y el reconocimiento de ese encabezado: el
 * frontmatter `paths:` que hace que el harness cargue el fichero solo al leer un fichero que coincide, luego el título
 * y de qué trata el área. Un fichero que empieza exactamente con este encabezado es un ledger de área de capture.mjs;
 * un fichero de reglas escrito a mano con el mismo nombre (una lista de enlaces, una lista de tareas) no lo es. Puro:
 * entra texto, sale texto, sin E/S, y nada de lo que importa lee el proyecto, así que `project.mjs` puede reconocer un
 * ledger de área sin depender del enrutador de ledgers.
 */

const FRONTMATTER_FENCE = '---';
const PATHS_KEY = 'paths:';
const GLOB_ITEM = '  - "';

/**
 * A glob as a YAML double-quoted scalar: a backslash and a double quote escaped. A declared glob holds neither
 * (`project-areas.mjs` refuses them); the escape is the second line of defence, so no glob can end the scalar or
 * start an escape.
 * @es Un glob como escalar YAML entre comillas dobles: barra invertida y comilla doble escapadas. Un glob declarado no
 * lleva ninguna (`project-areas.mjs` las rechaza); el escape es la segunda línea de defensa, para que ningún glob
 * cierre el escalar ni inicie un escape.
 */
const quotedGlob = (glob) => `"${glob.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** The frontmatter the harness reads to scope a rule to paths. @es El frontmatter que lee el harness para dar a una regla alcance de ruta. */
export const frontmatterOf = (paths) => [FRONTMATTER_FENCE, PATHS_KEY, ...paths.map((glob) => `  - ${quotedGlob(glob)}`), FRONTMATTER_FENCE].join('\n');

/** The title line of an area ledger. @es La línea de título de un ledger de área. */
const titleOf = (area) => `# Lessons Ledger — ${area} (path-scoped)`;

const BEFORE_ABOUT = '\n\nLessons about ';
const AFTER_ABOUT = '. The harness loads this file ONLY when a file matching the `paths:` above is read.\nOne line per RULE (a repeat folds into its line and bumps the counter). Machine state: the trailing `<!--fc:KEY#N-->`\nmarker belongs to `~/.claude/failure-capture/`; this file is written only by `capture.mjs`, never by hand.\n\n---\n';

/**
 * The header of an area ledger whose definition is `{ about, paths }`.
 * @es El encabezado de un ledger de área cuya definición es `{ about, paths }`.
 */
export const areaLedgerHeaderOf = (area, { about, paths }) => `${frontmatterOf(paths)}\n${titleOf(area)}${BEFORE_ABOUT}${about}${AFTER_ABOUT}`;

/**
 * Whether `text` begins with the header capture.mjs writes for the area `area`, whatever its globs and its one-line
 * `about`: the file is then an area ledger capture.mjs owns.
 * @es Si `text` empieza con el encabezado que capture.mjs escribe para el área `area`, sean cuales sean sus globs y su
 * `about` de una línea: el fichero es entonces un ledger de área de capture.mjs.
 */
export function isAreaLedgerText(area, text) {
  const lines = text.split('\n');

  if (lines[0] !== FRONTMATTER_FENCE || lines[1] !== PATHS_KEY) return false;

  let end = 2;

  while (end < lines.length && lines[end].startsWith(GLOB_ITEM)) end += 1;

  if (end === 2 || lines[end] !== FRONTMATTER_FENCE) return false;

  const rest = lines.slice(end + 1).join('\n');
  const head = `${titleOf(area)}${BEFORE_ABOUT}`;

  if (!rest.startsWith(head)) return false;

  const afterHead = rest.slice(head.length);
  const aboutEnd = afterHead.indexOf(AFTER_ABOUT);

  return aboutEnd > 0 && !afterHead.slice(0, aboutEnd).includes('\n');
}
