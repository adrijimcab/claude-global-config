/**
 * An incremental index of one session transcript: the structured writes (Write, Edit, MultiEdit, NotebookEdit
 * paths), the shell windows (command text, cwd, first and last timestamp of every Bash call) and the tool_use
 * ids. It is cached per transcript, keyed by the resolved path, and carries the size and mtime it was built
 * from plus the offset of the last complete line it consumed. A transcript that only grew is read from that
 * offset on (`readFrom` of `hook-state/jsonl-tail.mjs`, whose returned offset is the only one ever stored, so
 * a torn last line waits for the next call); one that is unchanged is not opened; one that shrank, was
 * replaced (an older mtime, or the same size under another mtime) or whose cache is unusable is read again
 * from 0. Before an append is trusted, the first min(size, 4096) bytes of the file are read and their sha256
 * compared with the fingerprint stored at index time (over the bytes that existed then); a different head
 * means a different file that merely grew past the old one, and it is read again from 0.
 *
 * THE ENGINE IS GENERIC: `foldTranscript(file, fold)` keeps, per transcript AND per fold, the state a fold
 * (`{ name, version, initial, absorb, isState }`) reaches after absorbing every complete record in order, so each
 * reader of a transcript states WHAT it extracts (its fold) and never how to read the file. `absorb(state, record,
 * line)` receives the parsed record and the exact line text it came from. With `unterminated: true` a last line
 * that has no newline yet but already parses is absorbed into a COPY of the state for this answer only, never
 * cached: the answer a reader of the whole text would give, while the cache waits for the line to complete.
 * `indexTranscript` is the engine with `TOOL_CALLS_FOLD` (writes, shell windows, tool_use ids).
 *
 * A shell window opens at its tool_use record (its timestamp is `first` and, until a result arrives, `last`)
 * and closes at the tool_result with the same id; a result that is not found closes nothing.
 *
 * @es Un índice incremental de un transcript de sesión: las escrituras estructuradas (rutas de Write, Edit,
 * MultiEdit y NotebookEdit), las ventanas de shell (texto del comando, cwd, primera y última marca de tiempo
 * de cada llamada Bash) y los ids de tool_use. Se guarda en caché por transcript, con clave la ruta resuelta,
 * y lleva el tamaño y la mtime con que se construyó más el offset de la última línea completa consumida. Un
 * transcript que solo creció se lee desde ese offset (`readFrom`, cuyo offset devuelto es el único que se
 * guarda, así que una última línea rota espera a la llamada siguiente); uno sin cambios no se abre; uno que
 * encogió, fue reemplazado (mtime más antigua, o mismo tamaño con otra mtime) o cuya caché no sirve se lee de
 * nuevo desde 0. Antes de fiarse de un añadido se leen los primeros min(tamaño, 4096) bytes y se compara su
 * sha256 con la huella guardada al indexar (sobre los bytes que entonces existían); una cabecera distinta es
 * otro fichero que solo creció más que el anterior, y se lee de nuevo desde 0. EL MOTOR ES GENÉRICO:
 * `foldTranscript(file, fold)` guarda, por transcript Y por pliegue, el estado al que llega un pliegue
 * (`{ name, version, initial, absorb, isState }`) tras absorber en orden cada registro completo, así que cada
 * lector dice QUÉ extrae y nunca cómo se lee el fichero; `absorb(state, record, line)` recibe el registro y el
 * texto exacto de su línea. Con `unterminated: true`, una última línea sin salto que ya parsea se absorbe en una
 * COPIA del estado solo para esta respuesta, nunca en la caché: lo que respondería quien lee el texto entero.
 * `indexTranscript` es el motor con `TOOL_CALLS_FOLD`. Una ventana de shell se abre en su registro tool_use y se cierra en el tool_result con el
 * mismo id; un resultado que no se encuentra no cierra nada.
 */

import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readFrom } from '../hook-state/jsonl-tail.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { bilingual } from './messages.mjs';

/** Bumped whenever the shape of a cache changes; a cache of another version is rebuilt. @es Sube con cada cambio de forma de la caché; una caché de otra versión se reconstruye. */
export const INDEX_VERSION = 3;

/** How many leading bytes fingerprint a transcript: the file that was indexed is the file that grew. @es Cuántos bytes iniciales identifican un transcript: el fichero indexado es el que creció. */
const HEAD_BYTES = 4096;

