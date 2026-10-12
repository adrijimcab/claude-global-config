#!/usr/bin/env node
/**
 * The decisions of ai-exclusion, each broken once, that `selftest.mjs` must catch.
 * @es Las decisiones de ai-exclusion, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const BLOCK = 'ai-exclusion/block.mjs';
const CLONE = 'ai-exclusion/clone.mjs';
const PROVISION = 'ai-exclusion/provision.mjs';
const CLI = 'ai-exclusion/cli.mjs';

const MUTANTS = [
  // --- block.mjs
  ['the end marker is left out of the rendered block', BLOCK, '[BEGIN_MARKER, ...patterns, END_MARKER]', '[BEGIN_MARKER, ...patterns]'],
  ['a CRLF file no longer gets a CRLF block', BLOCK, "text.includes('\\r\\n') ? '\\r\\n' : '\\n'", "'\\n'"],
  ['a marker in the middle of a line counts as a marker', BLOCK, "at === 0 || text[at - 1] === '\\n'", 'true'],
  ['an end marker before the begin marker is accepted', BLOCK, 'ends[0] < begins[0]', 'false'],
  ['a half block is accepted', BLOCK, 'begins.length !== 1 || ends.length !== 1 || ', ''],
  ['the carriage return of the end marker line is swallowed into the block', BLOCK, "text[end - 1] === '\\r' ? end - 1 : end", 'end'],
  ['a missing block is reported as stale', BLOCK, "if (where === undefined) return 'missing';", ''],
  ['a stale block is reported as ok', BLOCK, "? 'ok' : 'stale'", "? 'ok' : 'ok'"],
  ['the hand text before the block is dropped on replace', BLOCK, 'text.slice(0, where.start) + block + text.slice(where.end)', 'block + text.slice(where.end)'],
  ['the hand text after the block is dropped on replace', BLOCK, 'text.slice(0, where.start) + block + text.slice(where.end)', 'text.slice(0, where.start) + block'],
  ['an appended block is not separated from hand text', BLOCK, "(text.endsWith('\\n') ? text : text + eol) + eol", 'text'],
  ['an empty file gets a leading blank line', BLOCK, "text.length === 0 ? '' : ", 'false ? "" : '],

  // --- clone.mjs
  ['the shared file is taken from the worktree git dir, not the common one', CLONE, "'--git-common-dir'", "'--git-dir'"],
  ['tracked files are no longer filtered to the ones the patterns match', CLONE, "'-c', '-i', '-X'", "'-c', '-X'"],
  ['the empty tail of the listing counts as a tracked match', CLONE, '.filter((entry) => entry.length > 0)', ''],

  // --- provision.mjs
  ['a tracked match no longer blocks the write', PROVISION, 'if (conflicts.length > 0)', 'if (false)'],
  ['--check writes the block', PROVISION, "if (mode === 'check') return { status: state, file };", ''],
  ['an up-to-date file is rewritten and reported as written', PROVISION, "if (after === before) return { status: 'unchanged', file, alreadyByHand };", ''],
  ['--dry-run writes', PROVISION, "if (mode === 'dry-run') return", 'if (false) return'],
  ['the info directory is not created', PROVISION, 'mkdirSync(path.dirname(file), { recursive: true });', ''],
  ['every pattern is reported as listed by hand', PROVISION, 'handLines.has(pattern)', 'true'],

  // --- cli.mjs
  ['two flags are accepted', CLI, 'flags.length > 1 || ', ''],
  ['no repository, or two, is accepted', CLI, ' || repos.length !== 1', ''],
  ['--check on a missing or stale block exits 0', CLI, "result.status === 'stale' || result.status === 'missing' ? 1 : 0", '0'],
  ['a conflict exits 0', CLI, "out.error(`The clone TRACKS files the list would match; nothing written: ${result.conflicts.join(', ')}. @es El clon VERSIONA ficheros que la lista coincidiría; no se escribió nada.`);\n\n    return 2;", "out.error(`The clone TRACKS files the list would match; nothing written: ${result.conflicts.join(', ')}. @es El clon VERSIONA ficheros que la lista coincidiría; no se escribió nada.`);\n\n    return 0;"],
  ['a git failure exits 0', CLI, '@es ai-exclusion falló.`);\n\n    return 2;', '@es ai-exclusion falló.`);\n\n    return 0;']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['ai-exclusion', 'mutation-proof'],
  selftest: 'ai-exclusion/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
