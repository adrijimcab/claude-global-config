/**
 * Parses `git diff --unified=0 <base> <head>` output into the set of NEW-file line numbers each
 * changed file introduces or modifies. Zero context lines is what makes this exact: every hunk header
 * `@@ -oldStart,oldCount +newStart,newCount @@` fully states the changed range in the new file, with
 * no surrounding context lines to count or discard.
 *
 * String methods only (mandate M5 in this repo's own contract, applied here too): a hunk header is
 * split on spaces into fixed positional tokens, never matched with a regular expression.
 *
 * @es Parsea la salida de `git diff --unified=0 <base> <head>` al conjunto de números de línea NUEVOS
 * que cada fichero cambiado introduce o modifica. Cero líneas de contexto es lo que lo hace exacto: cada
 * cabecera de hunk expresa el rango cambiado completo en el fichero nuevo, sin líneas de contexto que
 * contar o descartar. Solo métodos de string: una cabecera de hunk se separa por espacios en tokens
 * posicionales fijos, nunca con una expresión regular.
 */

const NEW_FILE_HEADER_PREFIX = '+++ ';
const DEV_NULL_TARGET = '/dev/null';
const NEW_FILE_PATH_PREFIX = 'b/';
const HUNK_HEADER_PREFIX = '@@ ';
const NEW_RANGE_MARKER = '+';

/**
 * The repo-relative path a `+++ ` diff header names, or `null` when the header marks a deletion
 * (`+++ /dev/null`).
 * @es La ruta relativa al repo que nombra una cabecera de diff `+++ `, o `null` cuando marca un borrado.
 */
const parseNewFileHeader = (line) => {
  const spec = line.slice(NEW_FILE_HEADER_PREFIX.length);
  if (spec === DEV_NULL_TARGET) return null;
  if (spec.startsWith(NEW_FILE_PATH_PREFIX)) return spec.slice(NEW_FILE_PATH_PREFIX.length);
  return spec;
};

/**
 * One `+start,count` (or bare `+start`, implying `count = 1`) hunk-header token parsed into the list
 * of NEW-file line numbers it covers. A `count` of `0` is a pure deletion at that new-file position —
 * it introduces no new line, so it contributes nothing.
 * @es Un token `+start,count` (o `+start` sin coma, con `count = 1` implícito) convertido en la lista de
 * números de línea del fichero NUEVO que cubre. Un `count` de `0` es un borrado puro en esa posición —
 * no introduce línea nueva, así que no aporta nada.
 */
const expandNewRangeToken = (token) => {
  const spec = token.slice(NEW_RANGE_MARKER.length);
  const commaIndex = spec.indexOf(',');
  const start = Number(commaIndex === -1 ? spec : spec.slice(0, commaIndex));
  const count = commaIndex === -1 ? 1 : Number(spec.slice(commaIndex + 1));

  const lines = [];
  for (let offset = 0; offset < count; offset += 1) lines.push(start + offset);
  return lines;
};

/**
 * The NEW-file line numbers one `@@ -old +new @@ context` hunk header covers, or `[]` when the header
 * is malformed (defensive: every real `git diff` header carries a `+` token).
 * @es Los números de línea del fichero NUEVO que cubre una cabecera de hunk `@@ -old +new @@ context`,
 * o `[]` cuando la cabecera está malformada.
 */
const parseHunkHeader = (line) => {
  const body = line.slice(HUNK_HEADER_PREFIX.length);
  const newRangeToken = body.split(' ').find((token) => token.startsWith(NEW_RANGE_MARKER));
  return newRangeToken === undefined ? [] : expandNewRangeToken(newRangeToken);
};

/**
 * Parses unified-zero diff `text` into a `Map<repoRelativePath, number[]>` of changed NEW-file line
 * numbers per file. Deleted files (`+++ /dev/null`) contribute no entry, since a deleted file has no
 * new lines to grade.
 * @param text - The raw stdout of `git diff --unified=0`. @es El stdout crudo de `git diff --unified=0`.
 * @es Parsea el `text` de un diff unified-zero al `Map<rutaRelativa, number[]>` de números de línea
 * NUEVOS cambiados por fichero. Un fichero borrado no aporta entrada: no tiene líneas nuevas que auditar.
 */
export const parseChangedLinesByFile = (text) => {
  const changedLinesByFile = new Map();
  let currentFile = null;

  for (const line of text.split('\n')) {
    if (line.startsWith(NEW_FILE_HEADER_PREFIX)) {
      currentFile = parseNewFileHeader(line);
      continue;
    }
    if (line.startsWith(HUNK_HEADER_PREFIX) && currentFile !== null) {
      const lines = parseHunkHeader(line);
      if (lines.length === 0) continue;
      const existing = changedLinesByFile.get(currentFile) ?? [];
      changedLinesByFile.set(currentFile, existing.concat(lines));
    }
  }

  return changedLinesByFile;
};
