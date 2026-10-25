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
const PROBE = 'conflict-marker-guard/probe.mjs';
const DECIDE = 'conflict-marker-guard/decide.mjs';
const GUARD = 'conflict-marker-guard/guard.mjs';

const MUTANTS = [
  // --- markers.mjs: what a marker is, what a conflict is, what is data.
  ['one marker kind alone is a conflict', MARKERS, 'kinds.length >= 2', 'kinds.length >= 1'],
  ['three marker kinds are needed, so a half-resolved block passes', MARKERS, 'kinds.length >= 2', 'kinds.length >= 3'],
  ['`=======` is no longer a marker', MARKERS, '  if (text === MIDDLE) return MIDDLE;\n', ''],
  ['a marker may carry trailing text or more characters', MARKERS, 'text === kind || text.startsWith(`${kind} `)', 'text.startsWith(kind)'],
  ['a CRLF line is no longer a marker', MARKERS, "const text = line.endsWith('\\r') ? line.slice(0, -1) : line;", 'const text = line;'],
  ['the file name counts as a fixtures folder', MARKERS, "filePath.split('/').slice(0, -1).some", "filePath.split('/').some"],
  ['`fixtures` is no longer a fixtures folder', MARKERS, "['fixtures', '__fixtures__'", "['__fixtures__'"],
  ['a file the change adds is judged like any other', MARKERS, '!file.isNew && ', ''],
  ['a fixtures folder is judged like any other', MARKERS, ' && !isFixturePath(file.path)', ''],
  ['the oversize limit is huge', MARKERS, '5 * 1024 * 1024', '5000 * 1024 * 1024'],
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

  // --- probe.mjs: the questions to git.
  ['the patch keeps its context lines', PROBE, "'--cached', '-U0', ", "'--cached', "],
  ['paths are quoted by git again', PROBE, "run([...PLAIN_PATHS, 'diff'", "run(['diff'"],
  ['a failing git is read as clean', PROBE, 'if (result.status !== 0) return', 'if (false) return'],
  ['a git error object (timeout) is read as clean', PROBE, 'if (result.error !== undefined) return', 'if (false) return'],
  ['the timeout is a minute', PROBE, 'GIT_TIMEOUT_MS = 4000', 'GIT_TIMEOUT_MS = 60000'],
  ['git runs without a timeout', PROBE, 'timeout: GIT_TIMEOUT_MS, ', ''],
  ['git output is unbounded', PROBE, 'maxBuffer: MAX_OUTPUT_BYTES, ', ''],
  ['the output bound is one kilobyte', PROBE, '64 * 1024 * 1024', '1024'],
  ['git shows its window', PROBE, 'windowsHide: true', 'windowsHide: false'],
  ['git output is not decoded as text', PROBE, "{ cwd, encoding: 'utf8', timeout", '{ cwd, timeout'],
  ['an unmerged file under a fixtures folder is scanned', PROBE, '    if (isFixturePath(name)) continue;\n', ''],
  ['an oversized unmerged file is read', PROBE, '      if (size(file) > MAX_SCANNED_BYTES) continue;\n', ''],
  ['a path unmerged at three stages is read three times', PROBE, '[...new Set(', '[...('],
  ['the empty record after the last NUL is read as a path', PROBE, ".filter((record) => record.includes('\\t'))", ''],
  ['the path keeps the tab that separates it from its stage', PROBE, "record.slice(record.indexOf('\\t') + 1)", "record.slice(record.indexOf('\\t'))"],
  ['an unreadable unmerged file crashes the scan', PROBE, '    } catch {\n      // A file that cannot be read', '    } catch (error) {\n      throw error;\n      // A file that cannot be read'],

  // --- decide.mjs: which steps, in which repository.
  ['`am --continue` is not watched', DECIDE, "'cherry-pick', 'am'", "'cherry-pick'"],
  ['`rebase --continue` is not watched', DECIDE, "['rebase', 'merge'", "['merge'"],
  ['`merge --continue` is not watched', DECIDE, "'merge', 'cherry-pick'", "'cherry-pick'"],
  ['`cherry-pick --continue` is not watched', DECIDE, "'cherry-pick', 'am'", "'am'"],
  ['every rebase, merge, cherry-pick and am is watched, `--abort` included', DECIDE, "args.includes('--continue')", 'true'],
  ['`git commit` is not watched', DECIDE, "if (subcommand === 'commit') return true;\n", ''],
  ['every git step is watched', DECIDE, 'if (!commitsWork(invocation)) continue;\n', ''],
  ['an add is never remembered', DECIDE, "if (invocation.subcommand === 'add') staging.add(directory);", ''],
  ['every step is read as staging', DECIDE, "if (invocation.subcommand === 'add') staging.add(directory);", 'staging.add(directory);'],
  ['the worktree files are scanned although the line stages nothing', DECIDE, 'if (staging.has(directory)) answers.push(', 'if (true) answers.push('],
  ['an unfollowable cd is not a failure', DECIDE, 'if (directory === undefined) {', 'if (false) {'],
  ['an unfollowable cd goes on to probe the process directory', DECIDE, '      continue;\n    }\n\n    const answers', '    }\n\n    const answers'],
  ['the same repository is probed once per step', DECIDE, 'if (!probed.has(key))', 'if (true)'],
  ['a probe failure is dropped', DECIDE, 'if (answer.failure !== undefined) failures.push', 'if (false) failures.push'],
  ['one conflict is not enough to refuse', DECIDE, 'conflicts.length > 0', 'conflicts.length > 1'],
  ['a tool with no shell dialect is no longer exempted', DECIDE, 'dialect === undefined || ', ''],

  // --- guard.mjs: the shim.
  ['the shim never refuses', GUARD, 'if (decision.offender === undefined) return undefined;', 'return undefined;'],
  ['a decision failure is no longer swallowed', GUARD, "journal({ verdict: 'fail-open', session: payload?.session_id, reason: error", "throw error; journal({ verdict: 'fail-open', session: payload?.session_id, reason: error"],
  ['a probe failure is not journaled', GUARD, "for (const failure of decision.failures) journal({ verdict: 'fail-open', session: payload?.session_id, directory: failure.directory, reason: failure.reason });\n", ''],
  ['a refusal is not journaled', GUARD, "  journal({ verdict: 'deny', session: payload?.session_id, directory: decision.offender.directory, conflicts: decision.offender.conflicts.length });\n", ''],
  ['options (the git runner) are not passed to the decision', GUARD, 'decideFor(payload, options)', 'decideFor(payload)'],
  ['a payload with a byte-order mark is not read', GUARD, "raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw", 'raw'],
  ['the refusal loses its Spanish mirror', GUARD, '`@es CONFLICT-MARKER GUARD RECHAZÓ', '`CONFLICT-MARKER GUARD RECHAZÓ'],
  ['the Spanish half loses its accents', GUARD, 'commitearía una marca', 'commitearia una marca'],
  ['the refusal no longer says to retry (Spanish)', GUARD, 'y reintentar.', 'y seguir.'],
  ['the refusal no longer says to resolve the conflict (English)', GUARD, 'resolve the conflict (keep', 'fix it (keep'],
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
