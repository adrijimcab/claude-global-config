#!/usr/bin/env node
/**
 * The decisions of the eval guard's node-options walk, each broken once, that `selftest.mjs` must catch.
 * The runner and its rules (green unmutated baseline, each target exactly once, parse check) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * Both directions, because both cost: the mutant that makes the guard NOISY (it refuses a `-p` that belongs
 * to the script, the measured incident) and the one that makes it BLIND (it stops examining node's own
 * options too early and lets a mangled `-e` through).
 *
 * @es Las decisiones del recorrido de opciones de node del guard, rotas una a una, que `selftest.mjs` debe
 * cazar. Las dos direcciones: el mutante que lo vuelve RUIDOSO (rechaza un `-p` del script, el incidente
 * medido) y el que lo deja CIEGO (deja de examinar las opciones de node y deja pasar un `-e` destrozado).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const DETECT = 'eval-guard/detect.mjs';
const GUARD = 'eval-guard/guard.mjs';

const MUTANTS = [
  // --- noisy: the script's own arguments are read as node's ---
  ['the scan never stops, so a script argument -p is read as node\'s print switch', DETECT, '      if (endsNodeOptions(invocation[index])) break;\n', ''],
  ['the script path no longer ends node\'s options', DETECT, "!token.raw.startsWith('-') || token.raw === '-'", "token.raw === '-'"],
  ['a bare -- no longer ends node\'s options', DETECT, "token.raw === '--' || !token.raw.startsWith('-')", "!token.raw.startsWith('-')"],
  ['a lone - (stdin) no longer ends node\'s options', DETECT, " || token.raw === '-';", ';'],
  // --- blind: node's own options stop being examined ---
  ['the walk ends at the FIRST word, so any option before -e hides it', DETECT, '      if (endsNodeOptions(invocation[index])) break;\n', '      if (index > position + 1) break;\n'],
  ['a value-taking option is no longer skipped, so its value ends the walk early', DETECT, '      if (NODE_OPTIONS_TAKING_A_VALUE.has(invocation[index].raw)) {\n        index += 1;\n        continue;\n      }\n', ''],
  ['-r is missing from the value-taking options', DETECT, "  '-r',\n", ''],
  ['--input-type is missing from the value-taking options', DETECT, "  '--input-type',\n", ''],
  ['the payload word is not skipped, so it ends the walk and a later evaluate switch hides', DETECT, '      if (!inline) index += 1;\n', ''],
  ['the walk ends on any option, not only on a non-option', DETECT, '!token.raw.startsWith(\'-\') || token.raw === \'-\'', "token.raw.startsWith('--') || !token.raw.startsWith('-') || token.raw === '-'"],
  // --- text-edit programs: the program list, the word filter, the shape checks, the rendering ---
  ['sed, sd, awk and gawk are no longer examined', DETECT, 'if (Object.hasOwn(LEADING_SCRIPT_WORDS, name)) {', 'if (false) {'],
  ['perl, ruby and python are no longer examined', DETECT, 'if (Object.hasOwn(INTERPRETER_VALUE_OPTIONS, name)) {', 'if (false) {'],
  ['sd is missing from the examined programs', DETECT, ' sd: 2,', ''],
  ['options are no longer told apart from words, so option values shift the script positions', DETECT, 'if (!optionsEnded && isOptionWord(token)) {', 'if (false) {'],
  ['a quoted word that starts with a dash is read as an option', DETECT, 'return !token.quoted && token.raw.length > 1 && token.raw[0] === \'-\';', "return token.raw.length > 1 && token.raw[0] === '-';"],
  ['the value word of a value-taking option is not consumed', DETECT, '        if (SCRIPT_FILE_OPTIONS.has(token.raw)) scriptsLeft = 0;\n        index += 1;\n', '        if (SCRIPT_FILE_OPTIONS.has(token.raw)) scriptsLeft = 0;\n'],
  ['a script file option no longer clears the leading script words', DETECT, '        if (SCRIPT_FILE_OPTIONS.has(token.raw)) scriptsLeft = 0;\n', ''],
  ['the -e value no longer clears the leading script words', DETECT, '        scriptsLeft = 0;\n        index += 1;\n      } else if', '        index += 1;\n      } else if'],
  ['the partly-quoted shape check is skipped', DETECT, 'if (checkShape && token.quoted && token.bare)', 'if (false)'],
  ['the unterminated-quote check is skipped', DETECT, '  if (token.unterminated)\n    return [{ offset: 0, code: 0x27, kind: \'unterminated quote: the shell ends this payload somewhere you did not\' }];', ''],
  ['the eaten-escape characters are no longer reported', DETECT, 'return findings.length > 0 ? findings : undefined;', 'return undefined;'],
  ['the script path no longer ends the interpreter options', DETECT, " || token.raw[0] !== '-') break;", ') break;'],
  ['the text-edit kind is not rendered by the guard', GUARD, "  if (refusal.kind === 'text-edit') return textEditReason(refusal);\n", ''],
  // --- comments and line continuations: data, not payload ---
  ['an unquoted backslash-newline is read as an eaten escape instead of a line continuation', DETECT, "    if (character === BACKSLASH && command[index + 1] === '\\n') {\n", '    if (false) {\n'],
  ['a comment is tokenized as words, so its quotes and backslashes are judged', DETECT, "if (character === '#' && startsComment(command, index)) {", 'if (false) {'],
  ['every # opens a comment, including the one of ${#x} and a#b', DETECT, 'return index === 0 || BEFORE_A_COMMENT.has(command[index - 1]);', 'return true;'],
  ['a # after a brace opens a comment, so ${#x} hides the rest of the line', DETECT, "'\\n', ';', '|', '&']", "'\\n', ';', '|', '&', '{']"],
  ['a comment glued to ; is not a comment', DETECT, "'\\n', ';', '|', '&']", "'\\n', '|', '&']"],
  ['a comment glued to | is not a comment', DETECT, "'\\n', ';', '|', '&']", "'\\n', ';', '&']"],
  ['a comment glued to & is not a comment', DETECT, "'\\n', ';', '|', '&']", "'\\n', ';', '|']"],
  ['a comment after a blank is not a comment', DETECT, '...BLANK_CHARACTERS, ', ''],
  ['a comment stops at a quote instead of the end of the line', DETECT, "      const lineEnd = command.indexOf('\\n', index);\n", "      const lineEnd = command.indexOf(\"'\", index);\n"],
  // --- heredocs: the body is data, the scan resumes after the terminator ---
  ['the heredoc body is not skipped, so its lines are inspected as commands', DETECT, '        for (const heredoc of pendingHeredocs) index = skipHeredocBody(command, index, heredoc);\n', ''],
  ['the scan does not resume after the terminator, so a later dangerous command hides', DETECT, "if (line === heredoc.delimiter) return lineEnd === -1 ? command.length : lineEnd + 1;", 'if (line === heredoc.delimiter) return command.length;'],
  ['an unterminated body is not treated as data', DETECT, '  return command.length;\n}\n\n/**\n * Splits', '  return start;\n}\n\n/**\n * Splits'],
  ['<<- no longer strips the tabs of the terminator line', DETECT, '    if (heredoc.stripTabs) {', '    if (false) {'],
  ['a quoted delimiter is not recognised, so the terminator never matches', DETECT, "    if (character === \"'\" || character === '\"') {\n      const close = command.indexOf", "    if (false) {\n      const close = command.indexOf"],
  ['a line that merely starts with the delimiter ends the body', DETECT, 'if (line === heredoc.delimiter) return', 'if (line.startsWith(heredoc.delimiter)) return'],
  ['a here-string is treated as a heredoc instead of an argument separator', DETECT, 'if (startsHereString(command, index)) {', 'if (false) {'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['eval-guard', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'eval-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
