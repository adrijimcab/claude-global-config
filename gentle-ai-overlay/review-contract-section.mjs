/**
 * The review execution contract inside CLAUDE.md, and its LAZY form: the span gentle-ai renders from
 * the line `#### Review Execution Contract` up to (not including) the line `#### Cost and Context
 * Balance`, inside the `sdd-orchestrator` region (gentle-ai v2.9.1 internal/components/sdd/
 * boundedreview.go, replaceBoundedReviewSection). Pure: text in, text out, no I/O.
 *
 * While receipt-driven development is off the span is replaced, in place, by its heading, a sentinel
 * comment carrying the SHA-256 of the exact bytes moved out, and a pointer telling the reader when to
 * read the stash. The sentinel is an HTML comment, which the harness strips from the loaded text, and
 * it never contains a gentle-ai marker. Every byte outside the span is left as it was, and the
 * pointer uses the file's own line ending, so restoring the stash gives back the original file.
 *
 * @es El contrato de ejecución de revisiones dentro de CLAUDE.md y su forma DIFERIDA: el tramo que
 * gentle-ai genera desde la línea `#### Review Execution Contract` hasta (sin incluir) la línea
 * `#### Cost and Context Balance`, dentro de la región `sdd-orchestrator`. Puro: texto entra, texto
 * sale, sin E/S. Mientras el desarrollo guiado por recibos está apagado, el tramo se reemplaza en su
 * sitio por su encabezado, un comentario centinela con el SHA-256 de los bytes exactos que salieron y
 * un puntero que dice cuándo leer el depósito. El centinela es un comentario HTML, que el harness quita
 * del texto cargado, y nunca contiene un marcador de gentle-ai. Ningún byte fuera del tramo cambia y
 * el puntero usa el fin de línea del propio fichero, así que restaurar el depósito devuelve el original.
 */
import { createHash } from 'node:crypto';
import { lineContent, splitLines } from './text-file.mjs';

export const START_HEADING = '#### Review Execution Contract';
export const END_HEADING = '#### Cost and Context Balance';
const CONTRACT_TITLE = '# Native Compact Review Orchestration';
const REGION_OPEN = '<!-- gentle-ai:sdd-orchestrator -->';
const REGION_CLOSE = '<!-- /gentle-ai:sdd-orchestrator -->';
const SENTINEL_PREFIX = '<!-- owner-overlay:lazy-review-contract v1 sha256=';
const SENTINEL_SUFFIX = ' -->';

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Character offsets of every line whose content is exactly `needle`. @es Desplazamientos de cada línea cuyo contenido es exactamente `needle`. */
function lineStarts(text, needle) {
  const found = [];
  let offset = 0;
  for (const line of splitLines(text)) {
    if (lineContent(line) === needle) found.push(offset);
    offset += line.length + 1;
  }
  return found;
}

/**
 * Where the span is and which form it has.
 * @es Dónde está el tramo y qué forma tiene.
 * @returns {{ form: 'absent' } | { form: 'present'|'moved', start: number, end: number, sha?: string } | { refused: string }}
 */
export function inspectSection(text) {
  const [starts, ends, opens, closes] = [START_HEADING, END_HEADING, REGION_OPEN, REGION_CLOSE].map((needle) => lineStarts(text, needle));
  if (starts.length === 0 && lineStarts(text, CONTRACT_TITLE).length === 0) return { form: 'absent' };
  if (starts.length !== 1) return { refused: `"${START_HEADING}" is not exactly one whole line (${starts.length}) @es "${START_HEADING}" no es exactamente una línea completa (${starts.length})` };
  if (ends.length !== 1) return { refused: `"${END_HEADING}" is not exactly one whole line (${ends.length}) @es "${END_HEADING}" no es exactamente una línea completa (${ends.length})` };
  if (opens.length !== 1 || closes.length !== 1) return { refused: 'the sdd-orchestrator region is not present exactly once @es la región sdd-orchestrator no está exactamente una vez' };
  const [start, end] = [starts[0], ends[0]];
  if (!(opens[0] < start && start < end && end < closes[0])) return { refused: 'the span is not ordered inside the sdd-orchestrator region @es el tramo no está ordenado dentro de la región sdd-orchestrator' };
  const sentinel = splitLines(text.slice(start, end)).map(lineContent).find((line) => line.startsWith(SENTINEL_PREFIX) && line.endsWith(SENTINEL_SUFFIX));
  if (sentinel === undefined) return { form: 'present', start, end };
  return { form: 'moved', start, end, sha: sentinel.slice(SENTINEL_PREFIX.length, -SENTINEL_SUFFIX.length) };
}

const endingOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

/**
 * The text that stands in for the span: heading, sentinel, and the pointer with its exact triggers.
 * @es El texto que ocupa el lugar del tramo: encabezado, centinela y el puntero con sus disparadores exactos.
 */
export function pointerFor(text, movedSha, stashLabel) {
  return [
    START_HEADING,
    '',
    `${SENTINEL_PREFIX}${movedSha}${SENTINEL_SUFFIX}`,
    `Receipt-driven development is off globally, so this contract is not loaded here; its exact text is in \`${stashLabel}\`. READ THAT FILE IN FULL, and follow it as if it were written here, before any \`gentle-ai review\` command other than \`gentle-ai review mode status\`, before relaying a \`gentle-ai.review-integration.consent/v3\` envelope, and as soon as \`gentle-ai review mode status\` reports \`effective: on\`.`,
    `@es El desarrollo guiado por recibos está apagado globalmente, así que este contrato no se carga aquí; su texto exacto está en \`${stashLabel}\`. LEER ESE FICHERO COMPLETO, y seguirlo como si estuviera escrito aquí, antes de cualquier comando \`gentle-ai review\` distinto de \`gentle-ai review mode status\`, antes de transmitir un sobre \`gentle-ai.review-integration.consent/v3\`, y en cuanto \`gentle-ai review mode status\` informe \`effective: on\`.`,
    '',
    '',
  ].join(endingOf(text));
}

/**
 * What CLAUDE.md and the stash must become. `keepLoaded` is true when reviews may run or the mode could
 * not be read: the contract is then restored, never guessed. A moved span whose stash does not hash to
 * its sentinel is refused, and `gentle-ai sync` regenerates the canonical text.
 * @es En qué deben convertirse CLAUDE.md y el depósito. `keepLoaded` es verdadero cuando las revisiones
 * pueden correr o no se pudo leer el modo: el contrato se restaura, nunca se adivina. Un tramo movido
 * cuyo depósito no coincide con su centinela se rechaza, y `gentle-ai sync` regenera el texto canónico.
 * `form` is the span's form BEFORE reconciling. @es `form` es la forma del tramo ANTES de reconciliar.
 * @returns {{ outcome: 'moved'|'restored'|'unchanged', form: 'absent'|'present'|'moved', text: string, stash: string|null } | { refused: string }}
 */
export function reconcileSection(text, { keepLoaded, stash, stashLabel }) {
  const section = inspectSection(text);
  if (section.refused !== undefined) return section;
  const { form, start, end } = section;
  if (form === 'absent') return { outcome: 'unchanged', form, text, stash };
  if (form === 'present') {
    if (keepLoaded) return { outcome: 'unchanged', form, text, stash };
    const moved = text.slice(start, end);
    return { outcome: 'moved', form, text: text.slice(0, start) + pointerFor(text, sha256(moved), stashLabel) + text.slice(end), stash: moved };
  }
  if (stash === null || sha256(stash) !== section.sha) {
    return { refused: 'the stash is missing or does not match the sentinel; run `gentle-ai sync` @es el depósito falta o no coincide con el centinela; ejecutar `gentle-ai sync`' };
  }
  if (!keepLoaded) return { outcome: 'unchanged', form, text, stash };
  return { outcome: 'restored', form, text: text.slice(0, start) + stash + text.slice(end), stash };
}
