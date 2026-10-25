/**
 * The journal of what each delegated agent CREATED, kept by effect and confirmed by the agent's own completed call.
 *
 * THE DESIGN, in three records per call, all in one journal per agent (keyed by the harness's `agent_id`, in this
 * mechanism's state folder through the one state-location port `hook-state/locations.mjs`, classified for rotation
 * in `hook-state/rotate.mjs`):
 *
 *   1. PreToolUse writes `start` (the call id and its start time) and one `target` per creation target that does
 *      NOT exist at that moment (`authorship.mjs` says which). Nothing is owned yet.
 *   2. PostToolUse, which only fires for a call that really ran, writes `confirm` for each of those targets that
 *      exists NOW, with the file's IDENTITY (device and inode, the Windows file id included, read with `lstat` so a
 *      link is judged as a link) and its birth time, and writes `end`. A target that does not exist at that moment
 *      (a call another guard denied, a command that failed, `false && touch p`) is never confirmed and is simply
 *      discarded.
 *   3. A path is the agent's only if its CURRENT identity and birth equal a confirmed one: a file deleted and
 *      recreated by someone else has a new identity and is foreign. Rename keeps identity, so a file the agent
 *      moved is still its own, and the destination of a move is confirmed at PostToolUse by that identity.
 *
 * INTERVALS. Each completed call also leaves its `[start, end]` interval. What lies below a folder the agent made
 * is the agent's only if the agent recorded it itself, or if it was BORN inside one of the agent's own call
 * intervals (what its child processes dropped there). Anything born outside those intervals is foreign, so a shared
 * folder the agent happened to make first never captures what other actors put in it afterwards.
 *
 * STATED LIMITS. An actor that writes into such a folder DURING one of the agent's calls is mistaken for the
 * agent's child process: the window is one tool call. A call with a `start` and no `end` (a crash) leaves no
 * interval, so what it dropped is foreign. A journal that cannot be written loses evidence, never a decision: the
 * agent then owns less, so the guard refuses more.
 *
 * @es El journal de lo que cada agente delegado CREÓ, llevado por efecto y confirmado por la llamada COMPLETADA del
 * propio agente. EL DISEÑO, tres registros por llamada, en un journal por agente (clave `agent_id`, en la carpeta
 * de estado de este mecanismo por el único puerto de ubicaciones, clasificado en `rotate.mjs`): (1) PreToolUse
 * escribe `start` y un `target` por cada objetivo de creación que NO existe en ese instante; todavía no es de
 * nadie. (2) PostToolUse, que solo se dispara para una llamada que corrió de verdad, escribe `confirm` por cada
 * objetivo que existe AHORA, con la IDENTIDAD del fichero (dispositivo e inodo, también el id de fichero de
 * Windows, leída con `lstat` para juzgar un enlace como enlace) y su hora de nacimiento, y escribe `end`; un
 * objetivo que no existe entonces (llamada denegada por otro guard, comando fallido, `false && touch p`) no se
 * confirma y se descarta. (3) Una ruta es del agente solo si su identidad y nacimiento ACTUALES igualan a una
 * confirmada: un fichero borrado y recreado por otro tiene identidad nueva y es ajeno; renombrar conserva la
 * identidad, así que un fichero que el agente movió sigue siendo suyo. INTERVALOS: cada llamada completada deja su
 * intervalo `[start, end]`; lo que cuelga de una carpeta que el agente hizo es suyo solo si lo anotó él o NACIÓ
 * dentro de uno de sus intervalos (lo que dejaron sus procesos hijo); lo nacido fuera es ajeno, así que una
 * carpeta compartida que el agente hizo primero nunca captura lo que otros ponen después. LÍMITES: un actor que
 * escribe en esa carpeta DURANTE una llamada del agente se confunde con un proceso hijo (la ventana es una
 * llamada); una llamada con `start` y sin `end` (caída) no deja intervalo; un journal que no se puede escribir
 * pierde evidencia, nunca una decisión: el agente posee menos y se rechaza más.
 */

