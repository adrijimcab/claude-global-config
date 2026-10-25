/**
 * Live processes whose command line names a worktree. The process listing is an injected function, so
 * the proof never depends on what runs on the machine.
 * @es Procesos vivos cuya línea de comandos nombra un worktree. El listado es una función inyectada.
 *
 * `listProcesses` and `rowsOfListing` now live in `process-control/process-port.mjs`; they are re-exported here
 * with unchanged signatures so existing importers of this path keep working.
 * @es `listProcesses` y `rowsOfListing` viven ahora en `process-control/process-port.mjs`; se reexportan aquí con
 * las firmas sin cambios para que quien ya importa esta ruta siga funcionando.
 */

import { listProcesses } from '../process-control/process-port.mjs';

export { listProcesses, rowsOfListing } from '../process-control/process-port.mjs';

const normalized = (text) => text.split('\\').join('/').toLowerCase();

/** Processes (other than this one) whose command line contains `worktree`. @es Procesos que nombran el worktree. */
export function processesNaming(worktree, list = listProcesses) {
  const wanted = normalized(worktree);

  return list().filter((entry) => entry.pid !== process.pid && normalized(entry.commandLine).includes(wanted));
}
