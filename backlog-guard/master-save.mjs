/**
 * Detects a master-backlog `mem_save` inside a raw transcript excerpt.
 *
 * "Master-backlog save" means a `mem_save` call whose `topic_key` argument matches `backlog/*-master`
 * (owner directive: `~/.claude/rules/00-owner-mandates.md`, "Backlog maestro"; measured shape in this
 * project: `backlog/1.0.0-master`, engram observation #972). This module decides only THAT shape —
 * never whether the saved content is any good, which no command hook can judge.
 *
 * WHY A LITERAL SCAN OVER THE RAW TEXT, not `JSON.parse` per line. The transcript is JSONL, but a
 * `tool_use` block sits nested inside a larger per-line message object, and the value we need
 * (`input.topic_key`) is one field among many. `engram-persistence/guard.mjs` — the closest existing
 * mechanism, proven in production — already established the pattern this module extends: read the
 * transcript BYTES since a stored offset and search the raw text for a literal marker
 * (`SAVE_MARKERS = ['mem_save', 'mem_session_summary']`). This module needs one field's VALUE, not just
 * a tool name's presence, so it extracts every `"topic_key":"…"` value with plain string slicing —
 * still no regex (M5), and still tolerant of the tool call sitting anywhere in a large JSON blob.
 *
 * TWO CONDITIONS, BOTH REQUIRED, NEITHER POSITIONALLY LINKED. `hasMasterBacklogSave` requires the tail
 * to contain SOME save-tool marker (`mem_save`, which also matches inside the MCP-prefixed
 * `mcp__engram__mem_save` / `mcp__plugin_engram_engram__mem_save`, same reasoning as
 * `engram-persistence/guard.mjs`) AND a `topic_key` value shaped `backlog/*-master`, anywhere in the
 * same tail. It does not attempt to prove the two belong to the SAME tool call — that would need a real
 * JSON parse of the transcript's message structure, which a Stop hook heuristic does not need: the
 * worst case of this looseness is an extra, harmless ALLOW, and `grep localiza, NO dictamina` already
 * accepts that class of imprecision for every marker-based guard in this fleet.
 *
 * NO REGEX (owner mandate M5): `indexOf`/`slice`/`startsWith`/`endsWith` on literals only.
 *
 * A `mem_update` carries no `topic_key`, so it is NOT decided here: `master-update.mjs` asks the engram
 * store what the updated observation is. This module used to learn id/topic_key pairings from the
 * transcript for that purpose; it was removed once the store answered the question directly.
 *
 * @es Un `mem_update` no lleva `topic_key`, así que NO se decide aquí: `master-update.mjs` pregunta al
 * almacén de engram qué es la observación actualizada. Este módulo aprendía parejas id/topic_key del
 * transcript para eso; se eliminó cuando el almacén respondió la pregunta directamente.
 *
 * @es Detecta un guardado de backlog maestro dentro de un fragmento crudo de transcript. "Guardado de
 * backlog maestro" es una llamada `mem_save` cuyo argumento `topic_key` case `backlog/*-master`. Escanea
 * el texto crudo en vez de parsear JSON por línea, extendiendo el patrón ya probado de
 * `engram-persistence/guard.mjs` (buscar un marcador literal en los bytes desde un offset guardado) para
 * extraer el VALOR de un campo, no solo la presencia de un nombre de herramienta. Dos condiciones, ambas
 * requeridas, sin vincularse posicionalmente: el peor caso de esa holgura es un ALLOW extra e inofensivo.
 * SIN REGEX (mandato M5).
 */

/** The literal substring identifying a save-family tool call, including its MCP-prefixed spellings. @es El literal que identifica una llamada a la familia de guardado, incluidas sus formas con prefijo MCP. */
const SAVE_TOOL_MARKER = 'mem_save';

/** The exact JSON fragment preceding a `topic_key` value in a compact (no-space) JSON serialization. @es El fragmento JSON exacto que precede al valor de `topic_key` en una serialización JSON compacta. */
const TOPIC_KEY_MARKER = '"topic_key":"';

/** The backlog namespace prefix every master-backlog topic_key starts with. @es El prefijo de espacio de nombres con el que empieza todo topic_key de backlog maestro. */
const BACKLOG_NAMESPACE_PREFIX = 'backlog/';

/** The suffix that marks a backlog topic_key as the ONE master record for its milestone, not a note. @es El sufijo que marca un topic_key de backlog como el registro maestro de su hito, no una nota. */
const MASTER_SUFFIX = '-master';

/**
 * Every `topic_key` VALUE found in `text`, in order of appearance. Walks `indexOf` forward from each
 * match so overlapping or repeated keys are all captured, never just the first.
 * @es Cada VALOR de `topic_key` encontrado en `text`, en orden de aparición.
 */
export function topicKeyValuesIn(text) {
  const values = [];
  let searchFrom = 0;

  for (
    let markerAt = text.indexOf(TOPIC_KEY_MARKER, searchFrom);
    markerAt !== -1;
    markerAt = text.indexOf(TOPIC_KEY_MARKER, searchFrom)
  ) {
    const valueStart = markerAt + TOPIC_KEY_MARKER.length;
    const valueEnd = text.indexOf('"', valueStart);

    if (valueEnd === -1) break; // an unterminated fragment at the tail's cut point, nothing more to read

    values.push(text.slice(valueStart, valueEnd));
    searchFrom = valueEnd + 1;
  }

  return values;
}

/** Whether `value` is shaped like a master-backlog topic_key (`backlog/<anything>-master`). @es Si `value` tiene la forma de un topic_key de backlog maestro. */
export function isMasterBacklogTopicKey(value) {
  return typeof value === 'string' && value.startsWith(BACKLOG_NAMESPACE_PREFIX) && value.endsWith(MASTER_SUFFIX) && value.length > BACKLOG_NAMESPACE_PREFIX.length + MASTER_SUFFIX.length;
}

/**
 * Whether transcript excerpt `tail` shows a master-backlog save. `false` for `undefined`/empty input,
 * so a caller that could not read the transcript never has to special-case this function separately.
 * @es Si el fragmento de transcript `tail` muestra un guardado de backlog maestro. `false` para entrada
 * `undefined`/vacía.
 */
export function hasMasterBacklogSave(tail) {
  if (typeof tail !== 'string' || tail.length === 0) return false;
  if (!tail.includes(SAVE_TOOL_MARKER)) return false;

  return topicKeyValuesIn(tail).some((value) => isMasterBacklogTopicKey(value));
}
