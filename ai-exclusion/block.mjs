/**
 * The marked block inside an `info/exclude` text: how it is rendered, replaced and judged. Pure text in, text
 * out. Everything OUTSIDE the two marker lines is never rewritten: the block is replaced by index, so those
 * bytes stay identical. A file with a half block (one marker), a repeated marker or the markers out of order
 * is MALFORMED and throws: guessing which lines to drop could delete hand-written ones.
 *
 * @es El bloque marcado dentro de un texto `info/exclude`: cómo se genera, se reemplaza y se juzga. Texto
 * puro. Lo que queda FUERA de las dos líneas marcadoras no se reescribe nunca: el bloque se reemplaza por
 * índice y esos bytes quedan idénticos. Un fichero con medio bloque, un marcador repetido o marcadores en mal
 * orden es MALFORMADO y lanza error: adivinar qué líneas borrar podría perder las escritas a mano.
 */

export const BEGIN_MARKER = '# >>> ai-exclusion (managed by ~/.claude/ai-exclusion; edits here are overwritten)';
export const END_MARKER = '# <<< ai-exclusion';

/** The end-of-line the text already uses. @es El fin de línea que el texto ya usa. */
function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** The block for `patterns`, no trailing newline. @es El bloque de `patterns`, sin salto final. */
export function renderBlock(patterns, eol = '\n') {
  return [BEGIN_MARKER, ...patterns, END_MARKER].join(eol);
}

/** Every index where `needle` starts a line. @es Cada índice donde `needle` abre una línea. */
function lineStarts(text, needle) {
  const found = [];

  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    if (at === 0 || text[at - 1] === '\n') found.push(at);
  }

  return found;
}

/**
 * Where the block sits: `undefined` when absent, `{ start, end }` (end after the END marker) when whole.
 * @es Dónde está el bloque: `undefined` si no está, `{ start, end }` si está entero.
 */
function locate(text) {
  const begins = lineStarts(text, BEGIN_MARKER);
  const ends = lineStarts(text, END_MARKER);

  if (begins.length === 0 && ends.length === 0) return undefined;
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    throw new Error(`malformed ai-exclusion block: ${begins.length} begin and ${ends.length} end markers, or out of order. @es bloque ai-exclusion malformado: ${begins.length} marcadores de inicio y ${ends.length} de fin, o en mal orden.`);
  }

  const lineEnd = text.indexOf('\n', ends[0]);
  const end = lineEnd === -1 ? text.length : lineEnd;

  return { start: begins[0], end: text[end - 1] === '\r' ? end - 1 : end };
}

/**
 * `'ok'` when the text holds exactly this block, `'stale'` when it holds another one, `'missing'` when none.
 * @es `'ok'` si el texto tiene justo este bloque, `'stale'` si tiene otro, `'missing'` si no tiene.
 */
export function blockState(text, patterns) {
  const where = locate(text);

  if (where === undefined) return 'missing';

  return text.slice(where.start, where.end) === renderBlock(patterns, eolOf(text)) ? 'ok' : 'stale';
}

/**
 * The text with the block present and current: replaced in place when there, appended when not.
 * @es El texto con el bloque presente y vigente: reemplazado en su sitio si estaba, añadido si no.
 */
export function withBlock(text, patterns) {
  const eol = eolOf(text);
  const block = renderBlock(patterns, eol);
  const where = locate(text);

  if (where !== undefined) return text.slice(0, where.start) + block + text.slice(where.end);

  const separated = text.length === 0 ? '' : (text.endsWith('\n') ? text : text + eol) + eol;

  return `${separated}${block}${eol}`;
}
