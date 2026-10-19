#!/usr/bin/env node
/**
 * The decisions of the agent toolset check, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules (green unmutated baseline, exactly-once target, parse check) live in
 * `../mutation-proof/run-mutants.mjs`. Each row names the decision it removes, not the line it edits.
 *
 * @es Las decisiones del check de herramientas de roles, rotas una a una, que `selftest.mjs` debe cazar.
 * Cada fila nombra la decisión que elimina, no la línea que edita.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const C = 'agent-toolset-check/check.mjs';
const BLIND = "forbids: [...EXECUTION_TOOLS, 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch']";

const MUTANTS = [
  // --- reading the declaration.
  ['a token merely containing a tool name counts', C, 'declaration.declared.includes(tool)', 'declaration.declared.some((token) => token.includes(tool))'],
  ['tools: [] no longer means every tool', C, "const all = toolValues.length === 1 && toolValues[0] === '[]';", 'const all = false;'],
  ['a repeated `tools: []` is read as every tool', C, "const all = toolValues.length === 1 && toolValues[0] === '[]';", "const all = toolValues[0] === '[]';"],
  ['tools: [] stops reaching a tool it does not name', C, '(declaration.all || declaration.declared.includes(tool))', '(declaration.declared.includes(tool))'],
  ['a missing tools line passes', C, 'if (toolValues.length === 0) return { problem:', 'if (toolValues.length === 0) return { all: true, declared: [], disallowed: [], ignored:'],
  ['a key spelled with a blank before its colon is not seen', C, 'if (frontmatter.some((line) => spacedKey(line, key))) return', 'if (false) return'],
  ['a tab before the colon is no blank', C, "const BLANKS = [' ', '\\t'];", "const BLANKS = [' '];"],
  ['a key glued to its colon counts as spaced', C, 'line.startsWith(key) && BLANKS.includes(line[key.length]) && ', 'line.startsWith(key) && '],
  ['an indented continuation is read as another line', C, 'if (frontmatter.some((line, index) => line.startsWith(`${key}:`) && continuesValue(frontmatter[index + 1]))) return', 'if (false) return'],
  ['any next line continues a key', C, 'const continuesValue = (line) => BLANKS.includes(line?.[0]);', 'const continuesValue = (line) => line !== undefined;'],
  ['disallowedTools shapes are not checked', C, "shapeProblem(frontmatter, 'tools') ?? shapeProblem(frontmatter, 'disallowedTools')", "shapeProblem(frontmatter, 'tools')"],
  ['a repeated key is read as one', C, 'if (values.length > 1) return { tokens, problem:', 'if (false) return { tokens, problem:'],
  ['an empty value (YAML null or a block list) is read as an empty list', C, 'if (values.length === 1 && last.length === 0) return { tokens, problem:', 'if (false) return { tokens, problem:'],
  ['a token the reader does not understand is kept', C, 'return unsure === undefined ? { tokens } :', 'return true ? { tokens } :'],  ['a name made of any character is a tool name', C, "if (name.length === 0 || ![...name].every((character) => NAME_CHARACTERS.includes(character))) return undefined;", 'if (name.length === 0) return undefined;'],
  ['a scope with no tool name is a tool', C, 'if (name.length === 0 || ![...name]', 'if (![...name]'],
  ['an unclosed scope is a tool', C, "return token.endsWith(')') && ", 'return '],
  ['a quote or comment inside a scope is a tool', C, " && ![...scope].some((character) => SCOPE_STOPS.includes(character)) ? name : undefined;", ' ? name : undefined;'],
  ['a scoped token keeps its scope in the name', C, 'const name = open === -1 ? token : token.slice(0, open);', 'const name = token;'],
  ['declared tokens keep their scope', C, 'declared: tools.tokens.map(toolNameOf)', 'declared: tools.tokens'],
  ['a problem in tools: is ignored', C, 'const problem = tools.problem ?? disallowed.problem;', 'const problem = disallowed.problem;'],
  ['a problem in disallowedTools: is ignored', C, 'const problem = tools.problem ?? disallowed.problem;', 'const problem = tools.problem;'],
  ['a missing frontmatter passes', C, "if (frontmatter === undefined) return { problem:", "if (frontmatter === undefined) return { all: true, declared: [], disallowed: [], ignored:"],
  ['the frontmatter is not bounded, so a body line counts', C, 'const closing = lines.indexOf(\'---\', 1);', 'const closing = -1;'],
  ['a frontmatter that never closes is read as bounded', C, 'return closing === -1 ? undefined : lines.slice(1, closing);', 'return closing === -1 ? lines.slice(1) : lines.slice(1, closing);'],
  ['a trailing carriage return is kept in a line', C, 'text.split(\'\\n\').map((line) => line.trimEnd())', 'text.split(\'\\n\')'],
  ['disallowedTools is not read', C, "const disallowed = plainListOf(frontmatter, 'disallowedTools');", 'const disallowed = { tokens: [] };'],
  ['a disallowed tool is still reached', C, 'return !declaration.disallowed.includes(tool) && (', 'return ('],

  // --- MUST: what a profile demands.
  ['a needed tool named in disallowedTools is not a finding', C, 'if (blocked.length > 0) problems.push(', 'if (false) problems.push('],
  ['a needed group nobody reaches is not a finding', C, 'else if (!group.some((tool) => reaches(declaration, tool))) problems.push(', 'else if (false) problems.push('],
  ['a needed group wants every tool of the group instead of one', C, 'else if (!group.some((tool) => reaches(declaration, tool)))', 'else if (!group.every((tool) => reaches(declaration, tool)))'],
  ['the executor needs no command runner', C, 'executor: { requires: [EXECUTION_TOOLS], forbids: [] },', 'executor: { requires: [], forbids: [] },'],
  ['the blind reviewer need not read', C, "'blind-reviewer': { requires: [['Read']],", "'blind-reviewer': { requires: [],"],

  // --- MUST NOT: what a profile forbids.
  ['a forbidden tool the role reaches is not a finding', C, 'if (leaked.length > 0) problems.push(', 'if (false) problems.push('],
  ['the blind reviewer may run commands', C, BLIND, "forbids: ['Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch']"],
  ['the blind reviewer may write files', C, BLIND, "forbids: [...EXECUTION_TOOLS, 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch']"],
  ['the blind reviewer may edit files', C, BLIND, "forbids: [...EXECUTION_TOOLS, 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch']"],
  ['the blind reviewer may edit notebooks', C, BLIND, "forbids: [...EXECUTION_TOOLS, 'Write', 'Edit', 'WebFetch', 'WebSearch']"],
  ['the blind reviewer may fetch pages', C, BLIND, "forbids: [...EXECUTION_TOOLS, 'Write', 'Edit', 'NotebookEdit', 'WebSearch']"],
  ['the blind reviewer may search the web', C, BLIND, "forbids: [...EXECUTION_TOOLS, 'Write', 'Edit', 'NotebookEdit', 'WebFetch']"],

  // --- who is judged, and by which profile.
  ['a judge is classified as an executor again', C, "'jd-judge-a': 'blind-reviewer',", "'jd-judge-a': 'executor',"],
  ['a fixer is classified as a blind reviewer', C, "'jd-fix-agent': 'executor',", "'jd-fix-agent': 'blind-reviewer',"],
  ['an unclassified role passes', C, 'if (profileName === undefined) {', 'if (false) {'],
  ['a role naming an undefined profile is not reported', C, 'gaps.push({ role, problem: `names the profile', '[].push({ role, problem: `names the profile'],
  ['a classified role whose file is gone passes', C, 'if (!present.includes(role)) gaps.push(', 'if (false) gaps.push('],
  ['a missing agents directory passes', C, 'if (!existsSync(agentsDirectory)) return [{', 'if (!existsSync(agentsDirectory)) return []; [{'],
  ['a non-markdown file is a role', C, ".filter((name) => name.endsWith('.md'))", '.filter(() => true)'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['agent-toolset-check', 'mutation-proof', 'agents'], selftest: 'agent-toolset-check/selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });

process.exit(survivors === 0 ? 0 : 1);
