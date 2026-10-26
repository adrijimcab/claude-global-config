/**
 * An `Agent` brief that tells a role with NO shell tool to run git or npm.
 *
 * WHY. A role is declared in `agents/<name>.md`, and its `tools:` frontmatter is what the harness gives it: the
 * blind judges `jd-judge-a` and `jd-judge-b` declare Read, Glob, Grep and two memory reads, and nothing that runs a
 * command. A brief that asks such a role to run `git diff` or `npm test` cannot be carried out; the role answers
 * from what it can read, and the answer looks like a measurement it never made.
 *
 * WHAT IS READ, and from where. The `subagent_type` of the delegation names the role; its definition is the
 * project's `<main checkout>/.claude/agents/<name>.md` when it exists (a project definition takes precedence over a
 * user one), else `<claude home>/agents/<name>.md`. The declaration is read by `agent-toolset-check/check.mjs`, the
 * one reader of role toolsets, and the role is SHELL-LESS when it reaches none of its `EXECUTION_TOOLS`.
 *
 * WHICH COMMANDS: git and npm, the two the measured briefs asked of shell-less roles. A wider set would refuse a
 * judge's brief for a code span that only names a file, which instructions.mjs reads as a command.
 *
 * FAILS OPEN, stated: no `subagent_type`, a name that is not a plain role name, a role with no definition file (a
 * built-in type) or a declaration the reader cannot read are all left alone.
 *
 * @es Un brief de `Agent` que ordena a un rol SIN herramienta de shell ejecutar git o npm. El `tools:` del rol es lo
 * que el harness le da: los jueces ciegos solo leen. La definición es la del proyecto si existe, si no la del home;
 * la lee `agent-toolset-check/check.mjs`, el único lector de conjuntos de herramientas, y el rol no tiene shell cuando
 * no alcanza ninguna de `EXECUTION_TOOLS`. Comandos: git y npm, los medidos. Falla abierto, declarado: sin
 * `subagent_type`, nombre no simple, rol sin fichero (un tipo integrado) o declaración ilegible.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { declarationOf, EXECUTION_TOOLS, reaches } from '../agent-toolset-check/check.mjs';
import { claudeHome } from '../hook-state/locations.mjs';
import { resolveCommand, executableName } from '../shell-command/shell-command.mjs';

/** The programs a shell-less role is never told to run. @es Los programas que nunca se ordenan a un rol sin shell. */
const SHELL_PROGRAMS = new Set(['git', 'npm']);

/** The tools whose brief names a role. @es Las herramientas cuyo brief nombra un rol. */
const DELEGATION_TOOLS = new Set(['Agent', 'Task']);

/** The characters of a plain role name: nothing that could leave the agents folder. @es Los caracteres de un nombre de rol simple. */
const ROLE_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';

const isRoleName = (name) => typeof name === 'string' && name.length > 0 && [...name].every((character) => ROLE_CHARACTERS.includes(character));

/** The text of the role's definition, project first, or `undefined`. @es El texto de la definición del rol, primero la del proyecto, o `undefined`. */
function definitionOf(role, mainCheckout, home) {
  for (const file of [join(mainCheckout, '.claude', 'agents', `${role}.md`), join(home, 'agents', `${role}.md`)]) {
    try {
      return { file, text: readFileSync(file, 'utf8') };
    } catch {
      /* not there: the next place, or none */
    }
  }

  return undefined;
}

/** The program a simple command runs, by name, or `undefined`. @es El programa que corre un comando simple, o `undefined`. */
function programOf(words) {
  const at = resolveCommand(words).index;

  return at === -1 ? undefined : executableName(words[at]);
}

/**
 * The instructions (from `instructedCommands`) that tell the delegated role to run git or npm although its
 * definition reaches no shell tool: `{ lineNumber, line, detail, alternative }`.
 * @es Las instrucciones que ordenan al rol delegado ejecutar git o npm aunque su definición no alcanza ningún shell.
 */
export function shellLessRoleRefusals(instructions, payload, mainCheckout, home = claudeHome()) {
  const role = payload?.tool_input?.subagent_type;

  if (!DELEGATION_TOOLS.has(payload?.tool_name) || !isRoleName(role)) return [];

  const definition = definitionOf(role, mainCheckout, home);
  const declaration = definition === undefined ? undefined : declarationOf(definition.text);

  if (declaration === undefined || declaration.problem !== undefined || EXECUTION_TOOLS.some((tool) => reaches(declaration, tool))) return [];

  return instructions.flatMap(({ lineNumber, line, commands }) => commands.flatMap(({ words, text }) => {
    const program = programOf(words);

    if (!SHELL_PROGRAMS.has(program)) return [];

    return [{ lineNumber, line, detail: `\`${text.trim()}\` runs ${program}, and the role ${role} (${definition.file}) reaches no ${EXECUTION_TOOLS.join(' / ')} tool @es \`${text.trim()}\` ejecuta ${program}, y el rol ${role} (${definition.file}) no alcanza ninguna herramienta ${EXECUTION_TOOLS.join(' / ')}`, alternative: `run the command yourself and put its output in the brief, or delegate to a role that declares ${EXECUTION_TOOLS.join(' or ')} @es ejecuta el comando tú mismo y pon su salida en el brief, o delega en un rol que declare ${EXECUTION_TOOLS.join(' o ')}` }];
  }));
}
