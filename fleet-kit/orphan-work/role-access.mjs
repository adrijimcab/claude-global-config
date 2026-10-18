/**
 * Whether the role a delegation launches can WRITE: the one question that decides if parked work should
 * refuse the launch or only be shown.
 *
 * WHY (2026-10-18, MEASURED by the Discovery session): orphan-work refused a read-only Explore launch while an
 * approved branch waited to land. The refusal exists so a fresh agent does not REDO parked work; a role that
 * cannot write cannot redo anything, so it passes and the parked-work note is shown as information.
 *
 * THE DECISION is read from the role's own definition, never from a name list: `<agents>/<role>.md`
 * frontmatter `tools:` (project `.claude/agents` first, then the install's `agents/`, as Claude Code
 * resolves them). A role is read-only when it declares a toolset (`tools: []` means EVERY tool) and that
 * toolset reaches none of `WRITE_TOOLS`, `disallowedTools:` counted. A role with no file, no `tools:` line or
 * no `subagent_type` (general-purpose) is a writer: a failed reading is never a clean one.
 *
 * @es Si el rol que lanza una delegación puede ESCRIBIR: lo único que decide si el trabajo aparcado rechaza el
 * lanzamiento o solo se muestra. Se lee de la definición del rol (`tools:` del frontmatter, proyecto primero y
 * luego la instalación), nunca de una lista de nombres: es de solo lectura si declara un conjunto de
 * herramientas (`tools: []` = TODAS) que no alcanza ninguna de `WRITE_TOOLS`. Sin fichero, sin `tools:` o sin
 * `subagent_type` (general-purpose) es escritor: una lectura fallida nunca es una limpia.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { declarationOf, EXECUTION_TOOLS } from '../../agent-toolset-check/check.mjs';

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

function declarationFor(role, directories) {
  const file = directories.map((directory) => path.join(directory, `${role}.md`)).find((candidate) => existsSync(candidate));

  return file === undefined ? undefined : declarationOf(readFileSync(file, 'utf8'));
}

/**
 * Whether the role named by `payload.tool_input.subagent_type` cannot write.
 * @es Si el rol que nombra `subagent_type` no puede escribir.
 */
export function launchesReadOnlyRole(payload, directories) {
  const role = payload?.tool_input?.subagent_type;

  if (typeof role !== 'string' || !isPlainName(role)) return false;

  const declaration = declarationFor(role, directories);

  if (declaration === undefined) return READ_ONLY_BUILT_INS.has(role);
  if (declaration.problem !== undefined) return false;

  const reaches = (tool) => !declaration.disallowed.includes(tool) && (declaration.all || declaration.declared.includes(tool));

  return !WRITE_TOOLS.some(reaches);
}
