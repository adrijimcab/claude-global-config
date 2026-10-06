/**
 * Every file one `PreToolUse` call WRITES, over BOTH channels a worker can write through: an
 * `Edit`/`Write`/`MultiEdit`/`NotebookEdit` call (its `file_path`/`notebook_path`), and a `Bash`/
 * `PowerShell` line (its redirections, `sed -i`, `tee`, `cp`/`mv`, `Copy-Item`/`Move-Item`, and the
 * content cmdlets — `shell-writes.mjs`).
 *
 * WHY ONE OWNER. Two guards ask "which files does this call write?" — the golden guard (is one an API
 * golden?) and the isolation boundary (does one escape the worker's worktree?). Each used to carry its
 * own reading of the payload, and a policy enforced on one channel with a different lexer on the other is
 * exactly how `isolation-guard-screens-edits-but-not-shell-writes` happened: the edit tools were screened,
 * a plain `cp` onto the same absolute path was not. A question two guards ask is an abstraction, not two
 * copies, so the answer lives here and a policy decided over these targets is identical on both channels
 * by construction.
 *
 * Returns `{ path, via, channel }` (`channel` is `'edit'` or `'shell'`) for a target that resolves, and
 * `{ path: undefined, unresolvable, via, channel }` for one that does not (a variable, an unknowable `cd`). What an unresolvable target MEANS is the caller's
 * decision; `shell-writes.mjs` states the tradeoff both current callers make.
 *
 * @es Cada fichero que escribe una llamada `PreToolUse`, por los DOS canales por los que un worker
 * escribe: una llamada `Edit`/`Write`/`MultiEdit`/`NotebookEdit` y una línea `Bash`/`PowerShell`. Dos
 * guards hacen esta pregunta (¿es un golden?, ¿escapa del worktree?); cuando cada uno leía el payload a su
 * manera, una política se aplicaba en un canal y otro lexer la dejaba pasar en el otro — así ocurrió
 * `isolation-guard-screens-edits-but-not-shell-writes`. Una sola respuesta hace la política idéntica en
 * ambos canales por construcción. El significado de un destino no resoluble es decisión del llamador.
 */

import path from 'node:path';

import { dialectOfTool } from '../shell-command/shell-command.mjs';
import { shellWriteTargets } from './shell-writes.mjs';

/** The tools whose `tool_input` names a file directly. @es Las herramientas cuyo `tool_input` nombra un fichero directamente. */
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** The `file_path`/`notebook_path` an edit-tool call targets, or `undefined`. @es El `file_path`/`notebook_path` de una llamada de edición, o `undefined`. */
function editToolTarget(toolInput) {
  if (typeof toolInput?.file_path === 'string' && toolInput.file_path.length > 0) return toolInput.file_path;
  if (typeof toolInput?.notebook_path === 'string' && toolInput.notebook_path.length > 0) return toolInput.notebook_path;

  return undefined;
}

/** The directory a call starts in: the payload's `cwd`, else this process's. @es El directorio donde empieza la llamada. */
export function callDirectory(payload) {
  return typeof payload?.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : process.cwd();
}

/**
 * @param payload A parsed `PreToolUse` payload.
 * @returns Every write target of the call — empty for a tool that writes through neither channel.
 * @es Cada destino de escritura de la llamada; vacío para una herramienta que no escribe por ningún canal.
 */
export function toolCallWrites(payload) {
  const toolName = payload?.tool_name;
  const cwd = callDirectory(payload);

  if (EDIT_TOOLS.has(toolName)) {
    const target = editToolTarget(payload?.tool_input);

    if (target === undefined) return [];

    return [{ path: path.isAbsolute(target) ? target : path.resolve(cwd, target), via: `the ${toolName} tool`, channel: 'edit' }];
  }

  const dialect = dialectOfTool(toolName);
  const script = payload?.tool_input?.command;

  if (dialect === undefined || typeof script !== 'string') return [];

  return shellWriteTargets(script, dialect, cwd).map((write) => ({ ...write, channel: 'shell' }));
}
