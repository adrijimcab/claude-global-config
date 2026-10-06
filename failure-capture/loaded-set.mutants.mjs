#!/usr/bin/env node
/**
 * The decisions of the loaded-set walk, each broken once, that `loaded-set.selftest.mjs` must catch. The runner
 * and its rules live in `../mutation-proof/run-mutants.mjs`. A blind spot here measures the budget on a set the
 * harness does not load.
 *
 * @es Las decisiones del recorrido del conjunto cargado, rotas una a una. Un punto ciego aquí mide el
 * presupuesto sobre un conjunto que el harness no carga.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FILE = 'failure-capture/loaded-set.mjs';
const SEEN = 'if (seen.has(key) || depth >= MAX_DEPTH) return;';
const NO_CONTENT = "if (instructionContent(text).trim() === '') return;";
const MISSING = 'if (importedBy !== undefined) missing.push({ file, importedBy });';
const GLOBS = 'return globs.some((glob) => glob !== ALL_PATHS);';

const MUTANTS = [
  // --- what is loaded, and in which order
  ['the user CLAUDE.md is not loaded', FILE, "load(path.join(home, '.claude', 'CLAUDE.md'), 0);", ''],
  ['the user rules are not loaded', FILE, "loadRules(path.join(home, '.claude', 'rules'));", ''],
  ['a directory CLAUDE.md is not loaded', FILE, "load(path.join(directory, 'CLAUDE.md'), 0);", ''],
  ['a directory .claude/CLAUDE.md is not loaded', FILE, "load(path.join(directory, '.claude', 'CLAUDE.md'), 0);", ''],
  ['a directory rules folder is not loaded', FILE, "loadRules(path.join(directory, '.claude', 'rules'));", ''],
  ['CLAUDE.local.md is not loaded', FILE, "load(path.join(directory, 'CLAUDE.local.md'), 0);", ''],
  ['the directories are walked bottom-up', FILE, 'chain.unshift(directory);', 'chain.push(directory);'],
  ['the walk ignores the ceiling', FILE, 'if (keyOf(directory) === keyOf(ceiling)) break;', ''],
  ['the walk stops above the ceiling', FILE, 'if (keyOf(directory) === keyOf(ceiling)) break;\n  }', 'if (keyOf(directory) === keyOf(ceiling)) break;\n    chain.pop();\n  }'],
  ['a rules folder is not walked into subfolders', FILE, 'if (entry.isDirectory()) return rulesIn(full);', ''],
  ['a rule of any extension is loaded', FILE, 'entry.isFile() && entry.name.endsWith(\'.md\')', 'entry.isFile()'],
  ['rules are listed in the order the filesystem gives', FILE, '.sort((left, right) => (left.name < right.name ? -1 : 1))', ''],
  ['rules are listed in reverse order', FILE, '(left.name < right.name ? -1 : 1)', '(left.name < right.name ? 1 : -1)'],

  // --- path-scoped rules
  ['path-scoped rules are loaded', FILE, "if (!isPathScoped(text ?? '')) load(rule, 0);", 'load(rule, 0);'],
  ['a paths key inside another key counts', FILE, 'line.startsWith(PATHS_KEY)', 'item.startsWith(PATHS_KEY)'],
  ['a list item outside the paths key counts', FILE, 'else if (listing && item.startsWith(\'- \'))', 'else if (item.startsWith(\'- \'))'],
  ['the paths list never ends', FILE, '    } else {\n      listing = false;\n    }', '    }'],
  ['an empty paths value is scoped', FILE, GLOBS, 'return entries.length > 0;'],
  ['a paths value of everything is scoped', FILE, GLOBS, 'return globs.length > 0;'],
  ['a mix with everything is not scoped', FILE, GLOBS, 'return globs.every((glob) => glob !== ALL_PATHS);'],
  ['quotes stay on a paths entry', FILE, 'const bare = quoted ? trimmed.slice(1, -1) : trimmed;', 'const bare = trimmed;'],
  ['a trailing /** stays on a paths entry', FILE, 'return bare.endsWith(ALL_BELOW) ? bare.slice(0, -ALL_BELOW.length) : bare;', 'return bare;'],
  ['a quote is stripped from an unterminated entry', FILE, 'trimmed.length >= 2 && \'"\\\'\'.includes(trimmed[0]) && trimmed.endsWith(trimmed[0])', 'trimmed.length >= 1 && \'"\\\'\'.includes(trimmed[0])'],

  // --- imports, dedupe, depth, content
  ['a path already loaded is loaded again', FILE, SEEN, 'if (depth >= MAX_DEPTH) return;'],
  ['the depth limit is not applied', FILE, SEEN, 'if (seen.has(key)) return;'],
  ['the depth limit is one level too deep', FILE, SEEN, 'if (seen.has(key) || depth > MAX_DEPTH) return;'],
  ['the depth limit is 4', FILE, 'const MAX_DEPTH = 5;', 'const MAX_DEPTH = 4;'],
  ['the depth limit is 6', FILE, 'const MAX_DEPTH = 5;', 'const MAX_DEPTH = 6;'],
  ['a path is remembered only after it is read', FILE, 'seen.add(key);\n', ''],
  ['paths are remembered in the case they were spelled', FILE, 'path.resolve(file).toLowerCase()', 'path.resolve(file)'],
  ['imports are not followed', FILE, 'for (const target of importTargets(text, file, home)) load(target, depth + 1, file);', ''],
  ['imports are followed at the same depth', FILE, 'load(target, depth + 1, file);', 'load(target, depth, file);'],
  ['imports resolve against the home', FILE, 'importTargets(text, file, home)', 'importTargets(text, path.join(home, \'x\'), home)'],
  ['a file with no content is listed', FILE, NO_CONTENT, ''],
  ['a file with no content is judged on its raw text', FILE, NO_CONTENT, "if (text.trim() === '') return;"],

  // --- missing files
  ['a missing import is not reported', FILE, MISSING, ''],
  ['an absent optional file is reported missing', FILE, MISSING, 'missing.push({ file, importedBy });'],
  ['a missing import is reported against the wrong file', FILE, 'missing.push({ file, importedBy });', 'missing.push({ file: importedBy, importedBy: file });'],
  ['a missing file stops the walk', FILE, '    if (text === undefined) {', '    if (text === undefined) {\n      throw new Error(file);'],

  // --- lengths and totals
  ['raw is the counted length', FILE, 'raw: text.length', 'raw: countedLength(text)'],
  ['counted is the raw length', FILE, 'counted: countedLength(text)', 'counted: text.length'],
  ['the raw total sums the counted lengths', FILE, 'rawTotal: files.reduce((sum, file) => sum + file.raw, 0)', 'rawTotal: files.reduce((sum, file) => sum + file.counted, 0)'],
  ['the counted total sums the raw lengths', FILE, 'countedTotal: files.reduce((sum, file) => sum + file.counted, 0)', 'countedTotal: files.reduce((sum, file) => sum + file.raw, 0)'],
  ['the raw total misses the first file', FILE, 'rawTotal: files.reduce((sum, file) => sum + file.raw, 0)', 'rawTotal: files.slice(1).reduce((sum, file) => sum + file.raw, 0)'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'failure-capture/loaded-set.selftest.mjs',
  mutants: MUTANTS,
});

process.exit(survivors === 0 ? 0 : 1);