import { appendFileSync, lstatSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** The sub-folder of the mechanism's state that holds the per-agent journals. @es La subcarpeta con los journals por agente. */
const JOURNAL_FOLDER = 'authored';

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
 * What a path IS, not what it is called: `{ id, born }` from `lstat` (a link is not followed), where `id` is
 * `device:inode` (on Windows the volume serial and the file id) and `born` its birth time in milliseconds, falling
 * back to the change time on a file system with none. `undefined` when nothing exists there.
 * @es Qué ES una ruta, no cómo se llama: `{ id, born }` de `lstat` (no sigue enlaces); `id` es `dispositivo:inodo` y
 * `born` su hora de nacimiento en ms, con la de cambio si el sistema no la tiene. `undefined` si no existe nada.
 */
export function identityOf(target, stat = lstatSync) {
  try {
    const status = stat(target, { bigint: true });

    return { id: `${status.dev}:${status.ino}`, born: Number(status.birthtimeMs > 0n ? status.birthtimeMs : status.ctimeMs) };
  } catch {
    return undefined;
  }
}

/** Appends lines to an agent's journal; a journal that cannot be written loses the evidence and nothing else. @es Añade líneas al journal del agente; si no se puede escribir se pierde evidencia, nada más. */
function append(agentKey, records) {
  if (!isPlainKey(agentKey) || records.length === 0) return;

  try {
    mkdirSync(path.dirname(journalFile(agentKey)), { recursive: true });
    appendFileSync(journalFile(agentKey), records.map((record) => `${JSON.stringify(record)}\n`).join(''), 'utf8');
  } catch {
    // evidence lost, never a decision
  }
}

/** The parsed records of an agent's journal, in order; an unreadable journal or a torn line yields none for it. @es Los registros leídos del journal; uno ilegible o una línea rota no aportan nada. */
function recordsOf(agentKey) {
  if (!isPlainKey(agentKey)) return [];

  let text;

  try {
    text = readFileSync(journalFile(agentKey), 'utf8');
  } catch {
    return [];
  }

  const records = [];

  for (const line of text.split('\n')) {
    try {
      const record = JSON.parse(line);

      if (typeof record?.k === 'string' && typeof record.id === 'string') records.push(record);
    } catch {
      continue;
    }
  }

  return records;
}

/**
 * PreToolUse: the call starts. Records `start` and each creation target that does not exist yet.
 * @param {string} agentKey The key from `agentKeyOf`.
 * @param {string} callId The call's `tool_use_id`, or a made-up one.
 * @param {number} at The start time in milliseconds.
 * @param {string[]} canonicalTargets The creation targets that did not exist.
 * @es PreToolUse: empieza la llamada. Anota `start` y cada objetivo de creación que aún no existe.
 */
export function recordCall(agentKey, callId, at, canonicalTargets) {
  append(agentKey, [{ k: 'start', id: callId, at }, ...canonicalTargets.map((target) => ({ k: 'target', id: callId, path: target }))]);
}

/**
 * PostToolUse: the call completed. Confirms, with identity and birth, each of its recorded targets that exists now,
 * and records `end`. Without a call id the latest call that has a `start` and no `end` is the one. A call this
 * journal never saw start confirms nothing.
 * @es PostToolUse: la llamada se completó. Confirma, con identidad y nacimiento, cada objetivo anotado que existe
 * ahora, y anota `end`. Sin id de llamada es la última con `start` y sin `end`. Una llamada que no empezó aquí no confirma nada.
 */
export function confirmCall(agentKey, callId, at, identify = identityOf) {
  const records = recordsOf(agentKey);
  const ended = new Set(records.filter((record) => record.k === 'end').map((record) => record.id));
  const open = records.filter((record) => record.k === 'start' && !ended.has(record.id));
  const id = callId ?? open.at(-1)?.id;

  if (id === undefined || !open.some((record) => record.id === id)) return;

  const confirmations = [];

  for (const record of records) {
    if (record.k !== 'target' || record.id !== id) continue;

    const identity = identify(record.path);

    if (identity !== undefined) confirmations.push({ k: 'confirm', id, path: record.path, ino: identity.id, born: identity.born });
  }

  append(agentKey, [...confirmations, { k: 'end', id, at }]);
}

/**
 * The agent's confirmed paths (canonical path to the latest `{ id, born }`) and the intervals of its completed
 * calls.
 * @es Las rutas confirmadas del agente (ruta canónica a su última `{ id, born }`) y los intervalos de sus llamadas completadas.
 */
export function readJournal(agentKey) {
  const records = recordsOf(agentKey);
  const confirmed = new Map();
  const starts = new Map();
  const intervals = [];

  for (const record of records) {
    if (record.k === 'confirm' && typeof record.path === 'string' && typeof record.ino === 'string' && Number.isFinite(record.born)) confirmed.set(record.path, { id: record.ino, born: record.born });
    if (record.k === 'start' && Number.isFinite(record.at)) starts.set(record.id, record.at);
    if (record.k === 'end' && Number.isFinite(record.at) && starts.has(record.id)) intervals.push({ start: starts.get(record.id), end: record.at });
  }

  return { confirmed, intervals };
}

/**
 * Whether `target` is, right now, the very file the journal confirmed: same identity and same birth.
 * @es Si `target` es, ahora mismo, el mismo fichero que el journal confirmó: misma identidad y mismo nacimiento.
 */
export function sameIdentity(target, confirmed, identify = identityOf) {
  const identity = identify(target);

  return identity !== undefined && identity.id === confirmed.id && identity.born === confirmed.born;
}

/**
 * Whether `target` was born inside one of the agent's own call intervals.
 * @es Si `target` nació dentro de uno de los intervalos de las llamadas del propio agente.
 */
export function bornInside(target, intervals, identify = identityOf) {
  const born = identify(target)?.born;

  return born !== undefined && intervals.some((interval) => born >= interval.start && born <= interval.end);
}
