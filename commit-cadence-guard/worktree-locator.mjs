/**
 * Finds the linked worktree a delegated agent is working in.
 *
 * MEASURED, 2026-10-25 (a real `claude -p` run with a recording PreToolUse hook and a general-purpose subagent
 * that ran `cd <worktree> && pwd`, `pwd`, `git status`): every subagent payload carried `agent_id`, and `cwd` was
 * ALWAYS the directory the session was launched in, never the worktree, even for the call that `cd`-ed into it.
 * A writer given a worktree by its brief (TENANCY) therefore shows a main-checkout `cwd`, and judging `cwd` alone
 * would leave exactly those writers unwatched. So the candidates are the payload `cwd` FIRST, then the
 * directories the call itself names: the parent of a `file_path` / `notebook_path`, a `path`, and the directory
 * each command of a shell line runs in (following its own `cd`). The first one inside a LINKED worktree
 * (`git-worktree`, the one owner of that question) wins; the caller remembers it.
 *
 * NOT FOLLOWED, stated: `git -C <dir>` and a `cd` into a variable; the next call that names the worktree finds it.
 *
 * @es Encuentra el worktree enlazado en que trabaja un agente delegado. MEDIDO el 2026-10-25 con una corrida real
 * de `claude -p`: todo payload de subagente trae `agent_id`, y `cwd` es SIEMPRE el directorio de lanzamiento de la
 * sesión, nunca el worktree, ni siquiera en la llamada que hizo `cd`. Un writer al que el brief da un worktree
 * (TENANCY) muestra por eso el `cwd` del checkout principal; juzgar solo `cwd` dejaría sin vigilar justo a esos
 * writers. Los candidatos son `cwd` primero y luego los directorios que nombra la propia llamada. Gana el primero
 * dentro de un worktree ENLAZADO (`git-worktree`, el dueño de esa pregunta); quien llama lo recuerda. NO se
 * sigue `git -C <dir>` ni un `cd` a una variable; la siguiente llamada que nombre el worktree lo encuentra.
 */

import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { nativeSpelling, withWorkingDirectories } from '../cherry-pick-guard/working-directory.mjs';
import { gitOutput } from '../git-port/git.mjs';
import { isLinkedWorktree } from '../git-worktree/linked-worktree.mjs';
import { dialectOfTool, simpleCommands } from '../shell-command/shell-command.mjs';

/** The most candidates one call may try, so a long shell line cannot make discovery expensive. @es El máximo de candidatos por llamada. */
const MAX_CANDIDATES = 6;

const isText = (value) => typeof value === 'string' && value !== '';

/** The directory that is or holds `target`: the target itself when it is a directory, else its parent. @es El directorio que es o contiene `target`. */
function directoryOf(target) {
  try {
    return statSync(target).isDirectory() ? target : path.dirname(target);
  } catch {
    return path.dirname(target);
  }
}

/**
 * The directories one tool call points at, `cwd` first, without repeats.
 * @es Los directorios a que apunta una llamada, `cwd` primero, sin repetir.
 */
export function candidateDirectories(payload) {
  const input = payload?.tool_input ?? {};
  const cwd = isText(payload?.cwd) ? payload.cwd : undefined;
  const found = [];

  if (cwd !== undefined) found.push(cwd);

  for (const key of ['file_path', 'notebook_path', 'path']) {
    if (isText(input[key])) found.push(directoryOf(path.resolve(cwd ?? '.', nativeSpelling(input[key]))));
  }

  const dialect = dialectOfTool(payload?.tool_name);

  if (dialect !== undefined && isText(input.command) && cwd !== undefined) {
    for (const { directory } of withWorkingDirectories(simpleCommands(input.command, dialect), cwd, dialect)) {
      if (isText(directory)) found.push(directory);
    }
  }

  return [...new Set(found)].slice(0, MAX_CANDIDATES);
}

/**
 * The root of the first linked worktree among the candidates, or `undefined`.
 * @es La raíz del primer worktree enlazado entre los candidatos, o `undefined`.
 */
export function findLinkedWorktree(payload) {
  for (const directory of candidateDirectories(payload)) {
    try {
      if (existsSync(directory) && isLinkedWorktree(directory)) return gitOutput(undefined, ['rev-parse', '--show-toplevel'], { gitOptions: ['-C', directory] }).trim();
    } catch {
      /* not a repository, or git could not tell: this candidate is not a worktree */
    }
  }

  return undefined;
}
