#!/usr/bin/env node
/**
 * The decisions of the agent-model-guard, each broken once, that `selftest.mjs` must catch: which tools are
 * judged, what counts as a named model, what counts as opus, what a role must declare, how the frontmatter is
 * read, what the refusal says and how the shim reads and answers. The campaign runner and its rules (green
 * baseline first, exactly-once targets, parse-checked mutants) live in `../mutation-proof/run-mutants.mjs`. A
 * mutant is never deleted or softened to get a clean campaign: a survivor is a missing assertion.
 *
 * @es Las decisiones de agent-model-guard, rotas una a una, que `selftest.mjs` debe cazar: qué herramientas se
 * juzgan, qué cuenta como modelo nombrado, qué cuenta como opus, qué debe declarar un rol, cómo se lee el
 * frontmatter, qué dice el rechazo y cómo lee y responde el shim. Un mutante nunca se borra ni se ablanda: un
 * superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'agent-model-guard/guard.mjs';
const ROLE = 'agent-model-guard/role-model.mjs';
const REFUSAL = 'agent-model-guard/refusal-text.mjs';

const MUTANTS = [
  // Which tools / Qué herramientas
  ['the legacy Task tool is not judged', GUARD, "const DELEGATION_TOOLS = ['Agent', 'Task'];", "const DELEGATION_TOOLS = ['Agent'];"],
  ['the Agent tool is not judged', GUARD, "const DELEGATION_TOOLS = ['Agent', 'Task'];", "const DELEGATION_TOOLS = ['Task'];"],
  ['SendMessage is judged too', GUARD, "const DELEGATION_TOOLS = ['Agent', 'Task'];", "const DELEGATION_TOOLS = ['Agent', 'Task', 'SendMessage'];"],
  ['every tool is judged', GUARD, 'if (!DELEGATION_TOOLS.includes(toolName)) return undefined;', ''],
  // The model must be named / El modelo debe nombrarse
  ['a missing model passes', GUARD, "typeof model !== 'string' || model.trim().length === 0", "typeof model !== 'string'"],
  ['a blank model passes', GUARD, 'model.trim().length === 0', 'model.length === 0'],
  ['an empty model passes', GUARD, "typeof model !== 'string' || model.trim().length === 0", "typeof model === 'string' && model.trim().length === 0"],
  ['a non-string model passes', GUARD, "typeof model !== 'string' || model.trim().length === 0", 'model === undefined || (typeof model === \'string\' && model.trim().length === 0)'],
  // What counts as opus / Qué cuenta como opus
  ['opus is matched case-sensitively', GUARD, 'model.toLowerCase().includes(OPUS)', 'model.includes(OPUS)'],
  ['only the exact word opus is opus', GUARD, 'model.toLowerCase().includes(OPUS)', "model.toLowerCase() === OPUS"],
  ['sonnet is judged like opus', GUARD, '!model.toLowerCase().includes(OPUS) ||', 'false ||'],
  ['the opus word is misspelt', ROLE, "export const OPUS = 'opus';", "export const OPUS = 'opuss';"],
  // What a role must declare / Qué debe declarar un rol
  ['a declaring role is still refused', GUARD, '|| declaresOpus(role)) return undefined;', ') return undefined;'],
  ['any role is accepted for opus', GUARD, '|| declaresOpus(role)) return undefined;', '|| role !== undefined) return undefined;'],
  ['a role that does not declare opus is accepted', ROLE, "=== OPUS;\n  } catch {\n    return false;", "!== undefined;\n  } catch {\n    return false;"],
  ['a missing role file counts as opus', ROLE, '  } catch {\n    return false;\n  }\n}\n\n/** The names', '  } catch {\n    return true;\n  }\n}\n\n/** The names'],
  ['a non-string role is accepted', ROLE, "if (typeof roleName !== 'string' || !ROLE_NAME.test(roleName)) return false;", "if (typeof roleName !== 'string') return false;"],
  ['a role name may climb out of the directory', ROLE, "const ROLE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;", "const ROLE_NAME = /^.+$/;"],
  ['the definition is read from the wrong extension', ROLE, '`${roleName}.md`', '`${roleName}.txt`'],
  // How the frontmatter is read / Cómo se lee el frontmatter
  ['a file without frontmatter is read', ROLE, "if (lines[0]?.trim() !== '---') return undefined;", ''],
  ['an unclosed frontmatter is read to the end', ROLE, 'if (end === -1) return undefined;', ''],
  ['the body is read as frontmatter', ROLE, 'for (const line of lines.slice(1, end))', 'for (const line of lines.slice(1))'],
  ['a quoted value is not unquoted', ROLE, `["']?([^"'\\s#]+)["']?`, `([^"'\\s#]+)`],
  ['the value keeps its case', ROLE, 'return match[1].toLowerCase();', 'return match[1];'],
  ['the model key is any key', ROLE, '/^model:\\s*', '/^[a-z]+:\\s*'],
  // The listing of opus roles / El listado de roles opus
  ['every markdown role is listed', ROLE, '.filter(declaresOpus)', ''],
  ['an unreadable directory throws', ROLE, '  } catch {\n    return [];', '  } catch (error) {\n    throw error;'],
  // The refusal / El rechazo
  ['the no-model refusal drops the rule file', REFUSAL, 'Rule: rules/10-contracts.md, orchestration directive ("every Agent call names its model")', 'Rule: orchestration directive ("every Agent call names its model")'],
  ['the offending role is not named', REFUSAL, '`subagent_type "${role}"`', '`subagent_type "-"`'],
  ['a call with no role is named as a role', REFUSAL, "typeof role === 'string' && role.length > 0", 'true'],
  ['the roles list is not shown', REFUSAL, 'roles.join(', "roles.slice(0, 0).join("],
  ['an empty roles list is shown blank', REFUSAL, "roles.length === 0 ? line('no-roles') : ", ''],
  ['the tool is not named in the no-model refusal', REFUSAL, "line('no-model', { tool: toolName,", "line('no-model', { tool: '-',"],
  // The shim / El shim
  ['the shim does not strip a byte-order mark', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['the shim allows a refusal', GUARD, "permissionDecision: 'deny'", "permissionDecision: 'allow'"],
  ['the shim answers for another event', GUARD, "hookEventName: 'PreToolUse'", "hookEventName: 'Stop'"],
  ['a payload without an input object is judged', GUARD, "if (typeof payload.tool_input !== 'object' || payload.tool_input === null) return undefined;", ''],
  ['a null input object is read', GUARD, "typeof payload.tool_input !== 'object' || payload.tool_input === null", "typeof payload.tool_input !== 'object'"],
  ['the shim never prints the refusal', GUARD, 'if (output !== undefined) process.stdout.write(JSON.stringify(output));', '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['agent-model-guard', 'hook-dispatch', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'agent-model-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
