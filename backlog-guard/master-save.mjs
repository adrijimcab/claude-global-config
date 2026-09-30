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

/**
 * SECOND FACE, found in live use the day this mechanism was deployed: `mem_update` edits an EXISTING
 * observation by `id` alone — its own call carries no `topic_key` at all — so an owner correction to the
 * master backlog via `mem_update` tripped this guard even though it was a real, correct write. Verified
 * against real transcript data before building on it (owner directive: never type the shape from
 * memory): a real `mem_save` call's own `tool_result` echoes the engram-assigned numeric id in the SAME
 * exchange — `{"id":972,"judgment_required":false,…,"result":"Memory saved: …"}` — immediately after
 * the `tool_use` block that carried its `topic_key`. That id/topic_key pairing is the one deterministic
 * link available without guessing from title text (the alternative sources the owner named —
 * `mem_update`'s own result, `mem_get_observation`'s result — were checked against real data too and
 * BOTH echo the observation's TITLE, never its topic_key, so neither is usable).
 *
 * @es SEGUNDA CARA: `mem_update` edita una observación EXISTENTE solo por `id`, sin `topic_key` propio.
 * Verificado contra datos reales antes de construir sobre ello: el `tool_result` de un `mem_save` real
 * repite el id numérico asignado por engram en el MISMO intercambio, justo después del bloque
 * `tool_use` que llevaba su `topic_key` — es el único enlace determinista disponible sin adivinar desde
 * el texto del título (las otras fuentes que nombró el dueño se comprobaron contra datos reales y
 * AMBAS repiten el TÍTULO, nunca el topic_key).
 */

/** The literal marking a `mem_update` call, including its MCP-prefixed spellings. @es El literal que marca una llamada `mem_update`. */
const UPDATE_TOOL_MARKER = 'mem_update';

/**
 * The two shapes an `"id":` field takes in a real transcript, both measured before use (owner
 * directive: never type the shape from memory). A `tool_use.input` object sits at ONE JSON level, so
 * its `id` appears UNESCAPED — this is the shape `mem_update`'s own call uses. A `tool_result`'s
 * `content[].text` is a STRING field whose VALUE is itself JSON text, so the SAME field appears
 * ESCAPED one level deeper — measured on the real `mem_save` result this module was built against:
 * `"text":"{\"id\":972,\"judgment_required\":false,…}"`. Both are checked; neither alone would see
 * every real occurrence.
 * @es Las dos formas reales de un campo `"id":`: SIN escapar dentro de un `tool_use.input` (la forma
 * que usa la propia llamada `mem_update`), y ESCAPADA un nivel más adentro dentro del `text` de un
 * `tool_result`, que es un STRING cuyo valor es a su vez texto JSON. Medido contra datos reales.
 */
const ID_FIELD_MARKERS = ['"id":', '\\"id\\":'];

/** Digits, read one at a time — no regex (M5). @es Dígitos, leídos uno a uno — sin regex (M5). */
const DIGITS = '0123456789';

/**
 * How far PAST a `topic_key` match this module looks for the numeric `id` that names the SAME engram
 * observation. Measured on the real exchange above: the `id` sat in the very NEXT transcript line,
 * a few hundred bytes after the `topic_key` that started its `tool_use` block. This window is generous
 * headroom over that, not a tuned minimum — it only needs to reach the following tool_result, never the
 * whole rest of the transcript.
 * @es Cuánto mira este módulo PASADO un `topic_key` para hallar el `id` numérico de la MISMA
 * observación. Medido en el intercambio real de arriba: el `id` cayó en la línea SIGUIENTE.
 */
const ID_SEARCH_WINDOW = 4000;

/** Every numeric `id` VALUE found in `text` — either marker shape — as a `Set<number>`. @es Cada VALOR numérico de `id` en `text` — cualquiera de las dos formas — como `Set<number>`. */
export function numericIdValuesIn(text) {
  const ids = new Set();

  for (const marker of ID_FIELD_MARKERS) {
    let searchFrom = 0;

    for (let markerAt = text.indexOf(marker, searchFrom); markerAt !== -1; markerAt = text.indexOf(marker, searchFrom)) {
      let end = markerAt + marker.length;

      while (end < text.length && DIGITS.includes(text[end])) end += 1;

      const digits = text.slice(markerAt + marker.length, end);

      if (digits.length > 0) ids.add(Number(digits));

      searchFrom = end > markerAt + marker.length ? end : markerAt + marker.length + 1;
    }
  }

  return ids;
}

