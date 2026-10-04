/**
 * Decides whether the `mem_update` calls of ONE turn touched the master backlog record, by ASKING THE
 * ENGRAM STORE which topic_key each targeted observation holds.
 *
 * THE QUESTION: "is observation `id` a master-backlog record?" — the same question
 * `../backlog-owner-guard/decide.mjs` answers for subagents, and answered by the SAME resolver
 * (`../backlog-owner-guard/resolve-topic-key.mjs`, read-only sqlite on engram's own store). This module
 * replaces a transcript-learning scheme (remember which ids an earlier `mem_save`/`mem_get_observation`
 * showed as master) that failed three times live — escaped markers, an 8000-character window, and, on
 * 2026-10-02 (id 1129), a read that happened in an EARLIER, differently-evaluated turn. A transcript can
 * only ever show what was read; the store always knows.
 *
 * WHICH IDS COUNT: only the `id` of an actual `mem_update` TOOL CALL. A transcript is JSONL, so each
 * line is parsed and walked for objects shaped `{ name: '…mem_update', input: { id } }` (both MCP
 * mount spellings, and the bare name). The previous scan accepted any known id anywhere in a tail that
 * merely mentioned `mem_update`, so a master id appearing in a READ's result satisfied the turn. A line
 * that does not parse (a cut at the offset, a partial write) is skipped, never guessed at.
 *
 * WHEN THE STORE CANNOT ANSWER (`store-unreadable`: no database or no `node:sqlite`; `query-failed`) the
 * outcome is `unresolved`, and `decide.mjs` fails OPEN on it — see its header for the justification.
 * `not-found` and `no-id` are answers, not failures: that id is provably not a master record.
 *
 * @es Decide si las llamadas `mem_update` de UN turno tocaron el registro de backlog maestro,
 * PREGUNTANDO AL ALMACÉN de engram qué topic_key tiene cada observación objetivo. La pregunta es «¿la
 * observación `id` es un registro de backlog maestro?», la misma que responde `backlog-owner-guard`, y
 * con el MISMO resolutor. Reemplaza un esquema de aprendizaje desde el transcript que falló tres veces
 * en vivo; un transcript solo muestra lo que se leyó, el almacén siempre sabe. Cuentan solo los `id` de
 * llamadas reales a `mem_update`: cada línea JSONL se parsea y se recorre; una línea que no parsea se
 * descarta. Si el almacén no puede responder el resultado es `unresolved` y `decide.mjs` falla ABIERTO.
 * `not-found` y `no-id` son respuestas, no fallos: ese id no es un registro maestro.
 */

import { isMasterBacklogTopicKey } from './master-save.mjs';

/** The tool-name suffix of a `mem_update` call, matching both MCP mounts and the bare name. @es El sufijo del nombre de una llamada `mem_update`, válido para ambos montajes MCP y el nombre simple. */
const UPDATE_TOOL_SUFFIX = 'mem_update';

/** Resolver failures that mean "the store could not answer", as opposed to "the id is not a master". @es Fallos del resolutor que significan «el almacén no pudo responder». */
const STORE_FAILURES = new Set(['store-unreadable', 'query-failed']);

/** Every object reachable inside parsed JSON `value`, depth-first. @es Cada objeto alcanzable dentro del JSON parseado `value`, en profundidad. */
function* objectsIn(value) {
  if (value === null || typeof value !== 'object') return;

  yield value;

  for (const child of Object.values(value)) yield* objectsIn(child);
}

/** The parsed JSON of one transcript line, or `undefined` when it is empty or not JSON. @es El JSON parseado de una línea, o `undefined` si está vacía o no es JSON. */
function parsedLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/**
 * The distinct numeric `id`s that `mem_update` tool calls in transcript excerpt `tail` targeted, in order
 * of first appearance. `tail` is a string (`decide.mjs` never calls this with an unreadable transcript). A
 * non-numeric `id` is ignored: it cannot name an observation.
 * @es Los `id` numéricos distintos que las llamadas `mem_update` de `tail` tuvieron por objetivo, en orden
 * de primera aparición. `tail` es un string (`decide.mjs` nunca llama con un transcript ilegible). Un `id`
 * no numérico se ignora: no puede nombrar una observación.
 */
export function updatedObservationIds(tail) {
  const ids = new Set();

  for (const line of tail.split('\n')) {
    const record = parsedLine(line);

    if (record === undefined) continue;

    for (const node of objectsIn(record)) {
      const isUpdateCall = typeof node.name === 'string' && node.name.endsWith(UPDATE_TOOL_SUFFIX) && node.input !== null && typeof node.input === 'object';

      if (isUpdateCall && Number.isInteger(node.input.id)) ids.add(node.input.id);
    }
  }

  return [...ids];
}

/**
 * What the store says about the `mem_update` calls of `tail`: `{ master: true }` as soon as one targeted a
 * master-backlog record; otherwise `{ master: false, unresolved }` where `unresolved` lists the store
 * failures that stopped any target from being proven non-master (empty when every target was answered).
 * `resolveTopicKey` is `(id) => { topicKey } | { error }`, the shape of `resolveTopicKeyById`.
 * @es Lo que el almacén dice de los `mem_update` de `tail`: `{ master: true }` en cuanto uno tocó un
 * registro maestro; si no, `{ master: false, unresolved }` con los fallos del almacén que impidieron
 * probar un objetivo como no maestro (vacío si todos se respondieron).
 */
export function judgeMasterUpdates(tail, resolveTopicKey) {
  const unresolved = [];

  for (const id of updatedObservationIds(tail)) {
    const resolution = resolveTopicKey(id);

    if ('error' in resolution) {
      if (STORE_FAILURES.has(resolution.error)) unresolved.push(resolution.error);

      continue;
    }

    if (isMasterBacklogTopicKey(resolution.topicKey)) return { master: true, unresolved: [] };
  }

  return { master: false, unresolved };
}
