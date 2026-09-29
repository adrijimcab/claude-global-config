/**
 * The `tools:` line in the YAML frontmatter of a Claude Code sub-agent file.
 *
 * Only the frontmatter counts: a `tools:` line or a tool name in the prompt body grants nothing, so
 * both are ignored. Tools are compared as whole tokens, so `BashOutput` is not `Bash`.
 */
import { lineContent, splitLines } from './text-file.mjs';

const FENCE = '---';
const KEY = 'tools:';
const SEPARATOR = ', ';

/**
 * Locate the frontmatter `tools:` line.
 * @returns {{ lines: string[], index: number, value: string } | { error: string }}
 */
export function locateToolsLine(text) {
  const lines = splitLines(text);
  if (lineContent(lines[0]) !== FENCE) return { error: 'no frontmatter (first line is not ---)' };
  const end = lines.findIndex((line, index) => index > 0 && lineContent(line) === FENCE);
  if (end < 0) return { error: 'frontmatter is never closed' };
  const index = lines.findIndex((line, at) => at > 0 && at < end && line.startsWith(KEY));
  if (index < 0) return { error: 'frontmatter has no tools: line' };
  return { lines, index, value: lineContent(lines[index]).slice(KEY.length).trim() };
}

const unquote = (token) => (token.startsWith('"') && token.endsWith('"') ? token.slice(1, -1) : token);

/**
 * The tool names in a `tools:` value, and its form: `plain` (`A, B`), `flow` (`[A, B]`) or `empty`.
 * An empty value is also what a YAML block list looks like on its key line; its items are not read,
 * so an `empty` form is never rewritten.
 */
export function parseTools(value) {
  if (value === '' || value === '[]') return { form: 'empty', tokens: [] };
  const isFlow = value.startsWith('[') && value.endsWith(']');
  const inner = isFlow ? value.slice(1, -1) : value;
  const tokens = inner.split(',').map((token) => unquote(token.trim())).filter((token) => token !== '');
  return { form: isFlow ? 'flow' : 'plain', tokens };
}

/** The canonical plain line for `tokens`, the exact shape gentle-ai writes for Claude Code. */
export const renderPlainToolsLine = (tokens) => `${KEY} ${tokens.join(SEPARATOR)}`;

/**
 * `tokens` with `tool` inserted before the first MCP tool — where our customizations have always
 * lived (it reproduces the pre-sync lines byte for byte) — or appended when there is no MCP tool.
 */
export function withToolInserted(tokens, tool) {
  const firstMcp = tokens.findIndex((token) => token.startsWith('mcp__'));
  const at = firstMcp < 0 ? tokens.length : firstMcp;
  return [...tokens.slice(0, at), tool, ...tokens.slice(at)];
}
