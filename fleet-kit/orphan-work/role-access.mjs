/**
 * Whether the role a delegation launches can WRITE: the one question that decides if parked work should
 * refuse the launch or only be shown.
 *
 * WHY (2026-10-18, MEASURED by the Discovery session): orphan-work refused a read-only Explore launch while an
 * approved branch waited to land. The refusal exists so a fresh agent does not REDO parked work; a role that
 * cannot write cannot redo anything, so it passes and the parked-work note is shown as information.
 *
 * THE DECISION FAILS CLOSED. It is read from the role's own definition, never from a name list:
 * `<agents>/<role>.md` frontmatter `tools:` (project `.claude/agents` first, then the install's `agents/`, as
 * Claude Code resolves them), through the shared reader of `agent-toolset-check`, which reads only a plain
 * comma list (a flow list, quotes, a block list, an empty value or a repeated key is a problem). A role is
 * read-only only when that reading succeeds and the toolset reaches none of `WRITE_TOOLS` (a scoped
 * `Bash(npm:*)` reaches Bash; `disallowedTools:` counted). A role with no file, an unreadable file, an unread
 * shape, or no `subagent_type` (general-purpose) is a writer: a failed reading is never a clean one, and the
 * reason it failed travels with the verdict.
 *
 * THE QUESTION IS "CAN THIS ROLE REDO PARKED REPOSITORY WORK?" (2026-10-19, owner-side decision), so the writer
 * tools are exactly the ones that change the repository: Write, Edit, NotebookEdit, Bash and PowerShell, scoped
 * forms included. MCP tools do not count. LIMIT, stated: a role wired to an MCP server that writes the file
 * system is out of this guard's scope and reads as read-only.
 *
 * @es Si el rol que lanza una delegación puede ESCRIBIR: lo único que decide si el trabajo aparcado rechaza el
 * lanzamiento o solo se muestra. LA DECISIÓN FALLA CERRADA. Se lee de la definición del rol (`tools:` del
 * frontmatter, proyecto primero y luego la instalación) con el lector compartido de `agent-toolset-check`, que
 * solo lee una lista simple separada por comas. Es de solo lectura únicamente si esa lectura funciona y el
 * conjunto no alcanza ninguna de `WRITE_TOOLS` (un `Bash(npm:*)` con ámbito alcanza Bash). Sin fichero, con un
 * fichero ilegible, con una forma no leída o sin `subagent_type` (general-purpose) es escritor: una lectura fallida
 * nunca es una limpia, y el motivo del fallo viaja con el veredicto. LA PREGUNTA ES «¿PUEDE ESTE ROL REHACER TRABAJO
 * APARCADO DEL REPOSITORIO?», así que las herramientas de escritura son exactamente Write, Edit, NotebookEdit, Bash
 * y PowerShell, con ámbito incluido. Las herramientas MCP no cuentan. LÍMITE, dicho: un rol conectado a un servidor
 * MCP que escribe en el sistema de ficheros queda fuera del alcance de esta guarda y se lee como de solo lectura.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { declarationOf, EXECUTION_TOOLS, reaches } from '../../agent-toolset-check/check.mjs';

/**
 * The tools that change files, directly or through a command: a role with Bash or PowerShell can commit or
 * redirect into a file, so it counts as a writer (owner-side decision 2026-10-19).
 * @es Las herramientas que cambian ficheros, directamente o por una orden: un rol con Bash o PowerShell puede
 * hacer commit o redirigir a un fichero, así que cuenta como escritor (decisión del 2026-10-19).
 */
export const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit', ...EXECUTION_TOOLS];

/**
 * Built-in types that have no definition file. Source: the harness's own `Agent` tool listing, which states
 * their tools: Explore and Plan "All tools except Agent, ..., Edit, Write, NotebookEdit"; claude-code-guide
 * "Glob, Grep, Read, WebFetch, WebSearch". Explore and Plan list Bash there, yet stay in this set: the harness
 * documents them as read-only search and planning roles, and this was the launch the guard wrongly refused
 * (their definitions are not files this install can tighten). Every other built-in (general-purpose, statusline-setup, which
 * edits) is a writer, so it is deliberately absent.
 * @es Tipos integrados sin fichero de definición. Fuente: el listado de la herramienta `Agent` del propio
 * harness, que declara sus herramientas. Los demás (general-purpose, statusline-setup, que edita) escriben.
 */
export const READ_ONLY_BUILT_INS = new Set(['Explore', 'Plan', 'claude-code-guide']);

const INSTALL_AGENTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'agents');

/** Where role definitions are looked up, in precedence order. @es Dónde se buscan las definiciones de rol, por precedencia. */
export const agentDirectories = (mainCheckout) => [path.join(mainCheckout, '.claude', 'agents'), INSTALL_AGENTS];

/** Whether `role` is a plain file stem, so it cannot walk out of an agents folder. @es Si `role` es un nombre de fichero simple. */
const isPlainName = (role) => role.length > 0 && path.basename(role) === role && !role.includes('.');

/**
 * The declaration of the first definition file of `role`, `undefined` when none exists, or a `problem` when the
 * file exists but cannot be read (a folder, no permission): an unreadable file is never an absent one.
 * @es La declaración del primer fichero de definición de `role`, `undefined` si no hay ninguno, o un `problem`
 * si el fichero existe pero no se puede leer (una carpeta, sin permiso): ilegible nunca es ausente.
 */
function declarationFor(role, directories) {
  const file = directories.map((directory) => path.join(directory, `${role}.md`)).find((candidate) => existsSync(candidate));

  if (file === undefined) return undefined;

  try {
    return declarationOf(readFileSync(file, 'utf8'));
  } catch (error) {
    return { problem: `cannot be read (${error instanceof Error ? error.message : String(error)}) @es no se puede leer (${error instanceof Error ? error.message : String(error)})` };
  }
}

/**
 * What the role named by `payload.tool_input.subagent_type` may do: `readOnly`, and when its definition could not
 * be read, the `problem` that made it a writer, prefixed with the file it came from.
 * @es Lo que puede hacer el rol que nombra `subagent_type`: `readOnly` y, si su definición no se pudo leer, el
 * `problem` que lo volvió escritor.
 * @returns {{ readOnly: boolean, problem?: string }}
 */
export function launchAccess(payload, directories) {
  const role = payload?.tool_input?.subagent_type;

  if (typeof role !== 'string' || !isPlainName(role)) return { readOnly: false };

  const declaration = declarationFor(role, directories);

  if (declaration === undefined) return { readOnly: READ_ONLY_BUILT_INS.has(role) };
  if (declaration.problem !== undefined) return { readOnly: false, problem: `role ${role} ${declaration.problem}` };

  return { readOnly: !WRITE_TOOLS.some((tool) => reaches(declaration, tool)) };
}
