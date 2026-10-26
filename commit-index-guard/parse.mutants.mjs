#!/usr/bin/env node
/**
 * The decisions of the pure readers of `commit-index-guard` — the option table of `git commit`, the records of
 * `git status --porcelain=v2 -z`, the pathspec file, the quoting of a path and the texts — each broken once,
 * that `parse.selftest.mjs` must catch. The runner and its rules (green unmutated baseline, exactly-once target,
 * parse check) live in `../mutation-proof/run-mutants.mjs`. Each row names the DECISION it removes, not the line
 * it edits.
 *
 * @es Las decisiones de los lectores puros de `commit-index-guard` (la tabla de opciones de `git commit`, los
 * registros de `git status --porcelain=v2 -z`, el fichero de pathspec, el entrecomillado de una ruta y los
 * textos), rotas una a una, que `parse.selftest.mjs` debe cazar. Cada fila nombra la DECISIÓN que elimina.
 */

import { runCampaign } from './campaign.mjs';

const PARSE = 'commit-index-guard/commit-paths.mjs';
const STATUS = 'commit-index-guard/index-state.mjs';
const FILE = 'commit-index-guard/pathspec-file.mjs';
const TEXT = 'commit-index-guard/messages.mjs';

/** Long options that take a value, in the source's order: each is removed once. @es Opciones largas con valor, en el orden de la fuente. */
const VALUE_OPTIONS = ['file', 'author', 'date', 'message', 'reedit-message', 'reuse-message', 'fixup', 'squash', 'trailer', 'template', 'cleanup', 'unified', 'inter-hunk-context', 'pathspec-from-file'];

/** Long options that take no value, in the source's order: each is removed once. @es Opciones largas sin valor, en el orden de la fuente. */
const FLAG_OPTIONS = ['quiet', 'verbose', 'reset-author', 'signoff', 'edit', 'status', 'gpg-sign', 'all', 'include', 'interactive', 'patch', 'only', 'verify', 'dry-run', 'short', 'branch', 'ahead-behind', 'porcelain', 'long', 'null', 'amend', 'allow-empty', 'allow-empty-message', 'post-rewrite', 'untracked-files', 'pathspec-file-nul'];

/** The row that removes the `index`-th name of a list written `'a', 'b', 'c'`. @es La fila que quita el nombre `index` de una lista. */
const withoutName = (names, index, label) => [`--${names[index]} is not an option git commit knows (${label})`, PARSE, index === names.length - 1 ? `, '${names[index]}'])` : `'${names[index]}', `, index === names.length - 1 ? '])' : ''];

const valueRows = VALUE_OPTIONS.map((_, index) => withoutName(VALUE_OPTIONS, index, 'value options'));
const flagRows = FLAG_OPTIONS.map((_, index) => withoutName(FLAG_OPTIONS, index, 'flags'));

/** The characters of a plain path: each group is removed once from the set that needs no quoting. @es Los caracteres de una ruta simple. */
const PLAIN_SET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_./@%+=:,-';
const PLAIN_GROUPS = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', ...'_./@%+=:,-'];

const plainRows = PLAIN_GROUPS.map((removed) => [`a plain path holding "${removed}" is quoted in the suggested command`, TEXT, PLAIN_SET, PLAIN_SET.replace(removed, '')]);

