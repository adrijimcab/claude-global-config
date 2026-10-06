/**
 * WHERE a lesson's promotion lands, decided by the lesson's OWN scope and never by who repeated it. A
 * global lesson belongs in the global promoted-rules file, which every project and every subagent loads; a
 * project lesson belongs in that project's contract files, so it never leaks into a repository it does not
 * concern. (The actor that repeated a lesson says who made the mistake, not whose rule it is: a project
 * lesson repeated by the orchestrator used to be promoted into the global file.)
 *
 * The target names are the historical ones kept in `incidents.jsonl` closure records: `claude-md` is the
 * global promoted-rules file, `contract` the project's worker contract.
 *
 * @es DÓNDE aterriza la promoción de una lección, decidido por el alcance PROPIO de la lección y nunca por
 * quién reincidió. Una lección global va al fichero global de reglas promovidas, que carga todo proyecto y
 * todo subagente; una lección de proyecto va a los ficheros de contrato de ese proyecto, para que no se
 * filtre a un repositorio que no le concierne. (El actor dice quién cometió el error, no de quién es la
 * regla: una lección de proyecto repetida por el orquestador se promovía al fichero global.) Los nombres de
 * destino son los históricos de los registros de cierre: `claude-md` es el fichero global, `contract` el
 * contrato de worker del proyecto.
 */

import { isGlobalFamily } from './ledger-routes.mjs';

/** The target of a global lesson. @es El destino de una lección global. */
export const GLOBAL_TARGET = 'claude-md';

/** The target of a project lesson. @es El destino de una lección de proyecto. */
export const PROJECT_TARGET = 'contract';

/**
 * The target for a lesson of `scope`; throws when the lesson has no scope, because a guessed target would
 * promote it into the wrong repository.
 * @es El destino de una lección de `scope`; lanza si no tiene alcance, porque adivinarlo promovería a un repositorio equivocado.
 */
export function promotionTargetOf(scope) {
  if (typeof scope !== 'string' || scope.length === 0) throw new TypeError('a lesson with no scope has no promotion target. @es una lección sin alcance no tiene destino de promoción.');

  return isGlobalFamily(scope) ? GLOBAL_TARGET : PROJECT_TARGET;
}

/**
 * The files whose text must carry a promotion of `target`.
 * @param input `{ target, globalRules, workerContracts }` — the global promoted-rules file(s) (one path, or the list of them when the lesson belongs to an area) and the project's contract files.
 * @es Los ficheros cuyo texto debe llevar una promoción de `target`.
 */
export function promotionFiles({ target, globalRules, workerContracts }) {
  return target === GLOBAL_TARGET ? [globalRules].flat() : workerContracts;
}
