#!/usr/bin/env node
/**
 * The decisions of worker-git-guard, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules (green baseline first, exactly-once targets, parse-checked mutants) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * SLICES. The whole campaign runs longer than one bounded foreground command, so it is proved in committed slices:
 * `node worker-git-guard/mutants.mjs --from=<n> --to=<n>` runs mutants `n` up to `to` (excluded), counted from 0;
 * without them it runs every mutant. A slice prints its range first and its own verdict last: `VERDICT PASS` only
 * when every mutant of the slice was killed by an assertion, `VERDICT FAIL` with the number of survivors otherwise
 * (a crash kill counts as a survivor, `crashKills: 'fail'`), so a failing run never reads as all killed.
 *
 * @es Las decisiones de worker-git-guard, rotas una a una, que `selftest.mjs` debe cazar. La campaña se prueba en
 * tramos confirmados: `--from=<n> --to=<n>` corre los mutantes de `n` a `to` (excluido), contando desde 0; sin ellos,
 * todos. Un tramo imprime primero su rango y al final su propio veredicto: `VERDICT PASS` solo si cada mutante murió
 * por una aserción, `VERDICT FAIL` con el número de supervivientes si no (una muerte por crash cuenta como
 * superviviente), así que una corrida fallida nunca se lee como todo muerto.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'worker-git-guard/guard.mjs';
const DECISION = 'worker-git-guard/forbidden-invocations.mjs';
const OPTIONS = 'worker-git-guard/git-options.mjs';
const SCOPE = 'worker-git-guard/pathspec-scope.mjs';
const LINE = 'worker-git-guard/line-invocations.mjs';
const CONFIG = 'worker-git-guard/line-config.mjs';
const TOUCH = 'worker-git-guard/selector-touches.mjs';
const REFUSAL = 'worker-git-guard/refusal.mjs';
const MODULE = 'worker-git-guard/untracked-pathspec.mjs';
const LAYOUT = 'worker-git-guard/repository-layout.mjs';
const WRITES = 'worker-git-guard/line-writes.mjs';

/** The exit code of a slice that measured nothing (a bad range). @es La salida de un tramo que no midió nada. */
const EXIT_NOT_MEASURED = 2;

