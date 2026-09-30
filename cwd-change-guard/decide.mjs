/**
 * THE DECISION for `orchestrator-cwd-change-leaked-to-workers`: does this shell call, fired by the MAIN
 * session, run a directory-changing command in the session's OWN shell?
 *
 * MEASURED INCIDENT, 2026-09-30 (2nd occurrence). A foreground Bash call beginning
 * `cd /c/Users/adrian.jimenez/Desktop/Projects/b100-am-ui/.claude/worktrees/fix-spec-types && node …`
 * made the harness answer "Environment update — Primary working directory: …/fix-spec-types (was
 * …/b100-am-ui)", and that update reached the live workers. A later `cd` back restored it. The same
 * session measured what does NOT move it: `( cd X && … )` subshells and `run_in_background` calls
 * ("Session cwd remains …"). ROOT CAUSE: a foreground `cd` changes the session shell's cwd, and the harness
 * broadcasts that as session state to other actors. The lesson's RULE ("never `cd` in a Bash call") was
 * memory; this is the mechanism.
 *
 * WHAT COUNTS. A command in command position whose executable is `cd`, `chdir`, `pushd`, `popd`,
 * `Set-Location`, `sl`, `Push-Location` or `Pop-Location`, running at the line's top level in the line's
 * own shell. The orchestrator's brief named the FIRST command; the leak is the same wherever the `cd` sits
 * (`git status && cd x && node y`), so every top-level position is refused, not only the first.
 *
 * WHAT NEVER COUNTS, each a measured or structural fact, never a guess:
 *   - a subagent's call (its `agent_id` / `subagents/` transcript path): the harness keeps a worker's cwd
 *     per worker, and the orchestrator's session is the one that leaks;
 *   - `run_in_background: true`, measured not to move the session cwd;
 *   - a `cd` inside `( … )` (bash subshell), `$( … )`, backticks, `bash -c`, `powershell -Command`,
 *     `cmd /c`: a child process or substitution, so the session shell never changes directory;
 *   - a `cd` in a pipeline or backgrounded with `&`: bash runs those members in a subshell;
 *   - `cd` as DATA — an `echo` argument, a commit message, a heredoc body: the shared tokenizer
 *     (`../shell-command/shell-command.mjs`) keeps data out of command position, so no substring scan
 *     exists here (M5).
 *
 * FAILS OPEN: anything unparseable or not a shell call is `undefined`, never a refusal made from a guess.
 *
 * @es LA DECISIÓN de `orchestrator-cwd-change-leaked-to-workers`: ¿ejecuta esta llamada de shell, lanzada
 * por la sesión PRINCIPAL, un comando que cambia de directorio en la shell propia de la sesión? INCIDENTE
 * MEDIDO el 2026-09-30 (2.ª vez): un `cd …/fix-spec-types && node …` en primer plano hizo que el harness
 * anunciara «Primary working directory: …/fix-spec-types», aviso que llegó a los workers vivos. Medido
 * también lo que NO lo mueve: subshells `( cd X && … )` y llamadas `run_in_background`. CUENTAN los
 * `cd`/`pushd`/`Set-Location`… en posición de comando al nivel superior de la línea, en cualquier
 * posición, no solo la primera. NO CUENTAN: llamadas de un subagente, segundo plano, `cd` dentro de
 * `( )`, `$( )`, comillas invertidas, `bash -c`, `cmd /c`, miembros de una tubería o con `&`, ni `cd` como
 * DATO (echo, mensaje de commit, heredoc), porque el tokenizador compartido los deja fuera de la posición
 * de comando. Falla ABIERTO ante cualquier cosa ilegible.
 */

import { isSubagentCaller } from '../hook-caller/identify-caller.mjs';
import { commandWordIndex, dialectOfTool, DIALECTS, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** The executables that change the directory of the shell that runs them. @es Los ejecutables que cambian el directorio de la shell que los corre. */
export const DIRECTORY_CHANGERS = new Set(['cd', 'chdir', 'pushd', 'popd', 'set-location', 'sl', 'push-location', 'pop-location']);

/** Separators that end a command bash runs in a subshell: the left side of a pipe, or a background job. @es Separadores que terminan un comando que bash corre en un subshell. */
const SUBSHELL_SEPARATORS = new Set(['|', '|&', '&']);

/** Separators after which the NEXT command is the right side of a pipe, also a subshell. @es Separadores tras los que el siguiente comando es el lado derecho de una tubería. */
const PIPE_SEPARATORS = new Set(['|', '|&']);

/** True when a command runs in the line's own shell and not in a pipeline or background subshell. @es Verdadero si el comando corre en la shell de la línea. */
function runsInSessionShell(command, previous) {
  if (SUBSHELL_SEPARATORS.has(command.separator)) return false;

  return previous === undefined || !PIPE_SEPARATORS.has(previous.separator);
}

/** The executable in command position, or `undefined`. @es El ejecutable en posición de comando. */
function executableOf(command) {
  const at = commandWordIndex(command.words);

  return at === -1 ? undefined : executableName(command.words[at]);
}

/**
 * The first directory-changing command a main-session foreground call would run in the session shell.
 * @param {unknown} payload the parsed `PreToolUse` payload
 * @returns {{ executable: string, text: string } | undefined} the offender, or `undefined` to allow
 * @es El primer comando que cambiaría el directorio de la sesión, o `undefined` para permitir.
 */
export function offendingDirectoryChange(payload) {
  if (payload === null || typeof payload !== 'object') return undefined;
  if (isSubagentCaller(payload)) return undefined;

  const dialect = dialectOfTool(payload.tool_name);
  const toolInput = payload.tool_input;

  if (dialect === undefined || toolInput === null || typeof toolInput !== 'object') return undefined;
  if (toolInput.run_in_background === true) return undefined;

  const commands = simpleCommands(toolInput.command, dialect, { includeNested: false });

  for (const [index, command] of commands.entries()) {
    if (dialect === DIALECTS.BASH && command.depth > 0) continue;

    const executable = executableOf(command);

    if (executable === undefined || !DIRECTORY_CHANGERS.has(executable)) continue;
    if (!runsInSessionShell(command, commands[index - 1])) continue;

    return { executable, text: command.text.trim() };
  }

  return undefined;
}
