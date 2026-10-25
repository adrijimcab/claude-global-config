#!/usr/bin/env node
/**
 * The decisions of the pure readers of `commit-index-guard` — the option table of `git commit`, the records of
 * `git status --porcelain -z`, the quoting of a path and the texts — each broken once, that `parse.selftest.mjs`
 * must catch. The runner and its rules (green unmutated baseline, exactly-once target, parse check) live in
 * `../mutation-proof/run-mutants.mjs`. Each row names the DECISION it removes, not the line it edits.
 *
 * @es Las decisiones de los lectores puros de `commit-index-guard` (la tabla de opciones de `git commit`, los
 * registros de `git status`, el entrecomillado de una ruta y los textos), rotas una a una, que
 * `parse.selftest.mjs` debe cazar. Cada fila nombra la DECISIÓN que elimina, no la línea que edita.
 */

import { runCampaign } from './campaign.mjs';

const PARSE = 'commit-index-guard/commit-paths.mjs';
const STATUS = 'commit-index-guard/index-state.mjs';
const TEXT = 'commit-index-guard/messages.mjs';

/** Long options that take a value, in the source's order: each is removed once. @es Opciones largas con valor, en el orden de la fuente. */
const LONG_OPTIONS = ['--message', '--file', '--reedit-message', '--reuse-message', '--template', '--author', '--date', '--fixup', '--squash', '--cleanup', '--trailer', '--unified', '--inter-hunk-context'];

const longOptionRows = LONG_OPTIONS.map((name, index) => [
  `${name} is no longer an option that takes a value, so its value is read as a path`,
  PARSE,
  index === LONG_OPTIONS.length - 1 ? `, '${name}'` : `'${name}', `,
  ''
]);

/** The characters a plain path may hold: each group is removed once from the set that needs no quoting. @es Los caracteres de una ruta simple. */
const PLAIN_SET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./@%+=:,-';
const PLAIN_GROUPS = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', ...'_./@%+=:,-'];

const plainRows = PLAIN_GROUPS.map((removed) => [`a plain path holding "${removed}" is quoted in the suggested command`, TEXT, PLAIN_SET, PLAIN_SET.replace(removed, '')]);

