/**
 * Which `git stash` commands a shell line RUNS that change the repository's stash stack.
 *
 * WHAT COUNTS. An invocation `git [global options] stash <verb> ...` that `shell-command/git-invocations.mjs`
 * reports, so a `git stash` that is only MENTIONED (inside `echo`, a quoted `-m` message, a heredoc body, a
 * comment) is data and never counted, while one inside `$(...)`, `bash -c`, a chain or a subshell, or one
 * reached through `git -C <dir>`, is counted because it runs. `git stashed` is a different subcommand and is
 * not a stash.
 *
 * WHAT IS LEFT OUT, stated: `list` and `show` only read the stack; they cannot make one worker's entry
 * reach another's worktree, so refusing them would block a worker that is asked to triage a stash while
 * protecting nothing. Every other form (bare, `push`, `save`, `pop`, `apply`, `drop`, `clear`, `branch`,
 * `create`, `store`, or an option such as `-u`) is counted.
 *
 * @es Qué comandos `git stash` EJECUTA una línea de shell que cambian la pila de stashes del repositorio.
 * Una MENCIÓN (en `echo`, en un mensaje entrecomillado, en un heredoc o en un comentario) es dato y no
 * cuenta; lo que corre dentro de `$(...)`, `bash -c`, una cadena, un subshell o tras `git -C <dir>` sí
 * cuenta. `git stashed` es otro subcomando. Quedan fuera `list` y `show`: solo leen la pila y no pueden
 * hacer que la entrada de un worker llegue al worktree de otro. Toda otra forma cuenta.
 */

import { gitInvocations } from '../shell-command/git-invocations.mjs';

/** The git subcommand this guard is about. @es El subcomando de git que concierne a este guard. */
const STASH = 'stash';

/** Stash verbs that only read the stack. @es Verbos de stash que solo leen la pila. */
const READ_ONLY_VERBS = new Set(['list', 'show']);

/**
 * @param {string} script The shell line exactly as the tool received it.
 * @param {string} dialect `bash` or `powershell`.
 * @param {string} cwd The directory the line starts in.
 * @returns {Array<{ args: string[], text: string }>} The stack-changing `git stash` invocations, in order.
 * @es Las invocaciones `git stash` que cambian la pila, en orden de ejecución.
 */
export function stackChangingStashes(script, dialect, cwd) {
  return gitInvocations(script, dialect, cwd)
    .filter((invocation) => invocation.subcommand === STASH && !READ_ONLY_VERBS.has(invocation.args[0]))
    .map(({ args, text }) => ({ args, text }));
}
