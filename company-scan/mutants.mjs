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
const PATHS = 'company-scan/tool-paths.mjs';
const ATTRIBUTION = 'company-scan/attribution.mjs';

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
  ['the "more" line loses its Spanish half', FINDINGS, ' @es ... y ${more} más.`', '`'],
  ['a tool path is no longer a path finding', FINDINGS, '...toolPathTerms(path).map(', '...[].map('],
  ['a message is no longer checked for attribution', FINDINGS, 'return [...scanText(text, names, where), ...attributed];', 'return scanText(text, names, where);'],
  ['an attribution finding stops quoting its line', FINDINGS, '`(attribution) ${lines[hit.line - 1].trim().slice(0, EXCERPT_WIDTH)}`', "'(attribution)'"],

  // --- tool-paths.mjs: segment matching.
  ['path matching becomes case-sensitive', PATHS, 'path.toLowerCase().replaceAll', 'path.replaceAll'],
  ['a Windows separator is no longer read', PATHS, "replaceAll('\\\\', '/')", "replaceAll('\\\\', '\\\\')"],
  ['a directory term also matches the last segment (a file)', PATHS, 'segments.slice(0, last).includes(directory)', 'segments.includes(directory)'],
  ['a directory term needs no whole segment (substring of the path)', PATHS, 'segments.slice(0, last).includes(directory)', 'lowered.includes(directory)'],
  ['a file name matches as a mere suffix of the path', PATHS, 'segments[last] === file', 'lowered.endsWith(file)'],
  ['a file name matches at any segment, not only the last', PATHS, 'segments[last] === file', 'segments.includes(file)'],
  ['a segment prefix matches anywhere inside the segment', PATHS, 'segment.startsWith(prefix)', 'segment.includes(prefix)'],
  ['a segment suffix matches anywhere inside the segment', PATHS, 'segment.endsWith(suffix)', 'segment.includes(suffix)'],
  ['a path fragment is searched only in the file name', PATHS, 'lowered.includes(fragment)', 'segments[last].includes(fragment)'],
  ['the directory list loses .windsurf', PATHS, "'.windsurf', ", ''],
  ['the directory list loses agent-lifecycle', PATHS, ", 'agent-lifecycle']", ']'],
  ['the file list loses gemini.md', PATHS, ", 'gemini.md']", ']'],
  ['the prefix list loses agent-ledger', PATHS, ", 'agent-ledger']", ']'],
  ['the suffix list is empty', PATHS, "SEGMENT_SUFFIXES = ['.cursorrules']", 'SEGMENT_SUFFIXES = []'],
  ['the fragment list loses agent-contract', PATHS, ", 'agent-contract']", ']'],

  // --- attribution.mjs: phrases and term boundaries.
  ['the "generated with" phrase is dropped', ATTRIBUTION, "  ['generated', 'with'],\n", ''],
  ['the "cherrypicked from" phrase is dropped', ATTRIBUTION, ",\n  ['cherrypicked', 'from']", ''],
  ['the "co authored by" phrase is dropped', ATTRIBUTION, "  ['co', 'authored', 'by'],\n", ''],
  ['the robot emoji is no longer looked for', ATTRIBUTION, 'text.includes(ROBOT_FACE)', 'false'],
  ['the robot emoji line is off by one', ATTRIBUTION, 'line: index + 1 }] : []', 'line: index }] : []'],
  ['words of a phrase may be separated by anything', ATTRIBUTION, "term.gapBefore.trim() === ''", 'true'],
  ['the phrase length is not checked, so a longer compound matches', ATTRIBUTION, 'parts.length === phrase.length && ', ''],
  ['the joiners at a term edge are kept in the term, not in the gap', ATTRIBUTION, 'gap + leading', 'gap'],
  ['trailing joiners no longer go to the gap of the next term', ATTRIBUTION, 'gap = run.slice(leading.length + text.length);', "gap = '';"],
  ['line breaks inside a gap are not counted', ATTRIBUTION, "line += run.split('\\n').length - 1;", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['company-scan', 'company-config', 'mutation-proof'],
  selftest: 'company-scan/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
