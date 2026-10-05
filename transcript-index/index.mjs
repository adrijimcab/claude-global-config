/**
 * An incremental index of one session transcript: the structured writes (Write, Edit, MultiEdit, NotebookEdit
 * paths), the shell windows (command text, cwd, first and last timestamp of every Bash call) and the tool_use
 * ids. It is cached per transcript, keyed by the resolved path, and carries the size and mtime it was built
 * from plus the offset of the last complete line it consumed. A transcript that only grew is read from that
 * offset on (`readFrom` of `hook-state/jsonl-tail.mjs`, whose returned offset is the only one ever stored, so
 * a torn last line waits for the next call); one that is unchanged is not opened; one that shrank, was
 * replaced (an older mtime, or the same size under another mtime) or whose cache is unusable is read again
 * from 0.
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
 * nuevo desde 0. Una ventana de shell se abre en su registro tool_use y se cierra en el tool_result con el
 * mismo id; un resultado que no se encuentra no cierra nada.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { readFrom } from '../hook-state/jsonl-tail.mjs';
import { stateDir } from '../hook-state/locations.mjs';
import { bilingual } from './messages.mjs';

/** Bumped whenever the shape of an index changes; a cache of another version is rebuilt. @es Sube con cada cambio de forma del índice; una caché de otra versión se reconstruye. */
export const INDEX_VERSION = 1;

/** The input field that names the path each write tool changes. @es El campo de entrada que nombra la ruta que cambia cada herramienta de escritura. */
const WRITE_FIELD = { Write: 'file_path', Edit: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' };
const ARRAYS = ['writes', 'shells', 'toolUseIds'];

const isText = (value) => typeof value === 'string';

/** Where the cache of `file` lives. @es Dónde vive la caché de `file`. */
export function cachePath(file) {
  return path.join(stateDir('transcript-index'), `${createHash('sha256').update(path.resolve(file)).digest('hex')}.json`);
}

function emptyIndex(file) {
  return { version: INDEX_VERSION, path: path.resolve(file), size: 0, mtimeMs: 0, offset: 0, records: 0, lastTimestamp: null, writes: [], shells: [], toolUseIds: [] };
}

/** The cached index of `file` when it can be trusted, else `null`. @es El índice en caché de `file` si es fiable, si no `null`. */
function loadCache(file) {
  let cached;
  try {
    cached = JSON.parse(readFileSync(cachePath(file), 'utf8'));
  } catch {
    return null;
  }
  const usable = cached !== null && typeof cached === 'object' && cached.version === INDEX_VERSION && cached.path === path.resolve(file)
    && Number.isInteger(cached.offset) && cached.offset >= 0 && cached.offset <= cached.size && ARRAYS.every((name) => Array.isArray(cached[name]));

  return usable ? cached : null;
}

function saveCache(file, index) {
  const target = cachePath(file);
  const temporary = `${target}.${process.pid}.tmp`;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(temporary, JSON.stringify(index));
  renameSync(temporary, target);
}

/** `append`, `rebuild` or `unchanged`: what the file did since `cached` was built. @es Qué hizo el fichero desde que se construyó `cached`. */
function planFor(cached, stat) {
  if (cached === null) return 'rebuild';
  if (cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return 'unchanged';

  return stat.size > cached.size && stat.mtimeMs >= cached.mtimeMs ? 'append' : 'rebuild';
}

function absorbToolUse(index, block, record, timestamp) {
  if (!isText(block.id)) return;

  index.toolUseIds.push(block.id);
  const field = WRITE_FIELD[block.name];

  if (field !== undefined && isText(block.input?.[field])) index.writes.push({ id: block.id, tool: block.name, path: block.input[field], timestamp });
  if (block.name === 'Bash' && isText(block.input?.command)) index.shells.push({ id: block.id, command: block.input.command, cwd: isText(record.cwd) ? record.cwd : null, first: timestamp, last: timestamp });
}

function absorb(index, record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return;

  const timestamp = isText(record.timestamp) ? record.timestamp : null;
  index.records += 1;
  if (timestamp !== null) index.lastTimestamp = timestamp;

  for (const block of Array.isArray(record.message?.content) ? record.message.content : []) {
    if (block?.type === 'tool_use') absorbToolUse(index, block, record, timestamp);
    if (block?.type === 'tool_result' && timestamp !== null) {
      const window = index.shells.findLast((shell) => shell.id === block.tool_use_id);
      if (window !== undefined) window.last = timestamp;
    }
  }
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
 * Brings the index of `file` up to date and returns `{ index, mode, bytesRead }`, `mode` being `unchanged`
 * (nothing was opened), `appended` (only the new bytes were read) or `rebuilt` (read from 0).
 * @es Pone al día el índice de `file` y devuelve `{ index, mode, bytesRead }`; `mode` es `unchanged` (no se abrió
 * nada), `appended` (solo se leyeron los bytes nuevos) o `rebuilt` (leído desde 0).
 * @param options.onRead Called with the bytes of every read. @es Se llama con los bytes de cada lectura.
 * @param options.readBytes Replaces `fs.readSync` (a test seam). @es Sustituye a `fs.readSync` (punto de prueba).
 */
export function indexTranscript(file, { onRead, readBytes } = {}) {
  const stat = statOf(file);
  const cached = loadCache(file);
  const plan = planFor(cached, stat);

  if (plan === 'unchanged') return { index: cached, mode: 'unchanged', bytesRead: 0 };

  const index = plan === 'append' ? cached : emptyIndex(file);
  let bytesRead = 0;
  const { records, offset } = readFrom(file, index.offset, {
    readBytes,
    onRead: (bytes) => {
      bytesRead += bytes;
      onRead?.(bytes);
    }
  });

  for (const record of records) absorb(index, record);
  Object.assign(index, { size: stat.size, mtimeMs: stat.mtimeMs, offset });
  saveCache(file, index);

  return { index, mode: plan === 'append' ? 'appended' : 'rebuilt', bytesRead };
}