/**
 * Every `{ id, topicKey }` pairing this module can OBSERVE in `text`: for each master-backlog
 * `topic_key` match, the nearest numeric `id` appearing within `ID_SEARCH_WINDOW` characters AFTER it.
 * This is what LEARNS "observation 972 is the master backlog" — a durable fact, not a per-turn one — so
 * a caller persists it once seen, regardless of what this turn's verdict turns out to be.
 * @es Cada pareja `{ id, topicKey }` que este módulo puede OBSERVAR en `text`. Esto es lo que APRENDE
 * «la observación 972 es el backlog maestro» — un hecho durable, no de un turno.
 */
export function observedMasterIdPairings(text) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const pairings = [];
  let searchFrom = 0;

  for (let markerAt = text.indexOf(TOPIC_KEY_MARKER, searchFrom); markerAt !== -1; markerAt = text.indexOf(TOPIC_KEY_MARKER, searchFrom)) {
    const valueStart = markerAt + TOPIC_KEY_MARKER.length;
    const valueEnd = text.indexOf('"', valueStart);

    if (valueEnd === -1) break;

    const topicKey = text.slice(valueStart, valueEnd);
    searchFrom = valueEnd + 1;

    if (!isMasterBacklogTopicKey(topicKey)) continue;

    const window = text.slice(valueEnd, valueEnd + ID_SEARCH_WINDOW);
    const idsInWindow = numericIdValuesIn(window);

    for (const id of idsInWindow) pairings.push({ id, topicKey });
  }

  return [...pairings, ...observedFromResultMetadata(text)];
}

/**
 * SECOND SOURCE, found missing in live use: `mem_get_observation`'s (and `mem_save`'s) own RESULT text
 * carries a human-readable metadata footer — measured directly against a real transcript before fixing
 * this (owner directive: read the real records, never guess): `"result":"#972 [decision] BACKLOG
 * MAESTRO…\nTopic: backlog/1.0.0-master\nDuplicates: 1\nRevisions: 12\n…"`. The id sits right after
 * `#`, the topic_key after a literal `Topic: ` line, both inside the SAME result string. This is a
 * DIFFERENT shape from `observedMasterIdPairings`'s own JSON `"topic_key":"…"` scan (which only sees a
 * `mem_save` CALL's own input, never a READ's result), so it is a second, independent extraction over
 * the SAME text, not a replacement.
 *
 * SECOND LIVE DEFECT, found the day after the first fix shipped (45888ec): a real
 * `mem_get_observation` in the main session's own transcript — never a subagent's, never a fixture —
 * teaches NOTHING, because the marker was unescaped-only. MEASURED directly against session
 * `c45d798b-d78f-4f60-9a32-1f722bbe86e5`'s own transcript file (never guessed): the unescaped
 * `"result":"#972` occurs ZERO times in it, while the ESCAPED form `\"result\":\"#972` occurs 14
 * times. The reason is the same one `ID_FIELD_MARKERS` already documents for `"id":` two members
 * below: a `tool_result`'s `content[].text` is a JSON STRING whose VALUE is itself JSON-object-shaped
 * text, so every literal `"` inside that value — including the ones around `result` and `#972` —
 * is escaped ONCE when the whole line is serialized. `ID_FIELD_MARKERS` got both forms from the
 * start; this marker only ever got the unescaped one, because the mem_save-result fixture the first
 * fix was built against happened to be a SHORTER, differently-shaped result that never went through
 * this exact escaping depth in the unit tests that exercised it.
 * @es SEGUNDA FUENTE, hallada ausente en uso real: el resultado de `mem_get_observation` (y de
 * `mem_save`) lleva un pie de metadatos legible por humanos — medido contra un transcript real antes de
 * arreglarlo. El id va justo tras `#`, el topic_key tras una línea literal `Topic: `, ambos dentro del
 * MISMO string de resultado. Es una forma DISTINTA al escaneo JSON de `observedMasterIdPairings`
 * (que solo ve el INPUT de una llamada `mem_save`, nunca el resultado de una lectura).
 * SEGUNDO DEFECTO EN VIVO, hallado al día siguiente del primer arreglo: un `mem_get_observation` REAL
 * de la sesión principal no enseña NADA, porque el marcador solo tenía la forma sin escapar. MEDIDO
 * contra el transcript real de la sesión `c45d798b-d78f-4f60-9a32-1f722bbe86e5`: la forma sin escapar
 * aparece CERO veces; la forma ESCAPADA aparece 14 veces — el mismo motivo que ya documenta
 * `ID_FIELD_MARKERS` dos miembros más abajo.
 */
const RESULT_ID_MARKERS = ['"result":"#', '\\"result\\":\\"#'];
const TOPIC_LABEL_MARKER = 'Topic: ';
const RESULT_METADATA_WINDOW = 8000;

