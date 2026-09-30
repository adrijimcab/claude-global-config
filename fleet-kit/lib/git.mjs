/**
 * The one way kit modules ask git anything: an argv array (never a shell string), an explicit working
 * directory, and a result that says whether git answered — never an exception for a normal "no".
 *
 * @es La única forma en que los módulos del kit le preguntan algo a git: argv en array (nunca una
 * cadena de shell), directorio explícito, y un resultado que dice si git respondió.
 */

import { spawnSync } from 'node:child_process';

/**
 * Runs `git <gitOptions...> <args...>` in `directory`.
 * @returns `{ status, stdout, stderr }` — `stdout` trimmed of its trailing newline; `status` is `null`
 *   when git could not be spawned at all.
 * @es Corre git en `directory` y devuelve `{ status, stdout, stderr }`.
 */
export function runGit(directory, args, gitOptions = []) {
  const result = spawnSync('git', [...gitOptions, ...args], { cwd: directory, encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });

  return {
    status: result.error === undefined ? result.status : null,
    stdout: (result.stdout ?? '').trimEnd(),
    stderr: result.stderr ?? ''
  };
}

/**
 * An asker bound to one directory and one set of git global options: `ask('rev-parse', 'HEAD')`.
 * @es Un «preguntador» ligado a un directorio y a unas opciones globales de git.
 */
export const gitAsker = (directory, gitOptions = []) => (...args) => runGit(directory, args, gitOptions);

/**
 * `ask(...args).stdout`, or a thrown error naming the command when git said no. For facts the caller
 * cannot proceed without; a malfunction, not a verdict.
 * @es `stdout`, o un error con nombre cuando git dice que no. Para hechos imprescindibles.
 */
export function mustAsk(ask, ...args) {
  const answer = ask(...args);

  if (answer.status !== 0) throw new Error(`git ${args.join(' ')} failed (${String(answer.status)}): ${answer.stderr.trim()}`);

  return answer.stdout;
}

/** The commit `rev` names, or `undefined`. @es El commit que nombra `rev`, o `undefined`. */
export function commitOf(ask, rev) {
  const answer = ask('rev-parse', '--verify', '--quiet', `${rev}^{commit}`);

  return answer.status === 0 && answer.stdout.length > 0 ? answer.stdout : undefined;
}

/** The tree of commit `commit`. @es El árbol del commit. */
export const treeOf = (ask, commit) => mustAsk(ask, 'rev-parse', `${commit}^{tree}`);

/** Whether `ancestor` is an ancestor of (or equal to) `descendant`. @es Si `ancestor` es ancestro de `descendant`. */
export const isAncestor = (ask, ancestor, descendant) => ask('merge-base', '--is-ancestor', ancestor, descendant).status === 0;

/**
 * The porcelain entries of the working tree, untracked included and ignored excluded — every change
 * that would make the tree differ from `HEAD^{tree}`. Throws when git cannot answer, because an
 * unanswered status must never read as a clean tree.
 * @es Las entradas de porcelain, sin rastrear incluidas e ignoradas excluidas. Lanza si git no responde:
 * un status sin respuesta nunca puede leerse como árbol limpio.
 */
export function porcelainEntries(ask) {
  const text = mustAsk(ask, 'status', '--porcelain');

  return text.split('\n').filter((line) => line.trim().length > 0);
}
