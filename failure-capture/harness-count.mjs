/**
 * How the Claude Code harness counts one instruction file and what its limits are: `countedLength` (text in,
 * counted characters out) and `harnessLimits` (context size in, per-file and total limits out), each ONE
 * replaceable function, so a harness change touches one place. Nothing here reads a file or a directory.
 *
 * Read on 2026-09-30 from the JavaScript embedded in the installed Claude Code 2.1.286 binary (the design
 * read 2.1.285 and found the same): a file's text loses its frontmatter; when it holds `<!--`, line breaks
 * become `\n` and each TOP-LEVEL markdown HTML block that starts with `<!--` and holds `-->` loses its
 * comments (the block is dropped when only blanks remain); the per-file limit is
 * `max(40000, round(contextTokens * 0.05 * charsPerToken))` and the total limit is `max(120000, perFile)`;
 * a file over the per-file limit is left out of the sum that raises the warning. The harness defaults to a
 * 200,000-token context and to 4 chars per token for some models, else 3.
 * NOT PORTED, so this count is an UPPER BOUND of the harness's: only a block starting in column 0 is recognised
 * (a block inside a list item or quote, which the harness keeps, is kept too). Frontmatter is removed
 * exactly as the harness does (a leading `---` block, found by the same rule as its pattern). Inline markers such as `<!--fc:KEY#N-->` are counted, as the harness counts them.
 * NO REGEX, as in the rest of this directory.
 *
 * @es Cómo cuenta el harness de Claude Code un fichero de instrucciones y cuáles son sus límites:
 * `countedLength` (texto a caracteres contados) y `harnessLimits` (tamaño de contexto a límites por fichero y
 * total), cada una UNA función reemplazable, para que un cambio del harness toque un solo lugar. Nada aquí
 * lee un fichero ni un directorio. Leído el 2026-09-30 del JavaScript embebido en el binario instalado de
 * Claude Code 2.1.286 (el diseño leyó 2.1.285 con el mismo resultado): el texto pierde su frontmatter; si
 * contiene `<!--`, los saltos de línea pasan a `\n` y cada bloque HTML markdown de NIVEL SUPERIOR que empieza
 * con `<!--` y contiene `-->` pierde sus comentarios (el bloque se descarta si solo quedan blancos); el
 * límite por fichero es `max(40000, round(contextTokens * 0.05 * charsPerToken))` y el total
 * `max(120000, perFile)`; un fichero sobre el límite por fichero queda fuera de la suma que dispara el
 * aviso. El harness supone 200.000 tokens de contexto y 4 caracteres por token en algunos modelos, si no 3.
 * NO PORTADO, así que este recuento es una COTA SUPERIOR de la del harness: solo se reconoce un bloque que empieza
 * en la columna 0 (uno dentro de una lista o cita, que el harness conserva, también se conserva). El
 * frontmatter se quita exactamente como lo hace el harness (un bloque inicial `---`, hallado con la misma
 * regla que su patrón). Los marcadores en línea como `<!--fc:KEY#N-->` se cuentan, igual que el harness.
 * SIN REGEX, como el resto del directorio.
 */

export const HARNESS_VERSION = '2.1.286';

const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const FRONTMATTER_MARK = '---';
const BYTE_ORDER_MARK = 0xfeff;
const FENCE_CHARACTERS = ['`', '~'];
const MAX_FENCE_INDENT = 3;
const MIN_FENCE_LENGTH = 3;

const DEFAULT_CONTEXT_TOKENS = 200_000;
const DEFAULT_CHARS_PER_TOKEN = 3;
const CONTEXT_SHARE = 0.05;
const MIN_FILE_LIMIT = 40_000;
const MIN_TOTAL_LIMIT = 120_000;

/** Line breaks as the harness's markdown lexer sees them: CRLF and lone CR become LF. @es Saltos de línea como los ve el lexer markdown del harness: CRLF y CR suelto pasan a LF. */
const normalizeLineBreaks = (text) => text.split('\r\n').join('\n').split('\r').join('\n');

/** `raw` without every `<!-- ... -->` span; an opener with no closer stays. @es `raw` sin cada tramo `<!-- ... -->`; una apertura sin cierre se queda. */
function removeComments(raw) {
  let rest = '';
  let position = 0;

  for (;;) {
    const open = raw.indexOf(COMMENT_OPEN, position);
    const close = open === -1 ? -1 : raw.indexOf(COMMENT_CLOSE, open + COMMENT_OPEN.length);

    if (close === -1) return rest + raw.slice(position);

    rest += raw.slice(position, open);
    position = close + COMMENT_CLOSE.length;
  }
}

