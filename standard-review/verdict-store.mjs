/**
 * Where review verdicts are kept and how they are found again: one JSON line per review under the
 * `standard-review` state directory, keyed by the TREE hash of the reviewed HEAD. A verdict is looked up by the
 * tree of the unit being landed, so a change of content (a new tree) finds none: the verdict is invalid when
 * the tree changed, by construction. The latest line of a tree wins, so a later FAIL takes back an earlier
 * PASS. A line that is not a well-formed record grants nothing.
 *
 * @es Dónde se guardan los veredictos de revisión y cómo se vuelven a encontrar: una línea JSON por revisión
 * bajo el directorio de estado `standard-review`, indexada por el hash del ÁRBOL del HEAD revisado. Se busca
 * por el árbol de la unidad que aterriza, así que un cambio de contenido (árbol nuevo) no encuentra ninguno: el
 * veredicto es inválido cuando el árbol cambió, por construcción. Gana la última línea de un árbol, así que un
 * FAIL posterior retira un PASS anterior. Una línea que no es un registro bien formado no concede nada.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** The mechanism name. @es El nombre del mecanismo. */
export const MECHANISM = 'standard-review';

/** The file the verdicts are appended to. @es El fichero al que se añaden los veredictos. */
export const verdictsPath = () => path.join(stateDir(MECHANISM), 'verdicts.jsonl');

/**
 * Appends one review record and returns it.
 * @es Añade un registro de revisión y lo devuelve.
 * @param {{ tree: string, base: string, verdict: 'pass' | 'fail', summary: string, findings: object[], model: string, costUsd: number, durationMs: number }} review
 */
export function recordVerdict(review) {
  const record = { ts: new Date().toISOString(), ...review };

  mkdirSync(stateDir(MECHANISM), { recursive: true });
  appendFileSync(verdictsPath(), `${JSON.stringify(record)}\n`);

  return record;
}

/** A parsed line when it is a well-formed record, else undefined. @es Una línea parseada si es un registro bien formado. */
function wellFormed(line) {
  try {
    const record = JSON.parse(line);

    return typeof record.tree === 'string' && (record.verdict === 'pass' || record.verdict === 'fail') && Array.isArray(record.findings) ? record : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The latest record for `tree`, or undefined when that tree was never reviewed.
 * @es El último registro de `tree`, o undefined si ese árbol nunca se revisó.
 */
export function verdictOf(tree) {
  if (!existsSync(verdictsPath())) return undefined;
  const records = readFileSync(verdictsPath(), 'utf8').split('\n').map(wellFormed);

  return records.findLast((record) => record?.tree === tree);
}
