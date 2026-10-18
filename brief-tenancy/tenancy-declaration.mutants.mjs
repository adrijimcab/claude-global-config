#!/usr/bin/env node
/**
 * The decisions of `tenancy-declaration.mjs`, each broken once, that `tenancy-declaration.selftest.mjs` must
 * catch. The runner (`../mutation-proof/run-mutants.mjs`) mutates a COPY, refuses a target that is not
 * exactly once, a mutant that does not parse and a red baseline, so every kill is on the named decision.
 *
 * The first mutant is the defect itself, restored: the substring test over the whole declaration that
 * credited every checkout a TENANCY line mentioned, measured 2026-10-18 by the master session.
 *
 * @es Las decisiones de `tenancy-declaration.mjs`, rotas una a una, que su selftest debe cazar. El primer
 * mutante es el defecto mismo, restaurado: la prueba por subcadena sobre toda la declaración, que acreditaba
 * todo checkout mencionado en una línea TENANCY (medido el 2026-10-18 por la sesión maestra).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FILE = 'brief-tenancy/tenancy-declaration.mjs';
const SEPARATORS = "const WORD_SEPARATORS = ' \\t,;()[]{}\"\\'`';";
const separatorsWithout = (dropped) => SEPARATORS.split(dropped).join('');

const MUTANTS = [
  // --- THE DEFECT: a name is credited by substring, anywhere on the line.
  ['the substring test over the whole declaration is restored (the 2026-10-18 defect)', FILE, '  const words = wordsOf(declaration);', '  return declaration.toLowerCase().includes(name);\n  const words = wordsOf(declaration);'],

  // --- WHO DECLARES: paths alone when the line holds one, bare words otherwise.
  ['bare words declare on a line that holds a path too', FILE, 'if (paths.length > 0) return paths.some((path) => checkoutName(path) === name);', 'if (paths.some((path) => checkoutName(path) === name)) return true;'],
  ['a path must equal the checkout name whole, not by its last segment', FILE, 'paths.some((path) => checkoutName(path) === name)', 'paths.some((path) => path === name)'],
  ['a path-free line declares nothing', FILE, '  return words.includes(name);', '  return false;'],

  // --- WHAT A PATH IS: absolute, or under `worktrees`.
  ['every word with a slash is a path, so a branch name declares', FILE, "return absolute || (word.includes('/') && word.split('/').includes('worktrees'));", "return absolute || word.includes('/');"],
  ['a relative path under `worktrees` is not a path', FILE, "return absolute || (word.includes('/') && word.split('/').includes('worktrees'));", 'return absolute;'],
  ['the bare word `worktrees` is a path', FILE, "(word.includes('/') && word.split('/').includes('worktrees'))", "word.split('/').includes('worktrees')"],
  ['a segment merely containing `worktrees` makes a path', FILE, "word.split('/').includes('worktrees')", "word.includes('worktrees')"],
  ['a drive-letter path is not a path', FILE, "(LETTERS.includes(word.charAt(0)) && word.slice(1, 3) === ':/') || ", ''],
  ['any character before `:/` is a drive letter', FILE, "(LETTERS.includes(word.charAt(0)) && word.slice(1, 3) === ':/')", "word.slice(1, 3) === ':/'"],
  ['a bare drive `C:` is a path', FILE, "word.slice(1, 3) === ':/'", "word.charAt(1) === ':'"],
  ['a rooted path is not a path', FILE, " || word.startsWith('/')", ''],
  ['a home-relative path is not a path', FILE, " || word.startsWith('~')", ''],

  // --- HOW WORDS ARE CUT: the separators, the trailing period, the spellings.
  ['a tab does not separate words', FILE, SEPARATORS, separatorsWithout('\\t')],
  ['a comma does not separate words', FILE, SEPARATORS, separatorsWithout(',')],
  ['a semicolon does not separate words', FILE, SEPARATORS, separatorsWithout(';')],
  ['parentheses do not separate words', FILE, SEPARATORS, separatorsWithout('()')],
  ['brackets do not separate words', FILE, SEPARATORS, separatorsWithout('[]')],
  ['braces do not separate words', FILE, SEPARATORS, separatorsWithout('{}')],
  ['double quotes do not separate words', FILE, SEPARATORS, separatorsWithout('"')],
  ['single quotes do not separate words', FILE, SEPARATORS, separatorsWithout("\\'")],
  ['backticks do not separate words', FILE, SEPARATORS, separatorsWithout('`')],
  ['a trailing period stays on the word', FILE, "  return spaced.split(' ').map(trimPeriods);", "  return spaced.split(' ');"],
  ['backslash paths are not spelled as slash paths', FILE, "  let spaced = declaration.toLowerCase().split(BACKSLASH).join('/');", '  let spaced = declaration.toLowerCase();'],
  ['the declaration is not lower-cased', FILE, "  let spaced = declaration.toLowerCase().split(BACKSLASH).join('/');", "  let spaced = declaration.split(BACKSLASH).join('/');"],
  ['a backslash checkout is not spelled as a slash path', FILE, "checkoutName(checkout.toLowerCase().split(BACKSLASH).join('/'))", 'checkoutName(checkout.toLowerCase())'],
  ['the checkout is not lower-cased', FILE, "checkoutName(checkout.toLowerCase().split(BACKSLASH).join('/'))", "checkoutName(checkout.split(BACKSLASH).join('/'))"],

  // --- THE LINE AND ITS STATES: what a marker line is, and the five answers.
  ['the qualifier before the colon declares too', FILE, 'if (declares(rest.slice(colon + 1), name))', 'if (declares(rest, name))'],
  ['a line without a colon is read as a declaration', FILE, '    if (colon === -1) continue;\n', '\n'],
  ['a marker buried in a sentence heads a line', FILE, 'if (!line.startsWith(TENANCY_WORD)) continue;', 'if (!line.includes(TENANCY_WORD)) continue;'],
  ['the prefix-word test is dropped, so TENANCYWISE: declares', FILE, 'if (rest.length > 0 && LETTERS.includes(rest.charAt(0))) continue;', ''],
  ['list markup is not stripped, so a bullet is not a heading', FILE, 'while (index < line.length && isLead(line.charAt(index))) index += 1;', ''],
  ['a CR stays on the line', FILE, "stripLead(rawLine.split('\\r').join(''))", 'stripLead(rawLine)'],
  ['`unnamed` is reported as `no-colon`', FILE, "if (sawColon) return 'unnamed';", "if (sawColon) return 'no-colon';"],
  ['`no-colon` is reported as `buried`', FILE, "if (headsALine) return 'no-colon';", "if (headsALine) return 'buried';"],
  ['a buried marker is reported as absent', FILE, "return text.includes(TENANCY_WORD) ? 'buried' : 'absent';", "return 'absent';"],
  ['a trailing slash leaves an empty last segment', FILE, "checkout.split('/').filter((segment) => segment.length > 0)", "checkout.split('/')"],
  ['a path with no segment yields no name', FILE, 'segments.length === 0 ? checkout : segments[segments.length - 1]', 'segments[segments.length - 1]']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  selftest: 'brief-tenancy/tenancy-declaration.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