export const MUTANTS = [
  // caller identification and fail-open
  ['the main session is treated as a worker, so the orchestrator is refused too', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['every caller is allowed, so a worker may run anything', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', 'return undefined;'],
  ['PowerShell is not a shell this guard reads', GUARD, "if (dialect === undefined || typeof command !== 'string') return undefined;", "if (dialect !== 'bash' || typeof command !== 'string') return undefined;"],
  ['a refusal is never produced', GUARD, 'if (reason === undefined) return undefined;', 'return undefined;'],
  ['an internal failure refuses the command instead of failing open', GUARD, 'return undefined; // fail open: a malfunction of the decision must never block a command', "throw new Error('boom');"],
  ['the offending command is not named', GUARD, 'refusalText(offenders[0].family, offenders[0].text)', "refusalText(offenders[0].family, '(command)')"],
  // mention is data
  ['a mentioned command counts (substring scan over the text)', DECISION, 'return lineInvocations(script, dialect, cwd)', 'return lineInvocations(`${script}\\ngit reset`, dialect, cwd)'],
  // A, C: unresolvable lines and values (third round)
  ['a selector touch on the line is ignored (C)', DECISION, "  if (invocation.selectorTouch !== undefined || invocation.config.has(ANY_SETTING)) return 'unresolvable';", "  if (invocation.config.has(ANY_SETTING)) return 'unresolvable';"],
  ['a configuration that hides its keys is trusted (D)', DECISION, "  if (invocation.selectorTouch !== undefined || invocation.config.has(ANY_SETTING)) return 'unresolvable';", "  if (invocation.selectorTouch !== undefined) return 'unresolvable';"],
  ['a git command behind wrapper options is not seen (C)', DECISION, "  if (hidden !== undefined) return [{ family: 'unresolvable', text: hidden }];\n", ''],
  ['a commit with a hidden repository or index value is trusted (A)', DECISION, "if (hidesSelector(invocation) || isCutBySubexpression(invocation, dialect) ||", 'if (isCutBySubexpression(invocation, dialect) ||'],
  ['a PowerShell (...) cutting a commit is trusted (A)', DECISION, "if (hidesSelector(invocation) || isCutBySubexpression(invocation, dialect) ||", 'if (hidesSelector(invocation) ||'],
  ['a pathspec word holding an expansion is trusted (A)', DECISION, " || afterDashes.some((word) => isUnresolvableWord(word, dialect))) return 'unresolvable';", ") return 'unresolvable';"],
  ['a PowerShell splat is a literal word (A)', DECISION, "holdsExpansion(word) || (dialect === 'powershell' && word.startsWith('@'))", 'holdsExpansion(word)'],
  ['a PowerShell script block cutting a commit is trusted (A)', DECISION, "const POWERSHELL_SUBEXPRESSIONS = new Set(['(', '{']);", "const POWERSHELL_SUBEXPRESSIONS = new Set(['(']);"],
  ['a read-tree with a hidden index value is trusted (A)', DECISION, "      if (hidesSelector(invocation, [finalValue(optionsOf('read-tree', args).events, 'index-output')])) return 'unresolvable';\n", ''],
  ['a hidden --index-output is trusted (A)', DECISION, "hidesSelector(invocation, [finalValue(optionsOf('read-tree', args).events, 'index-output')])", 'hidesSelector(invocation, [])'],
  ['a backtick is no expansion (A)', CONFIG, "export const holdsExpansion = (word) => word.includes('$') || word.includes('`');", "export const holdsExpansion = (word) => word.includes('$');"],
  // porcelain families
  ['reset is allowed', DECISION, "case 'reset':\n      return 'reset';", "case 'reset':\n      return undefined;"],
  ['switch is allowed', DECISION, "case 'switch':", "case 'switch-off':"],
  ['checkout is allowed', DECISION, "case 'checkout':\n    case", "case 'checkout-off':\n    case"],
  ['restore without --staged is allowed', DECISION, "return surely(events, 'staged') && !mayBe(events, 'worktree') ? undefined : 'restore';", "return !mayBe(events, 'worktree') ? undefined : 'restore';"],
  ['restore --staged --worktree is allowed', DECISION, "return surely(events, 'staged') && !mayBe(events, 'worktree') ? undefined : 'restore';", "return surely(events, 'staged') ? undefined : 'restore';"],
  ['clean is never refused', DECISION, "return cleanDeletes(invocation) ? 'clean' : undefined;", 'return undefined;'],
  ['every clean is refused', DECISION, "return cleanDeletes(invocation) ? 'clean' : undefined;", "return 'clean';"],
  // R11, D: clean.requireForce set to false on the line, read by git's boolean rule
  ['clean.requireForce=false on the line is ignored (R11)', DECISION, 'const forceNotRequired = requireForce === UNSEEN || (requireForce !== undefined && gitBoolean(requireForce) === false);', 'const forceNotRequired = false;'],
  ['a dry run with clean.requireForce=false is refused (R11)', DECISION, "return mayBe(events, 'force') || (forceNotRequired && !surely(events, 'dry-run'));", "return mayBe(events, 'force') || forceNotRequired;"],
  ['an empty value is not false (D)', CONFIG, "const FALSE_WORDS = new Set(['false', 'no', 'off', '']);", "const FALSE_WORDS = new Set(['false', 'no', 'off']);"],
  ['on is not true (D)', CONFIG, "const TRUE_WORDS = new Set(['true', 'yes', 'on']);", "const TRUE_WORDS = new Set(['true', 'yes']);"],
  ['0x is not hexadecimal (D)', CONFIG, "const base = lower.startsWith('0x') ? 16 : lower.startsWith('0') ? 8 : 10;", "const base = lower.startsWith('0') ? 8 : 10;"],
  ['a leading 0 is not octal (D)', CONFIG, "const base = lower.startsWith('0x') ? 16 : lower.startsWith('0') ? 8 : 10;", "const base = lower.startsWith('0x') ? 16 : 10;"],
  ['a sign is not read (D)', CONFIG, "  if (rest.startsWith('+') || rest.startsWith('-')) rest = rest.slice(1);\n", ''],
  ['leading whitespace is not skipped (D)', CONFIG, '  let rest = text.trimStart();', '  let rest = text;'],
  ['the k unit is unknown (D)', CONFIG, "const UNITS = new Set(['', 'k', 'm', 'g']);", "const UNITS = new Set(['', 'm', 'g']);"],
  ['a trailing word after the digits is accepted (D)', CONFIG, '  if (length === 0 || !UNITS.has(body.slice(length))) return undefined;', '  if (length === 0) return undefined;'],
  ['zero is never zero (D)', CONFIG, "  return [...body.slice(0, length)].every((digit) => digit === '0');", '  return false;'],
  ['an invalid value reads as true (D)', CONFIG, '  return zero === undefined ? undefined : !zero;', '  return !zero;'],
  ['an unset --config-env variable reads as a value (D)', CONFIG, 'value === undefined || holdsExpansion(value) ? UNSEEN : value', "value === undefined || holdsExpansion(value) ? 'true' : value"],
  ['an alias whose body the line hides runs unseen (R5)', DECISION, "  if (invocation.unseenAlias === true) return 'aliasUnseen';\n", ''],
  // commit
  ['commit --no-verify is allowed', DECISION, "  if (mayBe(events, 'verify', false)) return 'commitNoVerify';\n", ''],
  ['a no-verify commit gets the paths refusal instead', DECISION, "return 'commitNoVerify';", "return 'commitNoPaths';"],
  ['commit --dry-run is refused too', DECISION, "  if (surely(events, 'dry-run')) return undefined;\n  if (hidesSelector", '  if (hidesSelector'],
  ['an ambiguous --d counts as a dry run', DECISION, "  if (surely(events, 'dry-run')) return undefined;\n  if (hidesSelector", "  if (mayBe(events, 'dry-run')) return undefined;\n  if (hidesSelector"],
  ['commit -i/--include is allowed (C1)', DECISION, "['all', 'include', 'patch', 'interactive'].some(", "['all', 'patch', 'interactive'].some("],
  ['commit -a/--all is allowed', DECISION, "['all', 'include', 'patch', 'interactive'].some(", "['include', 'patch', 'interactive'].some("],
  ['commit -p/--patch is allowed (R1)', DECISION, "['all', 'include', 'patch', 'interactive'].some(", "['all', 'include', 'interactive'].some("],
  ['commit --interactive is allowed (R1)', DECISION, "['all', 'include', 'patch', 'interactive'].some(", "['all', 'include', 'patch'].some("],
  ['a pathspec file does not count as naming paths (C10)', DECISION, "return finalValue(events, 'pathspec-from-file') === undefined ? 'commitNoPaths' : undefined;", "return 'commitNoPaths';"],
  ['a commit with no path after -- is allowed', DECISION, "return finalValue(events, 'pathspec-from-file') === undefined ? 'commitNoPaths' : undefined;", 'return undefined;'],
  ['a pathspec naming no specific path is allowed (C3)', DECISION, "return sweepsWorktree(afterDashes, contextOf(invocation)) ? 'commitNoPaths' : undefined;", 'return undefined;'],
  ['the pathspec is judged without the commit directory and repository (R2)', DECISION, 'sweepsWorktree(afterDashes, contextOf(invocation))', 'sweepsWorktree(afterDashes, {})'],
  // push
  ['push --no-verify is allowed', DECISION, "mayBe(optionsOf('push', args).events, 'verify', false) ? 'pushNoVerify' : undefined", 'undefined'],
  ['a later push --verify does not undo --no-verify (C2)', DECISION, "mayBe(optionsOf('push', args).events, 'verify', false) ?", "optionsOf('push', args).events.some((event) => event.candidates.some((candidate) => candidate.key === 'verify' && !candidate.on)) ?"],
  // read-tree (C4, C11, R3, R8, F)
  ['read-tree is allowed', DECISION, "return readTreeWrites(invocation) ? 'readTree' : undefined;", 'return undefined;'],
  ['every read-tree is refused', DECISION, "return readTreeWrites(invocation) ? 'readTree' : undefined;", "return 'readTree';"],
  ['read-tree --dry-run is refused (C11, R8)', DECISION, "      if (surely(optionsOf('read-tree', args).events, 'dry-run')) return undefined;\n", ''],
  ['read-tree -u is not read', DECISION, "if (mayBe(events, '-u') || mayBe(events, 'reset')) return true;", "if (mayBe(events, 'reset')) return true;"],
  ['read-tree --reset is not read', DECISION, "if (mayBe(events, '-u') || mayBe(events, 'reset')) return true;", "if (mayBe(events, '-u')) return true;"],
  ['read-tree -h is refused', DECISION, "  if (args.length === 1 && args[0] === '-h') return false;\n", ''],
  ['read-tree -h beside a tree is allowed', DECISION, "if (args.length === 1 && args[0] === '-h') return false;", "if (args[0] === '-h') return false;"],
  ['--index-output is read from the commit directory, not the root (F)', DECISION, 'namesLiveIndex(output, layout?.root ?? directory, layout)', 'namesLiveIndex(output, directory, layout)'],
  ['an empty --index-output is allowed', DECISION, 'return output.length === 0 || namesLiveIndex(output,', 'return namesLiveIndex(output,'],
  ['a GIT_INDEX_FILE on the line is ignored', DECISION, "const indexFile = selectorValues(invocation.environment, invocation.gitOptions).indexFile ?? '';", "const indexFile = '';"],
  ['an empty GIT_INDEX_FILE counts as a temporary index', DECISION, 'return indexFile.length === 0 || namesLiveIndex(indexFile, directory, layout);', 'return namesLiveIndex(indexFile, directory, layout);'],
  ['an index file naming the live index is allowed (R3)', DECISION, 'return layout !== undefined && samePath(path.resolve(base, nativeSpelling(value)), layout.liveIndex);', 'return false;'],
  ['an index file resolved from the process cwd (R3)', DECISION, 'path.resolve(base, nativeSpelling(value))', 'path.resolve(nativeSpelling(value))'],
  ['an index file in Git Bash spelling is not translated (E)', DECISION, 'path.resolve(base, nativeSpelling(value))', 'path.resolve(base, value)'],
  ['an index file after an unfollowable cd is trusted (R3)', DECISION, "  if (typeof base !== 'string') return true;", "  if (typeof base !== 'string') return false;"],
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
  ['the add short option -u is unknown to the table (R6)', OPTIONS, ' f:force u:update N:intent-to-add A:all', ' f:force N:intent-to-add A:all'],
  ['rm -n is unknown to the table (G)', OPTIONS, "  rm: 'n:dry-run q:quiet f:force r'", "  rm: 'q:quiet f:force r'"],
  ['rm --cached is unknown to the table (G)', OPTIONS, "  rm: '--dry-run --quiet --cached --force", "  rm: '--dry-run --quiet --force"],
  // which pathspec sweeps the worktree (C3, R2, E)
  ['a wildcard is read as a literal path, so * at the root names one file (E)', SCOPE, "  if (magic.includes('literal') || !holdsWildcard(text)) return text;", '  if (true) return text;'],
  ['literal magic is ignored, so :(literal)* sweeps (R2)', SCOPE, "  if (magic.includes('literal') || !holdsWildcard(text)) return text;", '  if (!holdsWildcard(text)) return text;'],
  ['the pattern is not normalised as git does (E)', SCOPE, "const normalized = (pattern) => path.posix.normalize(nativeSpelling(pattern).split('\\\\').join('/'));", "const normalized = (pattern) => nativeSpelling(pattern).split('\\\\').join('/');"],
  ['the Git Bash spelling of a pathspec is not translated (E)', SCOPE, "const normalized = (pattern) => path.posix.normalize(nativeSpelling(pattern).split('\\\\').join('/'));", "const normalized = (pattern) => path.posix.normalize(pattern.split('\\\\').join('/'));"],
  ['a covered prefix is never judged against the root (R2)', SCOPE, "    if (reachesRoot(coveredPrefix(pattern, magic), magic.includes('top'), directory, layout)) return true;\n", ''],
  [':/ and :(top) are read from the commit directory (R2)', SCOPE, '  const base = top ? layout?.root : directory;', '  const base = directory;'],
  ['. in a subdirectory is read as the root (R2)', SCOPE, '  const base = top ? layout?.root : directory;', '  const base = layout?.root;'],
  ['an absolute path to the root names specific paths (R2)', SCOPE, "if (path.isAbsolute(prefix)) return layout === undefined ? existsSync(path.join(prefix, '.git')) : isWithin(prefix, layout.root);", 'if (path.isAbsolute(prefix)) return false;'],
  ['a prefix inside the root counts as reaching it (R2)', SCOPE, 'return isWithin(path.resolve(base, prefix), layout.root);', 'return isWithin(layout.root, path.resolve(base, prefix));'],
  ['with no repository, no relative prefix reaches the root (R2)', SCOPE, "if (layout === undefined || typeof base !== 'string') return reachesBase(prefix);", "if (layout === undefined || typeof base !== 'string') return false;"],
  ['a pathspec without magic is read as short magic', SCOPE, "  if (!spec.startsWith(':')) return { magic: [], pattern: spec };\n", ''],
  ['long magic is not read', SCOPE, "if (spec.startsWith(':(')) {", 'if (false) {'],
  ['short exclusion magic is read as top', SCOPE, "magic.push(spec.charAt(at) === '/' ? 'top' : 'exclude');", "magic.push('top');"],
  ['an exclusion counts as naming a path', SCOPE, "    if (magic.includes('exclude')) continue;\n", ''],
  ['only exclusions name specific paths', SCOPE, '  return named === 0;', '  return false;'],
  // R4: a pathspec that can match files still to come
  ['a glob cannot match files to come (R4)', SCOPE, "  if (!magic.includes('literal') && holdsWildcard(pattern)) return true;\n", ''],
  ['a directory cannot match files to come (R4)', SCOPE, "normalized(pattern))).isDirectory();", "normalized(pattern))).isDirectory() && false;"],
  ['a literal file can match files to come (R4)', SCOPE, "normalized(pattern))).isDirectory();", "normalized(pattern))).isDirectory() || true;"],
  // the line context and its aliases (C4, C9, C12, D)
  ['an alias can replace a judged builtin', LINE, '|| JUDGED_BUILTINS.has(name) ||', '||'],
  ['an alias leading to another is not followed', LINE, 'const ALIAS_DEPTH = 8;', 'const ALIAS_DEPTH = 1;'],
  ['a shell alias is read as a git alias', LINE, "if (body.startsWith('!')) {", 'if (false) {'],
  ['the typed arguments of an alias are dropped', LINE, 'args: [...inner.args, ...invocation.args]', 'args: inner.args'],
  ['a ! alias body does not see its own options (D)', LINE, 'const config = configOf(inner.gitOptions, invocation.environment, invocation.config);', 'const config = invocation.config;'],
  ['an alias body does not see its own options (D)', LINE, '  const config = configOf(gitOptions, invocation.environment);', '  const config = invocation.config;'],
  ['aliases defined on the line are ignored', LINE, 'found.push(...expanded({ ...invocation, environment, config, chain, separator: command.separator, selectorTouch: touch, before: [...before] }, aliasesOf(config), 0));', 'found.push({ ...invocation, environment, config, chain, separator: command.separator, selectorTouch: touch, before: [...before] });'],
  ['a modelled assignment is not recorded', LINE, '    if (assignments !== undefined) record(assignments, lineEnvironment);\n', ''],
  ['a substitution\'s separator counts as the one before the command that holds it (C)', LINE, 'const isOwn = candidate !== undefined && candidate.text === command.text && candidate.separator === command.separator && candidate.depth === command.depth;', 'const isOwn = true;'],
  ['the separator before a command is lost (C)', LINE, '    previous = command.separator;\n', ''],
  ['every command starts a new chain', LINE, "if (previousSeparator !== undefined && previousSeparator !== '&&') chain += 1;", 'chain += 1;'],
  ['no command starts a new chain', LINE, "if (previousSeparator !== undefined && previousSeparator !== '&&') chain += 1;", ''],
  ['an environment prefix is ignored', LINE, '      for (const word of command.words.slice(0, at).filter(isAssignment)) environment.set(...splitAssignment(word));\n', ''],
  ['an environment prefix leaks into the later commands of the line', LINE, 'const environment = new Map(lineEnvironment);', 'const environment = lineEnvironment;'],
  // D: the configuration the line gives git
  ['a config key keeps its case, though git config names have none (R5, R11)', CONFIG, '  else config.set(key.toLowerCase(), holdsExpansion(value) ? UNSEEN : value);', '  else config.set(key, holdsExpansion(value) ? UNSEEN : value);'],
  ['a -c value holding an expansion is read as a value (A)', CONFIG, '  else config.set(key.toLowerCase(), holdsExpansion(value) ? UNSEEN : value);', '  else config.set(key.toLowerCase(), value);'],
  ['a -c key holding an expansion is trusted (D)', CONFIG, '  if (holdsExpansion(key)) config.set(ANY_SETTING, UNSEEN);\n  else', '  if (false) config.set(ANY_SETTING, UNSEEN);\n  else'],
  ['a --config-env key holding an expansion is trusted (D)', CONFIG, '      if (holdsExpansion(key)) config.set(ANY_SETTING, UNSEEN);\n      else', '      if (false) config.set(ANY_SETTING, UNSEEN);\n      else'],
  ['-c is not read', CONFIG, "    if (option === '-c' && index + 1 < gitOptions.length) setSetting(config, gitOptions[index + 1]);\n", ''],
  ['GIT_CONFIG_COUNT on the line is ignored (R5)', CONFIG, "for (let index = 0; index < Number.parseInt(count ?? '0', 10); index += 1) {", 'for (let index = 0; index < 0; index += 1) {'],
  ['a hidden GIT_CONFIG_COUNT is trusted (D)', CONFIG, '  if (count !== undefined && holdsExpansion(count)) config.set(ANY_SETTING, UNSEEN);\n', ''],
  ['a --config-env value is never read from the line (R5)', CONFIG, '  else config.set(key.toLowerCase(), value === undefined || holdsExpansion(value) ? UNSEEN : value);', '  else config.set(key.toLowerCase(), UNSEEN);'],
  ['the separate-word --config-env form is ignored (R5)', CONFIG, "const reference = option === '--config-env' ? gitOptions[index + 1] :", "const reference = option === '--config-env-off' ? gitOptions[index + 1] :"],
  ['a malformed GIT_CONFIG_PARAMETERS is trusted (D)', CONFIG, '    if (settings === undefined) config.set(ANY_SETTING, UNSEEN);', '    if (settings === undefined) void 0;'],
  ['a ! alias does not inherit the settings of its parent (D)', CONFIG, '  const config = new Map(inherited);', '  const config = new Map();'],
  ['an escaped quote ends the quoted string (D)', CONFIG, "    if (text.charAt(cursor) !== '\\\\' || text.charAt(cursor + 2) !== \"'\") return { value, end: cursor };", '    return { value, end: cursor };'],
  ['an escaped quote loses its character (D)', CONFIG, '    value += text.charAt(cursor + 1);\n', ''],
  ['an unterminated quote is accepted (D)', CONFIG, "    if (close === -1) return undefined;", "    if (close === -1) return { value: value + text.slice(cursor), end: text.length };"],
  ['an entry that is not quoted is skipped (D)', CONFIG, '    if (key === undefined) return undefined;', '    if (key === undefined) return settings;'],
  ['a new-style value is dropped (D)', CONFIG, '    settings.push(`${key.value}=${value.value}`);', '    settings.push(key.value);'],
  ["'key'= with no value is malformed (D)", CONFIG, '    if (value === undefined) {\n      settings.push(key.value);\n      continue;\n    }', '    if (value === undefined) {\n      return undefined;\n    }'],
  ['the space between entries is not skipped (D)', CONFIG, '    while (/\\s/.test(text.charAt(at))) at += 1;\n', ''],
  // C: selector touches
  ['a command in a subshell counts as top level (C)', TOUCH, 'export const isTopLevel = (command) => command.depth === 0 && ', 'export const isTopLevel = (command) => '],
  ['a command after && or || counts as top level (C)', TOUCH, '(command.previous === undefined || UNCONDITIONAL_BEFORE.has(command.previous))', 'true'],
  ['a command in a pipeline or block counts as top level (C)', TOUCH, ' && UNCONDITIONAL_AFTER.has(command.separator);', ';'],
  ['an assignment followed by && is a touch (C)', TOUCH, "const UNCONDITIONAL_AFTER = new Set([';', '\\n', 'end', '&&']);", "const UNCONDITIONAL_AFTER = new Set([';', '\\n', 'end']);"],
  ['source, eval and Invoke-Expression set nothing (C)', TOUCH, '  if (at !== -1) return RUNS_TEXT.has(executableName(words[at]));', '  if (at !== -1) return false;'],
  ['a launcher carrying an unreadable script sets nothing (C)', TOUCH, '  return script !== undefined && isUnresolvableWord(script);', '  return false;'],
  ['a readable carried script counts as unresolvable too (C)', TOUCH, '  return script !== undefined && isUnresolvableWord(script);', '  return script !== undefined;'],
  ['an env with options before git changes nothing (A)', TOUCH, "    return env !== -1 && words.slice(env + 1, at).some((word) => word.startsWith('-'));", '    return false;'],
  ['an env assignment before git counts as an option (A)', TOUCH, "    return env !== -1 && words.slice(env + 1, at).some((word) => word.startsWith('-'));", '    return env !== -1 && env + 1 < at;'],
  ['bash export is not modelled (R3, C)', TOUCH, "    if (words[0] === 'export' && operands.length > 0 && operands.every(isAssignment)) {", '    if (false) {'],
  ['bash unset is not modelled (R3, C)', TOUCH, "    if (words[0] === 'unset' && operands.length > 0 && operands.every(isPlainName)) return", '    if (false) return'],
  ['Remove-Item Env: is not modelled (R3, C)', TOUCH, '  if (!POWERSHELL_REMOVERS.has(first.toLowerCase())) return undefined;', '  return undefined;'],
  ['Remove-Item -Path is not modelled (C)', TOUCH, 'const operands = words.slice(1).filter((word) => !PATH_PARAMETERS.has(word.toLowerCase()));', 'const operands = words.slice(1);'],
  ['Env:\\NAME is not read as a drive path (C)', TOUCH, "  const name = word.slice(POWERSHELL_DRIVE.length).replace(/^[\\\\/]/, '');", '  const name = word.slice(POWERSHELL_DRIVE.length);'],
  ['$env:X = $null does not clear it (R3)', TOUCH, "value.length === 0 || value.toLowerCase() === '$null' ?", 'value.length === 0 ?'],
  ['a PowerShell variable name keeps its case', TOUCH, '{ set: [name.toUpperCase(), value] }', '{ set: [name, value] }'],
  ['a spaced PowerShell assignment is not modelled', TOUCH, "(words.length === 3 && words[1] === '=' ? words[2] : undefined)", 'undefined'],
  ['a fused PowerShell assignment is not modelled', TOUCH, 'words.length === 1 ? first.slice(fused + 1) : undefined', 'undefined'],
  ['a name inside a longer word is a selector (C)', TOUCH, '    if (/[A-Z0-9_]/.test(before)) continue;\n', ''],
  ['a longer name is the selector it starts with (C)', TOUCH, '    if (prefix || !/[A-Z0-9_]/.test(after)) return true;', '    return true;'],
  ['a GIT wildcard is no selector (C)', TOUCH, "  if (/GIT[A-Z0-9_]*[*?[]/.test(upper) || upper.includes('${!')) return true;", "  if (upper.includes('${!')) return true;"],
  ['a bash indirect expansion is no selector (C)', TOUCH, "  if (/GIT[A-Z0-9_]*[*?[]/.test(upper) || upper.includes('${!')) return true;", '  if (/GIT[A-Z0-9_]*[*?[]/.test(upper)) return true;'],
  ['the whole Env: drive is no selector (C)', TOUCH, "  if (upper.startsWith('ENV:') && /^ENV:[\\\\/]?([*?[]|$)/.test(upper)) return true;", '  if (false) return true;'],
  ['[Environment]:: is no selector (C)', TOUCH, "  if (upper.includes('[ENVIRONMENT]::') || upper.includes('[SYSTEM.ENVIRONMENT]::')) return true;", '  if (false) return true;'],
  ['GIT_CONFIG variables are no selectors (C)', TOUCH, ' || names(upper, CONFIG_PREFIX, true) ||', ' ||'],
  ['--config-env variables are no selectors (C)', TOUCH, " || extraNames.some((name) => names(upper, name.toUpperCase(), false));", ';'],
  ['a printer reads like any command (C)', TOUCH, "executable === 'git' || PRINTERS.has(executable) ?", "executable === 'git' ?"],
  ['the arguments of git are scanned (C)', TOUCH, "executable === 'git' || PRINTERS.has(executable) ?", 'PRINTERS.has(executable) ?'],
  ['a prefix assignment of a git command is a touch (C)', TOUCH, 'words.slice(0, at).filter((word) => !isAssignment(word)) :', 'words.slice(0, at) :'],
  ['a prefix assignment of another command is a touch (C)', TOUCH, 'words.filter((word, index) => index >= at || !isAssignment(word))', 'words'],
  ['a bare assignment is no touch (C)', TOUCH, 'const scanned = at === -1 ? words :', 'const scanned = at === -1 ? [] :'],
  ['env options before a program other than git hide a git command (A)', TOUCH, "    if (at === -1 || executableName(words[at]) !== 'git') return false;", '    if (at === -1) return false;'],
  ['the options of any launcher hide git, not only env (A)', TOUCH, "const env = words.findIndex((word, index) => index < at && executableName(word) === 'env');", 'const env = words.findIndex((word, index) => index < at);'],
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
  ['an unchecked commit refuses', GUARD, "if (found.offender === undefined) return undefined;", "if (found.offender === undefined) return found.unchecked.length > 0 ? refusalText('commitUntracked', 'unchecked', { paths: '', total: 0, add: '' }) : undefined;"],
  ['a deny is journaled in the unchecked journal', GUARD, '  const { family, text, files, file, writer, directory } = found.offender;', "  const { family, text, files, file, writer, directory } = found.offender;\n  journal({ verdict: 'deny', cwd, command: text });"],
  ['an unreadable pathspec file is allowed', GUARD, "if (family !== 'commitUntracked') return refusalText(family, text, { file: file ?? '', writer: writer ?? '' });", "if (family !== 'commitUntracked') return undefined;"],
  ['the refusal of an unreadable pathspec file does not name it', GUARD, "{ file: file ?? '', writer:", "{ file: '', writer:"],
  ['the refusal of a commit after writes does not name the writer (R4)', GUARD, "writer: writer ?? '' }", "writer: '' }"],
  ['the refusal lists every untracked path', GUARD, 'const LISTED_PATHS = 10;', 'const LISTED_PATHS = 1000;'],
  ['the refusal lists 9 paths only', GUARD, 'const LISTED_PATHS = 10;', 'const LISTED_PATHS = 9;'],
  ['a path with whitespace is not quoted (R10)', GUARD, '  if (PLAIN_WORD.test(word)) return word;', '  return word;'],
  ['every path is quoted (R10)', GUARD, '  if (PLAIN_WORD.test(word)) return word;\n', ''],
  ['PowerShell gets the bash quoting (R10)', GUARD, "return dialect === 'powershell' ?", "return dialect === 'none' ?"],
  ['the path is relative to the directory git -C moved to, not the shell cwd (R10)', GUARD, 'path.relative(cwd, path.resolve(directory, file))', 'path.relative(directory, path.resolve(directory, file))'],
  ['the refusal omits the total', GUARD, "{ paths: listed.join(' '), total: files.length,", "{ paths: listed.join(' '), total: listed.length,"],
  ['up to 10 paths go to a pathspec file too (H)', GUARD, '  if (files.length <= LISTED_PATHS) return inline;\n', ''],
  ['the pathspec file holds only the listed paths (H)', GUARD, 'writeFileSync(list, `${files.map(', 'writeFileSync(list, `${files.slice(0, LISTED_PATHS).map('],
  ['the pathspec file is read as newline separated (H)', GUARD, '`git add --pathspec-file-nul --pathspec-from-file=', '`git add --pathspec-from-file='],
  ['the pathspec file path keeps its backslashes (H)', GUARD, "quotedFor(list.split('\\\\').join('/'), dialect)", 'quotedFor(list, dialect)'],
  ['the pathspec file path is not quoted for the shell (H)', GUARD, "quotedFor(list.split('\\\\').join('/'), dialect)", "list.split('\\\\').join('/')"],
  ['an unwritable pathspec file leaves no git add (H)', GUARD, '  } catch {\n    return inline;\n  }', "  } catch {\n    return '';\n  }"],
  ['the journal is written outside the mechanism state directory', GUARD, "    const directory = stateDir('worker-git-guard');", "    const directory = stateDir('worker-git-guard-x');"],
  ['the journal is written into the dispatcher journal, mixing formats', GUARD, "path.join(directory, 'unchecked.jsonl')", "path.join(directory, 'journal.jsonl')"],
  // untracked pathspec: the decision module
  ['a commit with no pathspec is sent to git', MODULE, 'return afterDashes.length === 0 ? undefined : { pathspecs: afterDashes, fromFile: false };', 'return { pathspecs: afterDashes, fromFile: false };'],
  ['a dry run is sent to git', MODULE, "if (invocation.subcommand !== 'commit' || surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;", "if (invocation.subcommand !== 'commit') continue;"],
  ['every subcommand is read as a commit', MODULE, "if (invocation.subcommand !== 'commit' || surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;", "if (surely(optionsOf('commit', invocation.args).events, 'dry-run')) continue;"],
  ['git -C is ignored', MODULE, 'const directory = invocationDirectory(invocation);\n    const pathspec', 'const directory = invocation.directory;\n    const pathspec'],
  ['an unfollowable directory is asked to git as the process cwd', MODULE, 'if (environment === undefined) {', 'if (false) {'],
  ['an unfollowable directory is not reported', MODULE, "unchecked.push({ text: invocation.text, directory, reason: 'the directory or the repository the commit runs in cannot be followed from the line @es el directorio o el repositorio del commit no se pueden seguir desde la línea' });", ''],
  ['the unchecked reason loses its Spanish half', MODULE, "cannot be followed from the line @es el directorio o el repositorio del commit no se pueden seguir desde la línea' });", "cannot be followed from the line' });"],
  ['the git adapter error loses its Spanish half', MODULE, ' @es git ls-files salió con ${String(result.status)}', ''],
  // R7: the repository the line points git at reaches ls-files
  ['the line repository is not forwarded to ls-files (R7)', MODULE, 'const answer = list(directory, pathspec.pathspecs, environment);', 'const answer = list(directory, pathspec.pathspecs, {});'],
  ['the adapter drops the forwarded variables (R7)', MODULE, '    env: { ...process.env, ...environment },', '    env: process.env,'],
  ['--git-dir on the line is not read (R7)', LAYOUT, "gitDir: native(lastOption(gitOptions, '--git-dir') ?? environment.get('GIT_DIR')),", "gitDir: native(environment.get('GIT_DIR')),"],
  ['GIT_INDEX_FILE on the line is not read (R7)', LAYOUT, "indexFile: native(environment.get('GIT_INDEX_FILE'))", "indexFile: native(environment.get('OTHER'))"],
  ['a selector value keeps its Git Bash spelling (E)', LAYOUT, 'const native = (value) => (value === undefined ? undefined : nativeSpelling(value));', 'const native = (value) => value;'],
  ['a forwarded variable is not resolved against the commit directory (R7)', LAYOUT, 'forwarded[name] = path.resolve(directory, value);', 'forwarded[name] = value;'],
  ['a hidden forwarded variable is trusted (R7)', LAYOUT, '    if (holdsExpansion(value)) return undefined;\n\n    forwarded', '    forwarded'],
  // R3: where the live index is
  ['GIT_DIR on the line does not move the live index (R3)', LAYOUT, 'const found = gitDirValue === undefined ? discovered(directory) :', 'const found = true ? discovered(directory) :'],
  ['a linked worktree .git file is not followed (R3)', LAYOUT, "    if (kind === 'file') {", '    if (false) {'],
  // R4, B: a commit after an earlier writer of the same line
  ['an earlier writer is never seen (R4)', MODULE, 'const writer = earlierWriter(invocation.before, dialect);', 'const writer = undefined;'],
  ['a pathspec file after a writer is trusted (R4)', MODULE, '(readsPathspecFile || pathspec.pathspecs.some(', '(pathspec.unreadable !== undefined || pathspec.pathspecs.some('],
  ['a pathspec file the writer creates gets the unreadable refusal instead (R4)', MODULE, '(readsPathspecFile || pathspec.pathspecs.some(', '(pathspec.fromFile === true || pathspec.pathspecs?.some('],
  ['a redirection is not a writer (R4)', WRITES, '  if (redirectsToFile(text, dialect)) return true;\n', ''],
  ['a command of no word is a writer (B)', WRITES, '  if (at === -1) return false;', '  if (at === -1) return true;'],
  ['every command is a writer (R4)', WRITES, "return name === 'git' ? !gitReadsOnly(gitSubcommand, gitArgs) : !NON_WRITING.has(name);", 'return true;'],
  ['no program is a writer (R4)', WRITES, "return name === 'git' ? !gitReadsOnly(gitSubcommand, gitArgs) : !NON_WRITING.has(name);", "return name === 'git' ? !gitReadsOnly(gitSubcommand, gitArgs) : false;"],
  ['no git subcommand is a writer (R4)', WRITES, "return name === 'git' ? !gitReadsOnly(gitSubcommand, gitArgs) : !NON_WRITING.has(name);", "return name === 'git' ? false : !NON_WRITING.has(name);"],
  ['git status is a writer (B)', WRITES, "const NON_WRITING_GIT = new Set(['status', 'rev-parse',", "const NON_WRITING_GIT = new Set(['rev-parse',"],
  ['git diff --output reads only (B)', WRITES, '(READS_UNLESS_OUTPUT.has(subcommand) && !sendsOutput(args))', 'READS_UNLESS_OUTPUT.has(subcommand)'],
  ['git diff is a writer (B)', WRITES, '(READS_UNLESS_OUTPUT.has(subcommand) && !sendsOutput(args)) ||', 'false ||'],
  ['an abbreviated --output is not read (B)', WRITES, "  return name.startsWith(OUTPUT_OPTION) || (name.length >= OUTPUT_ABBREVIATION && OUTPUT_OPTION.startsWith(name));", '  return name.startsWith(OUTPUT_OPTION);'],
  ['an --output=<file> is read whole (B)', WRITES, "  const name = arg.split('=')[0];", '  const name = arg;'],
  ['restore --staged is a writer (B)', WRITES, "    return surely(events, 'staged') && !mayBe(events, 'worktree');", '    return false;'],
  ['rm --cached is a writer (B)', WRITES, "  return subcommand === 'rm' && surely(optionsOf('rm', args).events, 'cached');", '  return false;'],
  ['a PowerShell assignment runs its value as a command name (B)', WRITES, "const isAssignment = dialect === 'powershell' && first.startsWith('$') && (first.includes('=') || words[at + 1] === '=');", 'const isAssignment = false;'],
  ['a fused PowerShell assignment is not one (B)', WRITES, "(first.includes('=') || words[at + 1] === '=')", "words[at + 1] === '='"],
  ['a literal PowerShell value runs as a command (B)', WRITES, '  if (commandWords.length === 0 || LITERAL_STARTS.has(value.charAt(0))) return true;', '  if (commandWords.length === 0) return true;'],
  ['the command a PowerShell assignment runs never writes (B)', WRITES, "  if (name !== 'git') return NON_WRITING.has(name);", "  if (name !== 'git') return true;"],
  ['the git a PowerShell assignment runs never writes (B)', WRITES, '  return invocation !== undefined && gitReadsOnly(invocation.subcommand, invocation.args);', '  return true;'],
  ['a fused PowerShell assignment loses its command (B)', WRITES, '[words[at].slice(fused + 1), ...words.slice(at + 1)]', 'words.slice(at + 1)'],
  ['a PowerShell redirection to $null is a writer (R4)', WRITES, "found.target === undefined ? !text.toLowerCase().includes('$null')", 'found.target === undefined ? true'],
  ['a redirection to /dev/null is a writer (R4)', WRITES, "const NO_FILE = new Set(['/dev/null', 'nul']);", "const NO_FILE = new Set(['nul']);"],
  // R4: C-style quoted lines of a pathspec file
  ['a quoted pathspec line is not unquoted (R4)', MODULE, '(nul ? line : unquoted(line))', 'line'],
  ['an octal escape is not decoded (R4)', MODULE, '/^[0-7]{3}$/.test(body.slice(at + 1, at + 4))', 'false'],
  ['a git error is not reported', MODULE, 'unchecked.push({ text: invocation.text, directory, reason: answer.error });', ''],
  ['a git error counts as an offender', MODULE, 'unchecked.push({ text: invocation.text, directory, reason: answer.error });\n      continue;', "return { offender: { family: 'commitUntracked', text: invocation.text, files: [] }, unchecked };"],
  ['an empty answer is an offender', MODULE, 'if (files.length > 0) return', 'if (files.length >= 0) return'],
  ['the walk does not stop at the first offender', MODULE, "if (files.length > 0) return { offender: { family: 'commitUntracked', text: invocation.text, files, directory }, unchecked };", "if (files.length > 0) unchecked.push({ text: invocation.text, directory, reason: 'offender' });"],
  // C12, G: an earlier git add of the same chain and index
  ['an earlier add never counts', MODULE, '      added.push(...addedPaths(invocation).map((resolved) => ({ chain: invocation.chain, resolved, indexFile })));\n', ''],
  ['an add of another chain counts', MODULE, 'entry.chain === invocation.chain && entry.indexFile', 'entry.indexFile'],
  ['an add into another index counts (G)', MODULE, ' && entry.indexFile !== undefined && samePath(entry.indexFile, indexFile));', ');'],
  ['an add with no known index is compared anyway (G)', MODULE, ' && entry.indexFile !== undefined && samePath(entry.indexFile, indexFile));', ' && samePath(entry.indexFile, indexFile));'],
  ['a later unstage never cancels an add (G)', MODULE, '      for (let at = added.length - 1; at >= 0; at -= 1) if (overlaps(taken, added[at].resolved)) added.splice(at, 1);', '      for (let at = added.length - 1; at >= 0; at -= 1) if (false) added.splice(at, 1);'],
  ['restore and rm never unstage (G)', MODULE, '  if (!UNSTAGING.has(invocation.subcommand)) return [];', '  return [];'],
  ['a dry-run rm unstages (G)', MODULE, "  if (surely(events, 'dry-run')) return [];\n\n  const directory", '\n  const directory'],
  ['an unstage of no path unstages nothing (G)', MODULE, ' || positionals.length === 0) return [undefined];', ') return [undefined];'],
  ['an unstage behind a hidden git option is resolved literally (G)', MODULE, ' || invocation.gitOptions.some(holdsExpansion) ||', ' ||'],
  ['an unstage where the line cannot follow is resolved anyway (G)', MODULE, "  if (typeof directory !== 'string' || invocation.gitOptions", '  if (invocation.gitOptions'],
  ['an unstage of a narrower path keeps the add (G)', MODULE, ' || isWithin(second, first);', ';'],
  ['an unstage of a broader path keeps the add (G)', MODULE, ' || isWithin(first, second) ||', ' ||'],
  ['the added paths are not subtracted', MODULE, 'const files = answer.files.filter((file) => !staged.some((entry) => isWithin(entry.resolved, path.resolve(directory, file))));', 'const files = answer.files;'],
  ['a dry-run add counts as staging', MODULE, 'if (ADDS_NO_NEW_FILE.some((key) => mayBe(events, key)) ||', 'if ('],
  ['add -u/--update counts as staging new files (R6)', MODULE, "const ADDS_NO_NEW_FILE = ['dry-run', 'update', 'interactive',", "const ADDS_NO_NEW_FILE = ['dry-run', 'interactive',"],
  ['add -N counts as staging new files (R6)', MODULE, "'patch', 'edit', 'intent-to-add'];", "'patch', 'edit'];"],
  ['add -A with no path covers nothing (R6)', MODULE, "const layout = surely(events, 'all') ?", 'const layout = false ?'],
  ['the index of an add is not resolved (G)', LAYOUT, "return typeof directory === 'string' ? path.resolve(directory, indexFile) : undefined;", "return typeof directory === 'string' ? indexFile : undefined;"],
  ['an add without GIT_INDEX_FILE has no index (G)', LAYOUT, '  return repositoryLayout(directory, environment, gitOptions)?.liveIndex;', '  return undefined;'],
  ['an add of a sibling directory covers this one', LAYOUT, "return !path.isAbsolute(relative) && relative.split(/[\\\\/]/)[0] !== '..';", 'return !path.isAbsolute(relative);'],
  ['an add on another drive covers this one', LAYOUT, "return !path.isAbsolute(relative) && relative.split(/[\\\\/]/)[0] !== '..';", "return relative.split(/[\\\\/]/)[0] !== '..';"],
  ['containment compares text prefixes, so dots/..env is outside dots (R9)', LAYOUT, "return !path.isAbsolute(relative) && relative.split(/[\\\\/]/)[0] !== '..';", "return !path.isAbsolute(relative) && !relative.startsWith('..');"],
  // C10: --pathspec-from-file
  ['the pathspec file is never read', MODULE, "const file = finalValue(events, 'pathspec-from-file');", 'const file = undefined;'],
  ['an unreadable pathspec file gets the paths refusal', MODULE, "family: 'commitPathspecFile'", "family: 'commitNoPaths'"],
  ['a pathspec file naming the whole tree is asked to git', MODULE, 'if (pathspec.fromFile && sweepsWorktree(pathspec.pathspecs, { dialect: undefined, directory, layout }))', 'if (false)'],
  ['a relative pathspec file is read from the process cwd', MODULE, '? path.resolve(directory, file) :', '? file :'],
  ['an absolute pathspec file after an unknown cd is unreadable', MODULE, ': path.isAbsolute(file) ? file : undefined;', ': undefined;'],
  ['standard input is read as a file named -', MODULE, 'file === STANDARD_INPUT || resolved === undefined', 'resolved === undefined'],
  ['--pathspec-file-nul is ignored', MODULE, "const nul = surely(events, 'pathspec-file-nul');", 'const nul = false;'],
  ['a CRLF line keeps its carriage return', MODULE, ".map((line) => (line.endsWith('\\r') ? line.slice(0, -1) : line))", ''],
  ['empty lines of the pathspec file are kept', MODULE, 'pathspecs: lines.filter((line) => line.length > 0).map(', 'pathspecs: lines.map('],
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
  ['the commit paths refusal drops -i/--include (C1)', REFUSAL, "'and `-i`/`--include`, `-p`/`--patch` and `--interactive` commit everything staged besides the named paths. A',", "'and `-p`/`--patch` and `--interactive` commit everything staged besides the named paths. A',"],
  ['the commit paths refusal drops -p/--patch and --interactive (R1)', REFUSAL, "'and `-i`/`--include`, `-p`/`--patch` and `--interactive` commit everything staged besides the named paths. A',", "'and `-i`/`--include` commit everything staged besides the named paths. A',"],
  ['the after-writes refusal drops the own-command advice (R4)', REFUSAL, "'USE INSTEAD: run that command first, then commit in its own command after the files exist (and `git add` them',", "'USE INSTEAD: run that command first (and `git add` them',"],
  ['the Spanish after-writes refusal drops the own-command advice (R4)', REFUSAL, "'USAR EN SU LUGAR: ejecute primero ese comando y haga el commit en su propio comando cuando los ficheros existan',", "'USAR EN SU LUGAR: ejecute primero ese comando',"],
  ['the hidden-alias refusal loses its Spanish half (R5)', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: ejecuta un alias de git cuyo cuerpo la línea no muestra ({command}).',", "'WORKER-GIT GUARD RECHAZÓ este comando: ejecuta un alias de git ({command}).',"],
  ['the untracked refusal drops the git add advice (H)', REFUSAL, "'USE INSTEAD: run `{add}` first (it names every one of them), in its own command or earlier in the same `&&`',", "'USE INSTEAD: be careful, or name',"],
  ['the untracked refusal drops the Spanish git add advice (H)', REFUSAL, "'USAR EN SU LUGAR: ejecute antes `{add}` (nombra cada uno de ellos), en su propio comando o antes en la misma',", "'USAR EN SU LUGAR: tenga cuidado, o',"],
  ['the untracked refusal loses the Spanish accents', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: el pathspec de este `git commit` cubre", "'WORKER-GIT GUARD RECHAZO este comando: el pathspec de este `git commit` cubre"],
  ['the unresolvable refusal drops the literal route (A)', REFUSAL, "'USE INSTEAD: spell paths and values literally. Set a `GIT_*` variable only as a literal prefix of the git',", "'USE INSTEAD: ask. Set a `GIT_*` variable only as a literal prefix of the git',"],
  ['the Spanish unresolvable refusal drops the literal route (A)', REFUSAL, "'USAR EN SU LUGAR: escriba las rutas y los valores de forma literal. Fije una variable `GIT_*` solo como prefijo',", "'USAR EN SU LUGAR: pregunte. Fije una variable `GIT_*` solo como prefijo',"],
  ['the unresolvable refusal loses its Spanish headline (A)', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: depende de un valor que la línea no muestra ({command}).',", "'WORKER-GIT GUARD RECHAZÓ este comando ({command}).',"],
  ['the read-tree refusal stops naming the safe route', REFUSAL, "'USE INSTEAD: commit your work in progress on your branch, or ask the orchestrator to clear the index. To read',", "'USE INSTEAD: ask. To read',"],
  ['the Spanish read-tree refusal falls back to voseo (C5)', REFUSAL, "'USAR EN SU LUGAR: haga commit de su trabajo a medias en su rama, o pida al orquestador que limpie el índice.',", "'USAR EN SU LUGAR: commiteá tu trabajo a medias en tu rama, o pedile al orquestador que limpie el índice.',"],
  ['the read-tree refusal claims again that the temporary index must be outside the git directory (R3)', REFUSAL, "'Any literal temporary path is allowed, inside the git directory too (`.git/index.tmp`); only the live index',\n      'itself (`.git/index`, or the `index` of a linked worktree) and a path hidden behind a variable are refused.'", "'The temporary path must be a literal one outside the git directory: naming `.git/index` (the live index) or',\n      'hiding the path behind a variable is refused.'"],
  ['the Spanish read-tree refusal claims again that the temporary index must be outside the git directory (R3)', REFUSAL, "'Se permite cualquier ruta temporal literal, también dentro del directorio de git (`.git/index.tmp`); solo se',\n      'rechazan el propio índice vivo (`.git/index`, o el `index` de un worktree enlazado) y una ruta escondida tras una variable.'", "'La ruta temporal debe ser literal y estar fuera del directorio de git: nombrar `.git/index` (el índice vivo) o',\n      'esconder la ruta tras una variable se rechaza.'"],
  ['the symbolic-ref refusal stops naming the allowed read', REFUSAL, "'USE INSTEAD: nothing is needed; the orchestrator creates the branches and worktrees. Reading is allowed:',", "'USE INSTEAD: nothing is needed. Reading is allowed:',"],
  ['the reset refusal stops naming the alternative', REFUSAL, "'USE INSTEAD: to unstage, `git restore --staged -- <paths>` (it changes only the index). Never move HEAD;',", "'USE INSTEAD: to unstage, ask. Never move HEAD;',"],
  ['the Spanish half loses its accent mark', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git reset`", "'WORKER-GIT GUARD RECHAZO este comando: un worker delegado no puede ejecutar `git reset`"]
];

/**
 * The `[from, to)` range of the campaign a run asks for, or a bilingual reason it is not one.
 * @es El rango `[from, to)` de la campaña que pide una corrida, o el motivo bilingüe por el que no lo es.
 */
export function sliceOf(argv, total) {
  const read = (name, fallback) => {
    const word = argv.find((candidate) => candidate.startsWith(`--${name}=`));

    return word === undefined ? fallback : Number(word.slice(name.length + 3));
  };
  const from = read('from', 0);
  const to = read('to', total);

  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > total || from >= to) {
    return { problem: `--from and --to must be integers with 0 <= from < to <= ${total}, got ${from}..${to} @es --from y --to deben ser enteros con 0 <= from < to <= ${total}; se recibió ${from}..${to}` };
  }

  return { from, to };
}

function main() {
  const slice = sliceOf(process.argv.slice(2), MUTANTS.length);

  if (slice.problem !== undefined) {
    console.error(`NOT MEASURED — ${slice.problem}`);
    process.exit(EXIT_NOT_MEASURED);
  }

  console.log(`SLICE ${slice.from}..${slice.to} of ${MUTANTS.length} @es TRAMO ${slice.from}..${slice.to} de ${MUTANTS.length}`);

  const survivors = runMutants({
    fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    paths: ['worker-git-guard', 'mutation-proof', 'hook-caller', 'hook-payloads', 'hook-state', 'shell-command', 'cherry-pick-guard', 'bilingual-output', 'company-remote', 'write-targets'],
    selftest: 'worker-git-guard/selftest.mjs',
    mutants: MUTANTS.slice(slice.from, slice.to),
    crashKills: 'fail'
  });

  console.log(survivors === 0
    ? `VERDICT PASS — every mutant of ${slice.from}..${slice.to} was killed by an assertion @es VEREDICTO APROBADO — cada mutante de ${slice.from}..${slice.to} murió por una aserción`
    : `VERDICT FAIL — ${survivors} mutant(s) of ${slice.from}..${slice.to} counted as survivors (a crash kill counts as one) @es VEREDICTO FALLIDO — ${survivors} mutante(s) de ${slice.from}..${slice.to} cuentan como supervivientes (una muerte por crash cuenta como uno)`);
  process.exit(survivors === 0 ? 0 : 1);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main();
