#!/usr/bin/env node
/**
 * The decisions of company-scan, each broken once, that `selftest.mjs` must catch.
 * @es Las decisiones de company-scan, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DIFF = 'company-scan/diff-added.mjs';
const FINDINGS = 'company-scan/findings.mjs';

const MUTANTS = [
  // --- diff-added.mjs
  ['a hunk header with no count is read as zero lines', DIFF, 'count === undefined ? 1 : Number(count)', 'count === undefined ? 0 : Number(count)'],
  ['the "b/" prefix stays on the path', DIFF, "return named.startsWith('b/') ? named.slice(2) : named;", 'return named;'],
  ['the trailing tab of a header stays on the path', DIFF, "line.slice(4).split('\\t')[0]", 'line.slice(4)'],
  ['added lines no longer count down the hunk, so the hunk never ends', DIFF, 'remainingNew -= 1;', ''],
  ['removed lines no longer count down the hunk', DIFF, 'remainingOld -= 1;', ''],
  ['the line number does not advance', DIFF, 'nextLine += 1;', ''],
  ['the line number starts at 1 instead of the hunk start', DIFF, 'nextLine = newRange.start;', 'nextLine = 1;'],
  ['the hunk length is no longer taken from the header (a "+++" lookalike ends it)', DIFF, 'remainingNew = newRange.count;', 'remainingNew = 0;'],
  ['the commit marker keeps its NUL character', DIFF, 'commit = line.slice(1).trim();', 'commit = line;'],
  ['added lines lose their commit', DIFF, 'added.push({ commit, path, line: nextLine, text: line.slice(1) });', 'added.push({ path, line: nextLine, text: line.slice(1) });'],
  ['blank lines of a name listing become paths', DIFF, 'else if (line.length > 0) found.push', 'else found.push'],
  ['the commit marker of a name listing keeps its NUL character', DIFF, "if (raw.startsWith('\\u0000')) commit = line.slice(1);", "if (raw.startsWith('\\u0000')) commit = line;"],

  // --- findings.mjs
  ['a long line is no longer cut', FINDINGS, 'line.length > EXCERPT_WIDTH ? ', 'false ? '],
  ['the excerpt starts at the beginning of the whole text, not of the line', FINDINGS, "text.lastIndexOf('\\n', index - 1) + 1", '0'],
  ['the excerpt runs to the end of the whole text, not of the line', FINDINGS, 'text.slice(start, end === -1 ? text.length : end)', 'text.slice(start)'],
  ['an added-line finding drops its line number', FINDINGS, '`${entry.path}:${entry.line}`', 'entry.path'],
  ['a path finding no longer says it is a path', FINDINGS, 'excerpt: `(path) ${finding.excerpt}`', 'excerpt: finding.excerpt'],
  ['the rendered list is no longer capped', FINDINGS, 'const shown = findings.slice(0, limit);', 'const shown = findings;'],
  ['the "more" line is never added', FINDINGS, 'if (more > 0) lines.push', 'if (false) lines.push'],
  ['the "more" line loses its Spanish half', FINDINGS, ' @es ... y ${more} más.`', '`']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['company-scan', 'company-config', 'mutation-proof'],
  selftest: 'company-scan/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
