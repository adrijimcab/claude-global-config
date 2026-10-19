#!/usr/bin/env node
/**
 * The decisions of the harness count and limits, each broken once, that `harness-count.selftest.mjs` must
 * catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here makes the
 * budget under-count (an over-size set passes) or over-count (a false alarm).
 *
 * @es Las decisiones del recuento y los límites del harness, rotas una a una. Un punto ciego aquí hace que el
 * presupuesto cuente de menos (un conjunto demasiado grande pasa) o de más (falsa alarma).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FILE = 'failure-capture/harness-count.mjs';
const FENCE_CLOSES = 'fence !== undefined && fence.character === open.character && fence.length >= open.length && line.trim().length === fence.length';
const DEFAULT_TOKENS = 'Number.isFinite(contextTokens) && contextTokens > 0 ? contextTokens : DEFAULT_CONTEXT_TOKENS';
const PER_FILE = 'Math.max(MIN_FILE_LIMIT, Math.round(tokens * CONTEXT_SHARE * charsPerToken))';

const MUTANTS = [
  // --- counting: what is stripped and what is kept
  ['the no-comment shortcut is gone, so CRLF text is normalised without a comment', FILE, 'if (!body.includes(COMMENT_OPEN)) return body;', ''],
  ['line breaks are not normalised', FILE, 'const source = normalizeLineBreaks(body);', 'const source = body;'],
  ['a lone CR is not normalised', FILE, ".split('\\r').join('\\n')", ''],
  ['an indented comment is treated as a top-level block', FILE, 'source.startsWith(COMMENT_OPEN, position)', "(source.startsWith(COMMENT_OPEN, position) || source.startsWith(' ' + COMMENT_OPEN, position))"],
  ['`<!-->` is not recognised as a whole comment', FILE, "text.startsWith('>', bodyStart) || ", ''],
  ['`<!--->` is not recognised as a whole comment', FILE, " || text.startsWith('->', bodyStart)", ''],
  ['a whole comment is searched for its closing mark like any other', FILE, 'selfClosed ? start : text.indexOf(COMMENT_CLOSE, bodyStart)', 'text.indexOf(COMMENT_CLOSE, bodyStart)'],
  ['the blank lines after a block are kept', FILE, "while (text[end] === '\\n') end += 1;", ''],
  ['only one blank line after a block goes with it', FILE, "while (text[end] === '\\n') end += 1;", "if (text[end] === '\\n') end += 1;"],
  ['a block ends at its first line, not at the line with its closing mark', FILE, "text.indexOf('\\n', close)", "text.indexOf('\\n', start)"],
  ['text left after the comments is dropped', FILE, "return rest.trim().length > 0 ? rest : '';", "return '';"],
  ['a block left with only blanks is kept', FILE, "return rest.trim().length > 0 ? rest : '';", 'return rest;'],
  ['only the first comment of a block is removed', FILE, 'position = close + COMMENT_CLOSE.length;', 'return rest + raw.slice(close + COMMENT_CLOSE.length);'],
  ['an opener with no closer is dropped with what follows', FILE, 'if (close === -1) return rest + raw.slice(position);', 'if (close === -1) return rest + raw.slice(position, open === -1 ? raw.length : open);'],
  ['the comment body search starts at the opener', FILE, 'raw.indexOf(COMMENT_CLOSE, open + COMMENT_OPEN.length)', 'raw.indexOf(COMMENT_CLOSE, open)'],
  ['a counted line is one char short', FILE, 'kept += source.slice(position, lineEnd);', 'kept += source.slice(position, lineEnd - 1);'],

  // --- frontmatter
  ['frontmatter is never removed', FILE, 'if (!source.startsWith(FRONTMATTER_MARK)) return text;', 'return text;'],
  ['a byte-order mark hides the frontmatter', FILE, 'text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text', 'text'],
  ['a byte-order mark is dropped from text that has no frontmatter', FILE, 'if (!source.startsWith(FRONTMATTER_MARK)) return text;', 'if (!source.startsWith(FRONTMATTER_MARK)) return source;'],
  ['a byte-order mark is dropped when no frontmatter is found', FILE, 'return close === -1 ? text : ', 'return close === -1 ? source : '],
  ['frontmatter that never closes is removed', FILE, 'return close === -1 ? text : source.slice(skipBlanks(source, close + FRONTMATTER_MARK.length));', 'return source.slice(skipBlanks(source, close + FRONTMATTER_MARK.length));'],
  ['the opener needs no line break after it', FILE, 'lastBreak < FRONTMATTER_MARK.length ? -1 : ', ''],
  ['the blanks after the closing mark stay', FILE, 'source.slice(skipBlanks(source, close + FRONTMATTER_MARK.length))', 'source.slice(close + FRONTMATTER_MARK.length)'],
  ['only a space counts as a blank', FILE, "text[index].trim() === ''", "text[index] === ' '"],
  ['the blank run is not bounded by the text', FILE, 'index < text.length && ', ''],

  ['the byte-order mark is returned with the frontmatter', FILE, 'const start = text.charCodeAt(0) === BYTE_ORDER_MARK ? 1 : 0;', 'const start = 0;'],

  // --- fences: a comment inside one is not a block
  ['fences are ignored', FILE, 'fence === undefined && source.startsWith', 'source.startsWith'],
  ['a fence never opens', FILE, 'if (open === undefined) return fence;', 'if (open === undefined) return undefined;'],
  ['a fence of any character closes any other', FILE, FENCE_CLOSES, FENCE_CLOSES.replace('fence.character === open.character && ', '')],
  ['a shorter fence closes a longer one', FILE, FENCE_CLOSES, FENCE_CLOSES.replace('fence.length >= open.length && ', '')],
  ['a fence line with text after it closes the fence', FILE, FENCE_CLOSES, FENCE_CLOSES.replace(' && line.trim().length === fence.length', '')],
  ['a fence may be indented any amount', FILE, 'line.length - body.length > MAX_FENCE_INDENT || ', ''],
  ['a fence may be indented four spaces', FILE, 'const MAX_FENCE_INDENT = 3;', 'const MAX_FENCE_INDENT = 4;'],
  ['a fence may be indented only two spaces', FILE, 'const MAX_FENCE_INDENT = 3;', 'const MAX_FENCE_INDENT = 2;'],
  ['two characters make a fence', FILE, 'const MIN_FENCE_LENGTH = 3;', 'const MIN_FENCE_LENGTH = 2;'],
  ['four characters are needed for a fence', FILE, 'const MIN_FENCE_LENGTH = 3;', 'const MIN_FENCE_LENGTH = 4;'],
  ['a tilde is not a fence character', FILE, "const FENCE_CHARACTERS = ['`', '~'];", "const FENCE_CHARACTERS = ['`'];"],

  // --- limits
  ['a context size is not checked for being finite', FILE, DEFAULT_TOKENS, DEFAULT_TOKENS.replace('Number.isFinite(contextTokens) && ', '')],
  ['a context size is not checked for being positive', FILE, DEFAULT_TOKENS, DEFAULT_TOKENS.replace(' && contextTokens > 0', '')],
  ['the fallback context size is 100k', FILE, 'const DEFAULT_CONTEXT_TOKENS = 200_000;', 'const DEFAULT_CONTEXT_TOKENS = 100_000;'],
  ['the fallback chars per token is 4', FILE, 'const DEFAULT_CHARS_PER_TOKEN = 3;', 'const DEFAULT_CHARS_PER_TOKEN = 4;'],
  ['the context share is 10 percent', FILE, 'const CONTEXT_SHARE = 0.05;', 'const CONTEXT_SHARE = 0.1;'],
  ['the per-file floor is 50,000', FILE, 'const MIN_FILE_LIMIT = 40_000;', 'const MIN_FILE_LIMIT = 50_000;'],
  ['the per-file floor is dropped', FILE, PER_FILE, 'Math.round(tokens * CONTEXT_SHARE * charsPerToken)'],
  ['the per-file limit is floored instead of rounded', FILE, PER_FILE, PER_FILE.replace('Math.round', 'Math.floor')],
  ['the per-file limit is rounded up instead of to nearest', FILE, PER_FILE, PER_FILE.replace('Math.round', 'Math.ceil')],
  ['the total floor is 130,000', FILE, 'const MIN_TOTAL_LIMIT = 120_000;', 'const MIN_TOTAL_LIMIT = 130_000;'],
  ['the total never follows a larger per-file limit', FILE, 'total: Math.max(MIN_TOTAL_LIMIT, perFile)', 'total: MIN_TOTAL_LIMIT'],
  ['a file exactly at the per-file limit is left out of the total', FILE, 'length <= limits.perFile', 'length < limits.perFile'],
  ['the per-file exclusion uses the total limit', FILE, 'length <= limits.perFile', 'length <= limits.total'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'failure-capture/harness-count.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
