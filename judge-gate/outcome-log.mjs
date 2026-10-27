/**
 * What the gate writes down for every Stop it sees: judge, session, outcome, model cost and latency, plus the
 * reason of a block (a shadow block too), the why of a malfunction or a non-verdict, and the cause of a fallback block. One JSON line per Stop under the `judge-gate` state directory,
 * so the cost and the latency per turn, and the rate of malfunctions, are measured instead of assumed.
 *
 * @es Lo que la compuerta anota de cada Stop: juez, sesión, desenlace, costo y latencia del modelo, y el motivo
 * de un bloqueo (también en sombra), el porqué de un fallo o de un no-veredicto, y la causa de un bloqueo de respaldo. Una línea JSON por Stop bajo el directorio de estado `judge-gate`, para
 * medir el costo y la latencia por turno y la tasa de fallos en lugar de suponerlos.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** The mechanism name: this folder. @es El nombre del mecanismo: esta carpeta. */
export const MECHANISM = 'judge-gate';

/** The file the outcomes are appended to. @es El fichero al que se añaden los desenlaces. */
export const outcomesPath = () => path.join(stateDir(MECHANISM), 'outcomes.jsonl');

/**
 * Appends one outcome line and returns the record.
 * @es Añade una línea de desenlace y devuelve el registro.
 */
export function recordOutcome(judge, session, { outcome, costUsd, durationMs, reason, why, cause, continued }) {
  const record = { ts: new Date().toISOString(), judge, session, outcome, costUsd, durationMs, ...(reason === undefined ? {} : { reason }), ...(why === undefined ? {} : { why }), ...(cause === undefined ? {} : { cause }), ...(continued === true ? { continued: true } : {}) };

  mkdirSync(stateDir(MECHANISM), { recursive: true });
  appendFileSync(outcomesPath(), `${JSON.stringify(record)}\n`);

  return record;
}

/**
 * Whether a logged Stop was a continued one. Older lines carry no `continued` field but name it in the outcome.
 * @es Si una parada registrada fue continuada. Las líneas antiguas no traen `continued` pero lo dicen en el desenlace.
 */
const wasContinued = (record) => record.continued === true || (typeof record.outcome === 'string' && record.outcome.startsWith('pass-continued'));

/**
 * How many times `judge` blocked `session` in its current turn: the blocks logged since the last Stop that was not
 * a continued one (that Stop opens the turn and is counted). Unreadable lines are skipped; a missing log is zero;
 * any other read failure, or a call with no session, throws so the caller can fail open.
 * @es Cuántas veces `judge` bloqueó a `session` en su turno actual: los bloqueos registrados desde la última
 * parada no continuada (esa parada abre el turno y se cuenta). Las líneas ilegibles se saltan; sin registro es
 * cero; cualquier otro fallo de lectura, o una llamada sin sesión, lanza para que quien llama deje pasar.
 */
export const blocksThisTurn = (judge, session) => blockRecordsOfTurn(judge, session).length;

/**
 * When `judge` last blocked `session` in its current turn, as epoch milliseconds, or `undefined` when it has not.
 * Same reading and failure rules as `blocksThisTurn`.
 * @es Cuándo bloqueó `judge` a `session` por última vez en su turno actual, en milisegundos, o `undefined` si no
 * lo hizo. Misma lectura y mismas reglas de fallo que `blocksThisTurn`.
 */
export function lastBlockTimeThisTurn(judge, session) {
  const last = blockRecordsOfTurn(judge, session).at(-1);

  return last === undefined ? undefined : Date.parse(last.ts);
}

/** The block records of `judge` for `session` in its current turn, oldest first. @es Los registros de bloqueo del turno actual, del más antiguo al más nuevo. */
function blockRecordsOfTurn(judge, session) {
  if (typeof session !== 'string' || session === '') throw new Error('no session id to count the turn by @es no hay id de sesión para contar el turno');

  let text;

  try {
    text = readFileSync(outcomesPath(), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const records = [];

  for (const line of text.split('\n')) {
    try {
      const record = JSON.parse(line);

      if (record !== null && typeof record === 'object' && record.judge === judge && record.session === session) records.push(record);
    } catch {
      // A blank or torn line is not a record. @es Una línea vacía o rota no es un registro.
    }
  }

  const turnStart = records.findLastIndex((record) => !wasContinued(record));

  return records.slice(Math.max(turnStart, 0)).filter((record) => record.outcome === 'block');
}
