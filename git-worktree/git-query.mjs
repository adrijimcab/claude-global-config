/**
 * Asking git a question about a directory: the ONE way the worktree mechanisms run it. A failure THROWS, so a
 * caller decides what a git that cannot answer means for it (a guard fails open and journals; nothing here guesses).
 *
 * A thin wrapper over `../git-port/git.mjs`, which removes the variables that make git pick a repository instead of
 * discovering one (a git hook exports them) and bounds the wait at 15 s, so the answer is about `directory` and never
 * about the repository a hook happens to run in. What it keeps of its own: the `git -C <directory>` form, the trimmed
 * stdout, and the throw policy (the port's bilingual GitFailure).
 *
 * @es Preguntar a git por un directorio: la ÚNICA forma en que los mecanismos de worktrees lo ejecutan. Un fallo
 * LANZA, para que quien llama decida qué significa un git que no sabe responder (una guardia falla abierta y lo
 * registra; aquí nada se adivina). Envoltorio fino del puerto `../git-port/git.mjs`, que quita las variables que
 * hacen que git elija repositorio (un hook las exporta) y acota la espera a 15 s: la respuesta es sobre `directory`,
 * nunca sobre el repositorio en el que corre un hook. Conserva lo propio: la forma `git -C <directory>`, el stdout
 * sin espacios y la política de lanzar (el GitFailure bilingüe del puerto).
 */

import { gitOutput } from '../git-port/git.mjs';

/** The trimmed stdout of `git -C directory ...args`; throws when git fails. @es La salida de git sin espacios; lanza si git falla. */
export const git = (directory, args) => gitOutput(undefined, args, { gitOptions: ['-C', directory] }).trim();
