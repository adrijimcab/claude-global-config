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

const MUTANTS = [
  ['PowerShell stops counting as execution', C, "export const EXECUTION_TOOLS = ['Bash', 'PowerShell'];", "export const EXECUTION_TOOLS = ['Bash'];"],
  ['Bash stops counting as execution', C, "export const EXECUTION_TOOLS = ['Bash', 'PowerShell'];", "export const EXECUTION_TOOLS = ['PowerShell'];"],
  ['a token merely containing a tool name counts', C, 'tokensOf(tools).filter((token) => EXECUTION_TOOLS.includes(token))', 'tokensOf(tools).filter((token) => EXECUTION_TOOLS.some((tool) => token.includes(tool)))'],
  ['tools: [] no longer means every tool', C, "if (tools === '[]') return { kind: 'all' };", ''],
  ['a missing tools line passes', C, "if (tools === undefined) return { problem:", "if (tools === undefined) return { kind: 'all', problem: undefined, ignored:"],
  ['a missing frontmatter passes', C, "if (frontmatter === undefined) return { problem:", "if (frontmatter === undefined) return { kind: 'all', ignored:"],
  ['the frontmatter is not bounded, so a body line counts', C, 'const closing = lines.indexOf(\'---\', 1);', 'const closing = -1;'],
  ['a frontmatter that never closes is read as bounded', C, 'return closing === -1 ? undefined : lines.slice(1, closing);', 'return closing === -1 ? lines.slice(1) : lines.slice(1, closing);'],
  ['a trailing carriage return is kept in a line', C, 'text.split(\'\\n\').map((line) => line.trimEnd())', 'text.split(\'\\n\')'],
  ['disallowedTools is not read', C, "const blocked = tokensOf(valueOf(frontmatter, 'disallowedTools') ?? '')", "const blocked = tokensOf('')"],
  ['a role without any execution tool is not a gap', C, "else if (execution.kind === 'declared' && execution.execution.length === 0)", 'else if (false)'],
  ['an unclassified role passes', C, "if (policy === undefined) {", "if (false) {"],
  ['an exempt role is judged as if it needed execution', C, 'if (policy !== NEEDS_EXECUTION) continue;', ''],
  ['a classified role whose file is gone passes', C, "if (!present.includes(role)) gaps.push(", "if (false) gaps.push("],
  ['a missing agents directory passes', C, "if (!existsSync(agentsDirectory)) return [{", "if (!existsSync(agentsDirectory)) return []; [{"],
  ['a non-markdown file is a role', C, ".filter((name) => name.endsWith('.md'))", '.filter(() => true)'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['agent-toolset-check', 'mutation-proof', 'agents'], selftest: 'agent-toolset-check/selftest.mjs', mutants: MUTANTS });

process.exit(survivors === 0 ? 0 : 1);
