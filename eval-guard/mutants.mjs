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
const WRITES = 'eval-guard/script-writes.mjs';

/** A marker taken out of the list of write calls, one mutant each. @es Un marcador fuera de la lista de llamadas de escritura, un mutante cada uno. */
const markerMutants = ['writeFile', 'appendFile', 'fs.write', 'createWriteStream', 'write_text', 'write_bytes', 'Set-Content', 'Add-Content', 'Out-File'].map((marker) => [`the write marker ${marker} is no longer recognised`, WRITES, `'${marker}', `, '']);

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
  // --- the denial journal: a digest, never the text ---
  ['the denial journal stores the command text again (the pre-fix behaviour)', GUARD, '    commandDigest: digestInput(command),', '    command,'],
  ['the denial journal stores the digest of something else', GUARD, '    commandDigest: digestInput(command),', "    commandDigest: digestInput(''),"],
  ['the denial journal stores the text next to its digest', GUARD, '    commandDigest: digestInput(command),', '    commandDigest: digestInput(command),\n    command,'],
  // --- a delegated agent's script that writes a file, fed through a shell ---
  ['the script-write rule also runs for the orchestrator', DETECT, 'if (delegated && STDIN_INTERPRETERS.has(name)) {', 'if (STDIN_INTERPRETERS.has(name)) {'],
  ['the script-write rule never runs', DETECT, 'if (delegated && STDIN_INTERPRETERS.has(name)) {', 'if (false && STDIN_INTERPRETERS.has(name)) {'],
  ['no caller is read as delegated', GUARD, 'delegated: isSubagentCaller(payload)', 'delegated: false'],
  ['every caller is read as delegated', GUARD, 'delegated: isSubagentCaller(payload)', 'delegated: true'],
  ['the script-write refusal has no text of its own', GUARD, "if (refusal.kind === 'script-write') return scriptWriteReason(refusal);\n", ''],
  ['PowerShell here-strings are not cut out', DETECT, 'const prepared = delegated ? extractPowerShellHereStrings(command) : { text: command, scripts: [] };', 'const prepared = { text: command, scripts: [] };'],
  ['PowerShell here-string scripts are not judged', DETECT, "...powerShellScripts.map((text) => ({ text, source: 'PowerShell here-string' }))", '...[]'],
  ['a script FILE argument no longer takes the script off standard input', DETECT, "const readsStandardInput = words.every((word) => word.hereString || word.raw === '-' || isOptionWord(word));", 'const readsStandardInput = true;'],
  ['a lone dash is no longer standard input', DETECT, " || word.raw === '-'", ''],
  ['options no longer leave the script on standard input', DETECT, ' || isOptionWord(word)', ''],
  ['here-string words are not judged', DETECT, "...words.filter((word) => word.hereString).map((word) => ({ text: word.raw, source: 'here-string' })),", ''],
  ['heredoc bodies are not judged', DETECT, "...heredocs.map((text) => ({ text, source: 'heredoc' })),", ''],
  ['a here-string word is never flagged', DETECT, 'nextWordIsHereString = true;', 'nextWordIsHereString = false;'],
  ['the here-string flag leaks to every later word', DETECT, '      nextWordIsHereString = false;\n    }\n  };', '    }\n  };'],
  ['the heredoc body is not kept', DETECT, 'heredoc.body = command.slice(bodyStart, index);', "heredoc.body = '';"],
  ['the heredoc body is not given to its command', DETECT, "lastClosed?.heredocs.push(item.heredoc.body ?? '');", "lastClosed?.heredocs.push('');"],
  ['a heredoc after a separator is given to the command before it', DETECT, 'else lastClosed = undefined;', 'else lastClosed = lastClosed;'],
  ['@\' here-strings are not recognised', DETECT, 'const POWERSHELL_HERE_STRING_QUOTES = ["\'", \'"\'];', 'const POWERSHELL_HERE_STRING_QUOTES = [\'"\'];'],
  ['@" here-strings are not recognised', DETECT, 'const POWERSHELL_HERE_STRING_QUOTES = ["\'", \'"\'];', 'const POWERSHELL_HERE_STRING_QUOTES = ["\'"];'],
  ['an @-quote in the middle of a line opens a here-string', DETECT, "command.slice(index + 2, bodyStart).trim() === ''", 'true'],
  ['sh is not an interpreter of standard input', DETECT, "'sh', ", ''],
  ['bash is not an interpreter of standard input', DETECT, "'bash', ", ''],
  ['zsh is not an interpreter of standard input', DETECT, "'zsh', ", ''],
  ['dash is not an interpreter of standard input', DETECT, "'dash', ", ''],
  ['pwsh is not an interpreter of standard input', DETECT, "'pwsh', ", ''],
  ['powershell is not an interpreter of standard input', DETECT, ", 'powershell']", ']'],
  ['node is not an interpreter of standard input', DETECT, ", 'node', 'nodejs'", ", 'nodejs'"],
  ['nodejs is not an interpreter of standard input', DETECT, "'node', 'nodejs', ", "'node', "],
  ['python is not an interpreter of standard input', DETECT, "'nodejs', 'python', ", "'nodejs', "],
  ['python3 is not an interpreter of standard input', DETECT, "'python', 'python3'])", "'python'])"],
  ['no interpreter is shell-like', DETECT, "new Set(['sh', 'bash', 'zsh', 'dash', 'pwsh', 'powershell'])", 'new Set([])'],
  ['every interpreter is shell-like', DETECT, 'SHELL_LIKE_INTERPRETERS.has(name) }', 'true }'],
  ...markerMutants,
  ['the WriteAllText marker is no longer recognised', WRITES, ", 'WriteAllText'", ''],
  ['the w mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'ax+';"],
  ['the a mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'wx+';"],
  ['the x mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'wa+';"],
  ['the + mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'wax';"],
  ['only the first mode letter is read', WRITES, '[...mode].some(', '[...mode].slice(0, 1).some('],
  ['python open calls are never looked at', WRITES, 'if (opensForWriting(text))', 'if (false)'],
  ['a name ending in open( is read as an open call', WRITES, 'const startsACall = !isIdentifierCharacter(text[from - 1]);', 'const startsACall = true;'],
  ['the mode= keyword is not read', WRITES, "parts.find((part) => part.startsWith('mode='))", 'parts.find(() => false)'],
  ['a file-descriptor copy is read as a file redirection', WRITES, "    if (text[target] === '&') continue;\n", ''],
  ['a redirection to /dev/null is a file write', WRITES, 'if (!text.startsWith(NULL_DEVICE, target)) return true;', 'return true;'],
  ['the second > of >> is read as the target', WRITES, "    if (text[target] === '>') target += 1;\n", ''],
  ['blanks before the redirection target are not skipped', WRITES, "    while (text[target] === ' ' || text[target] === '\\t') target += 1;\n", ''],
  ['> is a redirection for every interpreter', WRITES, 'if (shellLike && redirectsToFile(text))', 'if (redirectsToFile(text))'],
  // --- heredocs: the body is data, the scan resumes after the terminator ---
  ['the heredoc body is not skipped, so its lines are inspected as commands', DETECT, '          index = skipHeredocBody(command, index, heredoc);\n', ''],
  ['the scan does not resume after the terminator, so a later dangerous command hides', DETECT, "if (line === heredoc.delimiter) return lineEnd === -1 ? command.length : lineEnd + 1;", 'if (line === heredoc.delimiter) return command.length;'],
  ['an unterminated body is not treated as data', DETECT, '  return command.length;\n}\n\n/**\n * Splits', '  return start;\n}\n\n/**\n * Splits'],
  ['<<- no longer strips the tabs of the terminator line', DETECT, '    if (heredoc.stripTabs) {', '    if (false) {'],
  ['a quoted delimiter is not recognised, so the terminator never matches', DETECT, "    if (character === \"'\" || character === '\"') {\n      const close = command.indexOf", "    if (false) {\n      const close = command.indexOf"],
  ['a line that merely starts with the delimiter ends the body', DETECT, 'if (line === heredoc.delimiter) return', 'if (line.startsWith(heredoc.delimiter)) return'],
  ['a here-string is treated as a heredoc instead of an argument separator', DETECT, 'if (startsHereString(command, index)) {', 'if (false) {'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['eval-guard', 'mutation-proof', 'hook-state', 'bilingual-output', 'hook-caller'],
  selftest: 'eval-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
