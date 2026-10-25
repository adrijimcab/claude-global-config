/**
 * The journal of what each delegated agent CREATED, kept by effect and not by what a command's words say.
 *
 * THE DESIGN. On every call a delegated agent makes that can create a file, the guard records each creation
 * target that does NOT exist at that moment (`creations.mjs` says which) with the time of the call. Authorship is
 * then decided later from the file system itself: a path is the agent's only if it is in that agent's journal,
 * it exists now, and its birth time is at or after the recorded time (less a small tolerance for file systems
 * with coarse clocks). Everything else is not the agent's, whatever any command said:
 *
 *   - a path that existed when the call was made is never recorded, so `mkdir -p <shared folder>`,
 *     `touch <shared>/*.mjs`, an append to an existing file or `cp x <existing folder>` claim nothing;
 *   - a write that was denied or failed leaves no file, so nothing matches;
 *   - what a folder holds counts as the agent's only through a folder the agent really made (an ancestor in the
 *     journal), never through a folder it merely wrote a file into.
 *
 * ONE JOURNAL PER AGENT, keyed by the harness's `agent_id`, in this mechanism's state folder through the one
 * state-location port (`hook-state/locations.mjs`), classified for rotation in `hook-state/rotate.mjs`.
 *
 * STATED LIMIT. A path recorded as absent and then created by SOMEONE ELSE before the agent's own call ran (or
 * after a failed call) has a birth time after the record and counts as the agent's. The window is one tool call.
 * A journal that cannot be written loses evidence, never a decision: the agent then owns less, so the guard
 * refuses more.
 *
 * @es El journal de lo que cada agente delegado CREÓ, llevado por efecto y no por lo que dicen las palabras de un
 * comando. EL DISEÑO: en cada llamada de un agente delegado que puede crear un fichero, el guard anota cada
 * objetivo de creación que NO existe en ese instante, con la hora de la llamada. La autoría se decide después
 * desde el propio sistema de ficheros: una ruta es del agente solo si está en su journal, existe ahora y su hora
 * de nacimiento es igual o posterior a la anotada (menos una tolerancia para relojes toscos). Todo lo demás no es
 * del agente, diga lo que diga cualquier comando: lo que ya existía al llamar nunca se anota (`mkdir -p` sobre
 * una carpeta compartida, `touch dir/*.mjs`, añadir a un fichero existente o `cp x carpeta` no reclaman nada);
 * una escritura denegada o fallida no deja fichero; y el contenido de una carpeta es del agente solo por una
 * carpeta que él hizo de verdad. UN JOURNAL POR AGENTE, con la clave `agent_id`, en la carpeta de estado de este
 * mecanismo por el único puerto de ubicaciones, clasificado en `rotate.mjs`. LÍMITE: una ruta anotada como
 * ausente y creada por OTRO antes de que corra la llamada del agente cuenta como suya; la ventana es una llamada.
 * Un journal que no se puede escribir pierde evidencia, nunca una decisión: el agente posee menos y se rechaza más.
 */

import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** The sub-folder of the mechanism's state that holds the per-agent journals. @es La subcarpeta con los journals por agente. */
const JOURNAL_FOLDER = 'authored';

/** How far before the recorded time a birth time may fall and still count, for coarse file-system clocks. @es Cuánto antes de la hora anotada puede caer un nacimiento y contar. */
export const BIRTH_TOLERANCE_MS = 2000;

/** A plain key: letters, digits, dash and underscore. @es Una clave simple. */
const isPlainKey = (key) => typeof key === 'string' && key.length > 0 && [...key].every((character) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'.includes(character));

const journalFile = (agentKey) => path.join(stateDir('foreign-delete-guard'), JOURNAL_FOLDER, `${agentKey}.jsonl`);

/**
 * The key of the agent that made a call: its `agent_id`, else the id in its transcript's file name
 * (`agent-<id>.jsonl`), else `undefined` (an agent that cannot be told apart owns nothing and is not judged).
 * @es La clave del agente que hizo una llamada: su `agent_id`, si no el id del nombre de su transcript, si no `undefined`.
 */
export function agentKeyOf(payload) {
  if (isPlainKey(payload?.agent_id)) return payload.agent_id;

  const transcript = payload?.transcript_path;

  if (typeof transcript !== 'string') return undefined;

  const name = transcript.split('\\').join('/').split('/').at(-1);
  const id = name.startsWith('agent-') && name.endsWith('.jsonl') ? name.slice('agent-'.length, -'.jsonl'.length) : '';

  return isPlainKey(id) ? id : undefined;
}

/**
 * Appends one record per canonical path to the agent's journal. A journal that cannot be written loses the
 * evidence and nothing else.
 * @param {string} agentKey The key from `agentKeyOf`.
 * @param {string[]} canonicalPaths The creation targets that did not exist.
 * @param {number} at The time of the call, in milliseconds.
 * @es Anota un registro por ruta canónica en el journal del agente.
 */
export function recordCreations(agentKey, canonicalPaths, at = Date.now()) {
  if (!isPlainKey(agentKey) || canonicalPaths.length === 0) return;

  try {
    mkdirSync(path.dirname(journalFile(agentKey)), { recursive: true });
    appendFileSync(journalFile(agentKey), canonicalPaths.map((target) => `${JSON.stringify({ path: target, at })}\n`).join(''), 'utf8');
  } catch {
    // evidence lost, never a decision
  }
}

/**
 * The agent's records as a map from canonical path to the latest recorded time. An unreadable journal or a torn
 * line yields nothing for it.
 * @es Los registros del agente como mapa de ruta canónica a la última hora anotada.
 */
export function readCreations(agentKey) {
  const recorded = new Map();

  if (!isPlainKey(agentKey)) return recorded;

  let text;

  try {
    text = readFileSync(journalFile(agentKey), 'utf8');
  } catch {
    return recorded;
  }

  for (const line of text.split('\n')) {
    try {
      const record = JSON.parse(line);

      if (typeof record?.path === 'string' && Number.isFinite(record.at)) recorded.set(record.path, Math.max(record.at, recorded.get(record.path) ?? 0));
    } catch {
      continue;
    }
  }

  return recorded;
}

/** When a path was born, or `undefined` when it does not exist; a file system with no birth time falls back to the change time. @es Cuándo nació una ruta. */
export function bornAt(target, stat = statSync) {
  try {
    const status = stat(target);

    return status.birthtimeMs > 0 ? status.birthtimeMs : status.ctimeMs;
  } catch {
    return undefined;
  }
}

/**
 * Whether the journal vouches for a canonical path: it is recorded, exists now, and was born at or after the
 * recorded time (less the tolerance). A path nobody recorded is answered without touching the file system; a
 * path that no longer exists has no birth time, and an undefined time is never at or after anything.
 * @es Si el journal responde por una ruta canónica: está anotada, existe ahora y nació en o después de la hora
 * anotada. Una ruta que nadie anotó se responde sin tocar el sistema de ficheros; una que ya no existe no tiene
 * hora de nacimiento, y una hora indefinida nunca es igual o posterior a nada.
 */
export function vouchedFor(recorded, canonicalPath, stat = statSync) {
  const at = recorded.get(canonicalPath);

  return at !== undefined && bornAt(canonicalPath, stat) >= at - BIRTH_TOLERANCE_MS;
}
