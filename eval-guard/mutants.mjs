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
const SOURCE = 'eval-guard/script-source.mjs';
const LAUNCHERS = 'eval-guard/launchers.mjs';

/** A call marker taken out of the list, one mutant each. @es Un marcador de llamada fuera de la lista, un mutante cada uno. */
const callMarkerMutants = ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream', 'writeSync', 'fs.write', 'copyFileSync', 'renameSync', 'cpSync', 'write_text', 'write_bytes', 'shutil.copy*', 'os.replace'].map((marker) => [`the write marker ${marker} is no longer recognised`, WRITES, `'${marker}',`, '']);

/** A cmdlet taken out of the list. @es Un cmdlet fuera de la lista. */
const cmdletMutants = [["'Set-Content', ", ''], ["'Add-Content', ", ''], [", 'Out-File'", '']].map(([original, replacement]) => [`the cmdlet ${original} is no longer recognised`, WRITES, original, replacement]);

/** An interpreter name taken out of its family. @es Un nombre de intérprete fuera de su familia. */
const nameMutants = [
  ["names: ['node', 'nodejs', 'tsx']", "names: ['nodejs', 'tsx']"],
  ["names: ['node', 'nodejs', 'tsx']", "names: ['node', 'tsx']"],
  ["names: ['node', 'nodejs', 'tsx']", "names: ['node', 'nodejs']"],
  ["names: ['python', 'py']", "names: ['py']"],
  ["names: ['python', 'py']", "names: ['python']"],
  ["names: ['perl']", 'names: []'],
  ["names: ['ruby']", 'names: []'],
  ["names: ['deno']", 'names: []'],
  ["names: ['bun']", 'names: []'],
  ["names: ['sh', 'bash', 'zsh', 'dash']", "names: ['bash', 'zsh', 'dash']"],
  ["names: ['sh', 'bash', 'zsh', 'dash']", "names: ['sh', 'zsh', 'dash']"],
  ["names: ['sh', 'bash', 'zsh', 'dash']", "names: ['sh', 'bash', 'dash']"],
  ["names: ['sh', 'bash', 'zsh', 'dash']", "names: ['sh', 'bash', 'zsh']"],
  ["names: ['pwsh', 'powershell']", "names: ['powershell']"],
  ["names: ['pwsh', 'powershell']", "names: ['pwsh']"]
].map(([original, replacement]) => [`${replacement} no longer names every interpreter of its family`, SOURCE, original, replacement]);

/** A launcher taken out of the table. @es Un lanzador fuera de la tabla. */
const launcherMutants = ['env', 'command', 'exec', 'time', 'timeout', 'nice', 'npx'].map((name) => [`${name} is no longer unwrapped`, LAUNCHERS, `  ${name}: {`, `  ${name}x: {`]);

