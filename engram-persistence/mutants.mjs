#!/usr/bin/env node
/**
 * The decisions of the engram-persistence guard, each broken once, that `selftest.mjs` must catch: when a
 * turn may end, when a session counts as first seen, what counts as a save and in which ORDER, and how it
 * fails open. The campaign runner and its rules (green baseline first, exactly-once targets, parse-checked
 * mutants) live in `../mutation-proof/run-mutants.mjs`. A mutant is never deleted or softened to get a
 * clean campaign: a survivor is a missing assertion in the selftest.
 *
 * @es Las decisiones del guard de persistencia en engram, rotas una a una, que `selftest.mjs` debe cazar:
 * cuándo puede terminar un turno, cuándo una sesión es la primera vista, qué cuenta como guardado y en qué
 * ORDEN, y cómo falla abierto. Un mutante nunca se borra ni se ablanda: un superviviente es una aserción que falta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const GUARD = 'engram-persistence/guard.mjs';
const OWN = 'engram-persistence/own-commits.mjs';
const SATISFIED = "tail.includes(marker))) {\n    writeState(sessionId, { head, offset: size ?? 0 });";

const MUTANTS = [
  // When the guard steps aside / Cuándo se aparta el guard
  ['a Stop the guard already refused once is refused again, trapping the turn', GUARD, 'if (payload?.stop_hook_active === true) return;', 'if (false) return;'],
  ['outside a repository the guard goes on to record a baseline', GUARD, 'return; // no git, no verdict', 'head = undefined; // no git, no verdict'],
  // First sighting and the baseline / Primera vista y línea base
  ['a state file whose head is not a string is compared instead of re-baselined', GUARD, "if (state === undefined || typeof state.head !== 'string') {", 'if (state === undefined) {'],
  ['the first sighting records no baseline', GUARD, "typeof state.head !== 'string') {\n    writeState(sessionId, { head, offset: size ?? 0 });", "typeof state.head !== 'string') {\n    void sessionId;"],
  ['an unmoved HEAD is read as moved, and a moved one as unmoved', GUARD, 'if (state.head === head) {', 'if (state.head !== head) {'],
  ['an idle Stop keeps the old transcript offset, so a save made while idle covers later commits', GUARD, 'offset: size ?? state.offset', 'offset: state.offset'],
  // What counts as a save, and when / Qué cuenta como guardado y cuándo
  ['the transcript tail is cut on the decoded string by a byte offset', GUARD, "readFileSync(path).subarray(offset).toString('utf8')", "readFileSync(path, 'utf8').slice(offset)"],
  ['mem_save no longer counts as a save', GUARD, "['mem_save', 'mem_session_summary']", "['mem_session_summary']"],
  ['mem_session_summary no longer counts as a save', GUARD, "['mem_save', 'mem_session_summary']", "['mem_save']"],
  ['every marker must appear before the save counts', GUARD, 'SAVE_MARKERS.some(', 'SAVE_MARKERS.every('],
  ['a satisfied guard keeps its old baseline, so the same save is spent twice', GUARD, SATISFIED, "tail.includes(marker))) {\n    void sessionId;"],
  // Fail open / Falla abierto
  ['an unreadable transcript crashes the guard instead of re-baselining', GUARD, 'if (tail === undefined) {', 'if (false) {'],
  ['an unresolvable recorded head re-baselines instead of leaving state alone', GUARD, 'return; // the range is unreadable (rebased, gone) — no honest verdict', 'landed = []; // the range is unreadable (rebased, gone) — no honest verdict'],
  // Whose commits / De quién son los commits
  ['every commit of the range is this session\'s, whoever made it', GUARD, 'commitsMadeBySession(landed, tail).map(', 'landed.map('],
  ['the committer time is compared in seconds against windows in milliseconds', GUARD, 'committedAtMs: Number(seconds) * 1000', 'committedAtMs: Number(seconds)'],
  ['a commit line keeps its committer time in the refusal', GUARD, 'line: `${hash}${entry.slice(hash.length + 1 + seconds.length)}`', 'line: entry'],
  ['a commit whose time is outside every commit window is still claimed', OWN, 'commits.filter((commit) => withinWindow(windows, commit.committedAtMs))', 'commits.filter(() => windows.length > 0)'],
  ['a call that failed still claims the commits inside its window', OWN, '!call.failed && createsCommits(call.command)', 'createsCommits(call.command)'],
  ['a shell call that creates no commits still claims the commits inside its window', OWN, '!call.failed && createsCommits(call.command)', '!call.failed'],
  ['git cherry-pick no longer creates commits', OWN, "'cherry-pick', ", ''],
  ['git merge no longer creates commits', OWN, "'merge', ", ''],
  ['git revert no longer creates commits', OWN, "'revert', ", ''],
  ['git am no longer creates commits', OWN, "'am', ", ''],
  ['git rebase no longer creates commits', OWN, ", 'rebase'", ''],
  ['git commit no longer creates commits', OWN, "new Set(['commit', ", "new Set(["],
  ['land.mjs no longer creates commits', OWN, "COMMIT_WRAPPERS = ['land.mjs']", 'COMMIT_WRAPPERS = []'],
  ['any backup-repo.mjs call creates commits', OWN, "tokens[index + 1] === 'commit'", 'true'],
  ['backup-repo.mjs commit no longer creates commits', OWN, "tokens[index + 1] === 'commit'", 'false'],
  ['the git program is only recognised by the bare name git', OWN, "name === 'git' || name === 'git.exe'", "name === 'git'"],
  ['the program name keeps its directory', OWN, ".split('/').at(-1)", ''],
  ['a Windows backslash path is not normalised', OWN, "token.replaceAll('\\\\', '/')", 'token'],
  ['the -C option is read as the verb', OWN, "new Set(['-C', '-c'])", "new Set(['-c'])"],
  ['the -c option is read as the verb', OWN, "new Set(['-C', '-c'])", "new Set(['-C'])"],
  ['an option value is not skipped', OWN, 'at += 1;\n    else', 'void at;\n    else'],
  ['a long option is read as the verb', OWN, "!tokens[at].startsWith('-')", 'true'],
  ['a semicolon no longer separates tokens', OWN, "[' ', '\\t', '\\n', '\\r', ';',", "[' ', '\\t', '\\n', '\\r',"],
  ['an ampersand no longer separates tokens', OWN, "';', '&', '|'", "';', '|'"],
  ['a pipe no longer separates tokens', OWN, "'&', '|', '('", "'&', '('"],
  ['an opening parenthesis no longer separates tokens', OWN, "'|', '(', ')'", "'|', ')'"],
  ['a closing parenthesis no longer separates tokens', OWN, "'(', ')', '\"'", "'(', '\"'"],
  ['a double quote no longer separates tokens', OWN, "')', '\"', \"'\"", "')', \"'\""],
  ['a single quote no longer separates tokens', OWN, "'\"', \"'\", '`'", "'\"', '`'"],
  ['a backtick no longer separates tokens', OWN, "\"'\", '`']", "\"'\"]"],
  ['a tab no longer separates tokens', OWN, "[' ', '\\t', ", "[' ', "],
  ['a newline no longer separates tokens', OWN, "'\\t', '\\n', '\\r'", "'\\t', '\\r'"],
  ['a carriage return no longer separates tokens', OWN, "'\\n', '\\r', ';'", "'\\n', ';'"],
  ['empty tokens between adjacent separators are kept', OWN, "if (current !== '') tokens.push(current);", 'tokens.push(current);'],
  ['the last token of a command is dropped', OWN, "current === '' ? tokens : [...tokens, current]", 'tokens'],
  ['a HEAD that moved backwards is refused with no commits to name', GUARD, 'if (subjects.length === 0) {', 'if (false) {'],
  ['an empty git log is parsed as one blank commit instead of none', GUARD, "return log === ''\n    ? []", 'return false\n    ? []'],
  ['the refusal lists thirteen subjects', GUARD, ".slice(0, 12)", ".slice(0, 13)"],
  ['the refusal lists every subject', GUARD, '.map((commit) => commit.line).slice(0, 12)', '.map((commit) => commit.line)'],
  ['a payload with a byte-order mark is not judged', GUARD, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['engram-persistence', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'engram-persistence/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