/**
 * The earliest of a literal newline, a JSON-escaped `\n`, or a DOUBLY-escaped `\\n` after `from`, or
 * `text.length` if none appear — the metadata footer's own line ending.
 *
 * THE DOUBLY-ESCAPED FORM, found in live use the day after the first fix shipped: MEASURED directly
 * against session `c45d798b-d78f-4f60-9a32-1f722bbe86e5`'s real transcript, the metadata footer's own
 * newlines appear as THREE raw bytes (`\`, `\`, `n`) right after the topic value, not two — one level
 * deeper than the `"result":"#` marker itself, which is only single-escaped. A single-escaped-only
 * check finds the SECOND backslash of that pair as its match, so the slice it returns keeps the FIRST
 * backslash as a trailing character of the topic value (`backlog/1.0.0-master\`), which then fails
 * `isMasterBacklogTopicKey`'s exact `-master` suffix check and teaches nothing. Checking all three
 * forms and taking the EARLIEST is what stops the exact escaping depth from mattering.
 * @es El primero de un salto real, uno escapado `\n`, o uno DOBLEMENTE escapado `\\n`, o el final del
 * texto. LA FORMA DOBLEMENTE ESCAPADA, hallada en uso real: el pie de metadatos tiene sus propios
 * saltos de línea como TRES bytes crudos, un nivel más adentro que el propio marcador `"result":"#`.
 * Comprobar las tres formas y tomar la MÁS TEMPRANA es lo que hace que la profundidad exacta de escape
 * deje de importar.
 */
function lineEndAfter(text, from) {
  const real = text.indexOf('\n', from);
  const singleEscaped = text.indexOf('\\n', from);
  const doubleEscaped = text.indexOf('\\\\n', from);
  const candidates = [real, singleEscaped, doubleEscaped].filter((index) => index !== -1);

  return candidates.length === 0 ? text.length : Math.min(...candidates);
}

/** One marker's pairings: every `{ id, topicKey }` this ONE `RESULT_ID_MARKERS` shape can observe in `text`. @es Las parejas que UNA forma de `RESULT_ID_MARKERS` puede observar en `text`. */
function observedFromResultMetadataMarker(text, marker) {
  const pairings = [];
  let searchFrom = 0;

  for (let markerAt = text.indexOf(marker, searchFrom); markerAt !== -1; markerAt = text.indexOf(marker, searchFrom)) {
    const idStart = markerAt + marker.length;
    let idEnd = idStart;

    while (idEnd < text.length && DIGITS.includes(text[idEnd])) idEnd += 1;

    const id = idEnd > idStart ? Number(text.slice(idStart, idEnd)) : undefined;

    searchFrom = idEnd > idStart ? idEnd : markerAt + marker.length + 1;

    if (id === undefined) continue;

    const window = text.slice(idEnd, idEnd + RESULT_METADATA_WINDOW);
    const topicAt = window.indexOf(TOPIC_LABEL_MARKER);

    if (topicAt === -1) continue;

    const valueStart = topicAt + TOPIC_LABEL_MARKER.length;
    const valueEnd = lineEndAfter(window, valueStart);
    const topicKey = window.slice(valueStart, valueEnd);

    if (isMasterBacklogTopicKey(topicKey)) pairings.push({ id, topicKey });
  }

  return pairings;
}

function observedFromResultMetadata(text) {
  return RESULT_ID_MARKERS.flatMap((marker) => observedFromResultMetadataMarker(text, marker));
}

/**
 * Whether transcript excerpt `tail` shows a `mem_update` targeting a KNOWN master-backlog observation
 * id. `knownMasterIds` is injected (a `Set<number>`/array of ids already learned, from THIS turn's own
 * `observedMasterIdPairings` and/or a persisted record of earlier ones) — this function never learns on
 * its own, so a caller controls exactly what counts as "known" and when.
 * @es Si `tail` muestra un `mem_update` sobre un id de observación de backlog maestro YA CONOCIDO.
 * `knownMasterIds` se inyecta; esta función nunca aprende por su cuenta.
 */
export function hasMasterBacklogUpdate(tail, knownMasterIds) {
  if (typeof tail !== 'string' || tail.length === 0) return false;
  if (!tail.includes(UPDATE_TOOL_MARKER)) return false;

  // No early return for an EMPTY `known` set: `known.has(id)` is already `false` for every id on an
  // empty `Set`, so a separate guard here would be dead weight — proven, not assumed, by this module's
  // own mutation campaign (a mutant removing exactly that guard did not survive... it SURVIVED, which is
  // precisely why the guard was removed rather than kept as unproven ceremony).
  // @es Sin retorno temprano para un `known` VACÍO: `known.has(id)` ya es `false` para cualquier id
  // sobre un `Set` vacío, así que una guarda aparte aquí sería peso muerto — probado, no asumido, por la
  // propia campaña de mutación de este módulo.
  const known = knownMasterIds instanceof Set ? knownMasterIds : new Set(knownMasterIds ?? []);
  const idsInTail = numericIdValuesIn(tail);

  for (const id of idsInTail) if (known.has(id)) return true;

  return false;
}
