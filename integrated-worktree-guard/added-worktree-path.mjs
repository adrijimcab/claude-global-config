/**
 * The directory a `git worktree add` invocation creates, or `undefined` for any other invocation.
 *
 * It reads an invocation the shared shell parser already produced (`shell-command/git-invocations.mjs`), so
 * a `git worktree add` that is only MENTIONED (in `echo`, a quoted string, a heredoc) never reaches it. The
 * path is resolved the way git does: against the directory the line runs in, moved by each `-C` in order.
 * Options that take a value (`-b`, `-B`) are skipped so the branch name is not read as the path; the first
 * remaining word is the path. A detached or orphan form that this misreads names a path that does not
 * exist, which attributes nothing.
 *
 * @es El directorio que crea una invocación `git worktree add`, o `undefined` para cualquier otra. Lee una
 * invocación que el parser de shell compartido ya produjo, así que un `git worktree add` solo MENCIONADO
 * nunca llega aquí. La ruta se resuelve como git: contra el directorio en que corre la línea, movido por
 * cada `-C` en orden. Se saltan las opciones con valor (`-b`, `-B`); la primera palabra restante es la ruta.
 */

import path from 'node:path';

import { invocationDirectory } from '../git-port/invocation-directory.mjs';

/** `git worktree add` options that take a separate value word. @es Opciones de `git worktree add` con valor separado. */
const OPTIONS_WITH_VALUE = new Set(['-b', '-B', '--reason']);

/**
 * @param {{ subcommand?: string, args: string[], gitOptions: string[], directory?: string }} invocation One parsed git invocation.
 * @returns {string | undefined} The absolute path of the worktree it adds.
 * @es La ruta absoluta del worktree que añade.
 */
export function addedWorktreePath(invocation) {
  const { subcommand, args } = invocation;

  if (subcommand !== 'worktree' || args[0] !== 'add') return undefined;

  const base = invocationDirectory(invocation);

  if (base === undefined) return undefined;

  for (let at = 1; at < args.length; at += 1) {
    if (OPTIONS_WITH_VALUE.has(args[at])) at += 1;
    else if (!args[at].startsWith('-')) return path.resolve(base, args[at]);
  }

  return undefined;
}
