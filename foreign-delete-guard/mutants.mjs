#!/usr/bin/env node
/**
 * The decisions of foreign-delete-guard, each broken once, that `selftest.mjs` must catch. The runner and its rules
 * (green baseline first, exactly-once targets, parse-checked mutants, no crash counted as a kill) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de foreign-delete-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'foreign-delete-guard/guard.mjs';
const JUDGE = 'foreign-delete-guard/judge.mjs';
const TARGETS = 'foreign-delete-guard/deletion-targets.mjs';
const OPERANDS = 'foreign-delete-guard/operand-paths.mjs';
const CREATION = 'foreign-delete-guard/creation-targets.mjs';
const AUTHORSHIP = 'foreign-delete-guard/authorship.mjs';
const FOREIGN = 'foreign-delete-guard/foreign-paths.mjs';
const TREE = 'foreign-delete-guard/own-tree.mjs';
const WILDCARDS = 'foreign-delete-guard/wildcards.mjs';
const REFUSAL = 'foreign-delete-guard/refusal.mjs';

const MUTANTS = [
  // who is judged, and the failure mode
  ['the main session is judged too', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['every caller is allowed', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', 'return undefined;'],
  ['a refusal is never produced', GUARD, 'if (verdict === undefined) return undefined;', 'return undefined;'],
  ['an internal failure refuses the call instead of failing open', GUARD, 'return undefined; // fail open: a malfunction of the decision must never block a call', "throw new Error('boom');"],
  ['a BOM-prefixed payload is not parsed', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a tool that runs no shell is parsed as a shell line', GUARD, 'if (dialect === undefined || typeof command !== \'string\') return undefined;', ''],
  // the order of the decision
  ['a line that deletes nothing still reads the transcript', JUDGE, 'if (targets.length === 0) return undefined;', ''],
  ['an unresolvable target is not refused', JUDGE, "if (unknown !== undefined) return { kind: 'unresolved', code: unknown.unresolvable, via: unknown.via };", ''],
  ['a missing transcript is not a reason to allow', JUDGE, 'if (transcript === undefined) return undefined;', ''],
  ['the files the current line creates are not authored', JUDGE, '...authoredPathsIn(transcript, cwd), ...authoredByCall(payload)', '...authoredPathsIn(transcript, cwd)'],
  ['the agent\'s own worktree is not owned', JUDGE, 'linkedWorktreeRoot(cwd)', 'undefined'],
  ['a walk past the limit is not refused', JUDGE, 'if (found.exceeded)', 'if (false)'],
  ['the walk limit is ignored', JUDGE, 'foreignLeaves(target.path, ownership, limit)', 'foreignLeaves(target.path, ownership)'],
  ['a later command replaces the one named in the refusal', JUDGE, 'if (!foreign.has(file)) foreign.set(file, target.via);', 'foreign.set(file, target.via);'],
  ['a foreign file is not a verdict', JUDGE, 'return foreign.size === 0 ? undefined :', 'return undefined; const unused ='],
  // what deletes
  ['rmdir is not a remover', TARGETS, "'rm', 'rmdir', ", "'rm', "],
  ['unlink is not a remover', TARGETS, "'unlink', ", ''],
  ['del is not a remover', TARGETS, "'unlink', 'del', ", "'unlink', "],
  ['erase is not a remover', TARGETS, "'del', 'erase', 'rd', 'remove-item'", "'del', 'rd', 'remove-item'"],
  ['rd is not a remover', TARGETS, "'erase', 'rd', 'remove-item'", "'erase', 'remove-item'"],
  ['Remove-Item is not a remover', TARGETS, "'rd', 'remove-item', 'ri']", "'rd', 'ri']"],
  ['ri is not a remover', TARGETS, "'rd', 'remove-item', 'ri']", "'rd', 'remove-item']"],
  ['Remove-Item is read with bash grammar', TARGETS, "const POWERSHELL_ONLY = new Set(['remove-item', 'ri']);", "const POWERSHELL_ONLY = new Set(['ri']);"],
  ['ri is read with bash grammar', TARGETS, "const POWERSHELL_ONLY = new Set(['remove-item', 'ri']);", "const POWERSHELL_ONLY = new Set(['remove-item']);"],
  ['PowerShell is read with bash grammar', TARGETS, 'const powershell = dialect === DIALECTS.POWERSHELL || POWERSHELL_ONLY.has(name);', 'const powershell = POWERSHELL_ONLY.has(name);'],
  ['cmd flags are operands', TARGETS, 'isOption(word) || (SLASH_FLAG_REMOVERS.has(name) && isSlashFlag(word))', 'isOption(word)'],
  ['a slash flag needs no letter', TARGETS, "word.charAt(1).toLowerCase() !== word.charAt(1).toUpperCase() && ", ''],
  ['a slash word of any length is a flag', TARGETS, "(word.length === 2 || word.charAt(2) === ':')", 'true'],
  ['a slash word needs no slash', TARGETS, "word.charAt(0) === '/' && ", ''],
  ['-- does not end the options', TARGETS, "if (!optionsEnded && word === '--') {", "if (false) {"],
  ['options after -- are still options', TARGETS, 'if (!optionsEnded && (isOption(word) ||', 'if ((isOption(word) ||'],
  ['-WhatIf does not turn the deletion off', TARGETS, 'if (POWERSHELL_DRY_PARAMETERS.has(name)) dryRun = true;', ''],
  ['-WhatIf is read but ignored', TARGETS, 'if (dryRun) return [];', ''],
  ['-wi is not a dry-run alias', TARGETS, "new Set(['-whatif', '-wi'])", "new Set(['-whatif'])"],
  ['Remove-Item filters are operands', TARGETS, "'-include', '-exclude', '-filter', ", ''],
  ['Remove-Item -ErrorAction values are operands', TARGETS, "'-erroraction', '-ea', ", ''],
  ['-LiteralPath is not a path parameter', TARGETS, "new Set(['-path', '-literalpath']);", "new Set(['-path']);"],
  ['-Path is not a path parameter', TARGETS, "new Set(['-path', '-literalpath']);", "new Set(['-literalpath']);"],
  ['the colon form of a parameter takes the next word', TARGETS, 'const value = colon === -1 ? args[index + 1] : word.slice(colon + 1);', 'const value = args[index + 1];'],
  ['a value parameter is not consumed', TARGETS, 'if (colon === -1) index += 1;', ''],
  ['a Remove-Item with no operand is not the pipeline', TARGETS, 'if (operands.length === 0) return', 'if (false) return'],
  ['a comma list is not split', TARGETS, "const items = value.split(',').filter((item) => item.length > 0);", 'const items = [value];'],
  ['a value with a comma is not also read whole', TARGETS, "return value.includes(',') ? [value, ...items] : items;", 'return items;'],
  ['find -delete is not a deletion', TARGETS, "if (args.includes('-delete')) return 'find -delete';", ''],
  ['find -exec of any command is a deletion', TARGETS, 'REMOVERS.has(executableName(args[index + 1] ?? \'\')))', 'true)'],
  ['find -execdir, -ok and -okdir are not deletions', TARGETS, "new Set(['-exec', '-execdir', '-ok', '-okdir'])", "new Set(['-exec'])"],
  ['find options before the start path end the start paths', TARGETS, "const FIND_LEADING_OPTIONS = new Set(['-H', '-L', '-P']);", 'const FIND_LEADING_OPTIONS = new Set([]);'],
  ['find with no start path starts nowhere', TARGETS, "return starts.length === 0 ? ['.'] : starts;", 'return starts;'],
  ['find reads its expression as start paths', TARGETS, "while (index < args.length && !args[index].startsWith('-')) {", 'while (index < args.length) {'],
  ['find is not read', TARGETS, "if (name === 'find') found.push", 'if (false) found.push'],
  ['xargs is not read', TARGETS, "if (name === 'xargs') found.push", 'if (false) found.push'],
  ['xargs options with a value are not skipped', TARGETS, 'index += XARGS_VALUE_OPTIONS.has(args[index]) ? 2 : 1;', 'index += 1;'],
  ['xargs ignores a remover behind a wrapper', TARGETS, "runsRemover(rest.join(' '), dialect) ?", "REMOVERS.has(executableName(rest[0])) ?"],
  ['xargs of any command is a deletion', TARGETS, "runsRemover(rest.join(' '), dialect) ?", 'true ?'],
  ['a remover is judged only at the line\'s first command', TARGETS, 'return at !== -1 && REMOVERS.has(executableName(command.words[at]));', 'return at === 0 && REMOVERS.has(executableName(command.words[at]));'],
  ['a command with only assignments is read', TARGETS, 'if (at === -1) continue;\n\n    const name = executableName(command.words[at]);\n    const args = command.words.slice(at + 1);\n\n    if (REMOVERS', 'const name = executableName(command.words[at]);\n    const args = command.words.slice(at + 1);\n\n    if (REMOVERS'],
  ['git clean is not read', TARGETS, "if (invocation.subcommand !== 'clean' || isDryRun(invocation.args)) continue;", 'continue;'],
  ['git clean -n still deletes', TARGETS, "if (invocation.subcommand !== 'clean' || isDryRun(invocation.args)) continue;", "if (invocation.subcommand !== 'clean') continue;"],
  ['--dry-run is not a dry run', TARGETS, "word === '--dry-run' || ", ''],
  ['any short option with an n is a dry run', TARGETS, "[...word.slice(1)].every((letter) => 'fdxXinqe'.includes(letter)) && ", ''],
  ['a short cluster without an n is a dry run', TARGETS, "&& word.includes('n')));", '));'],
  ['an unknowable directory of git clean is guessed', TARGETS, 'if (invocation.directory === undefined) {', 'if (false) {'],
  ['a failed preview is not refused', TARGETS, 'if (!preview.ok) {', 'if (false) {'],
  ['the preview is not a dry run', TARGETS, "return ['clean', '-n', ...rewritten];", "return ['clean', ...rewritten];"],
  ['the interactive flag reaches the preview', TARGETS, "if (word === '--interactive') continue;", ''],
  ['the interactive letter reaches the preview', TARGETS, "flags.filter((letter) => letter !== 'i')", 'flags'],
  ['the exclude pattern loses its letters', TARGETS, "...(exclude === -1 ? [] : letters.slice(exclude))", ''],
  ['pathspecs after -- are rewritten', TARGETS, "if (pathsStarted || word === '--') {", "if (word === '--') {"],
  ['a quoted preview name is trusted', TARGETS, "paths.some((listed) => listed.startsWith('\"')) ? { ok: false, paths: [] } : { ok: true, paths }", '{ ok: true, paths }'],
  ['a git failure is read as an empty listing', TARGETS, 'result.error !== undefined || result.status !== 0 ?', 'false ?'],
  ['quote paths are not turned off in the preview', TARGETS, "'-c', 'core.quotePath=off', ", ''],
  // what a word means
  ['a $ expansion is a literal', OPERANDS, "word.includes('$') || ", ''],
  ['a % expansion is a literal', OPERANDS, "word.includes('%') || ", ''],
  ['a backtick substitution is a literal', OPERANDS, "(dialect === DIALECTS.BASH && word.includes('`'))", 'false'],
  ['a backtick in PowerShell is a substitution', OPERANDS, "(dialect === DIALECTS.BASH && word.includes('`'))", "word.includes('`')"],
  ['an unknowable directory is guessed', OPERANDS, "if (directory === undefined) return [{ path: undefined, unresolvable: 'directory', via }];", ''],
  ['braces are expanded in PowerShell too', OPERANDS, 'dialect === DIALECTS.BASH ? braceExpansion(raw) : { words: [raw], unsupported: false }', 'braceExpansion(raw)'],
  ['braces are never expanded', OPERANDS, 'dialect === DIALECTS.BASH ? braceExpansion(raw) : { words: [raw], unsupported: false }', '{ words: [raw], unsupported: false }'],
  ['a brace range is guessed', OPERANDS, "if (unsupported) return [{ path: undefined, unresolvable: 'variable', via }];", ''],
  ['a glob is not expanded', OPERANDS, 'if (hasWildcard(word)) entries.push', 'if (false) entries.push'],
  ['the literal spelling of a glob is dropped', OPERANDS, 'if (hasWildcard(word)) entries.push(...expandPath(absolute).map((expanded) => ({ path: expanded, via })));\n\n    entries.push({ path: absolute, via });', 'if (hasWildcard(word)) entries.push(...expandPath(absolute).map((expanded) => ({ path: expanded, via })));\n    else entries.push({ path: absolute, via });'],
  ['Git Bash spellings are not translated', OPERANDS, 'path.resolve(directory, nativeSpelling(word, platform))', 'path.resolve(directory, word)'],
  // what the agent created
  ['an Edit target counts as created', AUTHORSHIP, "write.channel === 'edit' ? write.via === WRITE_TOOL_VIA : write.via !== SED_VIA", 'true'],
  ['a sed -i target counts as created', AUTHORSHIP, "write.channel === 'edit' ? write.via === WRITE_TOOL_VIA : write.via !== SED_VIA", "write.channel === 'edit' ? write.via === WRITE_TOOL_VIA : true"],
  ['a Write does not count as created', AUTHORSHIP, "write.channel === 'edit' ? write.via === WRITE_TOOL_VIA : write.via !== SED_VIA", "write.channel === 'edit' ? false : write.via !== SED_VIA"],
  ['a shell write does not count as created', AUTHORSHIP, "write.channel === 'edit' ? write.via === WRITE_TOOL_VIA : write.via !== SED_VIA", "write.channel === 'edit' ? write.via === WRITE_TOOL_VIA : false"],
  ['mkdir, touch and New-Item create nothing', AUTHORSHIP, "dialect !== undefined && typeof command === 'string' ? creationTargets", 'false ? creationTargets'],
  ['any block of a record is a tool call', AUTHORSHIP, "if (block?.type === 'tool_use') authored.push", 'if (true) authored.push'],
  ['a record\'s own cwd is ignored', AUTHORSHIP, "typeof record?.cwd === 'string' && record.cwd.length > 0 ? record.cwd : fallbackCwd", 'fallbackCwd'],
  ['a half-written line stops the read', AUTHORSHIP, '} catch {\n      continue;\n    }', '} catch {\n      return authored;\n    }'],
  ['only the exact authored path is owned', AUTHORSHIP, 'const slash = current.lastIndexOf(\'/\');\n\n      if (slash === -1) return false;\n\n      current = current.slice(0, slash);', 'return false;'],
  ['the agent\'s own worktree is never owned', AUTHORSHIP, 'if (ownTreeRoot !== undefined) roots.add(canonical(ownTreeRoot));', ''],
  ['an authored path is not owned', AUTHORSHIP, 'for (const file of authored) roots.add(canonical(file));', ''],
  ['ownership is compared as spelled', AUTHORSHIP, 'owns: (candidate) => ownsCanonical(canonical(candidate))', 'owns: (candidate) => ownsCanonical(candidate)'],
  // what mkdir, touch and New-Item create
  ['mkdir option values are operands', CREATION, "['mkdir', new Set(['-m', '--mode', '-Z', '--context'])]", "['mkdir', new Set([])]"],
  ['touch option values are operands', CREATION, "['touch', new Set(['-d', '--date', '-t', '-r', '--reference'])]", "['touch', new Set([])]"],
  ['md is not mkdir', CREATION, "['md', new Set()],", ''],
  ['-- does not end the options of mkdir', CREATION, "if (!optionsEnded && word === '--') {", 'if (false) {'],
  ['options after -- are still options for mkdir', CREATION, 'if (!optionsEnded && isOption(word)) {', 'if (isOption(word)) {'],
  ['New-Item -Name is ignored', CREATION, "if (parameter === '-name') names.push(args[index + 1]);", ''],
  ['New-Item -Path is ignored', CREATION, "if (parameter === '-path') paths.push(args[index + 1]);", ''],
  ['New-Item values are operands', CREATION, "new Set(['-path', '-name', '-itemtype', '-type', '-value', '-credential'])", 'new Set([])'],
  ['New-Item with a name only creates nowhere', CREATION, "(bases.length > 0 ? bases : ['.'])", 'bases'],
  ['New-Item ignores its positional path', CREATION, 'positional.slice(0, 1)', '[]'],
  ['ni is not New-Item', CREATION, "name === 'new-item' || name === 'ni'", "name === 'new-item'"],
  ['a creating command in another dialect is read with PowerShell grammar', CREATION, 'const grammar = isNewItem ? DIALECTS.POWERSHELL : dialect;', 'const grammar = DIALECTS.POWERSHELL;'],
  // what the deletion reaches
  ['a path that does not exist is foreign', FOREIGN, 'return { foreign: [], exceeded: false };\n  }\n\n  const root', 'return { foreign: [candidate], exceeded: false };\n  }\n\n  const root'],
  ['an owned path is foreign', FOREIGN, 'if (ownership.ownsCanonical(root)) return { foreign: [], exceeded: false };', ''],
  ['a foreign file is not foreign', FOREIGN, 'if (!status.isDirectory()) return { foreign: [candidate], exceeded: false };', 'if (!status.isDirectory()) return { foreign: [], exceeded: false };'],
  ['an empty folder is not foreign', FOREIGN, 'if (entries.length === 0) {', 'if (false) {'],
  ['a folder that cannot be listed is not foreign', FOREIGN, 'foreign.push(directory);\n      return;\n    }\n\n    if (entries', 'return;\n    }\n\n    if (entries'],
  ['owned entries are foreign', FOREIGN, 'if (ownership.ownsCanonical(canonicalChild)) continue;', ''],
  ['subfolders are not walked', FOREIGN, 'if (entry.isDirectory()) walk(child, canonicalChild);\n      else foreign.push(child);', 'foreign.push(child);'],
  ['a junction is followed', FOREIGN, 'if (entry.isDirectory()) walk(child, canonicalChild);', 'if (entry.isDirectory() || entry.isSymbolicLink()) walk(child, canonicalChild);'],
  ['the walk limit is ignored', FOREIGN, 'if (seen > limit) return;', ''],
  ['a walk exactly at the limit is exceeded', FOREIGN, 'exceeded: seen > limit', 'exceeded: seen >= limit'],
  ['the walk stops one entry late', FOREIGN, 'if (seen > limit) return;', 'if (seen > limit + 1) return;'],
  ['case is not folded in the walk', FOREIGN, "process.platform === 'win32' ? name.toLowerCase() : name", 'name'],
  // the agent's own tree
  ['a main checkout counts as a linked worktree', TREE, 'lstatSync(path.join(current, \'.git\')).isFile()', 'lstatSync(path.join(current, \'.git\')).isDirectory()'],
  ['every repository counts as a linked worktree', TREE, "lstatSync(path.join(current, '.git')).isFile() ? current : undefined", 'current'],
  ['the walk up stops at the working directory', TREE, 'const parent = path.dirname(current);\n\n      if (parent === current) return undefined;\n\n      current = parent;', 'return undefined;'],
  // wildcards
  ['? matches nothing', WILDCARDS, "if (head === '?') return index + 1;", ''],
  ['a class never opens', WILDCARDS, "if (head !== '[') return head === character ? index + 1 : -1;", 'return head === character ? index + 1 : -1;'],
  ['an unclosed [ is a class', WILDCARDS, "if (close === -1) return head === character ? index + 1 : -1;", 'if (close === -1) return -1;'],
  ['^ does not negate a class', WILDCARDS, "const CLASS_NEGATIONS = '!^';", "const CLASS_NEGATIONS = '!';"],
  ['! does not negate a class', WILDCARDS, "const CLASS_NEGATIONS = '!^';", "const CLASS_NEGATIONS = '^';"],
  ['a negated class matches what it lists', WILDCARDS, 'return inside !== negated ? close + 1 : -1;', 'return inside ? close + 1 : -1;'],
  ['a dash before the close is a range', WILDCARDS, "const isRange = pattern.charAt(cursor + 1) === '-' && cursor + 2 < close;", "const isRange = pattern.charAt(cursor + 1) === '-';"],
  ['a range excludes its upper end', WILDCARDS, 'character <= pattern.charAt(cursor + 2)', 'character < pattern.charAt(cursor + 2)'],
  ['a range excludes its lower end', WILDCARDS, 'character >= pattern.charAt(cursor)', 'character > pattern.charAt(cursor)'],
  ['a star does not remember where it was', WILDCARDS, 'starName += 1;\n      nameAt = starName;', 'nameAt += 1;'],
  ['a trailing star is a literal', WILDCARDS, "while (glob.charAt(patternAt) === '*') patternAt += 1;", ''],
  ['a pattern longer than the name matches', WILDCARDS, 'return patternAt === glob.length;', 'return true;'],
  ['case folds always', WILDCARDS, 'const glob = fold ? pattern.toLowerCase() : pattern;', 'const glob = pattern.toLowerCase();'],
  ['a brace group with one part is expanded', WILDCARDS, 'if (parts.length < 2) {', 'if (parts.length < 1) {'],
  ['a brace range is expanded as a literal', WILDCARDS, "const isRange = parts[0].includes('..');", 'const isRange = false;'],
  ['an unclosed brace is an error', WILDCARDS, "if (close === -1) return { words: [word], unsupported: false };", "if (close === -1) return { words: [], unsupported: true };"],
  ['nested braces split at the inner comma', WILDCARDS, "if (character === '{') depth += 1;\n    if (character === '}') depth -= 1;\n\n    if (character === ',' && depth === 0) {", "if (character === ',') {"],
  ['the brace list is not bounded', WILDCARDS, 'return words.length > MAX_BRACE_WORDS ? { words: [word], unsupported: true } : { words, unsupported };', 'return { words, unsupported };'],
  ['a bounded list is reported as supported', WILDCARDS, '{ words: [word], unsupported: true } : { words, unsupported }', '{ words: [word], unsupported: false } : { words, unsupported }'],
  ['an inner range does not make the word unsupported', WILDCARDS, 'unsupported = unsupported || inner.unsupported;', ''],
  ['the tail of a one-part group is dropped', WILDCARDS, 'const rest = braceExpansion(word.slice(close + 1));', 'const rest = { words: [\'\'], unsupported: false };'],
  ['a wildcard segment is not listed', WILDCARDS, 'if (!hasWildcard(segment)) {', 'if (true) {'],
  ['a wildcard that matches is dropped', WILDCARDS, 'if (wildcardMatch(segment, name, fold)) next.push(path.join(base, name));', ''],
  ['a missing folder aborts the expansion', WILDCARDS, '} catch {\n        continue;\n      }', '} catch {\n        return [];\n      }'],
  ['the file system case rule is ignored', WILDCARDS, "const FOLDS_CASE = process.platform === 'win32';", 'const FOLDS_CASE = false;'],
  // the refusal
  ['a long list is not capped', REFUSAL, 'verdict.files.slice(0, MAX_LISTED)', 'verdict.files'],
  ['the cap is one more', REFUSAL, 'export const MAX_LISTED = 5;', 'export const MAX_LISTED = 6;'],
  ['the count is the listed number', REFUSAL, 'count: String(verdict.files.length)', 'count: String(listed.length)'],
  ['an unresolvable verdict uses the foreign message', REFUSAL, "if (verdict.kind === 'unresolved') return render(MESSAGES[`unresolved_${verdict.code}`], { via: verdict.via });", ''],
  ['the English half loses the incident date', REFUSAL, "'WHY. Measured 2026-10-19 (third occurrence of worker-temp-file-collided-across-sessions): writers told to',", "'WHY. Measured (third occurrence of worker-temp-file-collided-across-sessions): writers told to',"],
  ['the English half stops saying to leave the files alone', REFUSAL, "'LEAVE THEM ALONE: those files belong to another actor.", "'NOTE: those files belong to another actor."],
  ['the English half stops naming the remedy', REFUSAL, "'(<scratchpad>/<your-name>/), keep your scratch output there and delete there. Your own worktree is yours too.',", "'(keep your scratch output there). Your own worktree is yours too.',"],
  ['the Spanish half stops saying to leave the files alone', REFUSAL, "'DEJAR ESOS FICHEROS EN PAZ: pertenecen a otro actor.", "'AVISO: pertenecen a otro actor."],
  ['the Spanish half loses its accent mark', REFUSAL, "'FOREIGN-DELETE GUARD RECHAZÓ este borrado: un agente delegado", "'FOREIGN-DELETE GUARD RECHAZO este borrado: un agente delegado"],
  ['the Spanish half stops naming the files', REFUSAL, "(se muestran {shown}): {files}'", "(se muestran {shown})'"],
  ['the Spanish half of a reason is dropped', REFUSAL, "es: 'sus objetivos llegan por la entrada estándar'", "es: 'sus objetivos llegan por otra parte'"],
  ['the pipeline reason is worded as stdin', REFUSAL, "en: 'its targets arrive through the pipeline'", "en: 'its targets arrive through standard input'"],
  ['the directory reason loses its word', REFUSAL, "en: 'the folder it runs in is only known when the command runs'", "en: 'where it runs is only known when the command runs'"],
  ['the limit reason loses its word', REFUSAL, "en: 'the folder holds more entries than can be checked'", "en: 'the folder is too big'"],
  ['the preview reason loses its name', REFUSAL, "en: 'git clean could not list what it would remove'", "en: 'it could not list what it would remove'"],
  ['the variable reason loses its word', REFUSAL, "en: 'a target depends on a variable, a command substitution or a brace range that is only known when the command runs'", "en: 'a target is only known when the command runs'"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['foreign-delete-guard', 'mutation-proof', 'hook-caller', 'hook-payloads', 'shell-command', 'cherry-pick-guard', 'bilingual-output', 'write-targets', 'shared-temp-guard'],
  selftest: 'foreign-delete-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
