/**
 * What the failure-capture loop sees from a directory: the project that holds it, the ledgers that apply
 * there, the scopes a capture may declare, and the worker contract a promotion would write into.
 *
 * WHY IT IS A FUNCTION, NOT A CONSTANT. The project is resolved from the directory a command runs in, and
 * resolving it reads the project's configuration, which may be invalid. A constant evaluated when the CLI
 * is loaded would make an invalid configuration crash EVERY command, including those that never read it;
 * a function lets the command that needs the project resolve it, and fail alone.
 *
 * @es Lo que el bucle de captura ve desde un directorio: el proyecto que lo contiene, los ledgers que
 * aplican, los alcances que una captura puede declarar y el contrato de worker donde escribiría una
 * promoción. Es una función y no una constante porque resolver el proyecto lee su configuración, que puede
 * ser inválida: una constante evaluada al cargar el CLI haría que una configuración inválida rompiera TODOS
 * los comandos, incluso los que no la leen; con una función falla solo el comando que necesita el proyecto.
 */

import { ledgerFiles } from './ledgers.mjs';
import { areaScopes, isReservedScope } from './ledger-routes.mjs';
import { GLOBAL_SCOPE, projectOf } from './project.mjs';

/**
 * The loop's context for `directory`; `home` is where the global ledger lives. Throws when the project's
 * configuration is invalid (`readProjectConfig`).
 * @es El contexto del bucle para `directory`; `home` es donde vive el ledger global. Lanza si la
 * configuración del proyecto es inválida.
 */
export function resolveLoopContext({ directory, home }) {
  const project = projectOf(directory);

  if (project !== undefined && isReservedScope(project.scope)) throw new Error(`the project scope "${project.scope}" is reserved: it names a scope of the home ledger (global, promoted or an area). @es el alcance de proyecto "${project.scope}" está reservado: nombra un alcance del ledger del home (global, promoted o un área).`);

  return {
    project,
    ledgers: ledgerFiles({ project, home }),
    workerContracts: project?.workerContracts ?? [],
    parityGate: project?.parityGate,
    scopes: [GLOBAL_SCOPE, ...areaScopes(), ...(project === undefined ? [] : [project.scope])]
  };
}
