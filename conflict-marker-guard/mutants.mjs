#!/usr/bin/env node
/**
 * The decisions of conflict-marker-guard, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules — green unmutated baseline, exactly-once target, parse check — live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de la guardia, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MARKERS = 'conflict-marker-guard/markers.mjs';
const FIXTURES = 'conflict-marker-guard/fixtures.mjs';
const PROBE = 'conflict-marker-guard/probe.mjs';
const DECIDE = 'conflict-marker-guard/decide.mjs';
const GUARD = 'conflict-marker-guard/guard.mjs';

const MUTANTS = [
  // --- markers.mjs: what a marker is, what a conflict is.
  ['`=======` is no longer a marker', MARKERS, '  if (text === MIDDLE) return MIDDLE;\n', ''],
  ['a marker may carry trailing text or more characters', MARKERS, 'text === kind || text.startsWith(`${kind} `)', 'text.startsWith(kind)'],
  ['a CRLF line is no longer a marker', MARKERS, "const text = line.endsWith('\\r') ? line.slice(0, -1) : line;", 'const text = line;'],
  ['a bare seven-character run counts as labelled', MARKERS, '.trim().length > 0', '.length >= 0'],
  ['whitespace after the run counts as a label', MARKERS, 'line.slice(kind.length).trim().length', 'line.slice(kind.length).length'],
  ['a non-marker line is read for a label', MARKERS, 'return kind !== undefined && line.slice', 'return line.slice'],
  ['a declared fixture prefix matches anywhere in the path', MARKERS, 'filePath.startsWith(prefix)', 'filePath.includes(prefix)'],
  ['the scan of an unmerged file does not stop at the first marker', MARKERS, '    if (unmerged) break;\n', ''],
  ['an unmerged file is judged like any other', MARKERS, '(unmerged || found.some', '(found.some'],
  ['a labelled line is no longer a marker on its own', MARKERS, 'found.some((marker) => marker.labelled)', 'false'],
  ['two bare kinds are no longer a conflict', MARKERS, 'kinds.length >= 2', 'kinds.length >= 3'],
  ['one bare kind is a conflict', MARKERS, 'kinds.length >= 2', 'kinds.length >= 1'],
  ['no marker is a conflict for an unmerged file', MARKERS, 'found.length > 0 && ', ''],
  ['a file the change adds is judged like any other', MARKERS, '!(exemptNew && file.isNew)', '!file.isNew && false'],
  ['a file added during a merge is always exempt', MARKERS, '!(exemptNew && file.isNew)', '!file.isNew'],
  ['a declared fixture is judged like any other', MARKERS, ' && !isDeclaredFixture(file.path, fixturePrefixes)', ''],
  ['the `\\ No newline` line is counted as an added line', MARKERS, "if (line.startsWith('\\\\')) continue;", ''],
  ['a removed line is counted as an added one', MARKERS, "if (line.startsWith('-')) hunk.removed -= 1;", "if (line.startsWith('-x')) hunk.removed -= 1;"],
  ['line numbers start from zero, not from the hunk header', MARKERS, 'number = hunk?.start ?? 0;', 'number = 0;'],
  ['line numbers do not advance', MARKERS, '        number += 1;\n', ''],
  ['the added text keeps its `+`', MARKERS, 'text: line.slice(1)', 'text: line'],
  ['`new file` marks nothing', MARKERS, 'pendingNew = true;', 'pendingNew = false;'],
  ['`new file` leaks to the next file', MARKERS, '      pendingNew = false;\n', ''],
  ['a deleted file is read as a file named /dev/null', MARKERS, "name === '/dev/null'", 'false'],
  ['the trailing tab git adds to a spaced path stays in the name', MARKERS, ".replace(/\\t$/, '')", ''],
  ['the `b/` prefix stays in the name', MARKERS, ".replace(/^b\\//, '')", ''],

  // --- fixtures.mjs: the declaration.
  ['the default prefix is somewhere else', FIXTURES, "'conflict-marker-guard/fixtures/'", "'elsewhere/fixtures/'"],
  ['an absent declaration is reported as a failure', FIXTURES, "    if (error.code === 'ENOENT') return { prefixes: [...DEFAULT_FIXTURE_PREFIXES] };\n\n", ''],
  ['a prefix without a trailing slash is accepted', FIXTURES, "prefix.endsWith('/') && ", ''],
  ['an absolute prefix is accepted', FIXTURES, ' && !prefix.startsWith(\'/\')', ''],
  ['a malformed declaration is not reported', FIXTURES, "failure: 'fixture-paths.json is not", "failureIgnored: 'fixture-paths.json is not"],
  ['an unreadable declaration is not reported', FIXTURES, "failure: `fixture-paths.json unreadable", "failureIgnored: `fixture-paths.json unreadable"],

  // --- probe.mjs: the questions to git.
  ['the prefilter looks for other shapes', PROBE, "'^(<<<<<<<|=======|>>>>>>>)'", "'^(<<<<<<<|>>>>>>>)'"],
  ['the prefilter is not passed to git', PROBE, '`-G${MARKER_SHAPES}`', "'--no-textconv'"],
  ['the prefilter drops renames', PROBE, "'--name-status', '-z', '-M', ", "'--name-status', '-z', "],
  ['the prefilter is not NUL-separated', PROBE, "'--name-status', '-z', ", "'--name-status', "],
  ['pathspecs are not literal', PROBE, "'core.quotePath=false', '--literal-pathspecs'", "'core.quotePath=false'"],
  ['paths are quoted by git again', PROBE, "const PLAIN = ['-c', 'core.quotePath=false', ", 'const PLAIN = ['],
  ['the patch keeps its context lines', PROBE, "'--cached', '-U0', ", "'--cached', "],
  ['the patch follows diff.relative', PROBE, "'-U0', '--no-relative', ", "'-U0', "],
  ['the patch follows diff.noprefix', PROBE, "'--src-prefix=a/', ", ''],
  ['the patch follows diff.mnemonicPrefix', PROBE, "'--dst-prefix=b/', ", ''],
  ['the patch follows diff.renames', PROBE, "'--dst-prefix=b/', '-M', ", "'--dst-prefix=b/', "],
  ['the patch runs external diff drivers', PROBE, "'--no-color', '--no-ext-diff', '--no-textconv', ...restrict", "'--no-color', '--no-textconv', ...restrict"],
  ['the patch runs textconv filters', PROBE, "'--no-ext-diff', '--no-textconv', ...restrict", "'--no-ext-diff', ...restrict"],
  ['a prefilter with no candidate still asks for the patch', PROBE, '  if (candidates.length === 0) return { conflicts: [] };\n', ''],
  ['the patch is never restricted to the candidates', PROBE, 'candidates.length <= MAX_PATHSPEC', 'false'],
  ['the patch is restricted however many candidates there are', PROBE, 'candidates.length <= MAX_PATHSPEC', 'true'],
  ['the pathspec limit is exclusive', PROBE, 'candidates.length <= MAX_PATHSPEC', 'candidates.length < MAX_PATHSPEC'],
  ['a rename source is not a candidate', PROBE, "tokens[index].startsWith('R') || tokens[index].startsWith('C') ? 2 : 1", '1'],
  ['a copy source is not a candidate', PROBE, " || tokens[index].startsWith('C') ? 2", ' ? 2'],
  ['a file added during a merge is exempt', PROBE, 'exemptNew: !inProgress', 'exemptNew: true'],
  ['a failing prefilter is read as clean', PROBE, 'if (listingFailure !== undefined) return { failure: listingFailure };', ''],
  ['a failing patch is read as clean', PROBE, 'return patchFailure === undefined ?', 'return true ?'],
  ['a failing git is read as clean', PROBE, 'if (result.status !== 0) return', 'if (false) return'],
  ['a git error object (timeout) is read as clean', PROBE, 'if (result.error !== undefined) return', 'if (false) return'],
  ['a failing rev-parse is not a failure', PROBE, 'if (failure !== undefined) return { failure };\n\n  const [toplevel', 'const [toplevel'],
  ['a merge in progress is not noticed', PROBE, "['MERGE_HEAD', 'REBASE_HEAD'", "['REBASE_HEAD'"],
  ['a revert in progress is not noticed', PROBE, ", 'REVERT_HEAD']", ']'],
  ['every line of the output is a state path', PROBE, '.slice(0, IN_PROGRESS_FILES.length)', ''],
  ['an empty state path counts as existing', PROBE, 'statePath.length > 0 && ', ''],
  ['the timeout is a minute', PROBE, 'GIT_TIMEOUT_MS = 4000', 'GIT_TIMEOUT_MS = 60000'],
  ['git runs without a timeout', PROBE, 'timeout: GIT_TIMEOUT_MS, ', ''],
  ['git output is unbounded', PROBE, 'maxBuffer: MAX_OUTPUT_BYTES, ', ''],
  ['the output bound is one kilobyte', PROBE, '64 * 1024 * 1024', '1024'],
  ['git shows its window', PROBE, 'windowsHide: true', 'windowsHide: false'],
  ['git output is not decoded as text', PROBE, "{ cwd, encoding: 'utf8', timeout", '{ cwd, timeout'],
  ['the unmerged paths are not listed relative to the top level', PROBE, "'ls-files', '-u', '-z', '--full-name'", "'ls-files', '-u', '-z'"],
  ['the unmerged paths are listed from the process directory', PROBE, "'--full-name'], { cwd: toplevel }", "'--full-name'], { cwd: process.cwd() }"],
  ['the unmerged files are read from the process directory', PROBE, 'path.join(toplevel, name)', 'path.join(name)'],
  ['an unmerged file is judged like any other', PROBE, ', { unmerged: true })', ')'],
  ['an unreadable unmerged file is skipped', PROBE, 'conflicts.push({ path: name, line: 0, kinds: [], unreadable: error.code ?? error.message });', ''],
  ['a path unmerged at three stages is read three times', PROBE, '[...new Set(', '[...('],
  ['the empty record after the last NUL is read as a path', PROBE, ".filter((record) => record.includes('\\t'))", ''],
  ['the path keeps the tab that separates it from its stage', PROBE, "record.slice(record.indexOf('\\t') + 1)", "record.slice(record.indexOf('\\t'))"],
  ['line numbers of a streamed file are off by one', PROBE, '    number += 1;\n    yield', '    number += 2;\n    yield'],
  ['the half line left at a chunk edge is yielded', PROBE, '      carry = parts.pop();\n', ''],
  ['the last line with no newline is lost', PROBE, '    if (carry.length > 0) yield carry;\n', ''],
  ['a multibyte character across a chunk edge is cut', PROBE, 'decoder.write(buffer.subarray(0, count))', 'buffer.subarray(0, count).toString()'],
  ['the descriptor of a streamed file is never closed', PROBE, '    close(descriptor);\n', ''],

  // --- decide.mjs: which steps, in which repository.
  ['`rebase --continue` is not watched', DECIDE, "['rebase', 'merge'", "['merge'"],
  ['`merge --continue` is not watched', DECIDE, "'merge', 'cherry-pick'", "'cherry-pick'"],
  ['`cherry-pick --continue` is not watched', DECIDE, "'cherry-pick', 'revert'", "'revert'"],
  ['`revert --continue` is not watched', DECIDE, "'cherry-pick', 'revert', 'am'", "'cherry-pick', 'am'"],
  ['`am --continue` is not watched', DECIDE, "'revert', 'am']", "'revert']"],
  ['`am --resolved` is not watched', DECIDE, "['--continue', '--resolved', '-r']", "['--continue', '-r']"],
  ['`am -r` is not watched', DECIDE, "['--continue', '--resolved', '-r']", "['--continue', '--resolved']"],
  ['`am --continue` is not watched through the option list', DECIDE, "['--continue', '--resolved', '-r']", "['--resolved', '-r']"],
  ['every continuing step takes the `am` options', DECIDE, "(subcommand === 'am' ? AM_CONTINUE_OPTIONS : ['--continue'])", 'AM_CONTINUE_OPTIONS'],
  ['`am` takes only `--continue`', DECIDE, "(subcommand === 'am' ? AM_CONTINUE_OPTIONS : ['--continue'])", "['--continue']"],
  ['a word after `--` is read as an option', DECIDE, "args.includes('--') ? args.slice(0, args.indexOf('--')) : args", 'args'],
  ['`git commit` is not watched', DECIDE, "if (subcommand === 'commit') return true;\n", ''],
  ['every git step is watched', DECIDE, 'if (!commitsWork(invocation)) continue;\n', ''],
  ['`--all` is not read as staging', DECIDE, "['--all', '--include', '--only']", "['--include', '--only']"],
  ['`--include` is not read as staging', DECIDE, "['--all', '--include', '--only']", "['--all', '--only']"],
  ['`--only` is not read as staging', DECIDE, "['--all', '--include', '--only']", "['--all', '--include']"],
  ['`-a` is not read as staging', DECIDE, "= 'aio'", "= 'io'"],
  ['`-i` is not read as staging', DECIDE, "= 'aio'", "= 'ao'"],
  ['`-o` is not read as staging', DECIDE, "= 'aio'", "= 'ai'"],
  ['`-m` is not read as taking a value', DECIDE, "= 'mFCctuS'", "= 'FCctuS'"],
  ['any word is read as a short-option cluster', DECIDE, "word.startsWith('-') && clusterStages(word)", 'clusterStages(word)'],
  ['a pathspec after `--` is not read as staging', DECIDE, "if (args.includes('--') && args.indexOf('--') < args.length - 1) return true;\n", ''],
  ['a trailing `--` is read as a pathspec', DECIDE, "args.indexOf('--') < args.length - 1", "args.indexOf('--') <= args.length - 1"],
  ['a commit that takes worktree content is not read as staging', DECIDE, 'commitStagesItself(invocation) || ', ''],
  ['an add in ANOTHER repository counts as staging', DECIDE, 'stagingDirectories.some((staged) => contextOf(staged).toplevel === context.toplevel)', 'stagingDirectories.length > 0'],
  ['staging is matched by raw directory, not by top level', DECIDE, 'contextOf(staged).toplevel === context.toplevel', 'staged === directory'],
  ['an add is never remembered', DECIDE, "if (invocation.subcommand === 'add' && directory !== undefined) stagingDirectories.push(directory);", ''],
  ['every step is remembered as staging', DECIDE, "invocation.subcommand === 'add' && directory !== undefined", 'directory !== undefined'],
  ['an add after an unfollowable cd is remembered', DECIDE, "invocation.subcommand === 'add' && directory !== undefined", "invocation.subcommand === 'add'"],
  ['the worktree files are scanned although the line stages nothing', DECIDE, 'if (stages) answers.push(', 'if (true) answers.push('],
  ['the worktree files are never scanned', DECIDE, 'if (stages) answers.push(', 'if (false) answers.push('],
  ['an unfollowable cd is not a failure', DECIDE, 'if (directory === undefined) {', 'if (false) {'],
  ['an unfollowable cd goes on to probe the process directory', DECIDE, '      continue;\n    }\n\n    const context', '    }\n\n    const context'],
  ['a directory that is no repository is not a failure', DECIDE, 'if (context.failure !== undefined) {', 'if (false) {'],
  ['a directory that is no repository goes on to probe', DECIDE, '      continue;\n    }\n\n    const stages', '    }\n\n    const stages'],
  ['the same repository is probed once per step', DECIDE, 'if (!remembered.has(key))', 'if (true)'],
  ['a broken fixture declaration is not reported', DECIDE, 'if (declared.failure !== undefined) failures.push', 'if (false) failures.push'],
  ['a probe failure is dropped', DECIDE, 'if (answer.failure !== undefined) failures.push', 'if (false) failures.push'],
  ['one conflict is not enough to refuse', DECIDE, 'conflicts.length > 0', 'conflicts.length > 1'],
  ['the refusal names the directory the command ran in', DECIDE, 'directory: context.toplevel, conflicts', 'directory, conflicts'],
  ['a tool with no shell dialect is no longer exempted', DECIDE, 'dialect === undefined || ', ''],

  // --- guard.mjs: the shim.
  ['the shim never refuses', GUARD, 'if (decision.offender === undefined) return undefined;', 'return undefined;'],
  ['a decision failure is no longer swallowed', GUARD, "journal({ verdict: 'fail-open', session: payload?.session_id, reason: error", "throw error; journal({ verdict: 'fail-open', session: payload?.session_id, reason: error"],
  ['a probe failure is not journaled', GUARD, "for (const failure of decision.failures) journal({ verdict: 'fail-open', session: payload?.session_id, directory: failure.directory, reason: failure.reason });\n", ''],
  ['a refusal is not journaled', GUARD, "  journal({ verdict: 'deny', session: payload?.session_id, directory: decision.offender.directory, conflicts: decision.offender.conflicts.length });\n", ''],
  ['options (the git runner) are not passed to the decision', GUARD, 'decideFor(payload, options)', 'decideFor(payload)'],
  ['a payload with a byte-order mark is not read', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['an unreadable file is described like a marker line', GUARD, 'unreadable === undefined ?', 'true ?'],
  ['the refusal loses its Spanish mirror', GUARD, '`@es CONFLICT-MARKER GUARD RECHAZÓ', '`CONFLICT-MARKER GUARD RECHAZÓ'],
  ['the Spanish half loses its accents', GUARD, 'commitearía una marca', 'commitearia una marca'],
  ['the refusal no longer says to retry (Spanish)', GUARD, 'y reintentar.', 'y seguir.'],
  ['the refusal no longer says to resolve the conflict (English)', GUARD, 'resolve the conflict (keep', 'fix it (keep'],
  ['the refusal no longer says one marker is enough (English)', GUARD, 'counts with ONE marker of any kind', 'counts with markers'],
  ['the refusal no longer says one marker is enough (Spanish)', GUARD, 'cuenta con UNA', 'cuenta con varias'],
  ['the refusal does not say where to declare fixtures (English)', GUARD, '(never valid for an unmerged file)', '(not for merges)'],
  ['the refusal does not say where to declare fixtures (Spanish)', GUARD, '(nunca vale para un fichero sin fusionar)', '(no vale en fusiones)'],
  ['the refusal omits the line number', GUARD, '`${file}:${line} (${kinds.join(\' \')})`', '`${file} (${kinds.join(\' \')})`'],
  ['the refusal lists nine conflicts, not eight', GUARD, 'LISTED_CONFLICTS = 8', 'LISTED_CONFLICTS = 9'],

  // --- the shared parser: a heredoc body is data.
  ['heredoc bodies are scanned as commands', 'shell-command/shell-command.mjs', "if (operator === '\\n') this.skipHeredocBodies();", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['conflict-marker-guard', 'shell-command', 'cherry-pick-guard', 'company-remote', 'mutation-proof', 'hook-payloads', 'hook-state', 'selftest-fixtures', 'hook-dispatch/manifests', 'git-worktree'],
  selftest: 'conflict-marker-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
