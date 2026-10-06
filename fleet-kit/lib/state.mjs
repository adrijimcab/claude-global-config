/**
 * Where the kit keeps runtime state: the `fleet-kit` state directory of `~/.claude/hook-state/locations.mjs`
 * (`~/.claude/fleet-kit/state`, where the kit always kept it), keyed per repository, never inside a
 * repository's tree. The kit resolves it through that one module like every other guard, so `HOOK_STATE_DIR`
 * (which `isolateState` and the selftest runner set) relocates it; the private `FLEET_KIT_STATE` override,
 * a second answer to the same question, is gone.
 *
 * @es Dónde guarda el kit su estado: el directorio de estado `fleet-kit` de `locations.mjs`
 * (`~/.claude/fleet-kit/state`, donde siempre estuvo), con clave por repositorio, nunca dentro del árbol de
 * un repositorio. Se resuelve por ese único módulo como cualquier otra guardia, así que `HOOK_STATE_DIR` lo
 * reubica; la variable privada `FLEET_KIT_STATE`, una segunda respuesta a la misma pregunta, ya no existe.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

import { stateDir } from '../../hook-state/locations.mjs';

/** The kit state root, read per call so a selftest can redirect it. @es La raíz de estado del kit, leída en cada llamada. */
export const kitStateRoot = () => stateDir('fleet-kit');

/**
 * A stable, readable key for a repository: its main checkout's folder name plus a short hash of the
 * lower-cased absolute path (Windows paths compare case-insensitively).
 * @es Una clave estable y legible por repositorio: nombre de carpeta más un hash corto de la ruta.
 */
export function repositoryKey(mainCheckout) {
  const normalized = path.resolve(mainCheckout).split('\\').join('/').toLowerCase();
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 12);

  return `${path.basename(path.resolve(mainCheckout))}-${digest}`;
}

/** The state directory of one repository. @es El directorio de estado de un repositorio. */
export const repositoryStateDir = (mainCheckout, stateRoot = kitStateRoot()) => path.join(stateRoot, 'repos', repositoryKey(mainCheckout));
