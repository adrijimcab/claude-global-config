/**
 * What a delegated agent may still do once the guard has refused: only what lets it COMMIT or INSPECT.
 *
 *   - `Read`, `Grep`, `Glob`: pure inspection.
 *   - a shell line whose every command is `cd` (navigation) or `git add|commit|status|diff|log`. A line that runs
 *     anything else, or that the parser cannot read, is not allowed: a refusal that let `npm test` through would
 *     be no refusal.
 *   - `SubagentHandback`: the exit hatch. A commit that keeps failing (a red pre-commit gate needs EDITS, and
 *     edits are refused) must not wedge the agent forever; it reports the blocker and the orchestrator, who sees
 *     the dirty tree, decides. A guard that can wedge a worker is a larger hazard than the one it names.
 *
 * `commitsIn` says whether a line runs `git commit`, so the guard can forget its cached measurement the moment a
 * commit is attempted.
 *
 * @es Lo que un agente delegado aún puede hacer tras la negativa: solo lo que le deja COMMITEAR o INSPECCIONAR.
 * `Read`, `Grep`, `Glob`; una línea de shell cuyos comandos son todos `cd` o `git add|commit|status|diff|log`
 * (cualquier otra cosa, o una línea que el parser no lee, no pasa: una negativa que dejara pasar `npm test` no
 * sería negativa); y `SubagentHandback`, la salida de emergencia: un commit que sigue fallando (un pre-commit
 * rojo pide EDICIONES, que están negadas) no debe atascar al agente para siempre. `commitsIn` dice si una línea
 * corre `git commit`, para que la guardia olvide su medición en cuanto se intenta un commit.
 */

import { gitInvocations } from '../shell-command/git-invocations.mjs';
import { commandWordIndex, dialectOfTool, executableName, simpleCommands } from '../shell-command/shell-command.mjs';

/** Tools that only inspect or hand back. @es Herramientas que solo inspeccionan o devuelven el control. */
const ALWAYS_ALLOWED_TOOLS = new Set(['Read', 'Grep', 'Glob', 'SubagentHandback']);

/** The git subcommands that let an agent commit or look. @es Los subcomandos de git que dejan commitear o mirar. */
export const ALLOWED_GIT_SUBCOMMANDS = Object.freeze(['add', 'commit', 'status', 'diff', 'log']);

/** Words that only change directory. @es Palabras que solo cambian de directorio. */
const NAVIGATION = new Set(['cd', 'chdir', 'set-location', 'sl', 'pushd', 'popd', 'push-location', 'pop-location']);

const isGit = (command) => {
  const at = commandWordIndex(command.words);

  return at !== -1 && executableName(command.words[at]) === 'git';
};

const isNavigation = (command) => {
  const at = commandWordIndex(command.words);

  return at !== -1 && NAVIGATION.has(command.words[at].toLowerCase());
};

/**
 * The shell line of a payload when its tool is a shell, else `undefined`.
 * @es La línea de shell de un payload si su herramienta es un shell, si no `undefined`.
 */
function shellLine(payload) {
  const dialect = dialectOfTool(payload?.tool_name);
  const command = payload?.tool_input?.command;

  return dialect !== undefined && typeof command === 'string' ? { dialect, command } : undefined;
}

/** Whether a shell line runs `git commit`. @es Si una línea de shell corre `git commit`. */
export function commitsIn(payload) {
  const line = shellLine(payload);

  if (line === undefined || !line.command.includes('commit')) return false;

  return gitInvocations(line.command, line.dialect, typeof payload.cwd === 'string' ? payload.cwd : '.').some((invocation) => invocation.subcommand === 'commit');
}

/**
 * Whether the call may run while the refusal is in force.
 * @es Si la llamada puede correr mientras rige la negativa.
 */
export function allowedUnderRefusal(payload) {
  if (ALWAYS_ALLOWED_TOOLS.has(payload?.tool_name)) return true;

  const line = shellLine(payload);

  if (line === undefined) return false;

  const commands = simpleCommands(line.command, line.dialect);

  if (commands.length === 0) return false;

  const others = commands.filter((command) => !isGit(command) && !isNavigation(command));
  const invocations = gitInvocations(line.command, line.dialect, typeof payload.cwd === 'string' ? payload.cwd : '.');

  return others.length === 0 && invocations.every((invocation) => ALLOWED_GIT_SUBCOMMANDS.includes(invocation.subcommand));
}
