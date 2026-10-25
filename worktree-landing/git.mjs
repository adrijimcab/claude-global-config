/**
 * Runs one git command with a bounded wait and never a prompt, so no landing step can hang on the network
 * or on a credential dialog. A thin wrapper over `../git-port/git.mjs`. What it keeps of its own: the
 * 5-minute bound (a landing runs test commands and fetches; the port's 15 s would cut them), the
 * `git -C <cwd>` form with the process directory as working directory, `GCM_INTERACTIVE=never`, and the
 * raw (untrimmed) stdout NUL-separated callers need. The error text names the command with its options
 * unquoted: `git -C <cwd> ...`.
 *
 * @es Ejecuta una orden de git con una espera acotada y sin ningún diálogo, para que ningún paso del
 * aterrizaje pueda quedarse colgado en la red ni en una petición de credenciales. Envoltorio fino del puerto
 * `../git-port/git.mjs`. Conserva lo propio: el límite de 5 minutos (un aterrizaje corre órdenes de prueba y
 * fetch; los 15 s del puerto las cortarían), la forma `git -C <cwd>` con el directorio del proceso como
 * directorio de trabajo, `GCM_INTERACTIVE=never` y el stdout crudo (sin recortar) que necesitan los llamadores
 * con separador NUL. El texto del error nombra la orden con sus opciones sin comillas: `git -C <cwd> ...`.
 */

import { gitOutput as portGitOutput, runGit } from '../git-port/git.mjs';

export { entriesOf, GitFailure } from '../git-port/git.mjs';

/** Default bound for one git command. @es Límite por defecto de una orden de git. */
export const GIT_TIMEOUT_MS = 5 * 60 * 1000;

/** The port's options for `git -C <cwd>`. @es Las opciones del puerto para `git -C <cwd>`. */
const portOptions = (cwd, { input, timeoutMs = GIT_TIMEOUT_MS } = {}) => ({ gitOptions: ['-C', cwd], input, timeoutMs, env: { GCM_INTERACTIVE: 'never' } });

/**
 * Runs `git -C <cwd> <args>` and returns what it did; the caller decides what a non-zero status means.
 * @es Ejecuta `git -C <cwd> <args>` y devuelve lo que hizo; quien llama decide qué significa un estado no cero.
 * @param {string} cwd
 * @param {string[]} args
 * @param {{ input?: string, timeoutMs?: number }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string, timedOut: boolean }}
 */
export const git = (cwd, args, options) => runGit(undefined, args, portOptions(cwd, options));

/**
 * Runs git and returns its stdout, or throws a bilingual GitFailure naming the command and its error.
 * @es Ejecuta git y devuelve su stdout, o lanza un GitFailure bilingüe con la orden y su error.
 */
export const gitOutput = (cwd, args, options) => portGitOutput(undefined, args, portOptions(cwd, options));