/** The input field that names the path each write tool changes. @es El campo de entrada que nombra la ruta que cambia cada herramienta de escritura. */
const WRITE_FIELD = { Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };
const ARRAYS = ['writes', 'shells', 'toolUseIds'];

const isText = (value) => typeof value === 'string';

function absorbToolUse(state, block, record, timestamp) {
  if (!isText(block.id)) return;

  state.toolUseIds.push(block.id);
  const field = WRITE_FIELD[block.name];

  if (field !== undefined && isText(block.input?.[field])) state.writes.push({ id: block.id, tool: block.name, path: block.input[field], timestamp });
  if (block.name === 'Bash' && isText(block.input?.command)) state.shells.push({ id: block.id, command: block.input.command, cwd: isText(record.cwd) ? record.cwd : null, first: timestamp, last: timestamp });
}

/**
 * The fold `indexTranscript` keeps: record count, last timestamp, structured writes, Bash windows, tool_use ids.
 * @es El pliegue que guarda `indexTranscript`: registros, última marca de tiempo, escrituras, ventanas Bash, ids de tool_use.
 */
export const TOOL_CALLS_FOLD = {
  name: 'tool-calls',
  version: 1,
  initial: () => ({ records: 0, lastTimestamp: null, writes: [], shells: [], toolUseIds: [] }),
  isState: (state) => state !== null && typeof state === 'object' && ARRAYS.every((name) => Array.isArray(state[name])),
  absorb(state, record) {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) return;

    const timestamp = isText(record.timestamp) ? record.timestamp : null;
    state.records += 1;
    if (timestamp !== null) state.lastTimestamp = timestamp;

    for (const block of Array.isArray(record.message?.content) ? record.message.content : []) {
      if (block?.type === 'tool_use') absorbToolUse(state, block, record, timestamp);
      if (block?.type === 'tool_result' && timestamp !== null) {
        const window = state.shells.findLast((shell) => shell.id === block.tool_use_id);
        if (window !== undefined) window.last = timestamp;
      }
    }
  }
};

/** Where the cache of `file` under `fold` lives. @es Dónde vive la caché de `file` bajo `fold`. */
export function cachePath(file, fold = TOOL_CALLS_FOLD) {
  return path.join(stateDir('transcript-index'), `${createHash('sha256').update(`${path.resolve(file)}\n${fold.name}`).digest('hex')}.json`);
}

/** The cached fold of `file` when it can be trusted, else `null`. @es El pliegue en caché de `file` si es fiable, si no `null`. */
function loadCache(file, fold) {
  let cached;
  try {
    cached = JSON.parse(readFileSync(cachePath(file, fold), 'utf8'));
  } catch {
    return null;
  }
  const usable = cached !== null && typeof cached === 'object' && cached.version === INDEX_VERSION && cached.fold === fold.name && cached.foldVersion === fold.version && cached.path === path.resolve(file)
    && Number.isInteger(cached.offset) && cached.offset >= 0 && cached.offset <= cached.size && Number.isInteger(cached.headBytes) && cached.headBytes >= 0 && cached.headBytes <= cached.size && isText(cached.head) && fold.isState(cached.state);

  return usable ? cached : null;
}

/** `length` bytes of `file` from `position`, every read reported to `io.onRead`. @es `length` bytes de `file` desde `position`, cada lectura informada a `io.onRead`. */
function readBytesAt(file, position, length, { onRead, readBytes = readSync }) {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    let filled = 0;
    for (let got = readBytes(fd, buffer, 0, length, position); got > 0 && filled < length; got = readBytes(fd, buffer, filled, length - filled, position + filled)) {
      onRead(got);
      filled += got;
    }

    return buffer.subarray(0, filled);
  } finally {
    closeSync(fd);
  }
}

const digestOf = (bytes) => createHash('sha256').update(bytes).digest('hex');

function saveCache(file, fold, cache) {
  const target = cachePath(file, fold);
  const temporary = `${target}.${process.pid}.tmp`;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(temporary, JSON.stringify(cache));
  renameSync(temporary, target);
}

