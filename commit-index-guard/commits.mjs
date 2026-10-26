/**
 * The `git commit` invocations a shell tool call RUNS, each with the directory it acts in and what it names.
 * It reuses the shared parsers: `gitInvocations()` decides what is a command (a `git commit` mentioned in
 * `echo`, a quoted message or a heredoc is data) and where it runs (`cd`, `-C`), and `invocationDirectory()`
 * folds the `-C` options over that directory; `commit-paths.mjs` reads the commit's own words.
 *
 * @es Las invocaciones de `git commit` que EJECUTA una llamada a una herramienta de shell, cada una con el
 * directorio en que actúa y lo que nombra. Reutiliza los analizadores compartidos: `gitInvocations()` decide
 * qué es un comando y dónde corre, `invocationDirectory()` pliega los `-C` sobre ese directorio y
 * `commit-paths.mjs` lee las palabras propias del commit.
 */

import { invocationDirectory } from '../company-remote/invocation-directory.mjs';
import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { readCommit } from './commit-paths.mjs';

/**
 * @param payload A `PreToolUse` or `PostToolUse` payload of a shell tool.
 * @returns `[{ directory, text, ...readCommit() }]`, in execution order; empty for a call that runs no shell,
 *   no command or no commit. `directory` is `undefined` when the line's own `cd` could not be followed.
 * @es Las invocaciones de commit del payload, en orden de ejecución; vacío si no hay.
 */
export function commitsOf(payload) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  if (dialect === undefined || typeof command !== 'string' || command.length === 0) return [];

  const cwd = typeof payload?.cwd === 'string' ? payload.cwd : process.cwd();

  return gitInvocations(command, dialect, cwd)
    .filter((invocation) => invocation.subcommand === 'commit')
    .map((invocation) => ({ directory: invocationDirectory(invocation), text: invocation.text, ...readCommit(invocation.args) }));
}

/** The payload of a raw hook input, or `undefined` when it is not JSON; a byte-order mark is tolerated. @es El payload de una entrada cruda, o `undefined` si no es JSON. */
export function parsePayload(raw) {
  try {
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return undefined;
  }
}
