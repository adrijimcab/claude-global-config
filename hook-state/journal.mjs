/**
 * The v2 journal of a hook mechanism and its fires counter. A journal line is one of three kinds
 * (`decision`, `dismissal`, `false-positive-report`), each correlated by `blockId`, `toolUseId` and
 * `inputDigest` and carrying a time-sortable id. The fires counter (`fires.json`) counts how often a
 * mechanism ran, WITHOUT adding a journal line: an allow is counted, never journaled.
 *
 * @es El journal v2 de un mecanismo de hooks y su contador de disparos. Una línea es de uno de tres tipos
 * (`decision`, `dismissal`, `false-positive-report`), correlacionada por `blockId`, `toolUseId` e
 * `inputDigest`, con un id ordenable por tiempo. El contador (`fires.json`) cuenta cuántas veces corrió un
 * mecanismo SIN añadir línea al journal: un permiso se cuenta, nunca se registra.
 */

import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from './locations.mjs';
import { bilingual } from './message-table.mjs';

/** The record kinds a journal accepts. @es Los tipos de registro que acepta un journal. */
export const KINDS = new Set(['decision', 'dismissal', 'false-positive-report']);

const ID_MS_WIDTH = 12;
const ID_SEQ_WIDTH = 4;
const ID_SEQ_LIMIT = 16 ** ID_SEQ_WIDTH;

const hex = (value, width) => value.toString(16).padStart(width, '0');

/**
 * An id generator: fixed-width hex milliseconds, then a sequence, then random bytes, so ids sort as strings
 * in time order. A clock that stands still or goes back keeps the last millisecond and counts up.
 * @es Un generador de ids: milisegundos en hex de ancho fijo, una secuencia y bytes aleatorios, así que los
 * ids se ordenan como texto en orden temporal. Un reloj detenido o que retrocede conserva el último
 * milisegundo y sigue contando.
 */
export function createIdGenerator() {
  let lastMs = 0;
  let sequence = 0;

  return (now = Date.now()) => {
    if (now > lastMs) {
      lastMs = now;
      sequence = 0;
    } else {
      sequence += 1;
    }

    if (sequence >= ID_SEQ_LIMIT) {
      lastMs += 1;
      sequence = 0;
    }

    return `${hex(lastMs, ID_MS_WIDTH)}${hex(sequence, ID_SEQ_WIDTH)}${randomBytes(4).toString('hex')}`;
  };
}

/** The id generator of this process. @es El generador de ids de este proceso. */
export const newId = createIdGenerator();

/** The sha256 hex digest of a tool input (a string, or the JSON of anything else). @es El sha256 hex de una entrada. */
export function digestInput(input) {
  return createHash('sha256').update(typeof input === 'string' ? input : JSON.stringify(input)).digest('hex');
}

const badField = (field, expected) => new Error(bilingual('bad-field', { field, expected }));

/** Refuses a record that is not of a known kind or lacks a correlation field. @es Rechaza un registro de tipo ajeno o sin campo de correlación. */
function assertRecord({ kind, blockId, toolUseId = null, inputDigest, reason }) {
  if (typeof kind !== 'string' || !KINDS.has(kind)) throw new Error(bilingual('unknown-kind', { kind: String(kind), allowed: [...KINDS].join(', ') }));
  if (typeof blockId !== 'string' || blockId === '') throw badField('blockId', 'non-empty string');
  if (typeof inputDigest !== 'string' || inputDigest === '') throw badField('inputDigest', 'non-empty string');
  if (toolUseId !== null && typeof toolUseId !== 'string') throw badField('toolUseId', 'string or null');
  if (reason !== undefined && typeof reason !== 'string') throw badField('reason', 'string');
}

/** The path of the journal of `mechanism`. @es La ruta del journal de `mechanism`. */
export const journalPath = (mechanism) => path.join(stateDir(mechanism), 'journal.jsonl');

/** The path of the fires counter of `mechanism`. @es La ruta del contador de disparos de `mechanism`. */
export const firesPath = (mechanism) => path.join(stateDir(mechanism), 'fires.json');

/**
 * Appends one v2 record to the journal of `mechanism` and returns it.
 * @es Añade un registro v2 al journal de `mechanism` y lo devuelve.
 */
export function appendRecord(mechanism, fields, { now = Date.now() } = {}) {
  assertRecord(fields);

  const { kind, blockId, toolUseId = null, inputDigest, reason } = fields;
  const record = { v: 2, id: newId(now), kind, ts: new Date(now).toISOString(), blockId, toolUseId, inputDigest, ...(reason === undefined ? {} : { reason }) };

  mkdirSync(stateDir(mechanism), { recursive: true });
  appendFileSync(journalPath(mechanism), `${JSON.stringify(record)}\n`);

  return record;
}

/** The counter stored in `file`, 0 when there is none; a corrupt one throws and is not touched. @es El contador guardado, 0 si no hay; uno corrupto lanza y no se toca. */
function readCount(file) {
  let text;

  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return 0;

    throw error;
  }

  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(bilingual('fires-corrupt', { file }));
  }

  if (!Number.isSafeInteger(parsed?.count) || parsed.count < 0) throw new Error(bilingual('fires-corrupt', { file }));

  return parsed.count;
}

/**
 * Counts one more run of `mechanism` and returns the new total; the journal is not touched.
 * @es Cuenta una corrida más de `mechanism` y devuelve el total; el journal no se toca.
 */
export function incrementFires(mechanism) {
  const file = firesPath(mechanism);
  const count = readCount(file) + 1;

  mkdirSync(stateDir(mechanism), { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify({ count })}\n`);
  renameSync(`${file}.tmp`, file);

  return count;
}
