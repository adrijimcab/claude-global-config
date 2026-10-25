#!/usr/bin/env node
/**
 * The decisions of commit-cadence-guard, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules (green unmutated baseline, exactly-once target, parse check, crash kills counted as survivors) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de la guardia, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const G = 'commit-cadence-guard/guard.mjs';
const C = 'commit-cadence-guard/config.mjs';
const H = 'commit-cadence-guard/holding-age.mjs';
const M = 'commit-cadence-guard/measure.mjs';
const T = 'commit-cadence-guard/messages.mjs';
const A = 'commit-cadence-guard/refusal-allowance.mjs';
const L = 'commit-cadence-guard/worktree-locator.mjs';
const S = 'commit-cadence-guard/agent-state.mjs';

const MUTANTS = [
  // --- config.mjs: the windows.
  ['the default notice window is 16 minutes', C, 'noticeMinutes: 15,', 'noticeMinutes: 16,'],
  ['the default refusal window is 31 minutes', C, 'refuseMinutes: 30,', 'refuseMinutes: 31,'],
  ['the default re-measure window is 61 seconds', C, 'remeasureSeconds: 60 }', 'remeasureSeconds: 61 }'],
  ['equal windows are accepted', C, 'declared.noticeMinutes < declared.refuseMinutes', 'declared.noticeMinutes <= declared.refuseMinutes'],
  ['zero is a valid window', C, 'value > 0', 'value >= 0'],
  ['a non-finite number is a valid window', C, 'Number.isFinite(value) && ', ''],
  ['the file never sets the notice window', C, 'windowsAgree ? declared.noticeMinutes : DEFAULTS.noticeMinutes', 'DEFAULTS.noticeMinutes'],
  ['the file never sets the refusal window', C, 'windowsAgree ? declared.refuseMinutes : DEFAULTS.refuseMinutes', 'DEFAULTS.refuseMinutes'],
  ['the file never sets the re-measure window', C, 'positive(declared?.[key]) ? declared[key] : DEFAULTS[key]', 'DEFAULTS[key]'],
  ['a minute is a second', C, 'MS_PER_MINUTE = 60_000', 'MS_PER_MINUTE = 1000'],

  // --- holding-age.mjs: which paths count and from when.
  ['an entry of three characters is read as a path', H, 'entry.length < 4', 'entry.length < 3'],
  ['a one-character path is dropped', H, 'entry.length < 4', 'entry.length <= 4'],
  ['the path starts after the wrong column', H, 'entry.slice(3)', 'entry.slice(2)'],
  ['a copy does not skip its origin', H, "new Set(['R', 'C'])", "new Set(['R'])"],
  ['a rename in the worktree column does not skip its origin', H, ' || HAS_ORIGIN.has(entry[1])', ''],
  ['a rename in the index column does not skip its origin', H, 'HAS_ORIGIN.has(entry[0]) || ', ''],
  ['a path modified at the moment of arrival is not counted', H, 'modifiedMs >= arrivalMs', 'modifiedMs > arrivalMs'],
  ['a path older than the arrival is counted', H, '.filter(({ modifiedMs }) => modifiedMs >= arrivalMs)', '.filter(({ modifiedMs }) => modifiedMs >= 0)'],
  ['a path older than the last commit keeps its old start', H, 'Math.max(modifiedMs, lastCommitMs)', 'modifiedMs'],
  ['the start is the earlier of mtime and commit', H, 'Math.max(modifiedMs, lastCommitMs)', 'Math.min(modifiedMs, lastCommitMs)'],
  ['the newest path is reported first', H, 'a.sinceMs - b.sinceMs', 'b.sinceMs - a.sinceMs'],

  // --- measure.mjs: what git is asked and how its answer is read.
  ['untracked directories are listed by directory, not by file', M, "'--untracked-files=all'", "'--untracked-files=normal'"],
  ['status is not NUL-separated', M, "'--porcelain=v1', '-z', ", "'--porcelain=v1', "],
  ['a failed status is read as a clean tree', M, 'if (status.status !== 0) return failure', 'if (false) return failure'],
  ['the commit time is read as milliseconds', M, 'committed * MS_PER_SECOND', 'committed'],
  ['a timeout is reported as an ordinary exit', M, 'answer.timedOut ?', 'false ?'],
  ['the arrival floor is ignored', M, 'heldPaths(dated, { arrivalMs, lastCommitMs })', 'heldPaths(dated, { arrivalMs: 0, lastCommitMs })'],
  ['the commit floor is ignored', M, 'heldPaths(dated, { arrivalMs, lastCommitMs })', 'heldPaths(dated, { arrivalMs, lastCommitMs: 0 })'],

  // --- messages.mjs.
  ['the age is rounded instead of floored', T, 'Math.floor(ms / MS_PER_MINUTE)', 'Math.round(ms / MS_PER_MINUTE)'],
  ['nine paths are listed', T, 'MAX_LISTED = 8', 'MAX_LISTED = 9'],
  ['a "+0 more" line is added when nothing is hidden', T, 'hidden > 0 ?', 'hidden >= 0 ?'],
  ['the refusal loses its Spanish mirror', T, '@es COMMIT-CADENCE GUARD RECHAZÓ', 'COMMIT-CADENCE GUARD RECHAZÓ'],
  ['the refusal no longer says how to unblock', T, "'TO UNBLOCK: commit, then carry on. The age resets the moment a commit lands.'", "'The age resets the moment a commit lands.'"],
  ['the refusal drops the exit hatch', T, 'report that blocker with SubagentHandback instead of working around it.', 'work around it.'],
  ['the notice loses its Spanish mirror', T, '@es AVISO DE CADENCIA', 'AVISO DE CADENCIA'],
  ['the notice no longer names the commit command', T, '`Commit now (git add any new file first): ${commitCommand(held)}`', "'Commit now.'"],

  // --- refusal-allowance.mjs: what a refused agent may still do.
  ['Read is refused', A, "'Read', ", ''],
  ['Grep is refused', A, "'Grep', ", ''],
  ['Glob is refused', A, "'Glob', ", ''],
  ['SubagentHandback is refused', A, ", 'SubagentHandback'", ''],
  ['git add is refused', A, "['add', ", '['],
  ['git commit is refused', A, "'commit', 'status'", "'status'"],
  ['git status is refused', A, "'status', 'diff'", "'diff'"],
  ['git diff is refused', A, "'diff', 'log'", "'log'"],
  ['git log is refused', A, ", 'log']", ']'],
  ['cd is refused', A, "'cd', ", ''],
  ['navigation is never recognised', A, 'NAVIGATION.has(command.words[at].toLowerCase())', 'false'],
  ['any other command is allowed beside git', A, 'others.length === 0 && ', ''],
  ['one allowed git subcommand allows the whole line', A, 'invocations.every(', 'invocations.some('],
  ['an empty shell line is allowed', A, 'if (commands.length === 0) return false;', ''],
  ['a non-shell tool is looked into as a shell', A, 'if (line === undefined) return false;', ''],
  ['an add is taken for a commit', A, "invocation.subcommand === 'commit'", "invocation.subcommand === 'add'"],

  // --- worktree-locator.mjs: where the agent works.
  ['a file_path is not a candidate', L, "['file_path', 'notebook_path', 'path']", "['notebook_path', 'path']"],
  ['a notebook_path is not a candidate', L, "['file_path', 'notebook_path', 'path']", "['file_path', 'path']"],
  ['a path is not a candidate', L, "['file_path', 'notebook_path', 'path']", "['file_path', 'notebook_path']"],
  ['the directories of a shell line are not candidates', L, 'if (dialect !== undefined && isText(input.command) && cwd !== undefined) {', 'if (false) {'],
  ['a directory path is replaced by its parent', L, 'statSync(target).isDirectory() ? target : path.dirname(target)', 'path.dirname(target)'],
  ['seven candidates are tried', L, 'MAX_CANDIDATES = 6', 'MAX_CANDIDATES = 7'],
  ['a main checkout counts as a worktree', L, 'if (isLinkedWorktree(directory)) return', 'if (true) return'],

  // --- agent-state.mjs: the keys and the file.
  ['an empty id is a key', S, "agentId === '' || ", ''],
  ['a non-string id is a key', S, "typeof agentId !== 'string' || ", ''],
  ['a 129-character id is a key', S, 'agentId.length > 128', 'agentId.length > 129'],
  ['"0" is not a key character', S, "character >= '0'", "character > '0'"],
  ['"9" is not a key character', S, "character <= '9'", "character < '9'"],
  ['"a" is not a key character', S, "character >= 'a'", "character > 'a'"],
  ['"z" is not a key character', S, "character <= 'z'", "character < 'z'"],
  ['"A" is not a key character', S, "character >= 'A'", "character > 'A'"],
  ['"Z" is not a key character', S, "character <= 'Z'", "character < 'Z'"],
  ['"-" is not a key character', S, "character === '-'", 'false'],
  ['"_" is not a key character', S, "character === '_'", 'false'],
  ['a stored value that is not an object is state', S, "state !== null && typeof state === 'object'", 'true'],

  // --- guard.mjs: the decision.
  ['a call with no plain agent id is judged anyway', G, 'if (key === undefined) return undefined;', ''],
  ['the orchestrator-shaped payload with no agent id is judged under a made-up key', G, 'stateKey(payload?.agent_id)', "stateKey(payload?.agent_id ?? 'orchestrator')"],
  ['the discovery throttle is inverted', G, 'now - (stored.searchedAtMs ?? 0) < config.remeasureMs', 'now - (stored.searchedAtMs ?? 0) > config.remeasureMs'],
  ['a known worktree is searched for on every call', G, 'if (stored.worktree !== undefined) return stored;', ''],
  ['an agent with no worktree is judged', G, 'if (state.worktree === undefined) {', 'if (false) {'],
  ['the state of an agent with no worktree is not stored', G, '      writeAgentState(key, state);\n\n      return undefined;', '      return undefined;'],
  ['a commit does not drop the stored measurement', G, 'writeAgentState(key, committing ?', 'writeAgentState(key, false ?'],
  ['the stored measurement is never used', G, 'now - (state.measuredAtMs ?? 0) < config.remeasureMs', 'false'],
  ['the measurement is never stored', G, 'writeAgentState(key, committing ? { ...measured.state, measuredAtMs: undefined, held: undefined } : measured.state);', ''],
  ['a clean tree is judged as held', G, 'if (measured.held.length === 0) return undefined;', ''],
  ['the refusal starts one millisecond late', G, 'age >= context.config.refuseMs', 'age > context.config.refuseMs'],
  ['the notice starts one millisecond late', G, 'age >= context.config.noticeMs', 'age > context.config.noticeMs'],
  ['the notice is repeated from the stored measurement', G, ' && measured.fresh', ''],
  ['a fresh measurement is never marked fresh', G, '{ held: answer.held, fresh: true,', '{ held: answer.held, fresh: false,'],
  ['the refusal allows nothing through', G, 'if (allowedUnderRefusal(payload)) return undefined;', ''],
  ['the refusal is never journaled', G, "journal({ verdict: 'deny'", "(() => 0)({ verdict: 'deny'"],
  ['a git failure is not journaled', G, "journal({ verdict: 'fail-open', worktree: state.worktree, reason: answer.reason }, now);", ''],
  ['a git failure keeps the worktree and measures again at once', G, '{ ...state, worktree: undefined, searchedAtMs: now, measuredAtMs: now, held: [] }', '{ ...state, held: [] }'],
  ['a crash is not swallowed', G, "journal({ verdict: 'fail-open', reason: error instanceof Error", 'throw error; journal({ verdict: \'fail-open\', reason: error instanceof Error'],
  ['the crash is not journaled', G, "journal({ verdict: 'fail-open', reason: error instanceof Error ? error.message.split('\\n')[0] : String(error) }, now);", ''],
  ['the age is counted from the newest path', G, 'const age = now - measured.held[0].sinceMs;', 'const age = now - measured.held.at(-1).sinceMs;']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['commit-cadence-guard', 'hook-dispatch/manifests', 'settings.json', 'hook-state', 'selftest-fixtures'],
  selftest: 'commit-cadence-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
