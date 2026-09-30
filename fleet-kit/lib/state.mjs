/**
 * Where the kit keeps runtime state: under its own `state/`, keyed per repository, never inside a
 * repository's tree. `FLEET_KIT_STATE` overrides the root so selftests never touch live state.
 *
 * @es Dónde guarda el kit su estado: bajo su propio `state/`, con clave por repositorio, nunca dentro
 * del árbol de un repositorio. `FLEET_KIT_STATE` cambia la raíz para que los selftests no toquen estado vivo.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The kit state root, read per call so a selftest can redirect it. @es La raíz de estado del kit, leída en cada llamada. */
export const kitStateRoot = () => process.env.FLEET_KIT_STATE ?? path.join(KIT_ROOT, 'state');

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
