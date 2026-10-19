#!/usr/bin/env node
/**
 * The decisions of the import reader, each broken once, that `instruction-imports.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here loads a file the harness
 * does not, or misses one it does, so the budget is measured on the wrong set.
 *
 * @es Las decisiones del lector de imports, rotas una a una. Un punto ciego aquí carga un fichero que el harness
 * no carga, o pierde uno que sí, y el presupuesto se mide sobre el conjunto equivocado.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FILE = 'failure-capture/instruction-imports.mjs';
const SCANNABLE = 'const scannable = fence === undefined && fenceAfter(undefined, line) === undefined;';
const EXTENSION = 'TEXT_EXTENSIONS.has(path.extname(target).toLowerCase()) || path.extname(target) === \'\'';

const MUTANTS = [
  // --- which @ starts an import
  ['an @ glued to a word starts an import', FILE, '(index > 0 && !isBlank(line[index - 1]))', 'false'],
  ['an @ at the start of the line is not looked at for a blank before it', FILE, 'index > 0 && ', ''],
  ['an escaped space ends the path', FILE, 'line.startsWith(ESCAPED_SPACE, end)', 'false'],
  ['a lone backslash stays in the path', FILE, " && line[end] !== '\\\\'", ''],
  ['the fragment is not cut', FILE, 'raw.split(FRAGMENT_MARK)[0]', 'raw'],

  // --- which words are paths
  ['a home path is not an import', FILE, "if (word.startsWith('~/')) return true;", ''],
  ['an absolute path is not an import', FILE, "if (word.startsWith('/')) return word !== '/';", ''],
  ['a lone slash is an import', FILE, "return word !== '/';", 'return true;'],
  ['a path may start with any character', FILE, 'return PATH_START.includes(word[0]);', 'return true;'],

  // --- resolution and extension
  ['a home path is resolved against the importing directory', FILE, 'path.join(home, word.slice(2))', 'path.resolve(path.dirname(importer), word.slice(2))'],
  ['a relative path is resolved against the working directory', FILE, 'path.resolve(path.dirname(importer), word)', 'path.resolve(word)'],
  ['a relative path is resolved against the home', FILE, 'path.resolve(path.dirname(importer), word)', 'path.resolve(home, word)'],
  ['every extension is loaded', FILE, EXTENSION, 'true'],
  ['a path without an extension is not loaded', FILE, " || path.extname(target) === ''", ''],
  ['an extension is compared in its own case', FILE, 'path.extname(target).toLowerCase()', 'path.extname(target)'],
  ['imports come in reverse order', FILE, 'return [...targets];', 'return [...targets].reverse();'],
  ['imports come sorted', FILE, 'return [...targets];', 'return [...targets].sort();'],

  // --- what is not scanned
  ['fenced code is scanned', FILE, SCANNABLE, 'const scannable = true;'],
  ['lines inside a fence are scanned', FILE, SCANNABLE, 'const scannable = fenceAfter(undefined, line) === undefined;'],
  ['a fence opener line is scanned', FILE, SCANNABLE, 'const scannable = fence === undefined;'],
  ['the fence is never tracked', FILE, 'fence = fenceAfter(fence, line);', 'fence = undefined;'],
  ['code spans are scanned', FILE, 'importWords(withoutCodeSpans(line))', 'importWords(line)'],
  ['a backtick that opens no span is dropped', FILE, "kept += close === -1 ? BACKTICK.repeat(length) : '';", "kept += '';"],
  ['a span closes on any backtick', FILE, 'nextRunOf(line, index + length, length)', 'line.indexOf(BACKTICK, index + length)'],
  ['a span closes on a run at least as long', FILE, 'if (backtickRun(line, at) === length) return at;', 'if (backtickRun(line, at) >= length) return at;'],
  ['the search for a closing run steps one char into a longer run', FILE, 'at + backtickRun(line, at))', 'at + 1)'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'agent-contract-parity', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'failure-capture/instruction-imports.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