/** `append`, `rebuild` or `unchanged`: what the file did since `cached` was built. @es Qué hizo el fichero desde que se construyó `cached`. */
function planFor(cached, stat) {
  if (cached === null) return 'rebuild';
  if (cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return 'unchanged';

  return stat.size > cached.size && stat.mtimeMs >= cached.mtimeMs ? 'append' : 'rebuild';
}

function statOf(file) {
  if (!isText(file) || file.length === 0) throw new Error(bilingual('bad-transcript-argument', { value: JSON.stringify(file) }));

  let stat;
  try {
    stat = statSync(file);
  } catch {
    throw new Error(bilingual('unreadable-transcript', { file }));
  }
  if (!stat.isFile()) throw new Error(bilingual('unreadable-transcript', { file }));

  return stat;
}

/**
 * `state` with the unterminated last line of `file` absorbed into a copy, when that line already parses;
 * `state` itself otherwise. @es `state` con la última línea sin terminar absorbida en una copia, si ya parsea; si no, `state`.
 */
function withUnterminated(file, fold, state, offset, size, io) {
  if (offset >= size) return state;

  const text = readBytesAt(file, offset, size - offset, io).toString('utf8');
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return state;
  }
  const copy = structuredClone(state);
  fold.absorb(copy, record, text);

  return copy;
}

/**
 * Brings the cached `fold` of `file` up to date and returns `{ state, cache, mode, bytesRead }`: `mode` is
 * `unchanged` (nothing was opened), `appended` (only the new bytes were read) or `rebuilt` (read from 0); `cache`
 * is what was stored (size, mtime, offset, head fingerprint, state).
 * @es Pone al día el pliegue `fold` de `file` y devuelve `{ state, cache, mode, bytesRead }`; `mode` es `unchanged`
 * (no se abrió nada), `appended` (solo los bytes nuevos) o `rebuilt` (desde 0); `cache` es lo guardado.
 * @param options.unterminated Absorb a parsing unterminated last line into a copy (see the module docblock). @es Absorber en una copia una última línea sin terminar que parsea.
 * @param options.onRead Called with the bytes of every read. @es Se llama con los bytes de cada lectura.
 * @param options.readBytes Replaces `fs.readSync` (a test seam). @es Sustituye a `fs.readSync` (punto de prueba).
 */
export function foldTranscript(file, fold, { onRead, readBytes, unterminated = false } = {}) {
  const stat = statOf(file);
  const cached = loadCache(file, fold);
  let plan = planFor(cached, stat);
  let bytesRead = 0;
  const io = {
    readBytes,
    onRead: (bytes) => {
      bytesRead += bytes;
      onRead?.(bytes);
    }
  };
  const answer = (cache, mode) => ({ state: unterminated ? withUnterminated(file, fold, cache.state, cache.offset, cache.size, io) : cache.state, cache, mode, bytesRead });

  if (plan === 'unchanged') return answer(cached, 'unchanged');

  const headLength = Math.min(stat.size, HEAD_BYTES);
  let head = null;

  if (plan === 'append') {
    head = readBytesAt(file, 0, headLength, io);
    if (digestOf(head.subarray(0, cached.headBytes)) !== cached.head) plan = 'rebuild';
  }

  const state = plan === 'append' ? cached.state : fold.initial();
  const { offset } = readFrom(file, plan === 'append' ? cached.offset : 0, { ...io, onRecord: (record, line) => fold.absorb(state, record, line) });

  head ??= readBytesAt(file, 0, headLength, io);
  const cache = { version: INDEX_VERSION, fold: fold.name, foldVersion: fold.version, path: path.resolve(file), size: stat.size, mtimeMs: stat.mtimeMs, offset, headBytes: head.length, head: digestOf(head), state };
  try {
    saveCache(file, fold, cache);
  } catch {
    // A cache that cannot be written costs the next call a rebuild, never this answer.
    // @es Una caché que no se puede escribir le cuesta una reconstrucción a la llamada siguiente, nunca esta respuesta.
  }

  return answer(cache, plan === 'append' ? 'appended' : 'rebuilt');
}

/**
 * Brings the index of `file` up to date and returns `{ index, mode, bytesRead }`: `foldTranscript` with
 * `TOOL_CALLS_FOLD`, the index being the cache's bookkeeping beside the fold's fields.
 * @es Pone al día el índice de `file` y devuelve `{ index, mode, bytesRead }`: `foldTranscript` con `TOOL_CALLS_FOLD`,
 * siendo el índice los datos de la caché junto a los campos del pliegue.
 */
export function indexTranscript(file, options = {}) {
  const { cache, mode, bytesRead } = foldTranscript(file, TOOL_CALLS_FOLD, options);
  const { state, fold, foldVersion, ...bookkeeping } = cache;

  return { index: { ...bookkeeping, ...state }, mode, bytesRead };
}
