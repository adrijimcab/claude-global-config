/**
 * What the gate writes down for every Stop it sees: judge, session, outcome, model cost and latency, plus the
 * reason of a block or the why of a malfunction. One JSON line per Stop under the `judge-gate` state directory,
 * so the cost and the latency per turn, and the rate of malfunctions, are measured instead of assumed.
 *
 * @es Lo que la compuerta anota de cada Stop: juez, sesión, desenlace, costo y latencia del modelo, y el motivo
 * de un bloqueo o el porqué de un fallo. Una línea JSON por Stop bajo el directorio de estado `judge-gate`, para
 * medir el costo y la latencia por turno y la tasa de fallos en lugar de suponerlos.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
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
export function recordOutcome(judge, session, { outcome, costUsd, durationMs, reason, why }) {
  const record = { ts: new Date().toISOString(), judge, session, outcome, costUsd, durationMs, ...(reason === undefined ? {} : { reason }), ...(why === undefined ? {} : { why }) };

  mkdirSync(stateDir(MECHANISM), { recursive: true });
  appendFileSync(outcomesPath(), `${JSON.stringify(record)}\n`);

  return record;
}