const MUTANTS = [
  // --- noisy: the script's own arguments are read as node's ---
  ['the scan never stops, so a script argument -p is read as node\'s print switch', DETECT, '      if (endsNodeOptions(invocation[index])) break;\n', ''],
  ['the script path no longer ends node\'s options', DETECT, "!token.raw.startsWith('-') || token.raw === '-'", "token.raw === '-'"],
  ['a bare -- no longer ends node\'s options', DETECT, "token.raw === '--' || !token.raw.startsWith('-')", "!token.raw.startsWith('-')"],
  ['a lone - (stdin) no longer ends node\'s options', DETECT, " || token.raw === '-';", ';'],
  // --- blind: node's own options stop being examined ---
  ['the walk ends at the FIRST word, so any option before -e hides it', DETECT, '      if (endsNodeOptions(invocation[index])) break;\n', '      if (index > position + 1) break;\n'],
  ['a value-taking option is no longer skipped, so its value ends the walk early', DETECT, '      if (NODE_OPTIONS_TAKING_A_VALUE.has(invocation[index].raw)) {\n        index += 1;\n        continue;\n      }\n', ''],
  ['-r is missing from the value-taking options', SOURCE, "  '-r',\n", ''],
  ['--input-type is missing from the value-taking options', SOURCE, "  '--input-type',\n", ''],
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
  // --- a delegated agent's script that writes a file, fed through a shell: who is judged ---
  ['the script-write rule also runs for the orchestrator', DETECT, '    if (delegated) {\n      const scriptRefusal', '    if (true) {\n      const scriptRefusal'],
  ['the script-write rule never runs', DETECT, '    if (delegated) {\n      const scriptRefusal', '    if (false) {\n      const scriptRefusal'],
  ['no caller is read as delegated', GUARD, 'delegated: isSubagentCaller(payload)', 'delegated: false'],
  ['every caller is read as delegated', GUARD, 'delegated: isSubagentCaller(payload)', 'delegated: true'],
  ['the script-write refusal has no text of its own', GUARD, "if (refusal.kind === 'script-write') return scriptWriteReason(refusal);\n", ''],
  // --- the program and whether it reads its script from stdin ---
  ['launchers are not unwrapped', DETECT, 'const at = programIndex(command, position);', 'const at = position;'],
  ['the argument list is not read: every interpreter reads stdin', DETECT, ' || !readsScriptFromStdin(family, command.slice(at + 1))', ''],
  ['a script that calls a writer is not judged', DETECT, 'const evidence = writeEvidence(input.text) ?? ', 'const evidence = '],
  ['a shell script is never judged as shell', DETECT, 'family.shellLike ? shellScriptWrites(input.text, family) : undefined', 'undefined'],
  ['every script is judged as shell', DETECT, 'family.shellLike ? shellScriptWrites(input.text, family) : undefined', 'shellScriptWrites(input.text, family)'],
  ...launcherMutants,
  ['env assignments are read as the program', LAUNCHERS, 'positionals: 0, noProgram: new Set(), assignments: true }', 'positionals: 0, noProgram: new Set(), assignments: false }'],
  ['env -u takes no value', LAUNCHERS, "new Set(['-u', '--unset', ", "new Set(['--unset', "],
  ['timeout has no duration before the program', LAUNCHERS, "new Set(['-s', '--signal', '-k', '--kill-after']), positionals: 1,", "new Set(['-s', '--signal', '-k', '--kill-after']), positionals: 0,"],
  ['timeout -s takes no value', LAUNCHERS, "new Set(['-s', '--signal', ", "new Set(['--signal', "],
  ['nice -n takes no value', LAUNCHERS, "new Set(['-n', '--adjustment'])", "new Set(['--adjustment'])"],
  ['command -v runs its argument', LAUNCHERS, "noProgram: new Set(['-v', '-V'])", 'noProgram: new Set([])'],
  ['a launcher option with = also skips the next word', LAUNCHERS, "at += launcher.values.has(option) && !word.raw.includes('=') ? 2 : 1;", 'at += launcher.values.has(option) ? 2 : 1;'],
  ['no launcher option takes a value', LAUNCHERS, "at += launcher.values.has(option) && !word.raw.includes('=') ? 2 : 1;", 'at += 1;'],
  ['an assignment before a program in a script is the program', LAUNCHERS, '  while (at < words.length && isEnvironmentAssignment(words[at])) at += 1;\n', ''],
  ['a program name keeps its case', LAUNCHERS, 'const name = raw.slice(start).toLowerCase();', 'const name = raw.slice(start);'],
  ['a program name keeps its .exe', LAUNCHERS, "return name.endsWith('.exe') ? name.slice(0, -4) : name;", 'return name;'],
  ...nameMutants,
  ['a versioned name is not its interpreter', SOURCE, ' || (name.startsWith(base) && [...name.slice(base.length)]', ' || (false && [...name.slice(base.length)]'],
  ['any name continuation is a version', SOURCE, '.every((character) => isDigit(character) || character === \'.\')', '.every(() => true)'],
  ['a dot is no part of a version', SOURCE, " || character === '.')", ')'],
  ['/dev/stdin is a script path', SOURCE, "new Set(['-', '/dev/stdin'])", "new Set(['-'])"],
  ['a here-string word is read as a script path', SOURCE, 'const argumentsOnly = words.filter((word) => !word.hereString);', 'const argumentsOnly = words;'],
  ['-- with nothing after it is a script path', SOURCE, 'return stdinForced || next === undefined || STDIN_SCRIPTS.has(next.raw);', 'return stdinForced || STDIN_SCRIPTS.has(next?.raw);'],
  ['-- followed by - is a script path', SOURCE, 'return stdinForced || next === undefined || STDIN_SCRIPTS.has(next.raw);', 'return stdinForced || next === undefined;'],
  ['-s is forgotten after --', SOURCE, 'return stdinForced || next === undefined', 'return next === undefined'],
  ['-s is forgotten at the first argument', SOURCE, '    return stdinForced;\n  }', '    return false;\n  }'],
  ['an inline-code option keeps the script on stdin', SOURCE, '      if (meaning.code) return false;\n', ''],
  ['a value option skips no word', SOURCE, '      if (meaning.value) index += 1;\n', ''],
  ['a subcommand is read as the script path', SOURCE, 'if (subcommandPending && word.raw === family.subcommand) {', 'if (false) {'],
  ['an attached short value skips the next word', SOURCE, 'return { ...meaning, value: index === letters.length - 1 };', 'return { ...meaning, value: true };'],
  ['a long option with = skips the next word', SOURCE, "value: family.valueLong?.has(name) === true && !raw.includes('=') };", 'value: family.valueLong?.has(name) === true };'],
  ['node -e is not code', SOURCE, "code: 'ep', value: 'rC'", "code: '', value: 'rC'"],
  ['node -r takes no value', SOURCE, "code: 'ep', value: 'rC'", "code: 'ep', value: 'C'"],
  ['node --eval is not code', SOURCE, "value: 'rC', codeLong: new Set(['--eval', '--print'])", "value: 'rC', codeLong: new Set(['--print'])"],
  ['node long value options take no value', SOURCE, 'valueLong: NODE_LONG_VALUES', 'valueLong: new Set()'],
  ['python -m is not code', SOURCE, "code: 'cm', value: 'WXQ'", "code: 'c', value: 'WXQ'"],
  ['python -c is not code', SOURCE, "code: 'cm', value: 'WXQ'", "code: 'm', value: 'WXQ'"],
  ['python -W takes no value', SOURCE, "code: 'cm', value: 'WXQ'", "code: 'cm', value: 'XQ'"],
  ['perl -M does not swallow its word', SOURCE, "rest: 'iMmdDxV'", "rest: 'imdDxV'"],
  ['ruby -e is not code', SOURCE, "code: 'e', value: 'rICE'", "code: '', value: 'rICE'"],
  ['ruby -r takes no value', SOURCE, "code: 'e', value: 'rICE'", "code: 'e', value: 'ICE'"],
  ['deno -c takes no value', SOURCE, "shellLike: false, value: 'c', valueLong", "shellLike: false, value: '', valueLong"],
  ['shell -c is not code', SOURCE, "code: 'c', stdin: 's', value: 'oO'", "code: '', stdin: 's', value: 'oO'"],
  ['shell -s does not force stdin', SOURCE, "code: 'c', stdin: 's', value: 'oO'", "code: 'c', stdin: '', value: 'oO'"],
  ['shell -o takes no value', SOURCE, "code: 'c', stdin: 's', value: 'oO'", "code: 'c', stdin: 's', value: 'O'"],
  ['shell +o is no option', SOURCE, '(family.plusOptions === true && token.raw[0] === \'+\')', 'false'],
  ['the shells are not shell-like', SOURCE, 'shellLike: true, plusOptions: true', 'shellLike: false, plusOptions: true'],
  ['PowerShell is not shell-like', SOURCE, 'shellLike: true, powershell: true', 'shellLike: false, powershell: true'],
  ['PowerShell options are read as getopt letters', SOURCE, '  if (family.powershell) return { value: POWERSHELL_VALUE_OPTIONS.has(raw.slice(1).toLowerCase()) };\n', ''],
  ['PowerShell -ExecutionPolicy takes no value', SOURCE, "new Set(['executionpolicy', ", 'new Set(['],
  // --- which text reaches the interpreter's stdin ---
  ['a redirection splits the command again (the pre-fix behaviour)', DETECT, 'const redirection = redirectionAt(command, index);', 'const redirection = undefined;'],
  ['a redirection target is read as a command word', DETECT, 'nextWordIsTarget = true;', 'nextWordIsTarget = false;'],
  ['a redirection target stays among the words', DETECT, '      if (redirection.target !== undefined) at += 1;\n', ''],
  ['a redirection after a compound is not its commands\'', DETECT, 'for (const owner of owners()) owner.redirects.push(redirection);', 'group.redirects.push(redirection);'],
  ['&> is not a redirection', DETECT, "  if (character === '&') return command[index + 1] === '>' ? (command[index + 2] === '>' ? '&>>' : '&>') : undefined;", "  if (character === '&') return undefined;"],
  ['>& is not one redirection', DETECT, "return command[index + 1 + second.length] === '&' ? `>${second}&` : `>${second}`;", 'return `>${second}`;'],
  ['the descriptor of a here-string is a word', DETECT, '      dropDescriptor(index);\n      flush();\n      hereStringAt = index;', '      flush();\n      hereStringAt = index;'],
  ['the descriptor of a heredoc is a word', DETECT, '      dropDescriptor(index);\n      flush();\n\n      const declaration', '      flush();\n\n      const declaration'],
  ['the descriptor of a redirection is a word', DETECT, "      dropDescriptor(index);\n      flush();\n      items.push({ kind: 'redirect'", "      flush();\n      items.push({ kind: 'redirect'"],
  ['any word glued to a redirection is a descriptor', DETECT, " && [...current.raw].every((digit) => digit >= '0' && digit <= '9')) current = undefined;", ') current = undefined;'],
  ['an arrow -> is a redirection', DETECT, "afterDash: command[index - 1] === '-' }", 'afterDash: false }'],
  ['(( )) is not arithmetic', DETECT, 'if (command.startsWith(ARITHMETIC_OPEN, index)) {', 'if (false) {'],
  ['a heredoc is given to no command', DETECT, "for (const owner of owners()) owner.inputs.push({ text: item.heredoc.body ?? ''", "for (const owner of []) owner.inputs.push({ text: item.heredoc.body ?? ''"],
  ['the heredoc body is not kept', DETECT, 'heredoc.body = command.slice(bodyStart, index);', "heredoc.body = '';"],
  ['the heredoc body is not given to its command', DETECT, "owner.inputs.push({ text: item.heredoc.body ?? '',", "owner.inputs.push({ text: '',"],
  ['a pipe passes nothing on', DETECT, 'pipedFrom = closed !== undefined ? [closed] : compound ?? [];', 'pipedFrom = [];'],
  ['a compound piped on passes nothing', DETECT, 'pipedFrom = closed !== undefined ? [closed] : compound ?? [];', 'pipedFrom = closed !== undefined ? [closed] : [];'],
  ['no compound is opened', DETECT, 'compoundStarts.push(groups.length);', ''],
  ['no compound is closed', DETECT, 'compound = start === undefined ? undefined : groups.slice(start);', 'compound = undefined;'],
  ['a compound stays open past a separator', DETECT, '      compound = undefined;\n      continue;\n    }\n\n    if (item.hereString', '      continue;\n    }\n\n    if (item.hereString'],
  ['a here-string after a compound starts a command', DETECT, 'if (item.hereString && group.length === 0) {', 'if (false) {'],
  ['a command forgets what is piped into it', DETECT, '      group.upstream = pipedFrom;\n', ''],
  ['a here-string word is not its command\'s input', DETECT, '    if (item.hereString) group.inputs.push(hereStringInput(item));\n', ''],
  ['a here-string word is never flagged', DETECT, 'hereString: hereStringAt !== undefined,', 'hereString: false,'],
  ['the here-string flag leaks to every later word', DETECT, '      hereStringAt = undefined;\n', ''],
  ['a command\'s own input is ignored', DETECT, '  if (command.inputs.length > 0) return command.inputs;\n', ''],
  ['the pipe does not flow through every stage', DETECT, '[...stdinTexts(before, powerShellScripts), ', '['],
  ['a PowerShell here-string piped on is not its output', DETECT, ', ...literalOutputOf(before, powerShellScripts)]', ']'],
  // --- E6: the finding points at the real opener ---
  ['a heredoc finding points at offset 0', DETECT, "source: 'heredoc', offset: item.start,", "source: 'heredoc', offset: 0,"],
  ['a here-string finding points at offset 0', DETECT, 'offset: word.hereStringAt,', 'offset: 0,'],
  ['the here-string opener is not remembered', DETECT, '      hereStringAt = index;', '      hereStringAt = 0;'],
  ['a PowerShell here-string finding points at offset 0', DETECT, 'offset: index, code: AT_SIGN', 'offset: 0, code: AT_SIGN'],
  ['a PowerShell here-string finding names U+003C', DETECT, 'offset: index, code: AT_SIGN', 'offset: index, code: LESS_THAN'],
  // --- E4: PowerShell here-strings ---
  ['PowerShell here-strings are cut out of Bash commands too', DETECT, "delegated && toolName === 'PowerShell' ? extractPowerShellHereStrings", 'delegated ? extractPowerShellHereStrings'],
  ['PowerShell here-strings are never cut out', DETECT, "delegated && toolName === 'PowerShell' ? extractPowerShellHereStrings", 'false ? extractPowerShellHereStrings'],
  ['an opener inside a token opens a here-string', DETECT, 'const startsAToken = index === 0 || BEFORE_A_POWERSHELL_TOKEN.includes(command[index - 1]);', 'const startsAToken = true;'],
  ['an unterminated here-string swallows the rest', DETECT, '    if (closing === -1) {', '    if (!opensOnItsOwnLine) {'],
  ['@\' here-strings are not recognised', DETECT, 'const POWERSHELL_HERE_STRING_QUOTES = ["\'", \'"\'];', 'const POWERSHELL_HERE_STRING_QUOTES = [\'"\'];'],
  ['@" here-strings are not recognised', DETECT, 'const POWERSHELL_HERE_STRING_QUOTES = ["\'", \'"\'];', 'const POWERSHELL_HERE_STRING_QUOTES = ["\'"];'],
  ['an @-quote in the middle of a line opens a here-string', DETECT, "command.slice(index + 2, bodyStart).trim() === ''", 'true'],
  // --- what a shell script writes ---
  ['an input redirection is a write', DETECT, "  if (!redirection.raw.includes('>') || ", '  if ('],
  ['a descriptor copy is a write', DETECT, "const descriptorCopy = redirection.raw.endsWith('&') && (", 'const descriptorCopy = false && ('],
  ['a closed descriptor >&- is a write', DETECT, "(target === '-' || [", '(['],
  ['/dev/null is a file', DETECT, "new Set(['/dev/null', ", 'new Set(['],
  ['/dev/stderr is a file', DETECT, "'/dev/stderr', ", ''],
  ['/dev/stdout is a file', DETECT, "'/dev/stdout', ", ''],
  ['$null is a file', DETECT, "'$null', ", ''],
  ['NUL is a file', DETECT, ", 'nul']);", ']);'],
  ['a sink is matched in one case only', DETECT, '  return !descriptorCopy && !NON_FILE_SINKS.has(target.toLowerCase());', '  return !descriptorCopy && !NON_FILE_SINKS.has(target);'],
  ['a nested interpreter is not judged', DETECT, "if (nested?.kind === 'script-write') return", 'if (false) return'],
  ['a [[ ]] comparison is a redirection', DETECT, "const comparison = command.some((word) => !word.quoted && word.raw === '[[');", 'const comparison = false;'],
  ['cp is no write', DETECT, "    if (name === 'cp') return 'calls cp';\n", ''],
  ['tee is no write', DETECT, "if (name === 'tee' && words.some(", 'if (false && words.some('],
  ['tee with no file writes', DETECT, 'words.some((word) => !isOptionWord(word) && !NON_FILE_SINKS.has(word.raw.toLowerCase()))', 'true'],
  ['tee into a sink writes', DETECT, '!isOptionWord(word) && !NON_FILE_SINKS.has(word.raw.toLowerCase())', '!isOptionWord(word)'],
  ['tee -a alone writes', DETECT, '!isOptionWord(word) && !NON_FILE_SINKS.has(word.raw.toLowerCase())', '!NON_FILE_SINKS.has(word.raw.toLowerCase())'],
  ['sed -i is no write', DETECT, "if (name === 'sed' && words.some(editsInPlace))", 'if (false)'],
  ['sed --in-place is no write', DETECT, "word.raw === '--in-place' || ", ''],
  ['sed --in-place=suffix is no write', DETECT, "word.raw.startsWith('--in-place=') || ", ''],
  ['a long sed option with an i edits in place', DETECT, "(word.raw[1] !== '-' && word.raw.includes('i'))", "word.raw.includes('i')"],
  ['any sed word with an i edits in place', DETECT, 'const editsInPlace = (word) => isOptionWord(word) && (', 'const editsInPlace = (word) => ('],
  // --- what a script calls ---
  ...callMarkerMutants,
  ['the WriteAllText marker is no longer recognised', WRITES, ", 'WriteAllText'", ''],
  ...cmdletMutants,
  ['a marker continues into any name', WRITES, '    if (prefix) while (isIdentifierCharacter(text[end])) end += 1;\n', ''],
  ['a name glued after another is a call site', WRITES, '    if (isIdentifierCharacter(text[from - 1])) continue;\n', ''],
  ['blanks before the parenthesis end the call', WRITES, 'const open = afterBlanks(text, end);', 'const open = end;'],
  ['a name with no parenthesis is a call', WRITES, "if (text[open] === '(') sites.push", 'if (true) sites.push'],
  ['cmdlets are matched in one case only', WRITES, 'const lower = withoutQuotedText(text).toLowerCase();', 'const lower = withoutQuotedText(text);'],
  ['a cmdlet is matched in its own case', WRITES, 'const wanted = cmdlet.toLowerCase();', 'const wanted = cmdlet;'],
  ['a cmdlet inside a string is a command', WRITES, 'const lower = withoutQuotedText(text).toLowerCase();', 'const lower = text.toLowerCase();'],
  ['a quote with no partner on its line blanks the next lines', WRITES, 'if (close === -1 || close > lineEnd) {', 'if (close === -1) {'],
  ['a cmdlet glued after a word is a command', WRITES, 'const before = from === 0 || BEFORE_A_COMMAND_WORD.includes(lower[from - 1]);', 'const before = true;'],
  ['a cmdlet glued before a word is a command', WRITES, 'const after = from + wanted.length === lower.length || AFTER_A_COMMAND_WORD.includes(lower[from + wanted.length]);', 'const after = true;'],
  ['the w mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'ax+';"],
  ['the a mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'wx+';"],
  ['the x mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'wa+';"],
  ['the + mode no longer writes', WRITES, "const WRITING_MODE_LETTERS = 'wax+';", "const WRITING_MODE_LETTERS = 'wax';"],
  ['only the first mode letter is read', WRITES, '[...mode].some(', '[...mode].slice(0, 1).some('],
  ['python open calls are never looked at', WRITES, 'if (opensForWriting(text))', 'if (false)'],
  ['the mode= keyword is not read', WRITES, "parts.find((part) => keywordOf(part) === 'mode')", 'parts.find(() => false)'],
  ['a method open takes its mode second', WRITES, 'method && !PATH_FIRST_MODULES.has(receiver) ? 0 : 1', '1'],
  ['io.open takes its mode first', WRITES, 'method && !PATH_FIRST_MODULES.has(receiver) ? 0 : 1', 'method ? 0 : 1'],
  ['nothing is a method open', WRITES, "const method = text[site.at - 1] === '.';", 'const method = false;'],
  ['the receiver of a method open is not read', WRITES, '  while (isIdentifierCharacter(text[receiverStart - 1])) receiverStart -= 1;\n', ''],
  ['brackets do not nest in an argument list', WRITES, "    if (character === '(' || character === '[' || character === '{') depth += 1;\n", ''],
  ['quotes do not group in an argument list', WRITES, "    if (character === \"'\" || character === '\"') {\n      let close", "    if (false) {\n      let close"],
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
