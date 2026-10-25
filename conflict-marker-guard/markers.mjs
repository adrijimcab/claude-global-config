/**
 * WHAT A LEFTOVER CONFLICT IS, in lines of text: pure functions, no git, no file system.
 *
 * A conflict git left behind is a file carrying AT LEAST TWO of the three marker kinds it writes
 * (`<<<<<<< ours`, `=======`, `>>>>>>> theirs`) as whole lines. One kind alone is data: a Markdown heading
 * underline is `=======`, a document explaining the format quotes `<<<<<<<` once. Measured 2026-10-25 on a real
 * conflicted merge: `git diff --cached --check` flags the Markdown underline too, so the rule "two kinds"
 * is what separates a conflict from that data, and it still catches a half-resolved block (the opening line
 * deleted by hand, the other two forgotten).
 *
 * A file that is DATA by declaration is exempt: one the change ADDS (a fixture or a test double that shows a
 * conflict deliberately), or one under a fixtures folder. A conflict is, by construction, a file both sides
 * already had, so a file absent from the base cannot be one.
 *
 * @es QUÉ ES UN CONFLICTO OLVIDADO, en líneas de texto: funciones puras, sin git ni sistema de ficheros. Es un
 * fichero con AL MENOS DOS de los tres tipos de marca que git escribe, como líneas enteras. Un solo tipo es
 * dato: el subrayado de un título Markdown es `=======`. Medido el 2026-10-25 sobre una fusión real en
 * conflicto: `git diff --cached --check` marca también ese subrayado, así que la regla «dos tipos» es lo que
 * separa un conflicto de ese dato y aun así caza un bloque a medio resolver. Un fichero que es DATO por
 * declaración queda exento: el que el cambio AÑADE (un fixture que muestra un conflicto a propósito) o el que
 * está bajo una carpeta de fixtures. Un conflicto es, por construcción, un fichero que ambos lados ya tenían.
 */

/** The three kinds of marker line, by the text a line starts with. @es Los tres tipos de línea de marca. */
const OPEN = '<<<<<<<';
const MIDDLE = '=======';
const CLOSE = '>>>>>>>';

/** Path segments that declare a folder of test data. @es Segmentos de ruta que declaran una carpeta de datos de prueba. */
export const FIXTURE_SEGMENTS = Object.freeze(['fixtures', '__fixtures__', 'selftest-fixtures', 'testdata']);

/** Files bigger than this are not read from the worktree. @es Los ficheros mayores no se leen del árbol de trabajo. */
export const MAX_SCANNED_BYTES = 5 * 1024 * 1024;

/**
 * The marker kind a line is, or `undefined`. As git writes them, `<<<<<<<` and `>>>>>>>` are followed by a space
 * or by the end of the line, and `=======` stands alone; `<<<<<<<<` (eight) and `=======x` are not markers.
 * @es El tipo de marca que es una línea, o `undefined`.
 */
export function markerKindOf(line) {
  const text = line.endsWith('\r') ? line.slice(0, -1) : line;

  if (text === MIDDLE) return MIDDLE;

  return [OPEN, CLOSE].find((kind) => text === kind || text.startsWith(`${kind} `));
}

/** Whether `filePath` sits under a declared fixtures folder. @es Si la ruta está bajo una carpeta de fixtures declarada. */
export function isFixturePath(filePath) {
  return filePath.split('/').slice(0, -1).some((segment) => FIXTURE_SEGMENTS.includes(segment));
}

/**
 * The conflict a list of lines carries, or `undefined`.
 * @param numbered `[{ number, text }]` — the lines to judge, with their line number in the file.
 * @returns `{ line, kinds }` — the first marker's line and the distinct kinds found — when two kinds or more.
 * @es El conflicto que lleva una lista de líneas, o `undefined`.
 */
export function conflictIn(numbered) {
  const found = [];

  for (const { number, text } of numbered) {
    const kind = markerKindOf(text);

    if (kind !== undefined) found.push({ number, kind });
  }

  const kinds = [...new Set(found.map((marker) => marker.kind))];

  return kinds.length >= 2 ? { line: found[0].number, kinds } : undefined;
}

/** Splits a text into numbered lines. @es Divide un texto en líneas numeradas. */
export function numberedLines(text) {
  return text.split('\n').map((line, index) => ({ number: index + 1, text: line }));
}

/** `@@ -a,b +c,d @@` -> `{ removed: b, added: d, start: c }`, or `undefined`. @es Lee la cabecera de un hunk. */
function hunkHeader(line) {
  if (!line.startsWith('@@ -')) return undefined;

  const [oldRange, newRange] = line.slice(3).split(' ').filter((part) => part.startsWith('-') || part.startsWith('+'));

  if (oldRange === undefined || newRange === undefined) return undefined;

  const count = (range) => (range.includes(',') ? Number(range.split(',')[1]) : 1);

  return { removed: count(oldRange.slice(1)), added: count(newRange.slice(1)), start: Number(newRange.slice(1).split(',')[0]) };
}

/** The path a `+++ ` header names, or `undefined` for `/dev/null`. @es La ruta que nombra una cabecera `+++ `. */
function targetPath(line) {
  const name = line.slice('+++ '.length).replace(/\t$/, '');

  return name === '/dev/null' ? undefined : name.replace(/^b\//, '');
}

/**
 * The files of a `git diff --cached -U0` patch with the lines each ADDS: `[{ path, isNew, added: [{ number, text }] }]`.
 * Hunk bodies are consumed by the counts of their header, so an added line that begins with `++` is a line,
 * never a file header.
 * @es Los ficheros de un parche `git diff --cached -U0` con las líneas que cada uno AÑADE; los cuerpos de hunk
 * se consumen por los contadores de su cabecera, así que una línea añadida que empieza por `++` es una línea.
 */
export function addedLinesByFile(patch) {
  const files = [];
  let current;
  let pendingNew = false;
  let hunk;
  let number = 0;

  for (const line of patch.split('\n')) {
    if (hunk !== undefined && hunk.removed + hunk.added > 0) {
      if (line.startsWith('\\')) continue;

      if (line.startsWith('-')) hunk.removed -= 1;
      else {
        hunk.added -= 1;
        current.added.push({ number, text: line.slice(1) });
        number += 1;
      }

      continue;
    }

    if (line.startsWith('diff --git ')) {
      current = undefined;
      pendingNew = false;
    } else if (line.startsWith('new file mode')) pendingNew = true;
    else if (line.startsWith('+++ ')) {
      const filePath = targetPath(line);

      current = filePath === undefined ? undefined : { path: filePath, isNew: pendingNew, added: [] };
      if (current !== undefined) files.push(current);
    } else if (current !== undefined && line.startsWith('@@ ')) {
      hunk = hunkHeader(line);
      number = hunk?.start ?? 0;
    }
  }

  return files;
}

/**
 * Every leftover conflict a patch adds: `[{ path, line, kinds }]`, exempting new files and fixtures folders.
 * @es Cada conflicto olvidado que añade un parche, con los ficheros nuevos y las carpetas de fixtures exentos.
 */
export function conflictsInPatch(patch) {
  return addedLinesByFile(patch)
    .filter((file) => !file.isNew && !isFixturePath(file.path))
    .flatMap((file) => {
      const conflict = conflictIn(file.added);

      return conflict === undefined ? [] : [{ path: file.path, ...conflict }];
    });
}
