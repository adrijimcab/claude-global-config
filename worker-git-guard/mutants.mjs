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
  ['a mentioned command counts (substring scan over the text)', DECISION, 'return gitInvocations(script, dialect, cwd)', 'return gitInvocations(`${script}\\ngit reset`, dialect, cwd)'],
  // families
  ['reset is allowed', DECISION, "case 'reset':\n      return 'reset';", "case 'reset':\n      return undefined;"],
  ['switch is allowed', DECISION, "case 'switch':", "case 'switch-off':"],
  ['checkout is allowed', DECISION, "case 'checkout':\n    case", "case 'checkout-off':\n    case"],
  ['restore with --staged is refused too', DECISION, 'return !staged || worktree ?', 'return !staged || worktree || staged ?'],
  ['restore without --staged is allowed', DECISION, 'return !staged || worktree ?', 'return worktree ?'],
  ['restore --staged --worktree is allowed', DECISION, 'return !staged || worktree ?', 'return !staged ?'],
  ['the short -S is not read as --staged', DECISION, "|| shorts.includes('S');", ';'],
  ['the short -W is not read as --worktree', DECISION, "|| shorts.includes('W');", ';'],
  ['clean --force is not read', DECISION, "longs.includes('--force') || shorts.includes('f')", "shorts.includes('f')"],
  ['clean -f in a cluster is not read', DECISION, "longs.includes('--force') || shorts.includes('f')", "longs.includes('--force')"],
  ['clean --dry-run is refused too', DECISION, "longs.includes('--force') || shorts.includes('f')", "longs.includes('--force') || shorts.includes('f') || longs.includes('--dry-run')"],
  ['clean -e takes no value, so its value is read as flags', DECISION, "clean: new Set(['e'])", 'clean: new Set([])'],
  ['commit --no-verify is allowed', DECISION, 'if (longs.some(isNoVerify) || shorts.includes(\'n\')) return', 'if (shorts.includes(\'n\')) return'],
  ['commit -n is allowed', DECISION, 'if (longs.some(isNoVerify) || shorts.includes(\'n\')) return', 'if (longs.some(isNoVerify)) return'],
  ['a no-verify commit gets the paths refusal instead', DECISION, "return 'commitNoVerify';", "return 'commitNoPaths';"],
  ['a commit with no path after -- is allowed', DECISION, 'afterDashes.length === 0 ? \'commitNoPaths\'', 'false ? \'commitNoPaths\''],
  ['a commit with any word is allowed, paths or not', DECISION, 'afterDashes.length === 0 ? \'commitNoPaths\'', 'positionals.length === 0 ? \'commitNoPaths\''],
  ['commit -a is not read', DECISION, "return shorts.includes('a') || longs.includes('--all') ||", "return longs.includes('--all') ||"],
  ['commit --all is not read', DECISION, "return shorts.includes('a') || longs.includes('--all') ||", "return shorts.includes('a') ||"],
  ['commit --dry-run is refused too', DECISION, "  if (longs.some((name) => isOption(name, '--dry-run', '--dr'.length))) return undefined;\n", ''],
  ['commit --dry-run abbreviation is not read', DECISION, "isOption(name, '--dry-run', '--dr'.length)", "isOption(name, '--dry-run', '--dry-run'.length)"],
  ['commit --d (ambiguous) counts as --dry-run', DECISION, "isOption(name, '--dry-run', '--dr'.length)", "isOption(name, '--dry-run', '--d'.length)"],
  ['the commit paths refusal drops the status check', REFUSAL, "'run `git status --porcelain` before the next one.'", "'be careful.'"],
  ['the commit paths refusal drops the safe form', REFUSAL, "`git commit -m \"<msg>\" -- <path> <path>` commits only the named paths.", 'commit carefully.'],
  ['a value-taking short option does not end the cluster, so -m"no" reads as -n', DECISION, 'break; // the rest of the cluster is the value', ''],
  ['the value word after -m is read as an option', DECISION, 'if (at === word.length - 1) index += 1; // the value is the next word', ''],
  ['the value word after --message is read as an option', DECISION, 'if (!word.includes(\'=\') && LONG_WITH_VALUE[subcommand].has(name)) index += 1;', ''],
  ['words after -- are read as options', DECISION, "if (word === '--') {", "if (word === '--never') {"],
  ['words after -- are not counted as names', DECISION, 'positionals.push(...afterDashes);', ''],
  ['words after -- are not recorded as paths', DECISION, 'afterDashes = args.slice(index + 1);', ''],
  ['a plain word is not counted as a name', DECISION, 'positionals.push(word);', ''],
  ['the --no-verify abbreviation is not recognised', DECISION, 'NO_VERIFY.startsWith(name)', 'NO_VERIFY === name'],
  ['any --no- prefix counts as --no-verify', DECISION, "const NO_VERIFY_MIN_LENGTH = '--no-v'.length;", "const NO_VERIFY_MIN_LENGTH = '--no'.length;"],
  ['push --no-verify is allowed', DECISION, "optionsOf('push', args).longs.some(isNoVerify) ? 'pushNoVerify' : undefined", 'undefined'],
  ['push -n (dry run) is refused', DECISION, "optionsOf('push', args).longs.some(isNoVerify) ?", "optionsOf('push', args).longs.some(isNoVerify) || optionsOf('push', args).shorts.includes('n') ?"],
  // plumbing families
  ['read-tree is allowed', DECISION, "return readTreeDiscards(args) ? 'readTree' : undefined;", 'return undefined;'],
  ['every read-tree is refused', DECISION, "return readTreeDiscards(args) ? 'readTree' : undefined;", "return 'readTree';"],
  ['read-tree -u is not read', DECISION, "return shorts.includes('u') || longs.some((name) => isOption(name, '--reset'", "return longs.some((name) => isOption(name, '--reset'"],
  ['read-tree --reset is not read', DECISION, "shorts.includes('u') || longs.some((name) => isOption(name, '--reset', '--res'.length));", "shorts.includes('u');"],
  ['read-tree --re (ambiguous) counts as --reset', DECISION, "isOption(name, '--reset', '--res'.length)", "isOption(name, '--reset', '--re'.length)"],
  ['read-tree --prefix takes no value, so its value is read as -u', DECISION, "'read-tree': new Set(['--index-output', '--prefix', '--exclude-per-directory'])", "'read-tree': new Set(['--index-output', '--exclude-per-directory'])"],
  ['read-tree --index-output takes no value', DECISION, "'read-tree': new Set(['--index-output', '--prefix', '--exclude-per-directory'])", "'read-tree': new Set(['--prefix', '--exclude-per-directory'])"],
  ['read-tree --exclude-per-directory takes no value', DECISION, "'read-tree': new Set(['--index-output', '--prefix', '--exclude-per-directory'])", "'read-tree': new Set(['--index-output', '--prefix'])"],
  ['checkout-index is allowed', DECISION, "return checkoutIndexOverwrites(args) ? 'checkoutIndex' : undefined;", 'return undefined;'],
  ['every checkout-index is refused', DECISION, "return checkoutIndexOverwrites(args) ? 'checkoutIndex' : undefined;", "return 'checkoutIndex';"],
  ['checkout-index -f is not read', DECISION, "return shorts.includes('f') || shorts.includes('a') ||", "return shorts.includes('a') ||"],
  ['checkout-index -a is not read', DECISION, "return shorts.includes('f') || shorts.includes('a') ||", "return shorts.includes('f') ||"],
  ['checkout-index --force is not read', DECISION, "isOption(name, '--force', '--f'.length) || isOption(name, '--all', '--a'.length)", "isOption(name, '--all', '--a'.length)"],
  ['checkout-index --all is not read', DECISION, "isOption(name, '--force', '--f'.length) || isOption(name, '--all', '--a'.length)", "isOption(name, '--force', '--f'.length)"],
  ['checkout-index --prefix takes no value', DECISION, "'checkout-index': new Set(['--prefix', '--stage'])", "'checkout-index': new Set(['--stage'])"],
  ['checkout-index --stage takes no value', DECISION, "'checkout-index': new Set(['--prefix', '--stage'])", "'checkout-index': new Set(['--prefix'])"],
  ['update-index is allowed', DECISION, "return updateIndexForceRemoves(args) ? 'updateIndex' : undefined;", 'return undefined;'],
  ['every update-index is refused', DECISION, "return updateIndexForceRemoves(args) ? 'updateIndex' : undefined;", "return 'updateIndex';"],
  ['update-index --force-remove is not read', DECISION, "isOption(name, '--force-remove', '--force-r'.length)", 'false'],
  ['update-index --force-* counts as --force-remove', DECISION, "isOption(name, '--force-remove', '--force-r'.length)", "isOption(name, '--force-remove', '--force-'.length)"],
  ['update-ref is allowed', DECISION, "return updateRefWrites(args) ? 'updateRef' : undefined;", 'return undefined;'],
  ['every update-ref is refused', DECISION, "return updateRefWrites(args) ? 'updateRef' : undefined;", "return 'updateRef';"],
  ['update-ref -d is not read', DECISION, "return shorts.includes('d') || positionals.length >= 2 ||", 'return positionals.length >= 2 ||'],
  ['update-ref <ref> <sha> is not read as a write', DECISION, "positionals.length >= 2 || longs.some((name) => isOption(name, '--stdin'", "positionals.length >= 3 || longs.some((name) => isOption(name, '--stdin'"],
  ['update-ref with one name is refused', DECISION, "positionals.length >= 2 || longs.some((name) => isOption(name, '--stdin'", "positionals.length >= 1 || longs.some((name) => isOption(name, '--stdin'"],
  ['update-ref --stdin is not read', DECISION, "|| longs.some((name) => isOption(name, '--stdin', '--s'.length));", ';'],
  ['update-ref -m takes no value, so its value is read as -d', DECISION, "'update-ref': new Set(['m'])", "'update-ref': new Set()"],
  ['symbolic-ref is allowed', DECISION, "return symbolicRefWrites(args) ? 'symbolicRef' : undefined;", 'return undefined;'],
  ['symbolic-ref with two names is not read as a write', DECISION, 'positionals.length >= 2 || shorts.includes(\'d\') ||', 'positionals.length >= 3 || shorts.includes(\'d\') ||'],
  ['symbolic-ref with one name (a read) is refused', DECISION, 'positionals.length >= 2 || shorts.includes(\'d\') ||', 'positionals.length >= 1 || shorts.includes(\'d\') ||'],
  ['symbolic-ref -d is not read', DECISION, "|| shorts.includes('d') || longs.some((name) => isOption(name, '--delete'", "|| longs.some((name) => isOption(name, '--delete'"],
  ['symbolic-ref --delete is not read', DECISION, "shorts.includes('d') || longs.some((name) => isOption(name, '--delete', '--d'.length))", "shorts.includes('d')"],
  ['symbolic-ref -m takes no value, so its value is counted as a name', DECISION, "'symbolic-ref': new Set(['m'])", "'symbolic-ref': new Set()"],
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
  ['a deny is journaled in the unchecked journal', GUARD, "  const { text, files } = found.offender;", "  const { text, files } = found.offender;\n  journal({ verdict: 'deny', cwd, command: text });"],
  ['the refusal lists every untracked path', GUARD, 'const LISTED_PATHS = 10;', 'const LISTED_PATHS = 1000;'],
  ['the refusal lists 9 paths only', GUARD, 'const LISTED_PATHS = 10;', 'const LISTED_PATHS = 9;'],
  ['a path with whitespace is not quoted', GUARD, '(/\\s/.test(file) ? `"${file}"` : file)', 'file'],
  ['every path is quoted', GUARD, '(/\\s/.test(file) ? `"${file}"` : file)', '`"${file}"`'],
  ['the refusal omits the total', GUARD, '{ paths: listed.join(\' \'), total: files.length }', '{ paths: listed.join(\' \'), total: listed.length }'],
  ['the journal is written outside the mechanism state directory', GUARD, "stateDir('worker-git-guard')", "stateDir('worker-git-guard-x')"],
  ['the journal is written into the dispatcher journal, mixing formats', GUARD, "path.join(directory, 'unchecked.jsonl')", "path.join(directory, 'journal.jsonl')"],
  // untracked pathspec: the decision module
  ['a commit with no pathspec is sent to git', MODULE, 'if (pathspecs.length === 0) continue;', ''],
  ['a dry run is sent to git', MODULE, "if (invocation.subcommand !== 'commit' || isDryRun(invocation.args)) continue;", "if (invocation.subcommand !== 'commit') continue;"],
  ['every subcommand is read as a commit', MODULE, "if (invocation.subcommand !== 'commit' || isDryRun(invocation.args)) continue;", 'if (isDryRun(invocation.args)) continue;'],
  ['the dry-run abbreviation is not recognised', MODULE, "word.length >= DRY_RUN_MIN_LENGTH && '--dry-run'.startsWith(word)", "word === '--dry-run'"],
  ['--d (ambiguous) counts as a dry run', MODULE, "const DRY_RUN_MIN_LENGTH = '--dr'.length;", "const DRY_RUN_MIN_LENGTH = '--d'.length;"],
  ['the whole line is scanned for a dry run, so a path named like one hides the commit', MODULE, 'const options = separator === -1 ? args : args.slice(0, separator);', 'const options = args;'],
  ['the pathspec is the words before --', MODULE, 'args.slice(at + 1)', 'args.slice(0, at)'],
  ['the pathspec starts at the separator itself', MODULE, 'args.slice(at + 1)', 'args.slice(at)'],
  ['git -C is ignored', MODULE, "if (gitOptions[index] === '-C' && index + 1 < gitOptions.length) {", 'if (false) {'],
  ['git -C replaces the directory instead of resolving against it', MODULE, 'path.resolve(directory, gitOptions[index + 1])', 'gitOptions[index + 1]'],
  ['an unfollowable directory is asked to git as the process cwd', MODULE, "if (typeof directory !== 'string') {", 'if (false) {'],
  ['an unfollowable directory is not reported', MODULE, "unchecked.push({ text: invocation.text, directory, reason: 'the directory the commit runs in cannot be followed from the line' });", ''],
  ['a git error is not reported', MODULE, 'unchecked.push({ text: invocation.text, directory, reason: answer.error });', ''],
  ['a git error counts as an offender', MODULE, 'if (answer.error !== undefined) {\n      unchecked.push({ text: invocation.text, directory, reason: answer.error });\n    } else if (answer.files.length > 0) {', 'if (answer.error !== undefined) {\n      return { offender: { text: invocation.text, files: [] }, unchecked };\n    } else if (answer.files.length > 0) {'],
  ['an empty answer is an offender', MODULE, '} else if (answer.files.length > 0) {', '} else if (answer.files.length >= 0) {'],
  ['the walk does not stop at the first offender', MODULE, 'return { offender: { text: invocation.text, files: answer.files }, unchecked };', 'unchecked.push({ text: invocation.text, directory, reason: "offender" });'],
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
  ['the untracked refusal drops the git add advice', REFUSAL, "'USE INSTEAD: run `git add -- {paths}` first, in its own command, or name the files precisely in the',", "'USE INSTEAD: be careful, or name the files precisely in the',"],
  ['the untracked refusal drops the Spanish git add advice', REFUSAL, "'USAR EN SU LUGAR: ejecutá antes `git add -- {paths}`, en su propio comando, o nombrá los ficheros con',", "'USAR EN SU LUGAR: tené cuidado, o nombrá los ficheros con',"],
  ['the untracked refusal loses the Spanish accents', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: el pathspec de este `git commit` cubre", "'WORKER-GIT GUARD RECHAZO este comando: el pathspec de este `git commit` cubre"],
  ['the read-tree refusal stops naming the safe route', REFUSAL, "'USE INSTEAD: commit your work in progress on your branch, or ask the orchestrator to clear the index. A bare',", "'USE INSTEAD: ask. A bare',"],
  ['the symbolic-ref refusal stops naming the allowed read', REFUSAL, "'USE INSTEAD: nothing is needed; the orchestrator creates the branches and worktrees. Reading is allowed:',", "'USE INSTEAD: nothing is needed. Reading is allowed:',"],
  ['the reset refusal stops naming the alternative', REFUSAL, "'USE INSTEAD: to unstage, `git restore --staged -- <paths>` (it changes only the index). Never move HEAD;',", "'USE INSTEAD: to unstage, ask. Never move HEAD;',"],
  ['the Spanish half loses its accent mark', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git reset`", "'WORKER-GIT GUARD RECHAZO este comando: un worker delegado no puede ejecutar `git reset`"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['worker-git-guard', 'mutation-proof', 'hook-caller', 'hook-payloads', 'hook-state', 'shell-command', 'cherry-pick-guard', 'bilingual-output'],
  selftest: 'worker-git-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
