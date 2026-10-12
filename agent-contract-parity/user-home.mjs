/**
 * Whether a directory is a USER HOME. `~/.claude/CLAUDE.md` is the user-level instruction file, never a
 * project's contract, so a walk upward from a folder that has no `.claude/` of its own must not take the home
 * for its project. Two homes count: the process's (`HOME`/`USERPROFILE`, which a fixture overrides) and the
 * account's own profile, which the OS reports whatever the environment says.
 *
 * @es Si un directorio es un HOME DE USUARIO. `~/.claude/CLAUDE.md` son las instrucciones de usuario, nunca el
 * contrato de un proyecto, así que un recorrido hacia arriba desde una carpeta sin `.claude/` propio no debe
 * tomar el home por su proyecto. Cuentan dos homes: el del proceso (que un fixture sobrescribe) y el perfil
 * real de la cuenta, que el SO informa diga lo que diga el entorno.
 */

import { realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';

const realpathOf = (directory) => {
  try {
    return realpathSync.native(directory);
  } catch {
    return path.resolve(directory);
  }
};

/** The homes this process knows. @es Los homes que este proceso conoce. */
export function userHomes() {
  const homes = [homedir()];

  try {
    homes.push(userInfo().homedir);
  } catch {
    // an account the OS cannot describe has no second home to compare with
  }

  return homes;
}

/**
 * @param {string} directory
 * @returns {boolean} whether it names a user home / si nombra un home de usuario
 */
export function isUserHome(directory) {
  return userHomes().some((home) => path.relative(realpathOf(home), realpathOf(directory)) === '');
}