const MUTANTS = [
  // --- the short options.
  ...['m', 'F', 'c', 'C', 't', 'U'].map((letter) => [`the value of -${letter} is read as a path`, PARSE, "new Set(['m', 'F', 'c', 'C', 't', 'U'])", `new Set([${['m', 'F', 'c', 'C', 't', 'U'].filter((other) => other !== letter).map((other) => `'${other}'`).join(', ')}])`]),
  ['-S no longer ends a cluster, so a later letter takes the next word', PARSE, "new Set(['S', 'u'])", "new Set(['u'])"],
  ['-u no longer ends a cluster, so a later letter takes the next word', PARSE, "new Set(['S', 'u'])", "new Set(['S'])"],
  ['a value letter in the middle of a cluster takes the next word', PARSE, 'index === cluster.length - 1 ? 1 : 0;', '1;'],
  ['a value letter at the end of a cluster takes nothing', PARSE, 'index === cluster.length - 1 ? 1 : 0;', '0;'],
  ['an optional-value letter is read as a flag, so a letter after it is read too', PARSE, 'if (SHORT_WITH_OPTIONAL_VALUE.has(letter)) return 0;', ''],
  ['-a in a cluster is not read', PARSE, "if (letter === 'a') read.all = true;", ''],
  ['-i in a cluster is not read', PARSE, "if (letter === 'i') read.include = true;", ''],
  ['-o in a cluster is not read', PARSE, "if (letter === 'o') read.only = true;", ''],

  // --- the words.
  ['a lone `-` is read as an option, not a path', PARSE, " || word === '-') {", ') {'],
  ['a word after `--` is read as an option when it starts with a dash', PARSE, 'if (afterSeparator || !word.startsWith', 'if (!word.startsWith'],
  ['a word that does not start with a dash is not a path', PARSE, "|| !word.startsWith('-')", ''],
  ['`--` is no longer the separator', PARSE, '} else if (word === SEPARATOR) {', '} else if (false) {'],
  ['a long word is read as a short cluster', PARSE, "} else if (word.startsWith('--')) {", '} else if (false) {'],
  ['a long option consumes nothing', PARSE, 'index += readLong(read, args, index);', 'readLong(read, args, index);'],
  ['a short cluster consumes nothing', PARSE, 'index += readCluster(read, word);', 'readCluster(read, word);'],

  // --- the long options.
  ...valueRows,
  ...flagRows,
  ['the --no- form of the value options is not known', PARSE, '...LONG_WITH_VALUE.map((name) => `no-${name}`), ', ''],
  ['the --no- form of the flags is not known', PARSE, ', ...LONG_FLAGS.map((name) => `no-${name}`)]', ']'],
  ['an exact name no longer wins over longer names that start with it', PARSE, 'if (LONG_NAMES.includes(name)) return name;', ''],
  ['an ambiguous prefix is resolved to its first candidate', PARSE, 'candidates.length === 1 ? candidates[0] : undefined', 'candidates[0]'],
  ['a prefix is matched anywhere in the name', PARSE, 'candidate.startsWith(name)', 'candidate.includes(name)'],
  ['an unknown option is read as a switch', PARSE, 'if (name === undefined) return 0;', ''],
  ['a `=value` is part of the option name', PARSE, 'equals === -1 ? word.slice(2) : word.slice(2, equals)', 'word.slice(2)'],
  ['--no-pathspec-from-file does not forget the file', PARSE, "if (name === 'no-pathspec-from-file') read.pathspecFile = undefined;", ''],
  ['a value option is read as a switch', PARSE, 'if (!LONG_WITH_VALUE.includes(name)) {', 'if (true) {'],
  ['a fused value is never fused', PARSE, 'const fused = equals !== -1;', 'const fused = false;'],
  ['a separated value is read as fused', PARSE, 'const fused = equals !== -1;', 'const fused = true;'],
  ['the file of --pathspec-from-file is not kept', PARSE, "if (name === 'pathspec-from-file') read.pathspecFile = fused ? word.slice(equals + 1) : words[index + 1];", ''],
  ['the fused value keeps its equals sign', PARSE, 'word.slice(equals + 1)', 'word.slice(equals)'],
  ['a fused value consumes the next word too', PARSE, 'return fused ? 0 : 1;', 'return 1;'],
  ['a separated value consumes nothing', PARSE, 'return fused ? 0 : 1;', 'return 0;'],
  ['the sign of a switch is ignored', PARSE, "const on = !name.startsWith('no-');", 'const on = true;'],
  ['a negated switch is read under its negated name', PARSE, "const positive = on ? name : name.slice('no-'.length);", 'const positive = name;'],
  ['--all is not read', PARSE, "if (positive === 'all') read.all = on;", ''],
  ['--include is not read', PARSE, "if (positive === 'include') read.include = on;", ''],
  ['--only is not read', PARSE, "if (positive === 'only') read.only = on;", ''],
  ['--dry-run is not read', PARSE, "if (positive === 'dry-run') read.dryRun = on;", ''],
  ['--pathspec-file-nul is not read', PARSE, "if (positive === 'pathspec-file-nul') read.pathspecNul = on;", ''],

  // --- how the status records are read.
  ['an ordinary record has a different number of fields before its path', STATUS, '{ 1: 8, 2: 9, u: 10 }', '{ 1: 7, 2: 9, u: 10 }'],
  ['a rename record has a different number of fields before its path', STATUS, '{ 1: 8, 2: 9, u: 10 }', '{ 1: 8, 2: 8, u: 10 }'],
  ['an unmerged record has a different number of fields before its path', STATUS, '{ 1: 8, 2: 9, u: 10 }', '{ 1: 8, 2: 9, u: 9 }'],
  ['the blob of an ordinary record is read from another field', STATUS, '{ 1: 7, 2: 7, u: 8 }', '{ 1: 6, 2: 7, u: 8 }'],
  ['the blob of a rename record is read from another field', STATUS, '{ 1: 7, 2: 7, u: 8 }', '{ 1: 7, 2: 6, u: 8 }'],
  ['the blob of an unmerged record is read from another field', STATUS, '{ 1: 7, 2: 7, u: 8 }', '{ 1: 7, 2: 7, u: 9 }'],
  ['a record whose type is not followed by a space is read', STATUS, "|| record[1] !== ' ') continue;", ') continue;'],
  ['a record that is cut short is read', STATUS, 'if (split === undefined) continue;', ''],
  ['a record with fewer fields than expected is read', STATUS, 'if (space === -1) return undefined;', ''],
  ['a dot in a status column is kept', STATUS, ".split('.').join(' ')", ''],
  ['the origin record of a rename is read as an entry', STATUS, "if (type === '2') index += 1;", ''],
  ['a path stale in only one column counts as a disagreement of both', STATUS, "code[0] !== ' ' && code[1] !== ' '", "code[0] !== ' ' || code[1] !== ' '"],
  ['a path staged-only counts as a disagreement of both', STATUS, "code[0] !== ' ' && code[1] !== ' '", "code[1] !== ' '"],
  ['a path worktree-only counts as a disagreement of both', STATUS, "code[0] !== ' ' && code[1] !== ' '", "code[0] !== ' '"],

  // --- the pathspec file.
  ['a missing file name is read', FILE, "if (typeof file !== 'string') return", 'if (false) return'],
  ['standard input is read as a file', FILE, "if (file === '-') return", 'if (false) return'],
  ['an unknown directory is read', FILE, "if (typeof directory !== 'string') return", 'if (false) return'],
  ['a file at exactly the limit is refused', FILE, 'sizeOf(target) > MAX_PATHSPEC_FILE_BYTES', 'sizeOf(target) >= MAX_PATHSPEC_FILE_BYTES'],
  ['a file a byte past the limit is read', FILE, 'sizeOf(target) > MAX_PATHSPEC_FILE_BYTES', 'sizeOf(target) > MAX_PATHSPEC_FILE_BYTES + 1'],
  ['the limit is a gibibyte', FILE, '1024 * 1024;', '1024 * 1024 * 1024;'],
  ['NUL-separated entries are read as lines', FILE, 'if (nul) return', 'if (false) return'],
  ['an empty NUL-separated entry is a path', FILE, ".filter((entry) => entry !== '')", ''],
  ['lines are split on carriage returns', FILE, "text.split('\\n')", "text.split('\\r\\n')"],
  ['an empty line is a path', FILE, "line !== '' && line !== '\\r'", "line !== '\\r'"],
  ['a line of only a carriage return is a path', FILE, "line !== '' && line !== '\\r'", "line !== ''"],
  ['a carriage return stays in the path', FILE, "line.endsWith('\\r') ? line.slice(0, -1) : line", 'line'],
  ['a lone quote is a quoted path', FILE, 'text.length > 1 && ', ''],
  ['a path that only ends with a quote is a quoted path', FILE, "text.startsWith('\"') && ", ''],
  ['a path that only starts with a quote is a quoted path', FILE, " && text.endsWith('\"')", ''],
  ['a quoted path that does not parse becomes a path', FILE, 'return { problem: text };', 'return { entry: text };'],
  ['a quoted path is not unquoted', FILE, 'return { entry: JSON.parse(text) };', 'return { entry: text };'],
  ['an unparsable quoted path is ignored', FILE, 'if (unreadable !== undefined) return', 'if (false) return'],
  ['a failure to read is a crash', FILE, '} catch (error) {', '} catch (error) { throw error;'],

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