const MUTANTS = [
  // --- what a commit names.
  ['a lone `-` is read as an option, not a path', PARSE, " || word === '-') {", ') {'],
  ['a word after `--` is read as an option when it starts with a dash', PARSE, 'if (afterSeparator || !word.startsWith', 'if (!word.startsWith'],
  ['`--` is no longer the separator', PARSE, 'if (word === SEPARATOR) {', 'if (false) {'],
  ['the value of -m is read as a path', PARSE, "new Set(['m', 'F', 'c', 'C', 't'])", "new Set(['F', 'c', 'C', 't'])"],
  ['the value of -F is read as a path', PARSE, "new Set(['m', 'F', 'c', 'C', 't'])", "new Set(['m', 'c', 'C', 't'])"],
  ['the value of -c is read as a path', PARSE, "new Set(['m', 'F', 'c', 'C', 't'])", "new Set(['m', 'F', 'C', 't'])"],
  ['the value of -C is read as a path', PARSE, "new Set(['m', 'F', 'c', 'C', 't'])", "new Set(['m', 'F', 'c', 't'])"],
  ['the value of -t is read as a path', PARSE, "new Set(['m', 'F', 'c', 'C', 't'])", "new Set(['m', 'F', 'c', 'C'])"],
  ['-S no longer ends a cluster, so a later letter takes the next word', PARSE, "new Set(['S', 'u'])", "new Set(['u'])"],
  ['-u no longer ends a cluster, so a later letter takes the next word', PARSE, "new Set(['S', 'u'])", "new Set(['S'])"],
  ['a value letter in the middle of a cluster takes the next word', PARSE, 'return index === cluster.length - 1 ? 1 : 0;', 'return 1;'],
  ['a value letter at the end of a cluster takes nothing', PARSE, 'return index === cluster.length - 1 ? 1 : 0;', 'return 0;'],
  ['a letter after a value letter is still read as a flag', PARSE, 'if (SHORT_WITH_VALUE.has(cluster[index]) || SHORT_WITH_OPTIONAL_VALUE.has(cluster[index])) return false;', ''],
  ['--all is not read', PARSE, "if (word === '--all') read.all = true;", ''],
  ['--include is not read', PARSE, "if (word === '--include') read.include = true;", ''],
  ['--dry-run is not read', PARSE, "if (word === '--dry-run') read.dryRun = true;", ''],
  ['--no-dry-run does not cancel --dry-run', PARSE, "if (word === '--no-dry-run') read.dryRun = false;", ''],
  ['--pathspec-from-file is not reported', PARSE, "if (word.startsWith('--pathspec-from-file')) read.fromFile = true;", ''],
  ['-a in a cluster is not read', PARSE, "if (clusterHas(word, 'a')) read.all = true;", ''],
  ['-i in a cluster is not read', PARSE, "if (clusterHas(word, 'i')) read.include = true;", ''],
  ['an abbreviated long option no longer takes its value', PARSE, 'name.startsWith(word)', 'name === word'],
  ...longOptionRows,

  // --- how the status records are read.
  ['untracked and ignored paths count as stale', STATUS, 'if (UNTRACKED_CODES.has(code)) continue;', ''],
  ['the origin of a worktree rename is read as a path', STATUS, 'if (ORIGIN_CODES.has(code[0]) || ORIGIN_CODES.has(code[1])) index += 1;', 'if (ORIGIN_CODES.has(code[0])) index += 1;'],
  ['the origin of a staged rename is read as a path', STATUS, 'if (ORIGIN_CODES.has(code[0]) || ORIGIN_CODES.has(code[1])) index += 1;', 'if (ORIGIN_CODES.has(code[1])) index += 1;'],
  ['a one-letter path is dropped', STATUS, 'if (record.length < 4) continue;', 'if (record.length < 5) continue;'],
  ['the path starts at the wrong column', STATUS, 'path: record.slice(3)', 'path: record.slice(2)'],
  ['a path stale in only one column counts as a disagreement of both', STATUS, "code[0] !== ' ' && code[1] !== ' '", "code[0] !== ' ' || code[1] !== ' '"],
  ['a path staged-only counts as a disagreement of both', STATUS, "code[0] !== ' ' && code[1] !== ' '", "code[1] !== ' '"],
  ['a path worktree-only counts as a disagreement of both', STATUS, "code[0] !== ' ' && code[1] !== ' '", "code[0] !== ' '"],

  // --- the texts.
  ['the notice loses its Spanish mirror', TEXT, "'@es COMMIT-INDEX GUARD: el commit salió bien", "'COMMIT-INDEX GUARD: el commit salió bien"],
  ['the refusal loses its Spanish mirror', TEXT, "'@es COMMIT-INDEX GUARD RECHAZÓ este commit", "'COMMIT-INDEX GUARD RECHAZÓ este commit"],
  ['the notice stops saying nothing is discarded', TEXT, "'NEXT STEP, pick one (nothing here is to be discarded; do NOT restore, checkout or reset these paths):',", ''],
  ['the Spanish notice stops saying nothing is discarded', TEXT, "'SIGUIENTE PASO, elige uno (aquí no se descarta nada; NO uses restore, checkout ni reset sobre estas rutas):',", ''],
  ['the refusal stops saying nothing is discarded', TEXT, "'Do NOT restore, checkout or reset these paths: that would throw the hook\\'s rewrite away.',", ''],
  ['the Spanish refusal stops saying nothing is discarded', TEXT, "'NO uses restore, checkout ni reset sobre estas rutas: tiraría la reescritura del hook.'", "''"],
  ['the notice stops offering the diff', TEXT, '`  1. review the rewrite:  git diff -- ${words(entries)}   (and git diff --cached -- ... for the staged side)`,', ''],
  ['the Spanish notice stops offering the diff', TEXT, '`  1. revisar la reescritura:  git diff -- ${words(entries)}   (y git diff --cached -- ... para el lado en stage)`,', ''],
  ['the notice stops offering its own commit', TEXT, '`  2. commit it as its own change:  git commit -m "<type(scope): description>" -- ${words(entries)}`,', ''],
  ['the Spanish notice stops offering its own commit', TEXT, '`  2. commitearla como un cambio propio:  git commit -m "<tipo(ámbito): descripción>" -- ${words(entries)}`,', ''],
  ['the notice stops offering git add', TEXT, '`  3. or stage it before the next commit:  git add -- ${words(entries)}`,', ''],
  ['the Spanish notice stops offering git add', TEXT, '`  3. o ponerla en stage antes del próximo commit:  git add -- ${words(entries)}`,', ''],
  ['the notice stops warning that a bare commit is refused', TEXT, "'Until then a commit with no pathspec is refused in this repository: it would sweep the stale staged variant in.',", ''],
  ['the Spanish notice stops warning that a bare commit is refused', TEXT, "'Mientras tanto, un commit sin pathspec se rechaza en este repositorio: arrastraría la variante vieja en stage.'", "''"],
  ['the refusal stops offering its own commit', TEXT, '`  1. commit them as their own change:  git commit -m "<type(scope): description>" -- ${words(entries)}`,', ''],
  ['the Spanish refusal stops offering its own commit', TEXT, '`  1. commitearlas como un cambio propio:  git commit -m "<tipo(ámbito): descripción>" -- ${words(entries)}`,', ''],
  ['the refusal stops offering git add', TEXT, '`  2. stage the current content, then commit:  git add -- ${words(entries)}`,', ''],
  ['the Spanish refusal stops offering git add', TEXT, '`  2. poner en stage el contenido actual y luego commitear:  git add -- ${words(entries)}`,', ''],
  ['the refusal stops offering a commit of other paths', TEXT, "'  3. commit only the paths you mean:  git commit -m \"<type(scope): description>\" -- <paths>',", ''],
  ['the Spanish refusal stops offering a commit of other paths', TEXT, "'  3. commitear solo las rutas que quieres:  git commit -m \"<tipo(ámbito): descripción>\" -- <rutas>',", ''],
  ['a staged-only path is described as a worktree difference', TEXT, "if (code[0] !== ' ') return { en: 'the staged content differs from HEAD'", "if (false) return { en: 'the staged content differs from HEAD'"],
  ['an MM path is described as a one-column difference', TEXT, "if (code[0] !== ' ' && code[1] !== ' ') return", 'if (false) return'],
  ['an empty path is not quoted', TEXT, 'candidate.length > 0 && [...candidate].every', 'candidate.length >= 0 && [...candidate].every'],
  ['a quote inside a path is not closed and reopened', TEXT, `candidate.split("'").join("'\\\\''")`, 'candidate'],
  ...plainRows
];

runCampaign({ selftest: 'commit-index-guard/parse.selftest.mjs', paths: ['commit-index-guard', 'mutation-proof'], mutants: MUTANTS });
