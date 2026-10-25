/**
 * WHAT A LEFTOVER CONFLICT IS, in lines of text: pure functions, no git, no file system.
 *
 * A conflict git left behind is a file carrying a marker line, judged by two rules:
 *  - a LABELLED `<<<<<<< ours` or `>>>>>>> theirs` line (the seven characters, a space and a label) is a marker on
 *    its own, because git always writes the label and the incident this guard exists for left exactly ONE such line;
 *  - a bare `=======` is a Markdown heading underline as often as a marker, so it counts only beside a second kind
 *    (and a bare seven-character `<<<<<<<` or `>>>>>>>` is in the same weak group).
 * For a file git ITSELF lists as unmerged, the file is in conflict by git's own record and ANY marker line counts.
 *
 * Exempt, in the index only and never for an unmerged file: a path under a prefix DECLARED in
 * `fixture-paths.json` (test data that shows a conflict on purpose), and a file the change ADDS while no merge,
 * rebase, cherry-pick or revert is in progress (a conflict is by construction a file both sides already had).
 *
 * @es QUÉ ES UN CONFLICTO OLVIDADO, en líneas de texto: funciones puras, sin git ni sistema de ficheros. Una
 * línea ETIQUETADA `<<<<<<< ours` o `>>>>>>> theirs` (siete caracteres, un espacio y una etiqueta) es una marca por
 * sí sola, porque git siempre escribe la etiqueta y el incidente que motiva esta guardia dejó exactamente UNA. Un
 * `=======` suelto es tanto un subrayado de título Markdown como una marca, así que solo cuenta junto a un segundo
 * tipo (y un `<<<<<<<` o `>>>>>>>` sin etiqueta es del mismo grupo débil). En un fichero que git MISMO lista como
 * sin fusionar, cualquier línea de marca cuenta. Exentos, solo en el índice y nunca para un fichero sin fusionar:
 * una ruta bajo un prefijo DECLARADO en `fixture-paths.json` y un fichero que el cambio AÑADE mientras no hay
 * fusión, rebase, cherry-pick ni revert en curso.
 */

/** The three kinds of marker line. @es Los tres tipos de línea de marca. */
const OPEN = '<<<<<<<';
const MIDDLE = '=======';
const CLOSE = '>>>>>>>';

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

/** Whether a marker line is one git writes: a seven-character run, a space and a non-empty label. @es Si una línea de marca lleva la etiqueta que escribe git. */
export function isLabelled(line) {
  const kind = markerKindOf(line);

  return kind !== undefined && kind !== MIDDLE && line.slice(kind.length).trim().length > 0;
}

/** Whether `filePath` is under one of the declared fixture prefixes (each ends with `/`). @es Si la ruta está bajo un prefijo de fixtures declarado. */
export function isDeclaredFixture(filePath, prefixes) {
  return prefixes.some((prefix) => filePath.startsWith(prefix));
}

/**
 * The conflict a sequence of lines carries, or `undefined`.
 * @param numbered `[{ number, text }]` — any iterable, so a file can be read as a stream.
 * @param options.unmerged True for a file git lists as unmerged: one marker of any kind is a conflict, and the scan
 *   stops at the first. @es Verdadero para un fichero sin fusionar según git.
 * @returns `{ line, kinds }` — the first marker's line and the distinct kinds seen.
 * @es El conflicto que lleva una secuencia de líneas, o `undefined`.
 */
export function conflictIn(numbered, { unmerged = false } = {}) {
  const found = [];

  for (const { number, text } of numbered) {
    const kind = markerKindOf(text);

    if (kind === undefined) continue;

    found.push({ number, kind, labelled: isLabelled(text) });

    if (unmerged) break;
  }

  const kinds = [...new Set(found.map((marker) => marker.kind))];
  const isConflict = found.length > 0 && (unmerged || found.some((marker) => marker.labelled) || kinds.length >= 2);

  return isConflict ? { line: found[0].number, kinds } : undefined;
}

/** `@@ -a,b +c,d @@` -> `{ removed: b, added: d, start: c }`, or `undefined`. @es Lee la cabecera de un hunk. */
function hunkHeader(line) {
  if (!line.startsWith('@@ -')) return undefined;

  const [oldRange, newRange] = line.slice(3).split(' ').filter((part) => part.startsWith('-') || part.startsWith('+'));

  if (oldRange === undefined || newRange === undefined) return undefined;

  const count = (range) => (range.includes(',') ? Number(range.split(',')[1]) : 1);

  return { removed: count(oldRange.slice(1)), added: count(newRange.slice(1)), start: Number(newRange.slice(1).split(',')[0]) };
}

/** The path a `+++ ` header names, or `undefined` for `/dev/null`. The prefix is pinned to `b/` by the probe. @es La ruta que nombra una cabecera `+++ `. */
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
 * Every leftover conflict a patch adds: `[{ path, line, kinds }]`.
 * @param options.exemptNew Whether a file the change adds is data (false while a merge, rebase, cherry-pick or revert is in progress).
 * @param options.fixturePrefixes The declared fixture prefixes. @es Los prefijos de fixtures declarados.
 * @es Cada conflicto olvidado que añade un parche.
 */
export function conflictsInPatch(patch, { exemptNew, fixturePrefixes }) {
  return addedLinesByFile(patch)
    .filter((file) => !(exemptNew && file.isNew) && !isDeclaredFixture(file.path, fixturePrefixes))
    .flatMap((file) => {
      const conflict = conflictIn(file.added);

      return conflict === undefined ? [] : [{ path: file.path, ...conflict }];
    });
}