/** Where the HTML block that starts at `start` ends: after the line holding its first `-->` and the newlines that follow; the end of the text when it never closes. `<!-->` and `<!--->` are whole comments, so their block ends with their own line. @es Dónde termina el bloque HTML que empieza en `start`: tras la línea con su primer `-->` y los saltos que siguen; el fin del texto si nunca cierra. `<!-->` y `<!--->` son comentarios completos, así que su bloque termina con su propia línea. */
function commentBlockEnd(text, start) {
  const bodyStart = start + COMMENT_OPEN.length;
  const selfClosed = text.startsWith('>', bodyStart) || text.startsWith('->', bodyStart);

  const close = selfClosed ? start : text.indexOf(COMMENT_CLOSE, bodyStart);

  if (close === -1) return text.length;

  const lineEnd = text.indexOf('\n', close);
  let end = lineEnd === -1 ? text.length : lineEnd;

  while (text[end] === '\n') end += 1;

  return end;
}

/** The fence a line opens or closes, `{ character, length }`, or `undefined`: three or more identical fence characters after at most three spaces. @es La valla que una línea abre o cierra, o `undefined`: tres o más caracteres de valla iguales tras un máximo de tres espacios. */
function fenceOf(line) {
  const body = line.trimStart();
  const character = body[0];

  if (line.length - body.length > MAX_FENCE_INDENT || !FENCE_CHARACTERS.includes(character)) return undefined;

  let length = 0;

  while (body[length] === character) length += 1;

  return length >= MIN_FENCE_LENGTH ? { character, length } : undefined;
}

/** The fence in force after `line`: the one it opens, or none when it is a bare closing fence of the same character and at least the same length. @es La valla vigente tras `line`: la que abre, o ninguna si es una valla de cierre sola, del mismo carácter y al menos igual de larga. */
export function fenceAfter(open, line) {
  const fence = fenceOf(line);

  if (open === undefined) return fence;

  const closes = fence !== undefined && fence.character === open.character && fence.length >= open.length && line.trim().length === fence.length;

  return closes ? undefined : open;
}

/** The text of a comment block that stays once its comments go: nothing when only blanks remain. @es El texto de un bloque de comentarios que permanece al quitar sus comentarios: nada si solo quedan blancos. */
function remainderOf(block) {
  const rest = removeComments(block);

  return rest.trim().length > 0 ? rest : '';
}

/** The index after the run of whitespace that starts at `from`. @es El índice tras la racha de blancos que empieza en `from`. */
function skipBlanks(text, from) {
  let index = from;

  while (index < text.length && text[index].trim() === '') index += 1;

  return index;
}

/** `text` without its leading `---` frontmatter block; unchanged when it has none. A byte-order mark is ignored when looking, and kept when nothing is removed. @es `text` sin su bloque inicial de frontmatter `---`; igual si no lo tiene. */
function withoutFrontmatter(text) {
  const source = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;

  if (!source.startsWith(FRONTMATTER_MARK)) return text;

  const gapEnd = skipBlanks(source, FRONTMATTER_MARK.length);
  const lastBreak = source.lastIndexOf('\n', gapEnd - 1);
  const close = lastBreak < FRONTMATTER_MARK.length ? -1 : source.indexOf(FRONTMATTER_MARK, lastBreak + 1);

  return close === -1 ? text : source.slice(skipBlanks(source, close + FRONTMATTER_MARK.length));
}

/** The text the harness keeps of an instruction file: no frontmatter and no top-level comment blocks. @es El texto que el harness conserva de un fichero de instrucciones: sin frontmatter ni bloques de comentarios de nivel superior. */
export function instructionContent(text) {
  const body = withoutFrontmatter(text);

  if (!body.includes(COMMENT_OPEN)) return body;

  const source = normalizeLineBreaks(body);
  let kept = '';
  let position = 0;
  let fence;

  while (position < source.length) {
    if (fence === undefined && source.startsWith(COMMENT_OPEN, position)) {
      const blockEnd = commentBlockEnd(source, position);

      kept += remainderOf(source.slice(position, blockEnd));
      position = blockEnd;
      continue;
    }

    const newline = source.indexOf('\n', position);
    const lineEnd = newline === -1 ? source.length : newline + 1;

    fence = fenceAfter(fence, source.slice(position, lineEnd));
    kept += source.slice(position, lineEnd);
    position = lineEnd;
  }

  return kept;
}

/** The characters the harness counts for an instruction file with this `text`. @es Los caracteres que el harness cuenta para un fichero con este `text`. */
export const countedLength = (text) => instructionContent(text).length;

/** The per-file and total limits, in characters, for a context of `contextTokens` at `charsPerToken`. @es Los límites por fichero y total, en caracteres, para un contexto de `contextTokens` a `charsPerToken`. */
export function harnessLimits({ contextTokens, charsPerToken = DEFAULT_CHARS_PER_TOKEN }) {
  const tokens = Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS;
  const perFile = Math.max(MIN_FILE_LIMIT, Math.round(tokens * CONTEXT_SHARE * charsPerToken));

  return { perFile, total: Math.max(MIN_TOTAL_LIMIT, perFile) };
}

/** Whether a file of `length` characters is added to the sum that raises the warning: one over the per-file limit is left out. @es Si un fichero de `length` caracteres entra en la suma que dispara el aviso: uno sobre el límite por fichero queda fuera. */
export const countsTowardTotal = (length, limits) => length <= limits.perFile;
