#!/usr/bin/env node
/**
 * The decisions of worker-git-guard, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules (green baseline first, exactly-once targets, parse-checked mutants) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de worker-git-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'worker-git-guard/guard.mjs';
const DECISION = 'worker-git-guard/forbidden-invocations.mjs';
const OPTIONS = 'worker-git-guard/git-options.mjs';
const SCOPE = 'worker-git-guard/pathspec-scope.mjs';
const LINE = 'worker-git-guard/line-invocations.mjs';
const REFUSAL = 'worker-git-guard/refusal.mjs';
const MODULE = 'worker-git-guard/untracked-pathspec.mjs';

const MUTANTS = [
  // caller identification and fail-open
  ['the main session is treated as a worker, so the orchestrator is refused too', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['every caller is allowed, so a worker may run anything', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', 'return undefined;'],
  ['PowerShell is not a shell this guard reads', GUARD, "if (dialect === undefined || typeof command !== 'string') return undefined;", "if (dialect !== 'bash' || typeof command !== 'string') return undefined;"],
  ['a refusal is never produced', GUARD, 'if (reason === undefined) return undefined;', 'return undefined;'],
  ['an internal failure refuses the command instead of failing open', GUARD, 'return undefined; // fail open: a malfunction of the decision must never block a command', "throw new Error('boom');"],
  ['the offending command is not named', GUARD, 'refusalText(offenders[0].family, offenders[0].text)', "refusalText(offenders[0].family, '(command)')"],
  // mention is data
  ['a mentioned command counts (substring scan over the text)', DECISION, 'return lineInvocations(script, dialect, cwd)', 'return lineInvocations(`${script}\\ngit reset`, dialect, cwd)'],
  // porcelain families
  ['reset is allowed', DECISION, "case 'reset':\n      return 'reset';", "case 'reset':\n      return undefined;"],
  ['switch is allowed', DECISION, "case 'switch':", "case 'switch-off':"],
  ['checkout is allowed', DECISION, "case 'checkout':\n    case", "case 'checkout-off':\n    case"],
  ['restore without --staged is allowed', DECISION, "return surely(events, 'staged') && !mayBe(events, 'worktree') ?", "return !mayBe(events, 'worktree') ?"],
  ['restore --staged --worktree is allowed', DECISION, "return surely(events, 'staged') && !mayBe(events, 'worktree') ?", "return surely(events, 'staged') ?"],
  ['clean is never refused', DECISION, "return mayBe(optionsOf('clean', args).events, 'force') ? 'clean' : undefined;", 'return undefined;'],
  ['every clean is refused', DECISION, "return mayBe(optionsOf('clean', args).events, 'force') ? 'clean' : undefined;", "return 'clean';"],
  // commit
  ['commit --no-verify is allowed', DECISION, "  if (mayBe(events, 'verify', false)) return 'commitNoVerify';\n", ''],
  ['a no-verify commit gets the paths refusal instead', DECISION, "return 'commitNoVerify';", "return 'commitNoPaths';"],
  ['commit --dry-run is refused too', DECISION, "  if (surely(events, 'dry-run')) return undefined;\n", ''],
  ['an ambiguous --d counts as a dry run', DECISION, "  if (surely(events, 'dry-run')) return undefined;", "  if (mayBe(events, 'dry-run')) return undefined;"],
  ['commit -i/--include is allowed (C1)', DECISION, "if (mayBe(events, 'all') || mayBe(events, 'include')) return", "if (mayBe(events, 'all')) return"],
  ['commit -a/--all is allowed', DECISION, "if (mayBe(events, 'all') || mayBe(events, 'include')) return", "if (mayBe(events, 'include')) return"],
  ['a pathspec file does not count as naming paths (C10)', DECISION, "return finalValue(events, 'pathspec-from-file') === undefined ? 'commitNoPaths' : undefined;", "return 'commitNoPaths';"],
  ['a commit with no path after -- is allowed', DECISION, "return finalValue(events, 'pathspec-from-file') === undefined ? 'commitNoPaths' : undefined;", 'return undefined;'],
  ['a pathspec naming no specific path is allowed (C3)', DECISION, "return namesSpecificPaths(afterDashes, dialect) ? undefined : 'commitNoPaths';", 'return undefined;'],
  ['the pathspec is read without its dialect, so @files passes in PowerShell', DECISION, 'return commitFamily(args, dialect);', "return commitFamily(args, 'bash');"],
  // push
  ['push --no-verify is allowed', DECISION, "mayBe(optionsOf('push', args).events, 'verify', false) ? 'pushNoVerify' : undefined", 'undefined'],
  ['a later push --verify does not undo --no-verify (C2)', DECISION, "mayBe(optionsOf('push', args).events, 'verify', false) ?", "optionsOf('push', args).events.some((event) => event.candidates.some((candidate) => candidate.key === 'verify' && !candidate.on)) ?"],
  // read-tree (C4, C11)
  ['read-tree is allowed', DECISION, "return readTreeWrites(args, environment) ? 'readTree' : undefined;", 'return undefined;'],
  ['every read-tree is refused', DECISION, "return readTreeWrites(args, environment) ? 'readTree' : undefined;", "return 'readTree';"],
  ['read-tree -u is not read', DECISION, "if (mayBe(events, '-u') || mayBe(events, 'reset')) return true;", "if (mayBe(events, 'reset')) return true;"],
  ['read-tree --reset is not read', DECISION, "if (mayBe(events, '-u') || mayBe(events, 'reset')) return true;", "if (mayBe(events, '-u')) return true;"],
  ['read-tree -h is refused', DECISION, "  if (args.length === 1 && args[0] === '-h') return false;\n", ''],
  ['read-tree -h beside a tree is allowed', DECISION, "if (args.length === 1 && args[0] === '-h') return false;", "if (args[0] === '-h') return false;"],
  ['read-tree --dry-run is refused (C11)', DECISION, "if (surely(events, 'dry-run') || finalValue(events, 'index-output') !== undefined) return false;", "if (finalValue(events, 'index-output') !== undefined) return false;"],
  ['read-tree --index-output is refused', DECISION, "if (surely(events, 'dry-run') || finalValue(events, 'index-output') !== undefined) return false;", "if (surely(events, 'dry-run')) return false;"],
  ['a GIT_INDEX_FILE on the line is ignored', DECISION, "return (environment.get(INDEX_FILE_VARIABLE) ?? '').length === 0;", 'return true;'],
  ['an empty GIT_INDEX_FILE counts as a temporary index', DECISION, "return (environment.get(INDEX_FILE_VARIABLE) ?? '').length === 0;", 'return environment.get(INDEX_FILE_VARIABLE) === undefined;'],
  ['another variable counts as GIT_INDEX_FILE', DECISION, "const INDEX_FILE_VARIABLE = 'GIT_INDEX_FILE';", "const INDEX_FILE_VARIABLE = 'OTHER';"],
  // plumbing families
  ['checkout-index is allowed', DECISION, "return checkoutIndexOverwrites(args) ? 'checkoutIndex' : undefined;", 'return undefined;'],
  ['every checkout-index is refused', DECISION, "return checkoutIndexOverwrites(args) ? 'checkoutIndex' : undefined;", "return 'checkoutIndex';"],
  ['checkout-index -f is not read', DECISION, "return mayBe(events, 'force') || mayBe(events, 'all');", "return mayBe(events, 'all');"],
  ['checkout-index -a is not read', DECISION, "return mayBe(events, 'force') || mayBe(events, 'all');", "return mayBe(events, 'force');"],
  ['update-index is allowed', DECISION, "return updateIndexForceRemoves(args) ? 'updateIndex' : undefined;", 'return undefined;'],
  ['every update-index is refused', DECISION, "return updateIndexForceRemoves(args) ? 'updateIndex' : undefined;", "return 'updateIndex';"],
  ['update-index reads only the last --force-remove, though git applies each to the paths after it', DECISION, "anyMayBe(optionsOf('update-index', args).events, 'force-remove')", "mayBe(optionsOf('update-index', args).events, 'force-remove')"],
  ['update-ref is allowed', DECISION, "return updateRefWrites(args) ? 'updateRef' : undefined;", 'return undefined;'],
  ['every update-ref is refused', DECISION, "return updateRefWrites(args) ? 'updateRef' : undefined;", "return 'updateRef';"],
  ['update-ref -d is not read', DECISION, "return mayBe(events, '-d') || positionals.length >= 2 ||", 'return positionals.length >= 2 ||'],
  ['update-ref <ref> <sha> is not read as a write', DECISION, "|| positionals.length >= 2 || mayBe(events, 'stdin');", "|| positionals.length >= 3 || mayBe(events, 'stdin');"],
  ['update-ref with one name is refused', DECISION, "|| positionals.length >= 2 || mayBe(events, 'stdin');", "|| positionals.length >= 1 || mayBe(events, 'stdin');"],
  ['update-ref --stdin is not read', DECISION, "|| positionals.length >= 2 || mayBe(events, 'stdin');", '|| positionals.length >= 2;'],
  ['symbolic-ref is allowed', DECISION, "return symbolicRefWrites(args) ? 'symbolicRef' : undefined;", 'return undefined;'],
  ['symbolic-ref with two names is not read as a write', DECISION, "return positionals.length >= 2 || mayBe(events, 'delete');", "return positionals.length >= 3 || mayBe(events, 'delete');"],
  ['symbolic-ref with one name (a read) is refused', DECISION, "return positionals.length >= 2 || mayBe(events, 'delete');", "return positionals.length >= 1 || mayBe(events, 'delete');"],
  ['symbolic-ref -d is not read', DECISION, "return positionals.length >= 2 || mayBe(events, 'delete');", 'return positionals.length >= 2;'],
  // git's option grammar (C2, C6, C7)
  ['words after -- are read as options', OPTIONS, "if (word === '--') {", "if (word === '--never') {"],
  ['words after -- are not counted as names', OPTIONS, 'positionals.push(...afterDashes);', ''],
  ['words after -- are not recorded as paths', OPTIONS, 'afterDashes = args.slice(index + 1);', ''],
  ['a plain word is not counted as a name', OPTIONS, '      positionals.push(word);', ''],
  ['an abbreviation is not resolved (C7)', OPTIONS, '.filter((listed) => listed.startsWith(name))', '.filter((listed) => listed === name)'],
  ['a long value word is not consumed, so --message --no-verify reads as --no-verify', OPTIONS, 'if (value === undefined && takesValue && index + 1 < args.length) {', 'if (false) {'],
  ['the name of a long option keeps its =value', OPTIONS, 'candidatesOf(longs, (equals === -1 ? word : word.slice(0, equals)).slice(2))', 'candidatesOf(longs, word.slice(2))'],
  ['the =value of a long option keeps the =', OPTIONS, 'let value = equals === -1 ? undefined : word.slice(equals + 1);', 'let value = equals === -1 ? undefined : word.slice(equals);'],
  ['a --no-x option sets x on instead of off', OPTIONS, "table.set(name, { key: negates ? name.slice(3) : name, on: !negates,", "table.set(name, { key: negates ? name.slice(3) : name, on: true,"],
  ['a --no-x option is its own key, so it never undoes --x', OPTIONS, "const negates = name.startsWith('no-') && plain.has(name.slice(3));", 'const negates = false;'],
  ['no long option takes a value', OPTIONS, "value: required ? 'required' : 'none' });", "value: 'none' });"],
  ['an optional short value is read as required, so -S eats the next word (C6)', OPTIONS, "const value = marker === '=' ? 'required' : marker === '?' ? 'optional' : 'none';", "const value = marker === '=' || marker === '?' ? 'required' : 'none';"],
  ['no short option takes a value', OPTIONS, "const value = marker === '=' ? 'required' : marker === '?' ? 'optional' : 'none';", "const value = marker === '?' ? 'optional' : 'none';"],
  ['a short option without a long one sets its key off', OPTIONS, "const resolved = long === undefined ? { key: `-${character}`, on: true } : longs.get(long);", "const resolved = long === undefined ? { key: `-${character}`, on: false } : longs.get(long);"],
  ['a short option ignores the state of its long one, so -n is not --no-verify', OPTIONS, 'table.set(character, { key: resolved.key, on: resolved.on, value });', 'table.set(character, { key: resolved.key, on: true, value });'],
  ['an unknown short option hides the rest of its cluster', OPTIONS, "          events.push({ candidates: [] });\n          continue;", "          events.push({ candidates: [] });\n          break;"],
  ['a short option without value swallows the rest of the cluster', OPTIONS, "          events.push({ candidates: [option] });\n          continue;", "          events.push({ candidates: [option] });"],
  ['an optional short value eats the next word (C6)', OPTIONS, "if (value.length === 0 && option.value === 'required' && index + 1 < args.length) {", "if (value.length === 0 && option.value !== 'none' && index + 1 < args.length) {"],
  ['the short value word is read again as an option', OPTIONS, '          index += 1;\n          value = args[index]; // the value is the next word', '          value = args[index]; // the value is the next word'],
  ['a value-taking short option does not end the cluster, so -m"no" reads as -n', OPTIONS, 'break; // the rest of the cluster is the value', ''],
  ['the FIRST occurrence wins instead of the last (C2)', OPTIONS, 'const lastTouching = (events, key) => events.findLast(', 'const lastTouching = (events, key) => events.find('],
  ['an ambiguous abbreviation counts as certain', OPTIONS, "return last !== undefined && last.candidates.length === 1 && last.candidates[0].on === on;", "return last !== undefined && last.candidates[0].on === on;"],
  ['an option git applies to the paths after it is read from the last occurrence only', OPTIONS, 'export const anyMayBe = (events, key, on = true) => events.some(', 'export const anyMayBe = (events, key, on = true) => events.slice(-1).some('],
  ['the value of an option is lost', OPTIONS, '? last.value : undefined;', '? undefined : undefined;'],
  // which pathspec names specific paths (C3)
  ['a star pattern names specific paths', SCOPE, "const WHOLE_TREE_CHARACTERS = './*';", "const WHOLE_TREE_CHARACTERS = './';"],
  ['a pathspec without magic is read as short magic', SCOPE, "  if (!spec.startsWith(':')) return { magic: [], pattern: spec };\n", ''],
  ['long magic is not read', SCOPE, "if (spec.startsWith(':(')) {", 'if (false) {'],
  ['short exclusion magic is read as top', SCOPE, "magic.push(spec.charAt(at) === '/' ? 'top' : 'exclude');", "magic.push('top');"],
  ['an exclusion counts as naming a path', SCOPE, "const isExclusion = (spec) => magicOf(spec).magic.includes('exclude');", 'const isExclusion = (spec) => false;'],
  ['only exclusions name specific paths', SCOPE, 'return including.length > 0 && !including.some(namesWholeTree);', 'return !including.some(namesWholeTree);'],
  ['a whole-tree pathspec names specific paths', SCOPE, 'return including.length > 0 && !including.some(namesWholeTree);', 'return including.length > 0;'],
  ['an expansion counts as a named path', SCOPE, "const named = pathspecs.filter((spec) => dialect === undefined || !isExpansion(spec, dialect));", 'const named = pathspecs;'],
  ['a command substitution with a slash counts as a named path', SCOPE, "  if (word.startsWith('$(') && word.endsWith(')')) return true;\n", ''],
  ['a bash backtick counts as a named path', SCOPE, "  if (dialect === 'bash' && word.startsWith('`') && word.endsWith('`')) return true;\n", ''],
  ['@ is an expansion in bash too', SCOPE, "(dialect === 'powershell' && word.startsWith('@'))", "word.startsWith('@')"],
  ['a variable with a literal path part counts as an expansion', SCOPE, "return sigil && !word.includes('/') && !word.includes('\\\\');", "return sigil && !word.includes('\\\\');"],
  ['a variable with a literal backslash part counts as an expansion', SCOPE, "return sigil && !word.includes('/') && !word.includes('\\\\');", "return sigil && !word.includes('/');"],
  // the line context and its aliases (C4, C9, C12)
  ['an alias can replace a judged builtin', LINE, '|| JUDGED_BUILTINS.has(name) ||', '||'],
  ['an alias leading to another is not followed', LINE, 'const ALIAS_DEPTH = 8;', 'const ALIAS_DEPTH = 1;'],
  ['a shell alias is read as a git alias', LINE, "if (body.startsWith('!')) {", 'if (false) {'],
  ['the typed arguments of an alias are dropped', LINE, 'args: [...inner.args, ...invocation.args]', 'args: inner.args'],
  ['an alias name keeps its case, though git config names have none', LINE, 'aliases.set(setting.slice(ALIAS_KEY.length, equals).toLowerCase(),', 'aliases.set(setting.slice(ALIAS_KEY.length, equals),'],
  ['aliases defined on the line are ignored', LINE, 'found.push(...expanded({ ...invocation, environment, chain }, aliasesOf(invocation.gitOptions), 0));', 'found.push({ ...invocation, environment, chain });'],
  ['every command starts a new chain', LINE, "if (previousSeparator !== undefined && previousSeparator !== '&&') chain += 1;", 'chain += 1;'],
  ['no command starts a new chain', LINE, "if (previousSeparator !== undefined && previousSeparator !== '&&') chain += 1;", ''],
  ['PowerShell $env: assignments are ignored', LINE, "    if (dialect === 'powershell') recordPowerShellAssignment(command.words, lineEnvironment);\n", ''],
  ['an environment prefix is ignored', LINE, "    for (const word of command.words.slice(0, at).filter(isAssignment)) environment.set(word.slice(0, word.indexOf('=')), word.slice(word.indexOf('=') + 1));\n", ''],
  ['an environment prefix leaks into the later commands of the line', LINE, 'const environment = new Map(lineEnvironment);', 'const environment = lineEnvironment;'],
  ['a PowerShell variable name keeps its case', LINE, '.slice(POWERSHELL_ENVIRONMENT.length).toUpperCase();', '.slice(POWERSHELL_ENVIRONMENT.length);'],
  ['a spaced PowerShell assignment is not read', LINE, "(second === '=' ? third : undefined)", 'undefined'],
  // untracked pathspec: composition in the guard
  ['the untracked check never runs', GUARD, 'const reason = offenders.length === 0 ? untrackedRefusal(payload, command, dialect, cwd, list) :', 'const reason = offenders.length === 0 ? undefined :'],
  ['the untracked check also runs when the lexical rules refused (wrong message wins)', GUARD, 'const reason = offenders.length === 0 ? untrackedRefusal(payload, command, dialect, cwd, list) : refusalText(offenders[0].family, offenders[0].text);', 'const reason = untrackedRefusal(payload, command, dialect, cwd, list) ?? (offenders.length === 0 ? undefined : refusalText(offenders[0].family, offenders[0].text));'],
  ['the git port is not passed on, so the real git always answers', GUARD, 'untrackedUnderCommits(command, dialect, cwd, list)', 'untrackedUnderCommits(command, dialect, cwd)'],
  ['the check starts from the process cwd instead of the payload cwd', GUARD, 'untrackedRefusal(payload, command, dialect, cwd, list) :', 'untrackedRefusal(payload, command, dialect, process.cwd(), list) :'],
  ['a failing check refuses instead of failing open', GUARD, 'reason: error instanceof Error ? error.message.split(\'\\n\')[0] : String(error) });\n\n    return undefined;', 'reason: error instanceof Error ? error.message.split(\'\\n\')[0] : String(error) });\n\n    throw error;'],
  ['a failing check is not journaled', GUARD, "journal({ verdict: 'unchecked', session: payload.session_id, cwd, reason:", "void ({ verdict: 'unchecked', session: payload.session_id, cwd, reason:"],
  ['a git that could not answer is not journaled', GUARD, 'for (const miss of found.unchecked) journal(', 'for (const miss of []) journal('],
  ['the journal of a miss loses the reason', GUARD, 'command: miss.text, reason: miss.reason }', 'command: miss.text }'],
  ['the journal of a miss loses the directory', GUARD, 'cwd: miss.directory ?? cwd,', 'cwd,'],
  ['an unchecked commit refuses', GUARD, "if (found.offender === undefined) return undefined;", "if (found.offender === undefined) return found.unchecked.length > 0 ? refusalText('commitUntracked', 'unchecked', { paths: '', total: 0 }) : undefined;"],
  ['a deny is journaled in the unchecked journal', GUARD, '  const { family, text, files, file } = found.offender;', "  const { family, text, files, file } = found.offender;\n  journal({ verdict: 'deny', cwd, command: text });"],
  ['an unreadable pathspec file is allowed', GUARD, "if (family !== 'commitUntracked') return refusalText(family, text, { file: file ?? '' });", "if (family !== 'commitUntracked') return undefined;"],
  ['the refusal of an unreadable pathspec file does not name it', GUARD, "{ file: file ?? '' }", "{ file: '' }"],
  ['the refusal lists every untracked path', GUARD, 'const LISTED_PATHS = 10;', 'const LISTED_PATHS = 1000;'],
  ['the refusal lists 9 paths only', GUARD, 'const LISTED_PATHS = 10;', 'const LISTED_PATHS = 9;'],
  ['a path with whitespace is not quoted', GUARD, '(/\\s/.test(file) ? `"${file}"` : file)', 'file'],
  ['every path is quoted', GUARD, '(/\\s/.test(file) ? `"${file}"` : file)', '`"${file}"`'],
  ['the refusal omits the total', GUARD, '{ paths: listed.join(\' \'), total: files.length }', '{ paths: listed.join(\' \'), total: listed.length }'],
  ['the journal is written outside the mechanism state directory', GUARD, "stateDir('worker-git-guard')", "stateDir('worker-git-guard-x')"],
  ['the journal is written into the dispatcher journal, mixing formats', GUARD, "path.join(directory, 'unchecked.jsonl')", "path.join(directory, 'journal.jsonl')"],
  // untracked pathspec: the decision module
  ['a commit with no pathspec is sent to git', MODULE, 'return afterDashes.length === 0 ? undefined : { pathspecs: afterDashes, fromFile: false };', 'return { pathspecs: afterDashes, fromFile: false };'],
  ['a dry run is sent to git', MODULE, "if (invocation.subcommand !== 'commit' || surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;", "if (invocation.subcommand !== 'commit') continue;"],
  ['every subcommand is read as a commit', MODULE, "if (invocation.subcommand !== 'commit' || surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;", "if (surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;"],
  ['git -C is ignored', MODULE, 'const directory = invocationDirectory(invocation);\n    const pathspec', 'const directory = invocation.directory;\n    const pathspec'],
  ['an unfollowable directory is asked to git as the process cwd', MODULE, "if (typeof directory !== 'string') {\n      unchecked.push(", 'if (false) {\n      unchecked.push('],
  ['an unfollowable directory is not reported', MODULE, "unchecked.push({ text: invocation.text, directory, reason: 'the directory the commit runs in cannot be followed from the line' });", ''],
  ['a git error is not reported', MODULE, 'unchecked.push({ text: invocation.text, directory, reason: answer.error });', ''],
  ['a git error counts as an offender', MODULE, 'unchecked.push({ text: invocation.text, directory, reason: answer.error });\n      continue;', "return { offender: { family: 'commitUntracked', text: invocation.text, files: [] }, unchecked };"],
  ['an empty answer is an offender', MODULE, 'if (files.length > 0) return', 'if (files.length >= 0) return'],
  ['the walk does not stop at the first offender', MODULE, "if (files.length > 0) return { offender: { family: 'commitUntracked', text: invocation.text, files }, unchecked };", "if (files.length > 0) unchecked.push({ text: invocation.text, directory, reason: 'offender' });"],
  // C12: an earlier git add of the same chain
  ['an earlier add never counts', MODULE, '      added.push(...addedPaths(invocation).map((resolved) => ({ chain: invocation.chain, resolved })));\n', ''],
  ['an add of another chain counts', MODULE, 'const staged = added.filter((entry) => entry.chain === invocation.chain);', 'const staged = added;'],
  ['the added paths are not subtracted', MODULE, 'const files = answer.files.filter((file) => !staged.some((entry) => isUnder(entry.resolved, path.resolve(directory, file))));', 'const files = answer.files;'],
  ['a dry-run add counts as staging', MODULE, "  if (options.some((word) => word === '-n' || word === '--dry-run')) return [];\n", ''],
  ['an add of a sibling directory covers this one', MODULE, "return !relative.startsWith('..') && !path.isAbsolute(relative);", 'return !path.isAbsolute(relative);'],
  ['an add on another drive covers this one', MODULE, "return !relative.startsWith('..') && !path.isAbsolute(relative);", "return !relative.startsWith('..');"],
  // C10: --pathspec-from-file
  ['the pathspec file is never read', MODULE, "const file = finalValue(events, 'pathspec-from-file');", 'const file = undefined;'],
  ['an unreadable pathspec file gets the paths refusal', MODULE, "family: 'commitPathspecFile'", "family: 'commitNoPaths'"],
  ['a pathspec file naming the whole tree is asked to git', MODULE, 'if (pathspec.fromFile && !namesSpecificPaths(pathspec.pathspecs, undefined))', 'if (false)'],
  ['a relative pathspec file is read from the process cwd', MODULE, '? path.resolve(directory, file) :', '? file :'],
  ['an absolute pathspec file after an unknown cd is unreadable', MODULE, ': path.isAbsolute(file) ? file : undefined;', ': undefined;'],
  ['standard input is read as a file named -', MODULE, 'file === STANDARD_INPUT || resolved === undefined', 'resolved === undefined'],
  ['--pathspec-file-nul is ignored', MODULE, "surely(events, 'pathspec-file-nul') ? '\\0' : '\\n'", "'\\n'"],
  ['a CRLF line keeps its carriage return', MODULE, ".map((line) => (line.endsWith('\\r') ? line.slice(0, -1) : line))", ''],
  ['empty lines of the pathspec file are kept', MODULE, 'pathspecs: lines.filter((line) => line.length > 0), fromFile: true', 'pathspecs: lines, fromFile: true'],
  ['the file adapter never reads', MODULE, "    return readFileSync(file, 'utf8');", '    return undefined;'],
  ['the file adapter reads a missing file as empty', MODULE, '  } catch {\n    return undefined;\n  }', "  } catch {\n    return '';\n  }"],
  ['git is asked for tracked files instead of untracked ones', MODULE, "['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs]", "['ls-files', '--exclude-standard', '-z', '--', ...pathspecs]"],
  ['git is asked without respecting ignore rules', MODULE, "['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs]", "['ls-files', '--others', '-z', '--', ...pathspecs]"],
  ['git answers one path per line instead of NUL separated', MODULE, "['ls-files', '--others', '--exclude-standard', '-z', '--', ...pathspecs]", "['ls-files', '--others', '--exclude-standard', '--', ...pathspecs]"],
  ['the pathspec is not protected by --', MODULE, "'-z', '--', ...pathspecs]", "'-z', ...pathspecs]"],
  ['git runs through a shell', MODULE, '    cwd: directory,\n', '    cwd: directory,\n    shell: true,\n'],
  ['git runs in the process cwd', MODULE, '    cwd: directory,\n', ''],
  ['git has no timeout', MODULE, '    timeout: GIT_TIMEOUT_MS,\n', ''],
  ['the timeout is a minute', MODULE, 'export const GIT_TIMEOUT_MS = 5000;', 'export const GIT_TIMEOUT_MS = 60000;'],
  ['a spawn error is ignored', MODULE, 'if (result.error !== undefined) {', 'if (false) {'],
  ['a timeout is reported as an inability to run', MODULE, "const timedOut = result.error.code === 'ETIMEDOUT';", 'const timedOut = false;'],
  ['every spawn error is reported as a timeout', MODULE, "const timedOut = result.error.code === 'ETIMEDOUT';", 'const timedOut = true;'],
  ['a non-zero exit is read as an answer', MODULE, 'if (result.status !== 0) return {', 'if (false) return {'],
  ['the stderr of a failure is lost', MODULE, 'String(result.stderr).trim().split(\'\\n\')[0]', "''"],
  ['the answer is split on newlines', MODULE, "result.stdout.split('\\0')", "result.stdout.split('\\n')"],
  ['empty entries of the answer are kept', MODULE, '.filter((file) => file.length > 0)', ''],
  // refusal text
  ['the commit paths refusal drops the status check', REFUSAL, "'run `git status --porcelain` before the next one.'", "'be careful.'"],
  ['the commit paths refusal drops the safe form', REFUSAL, "`git commit -m \"<msg>\" -- <path> <path>` commits only the named paths.", 'commit carefully.'],
  ['the commit paths refusal drops -i/--include (C1)', REFUSAL, "'and `-i`/`--include` commits everything staged besides the named paths. A pathspec that names no specific',", "'and a pathspec that names no specific',"],
  ['the untracked refusal drops the git add advice', REFUSAL, "'USE INSTEAD: run `git add -- {paths}` first, in its own command or earlier in the same `&&` chain, or name',", "'USE INSTEAD: be careful, or name',"],
  ['the untracked refusal drops the Spanish git add advice', REFUSAL, "'USAR EN SU LUGAR: ejecute antes `git add -- {paths}`, en su propio comando o antes en la misma cadena `&&`, o',", "'USAR EN SU LUGAR: tenga cuidado, o',"],
  ['the untracked refusal loses the Spanish accents', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: el pathspec de este `git commit` cubre", "'WORKER-GIT GUARD RECHAZO este comando: el pathspec de este `git commit` cubre"],
  ['the read-tree refusal stops naming the safe route', REFUSAL, "'USE INSTEAD: commit your work in progress on your branch, or ask the orchestrator to clear the index. To read',", "'USE INSTEAD: ask. To read',"],
  ['the Spanish read-tree refusal falls back to voseo (C5)', REFUSAL, "'USAR EN SU LUGAR: haga commit de su trabajo a medias en su rama, o pida al orquestador que limpie el índice.',", "'USAR EN SU LUGAR: commiteá tu trabajo a medias en tu rama, o pedile al orquestador que limpie el índice.',"],
  ['the symbolic-ref refusal stops naming the allowed read', REFUSAL, "'USE INSTEAD: nothing is needed; the orchestrator creates the branches and worktrees. Reading is allowed:',", "'USE INSTEAD: nothing is needed. Reading is allowed:',"],
  ['the reset refusal stops naming the alternative', REFUSAL, "'USE INSTEAD: to unstage, `git restore --staged -- <paths>` (it changes only the index). Never move HEAD;',", "'USE INSTEAD: to unstage, ask. Never move HEAD;',"],
  ['the Spanish half loses its accent mark', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git reset`", "'WORKER-GIT GUARD RECHAZO este comando: un worker delegado no puede ejecutar `git reset`"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['worker-git-guard', 'mutation-proof', 'hook-caller', 'hook-payloads', 'hook-state', 'shell-command', 'cherry-pick-guard', 'bilingual-output', 'company-remote'],
  selftest: 'worker-git-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
