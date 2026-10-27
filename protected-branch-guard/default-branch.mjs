/**
 * The DEFAULT branch of a repository as git records it: where `refs/remotes/<remote>/HEAD` points, read with
 * `git symbolic-ref` in the directory a command acts in. It widens the protected pair with the branch a repository
 * actually integrates on (this configuration repository's `master`) without a hand-kept list. It is asked LAZILY, only
 * for a deletion whose name is not already protected, so an ordinary command never spawns git for it.
 *
 * `undefined` when it cannot be read: no such remote, no `<remote>/HEAD` set, not a repository, an unknowable
 * directory. The caller then keeps the constant pair, and never fails closed on every deletion.
 *
 * @es La rama POR DEFECTO de un repositorio tal como la registra git: a dónde apunta `refs/remotes/<remoto>/HEAD`,
 * leída con `git symbolic-ref` en el directorio donde actúa el comando. Amplía el par protegido con la rama en la que
 * el repositorio integra de verdad (el `master` de este repositorio de configuración) sin una lista a mano. Se
 * pregunta de forma PEREZOSA, solo para un borrado cuyo nombre no está ya protegido. `undefined` si no se puede leer;
 * quien llama conserva entonces el par constante y nunca falla cerrado en todo borrado.
 */

import { spawnSync } from 'node:child_process';

/** How long the question may take. @es Cuánto puede tardar la pregunta. */
const GIT_TIMEOUT_MS = 20_000;

/**
 * @param {string|undefined} directory The directory the command acts in.
 * @param {string} remote The remote whose HEAD names the default branch.
 * @returns {string|undefined} The default branch name, without the remote prefix.
 * @es El nombre de la rama por defecto, sin el prefijo del remoto.
 */
export function gitDefaultBranch(directory, remote) {
  if (directory === undefined) return undefined;

  const run = spawnSync('git', ['-C', directory, 'symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`], { encoding: 'utf8', windowsHide: true, timeout: GIT_TIMEOUT_MS });
  const target = run.status === 0 ? run.stdout.trim() : '';

  return target.startsWith(`${remote}/`) && target.length > remote.length + 1 ? target.slice(remote.length + 1) : undefined;
}
