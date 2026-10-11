#!/usr/bin/env node
/**
 * The decisions of sdd-attempt-cwd-guard, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules — green unmutated baseline, exactly-once target, parse check — live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de la guardia, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- decide.mjs: which invocations bind the ledger.
  ['`status`/`reset`/`inspect` are refused too: the verb set is no longer checked', 'sdd-attempt-cwd-guard/decide.mjs', " && BOUND_VERBS.has(words[1])", ''],
  ['the v4 review verbs are not watched', 'sdd-attempt-cwd-guard/decide.mjs', "  if (words[0] === 'review' && RANGE_REVIEW_VERBS.has(words[1])) return cwdOption(words.slice(2)) ?? '.';\n", ''],
  ['any v4 review verb is watched, `mode status` included', 'sdd-attempt-cwd-guard/decide.mjs', " && RANGE_REVIEW_VERBS.has(words[1])", ''],
  ['an absent --cwd under v4 binds nothing, although it defaults to "."', 'sdd-attempt-cwd-guard/decide.mjs', " ?? '.';", ';'],
  ['a verb is dropped from the bound set, so `finish` escapes', 'sdd-attempt-cwd-guard/decide.mjs', "'record', 'finish']", "'record']"],
  ['the `sdd-attempt` word is no longer required, so `sdd-attempts` and `sdd-attempt-status` are read as it', 'sdd-attempt-cwd-guard/decide.mjs', "words[0] === 'sdd-attempt' && ", ''],
  ['any executable is read as gentle-ai', 'sdd-attempt-cwd-guard/decide.mjs', "executableName(command.words[at]) !== 'gentle-ai'", 'false'],
  ['the fused `--cwd=value` spelling is no longer read', 'sdd-attempt-cwd-guard/decide.mjs', "|| word.startsWith('--cwd=')", ''],
  ['a relative --cwd is resolved against the process cwd instead of the command cwd', 'sdd-attempt-cwd-guard/decide.mjs', 'path.resolve(directory, nativeSpelling(value, platform))', 'path.resolve(nativeSpelling(value, platform))'],
  ['the line\'s own `cd` is ignored: every command is taken to run in the payload cwd', 'sdd-attempt-cwd-guard/decide.mjs', 'withWorkingDirectories(simpleCommands(script, dialect), startDirectory, dialect, platform)', 'simpleCommands(script, dialect).map((command) => ({ command, directory: startDirectory }))'],
  ['a tool with no shell dialect is no longer exempted', 'sdd-attempt-cwd-guard/decide.mjs', 'if (dialect === undefined || typeof command', 'if (typeof command'],

  // --- worktree-work.mjs: what counts as work, and which directory is a main checkout.
  ['a linked worktree as --cwd is treated like a main checkout', 'sdd-attempt-cwd-guard/worktree-work.mjs', 'if (gitDir.trim() !== commonDir.trim()) return [];', ''],
  ['uncommitted changes no longer count as work', 'sdd-attempt-cwd-guard/worktree-work.mjs', 'worktree.ahead > 0 || worktree.dirty', 'worktree.ahead > 0'],
  ['commits ahead of the main HEAD no longer count as work', 'sdd-attempt-cwd-guard/worktree-work.mjs', 'worktree.ahead > 0 || worktree.dirty', 'worktree.dirty'],
  ['every linked worktree counts as work, integrated or not', 'sdd-attempt-cwd-guard/worktree-work.mjs', '.filter((worktree) => worktree.ahead > 0 || worktree.dirty)', ''],
  ['the main checkout itself is listed as a linked worktree', 'sdd-attempt-cwd-guard/worktree-work.mjs', 'const [, ...linked] = worktreePaths(directory);', 'const linked = worktreePaths(directory);'],

  // --- guard.mjs: the shim.
  ['the shim never refuses', 'sdd-attempt-cwd-guard/guard.mjs', 'if (offender === undefined) return undefined;', 'return undefined;'],
  ['a git failure is no longer swallowed, so an unreadable repository crashes the hook', 'sdd-attempt-cwd-guard/guard.mjs', 'journal({ verdict: \'fail-open\'', 'throw error; journal({ verdict: \'fail-open\''],
  ['the fail-open is not journaled', 'sdd-attempt-cwd-guard/guard.mjs', "journal({ verdict: 'fail-open', session: payload?.session_id, reason: error instanceof Error ? error.message.split('\\n')[0] : String(error) });", ''],
  ['the refusal loses its Spanish mirror', 'sdd-attempt-cwd-guard/guard.mjs', '`@es SDD-ATTEMPT-CWD GUARD RECHAZÓ', '`SDD-ATTEMPT-CWD GUARD RECHAZÓ'],
  ['the refusal no longer says what to pass (English)', 'sdd-attempt-cwd-guard/guard.mjs', "Pass `--cwd <the unit's own worktree>` instead.", ''],
  ['the refusal no longer says how many commits are ahead', 'sdd-attempt-cwd-guard/guard.mjs', 'commit(s) ahead', 'ahead'],

  // --- the shared parser: a heredoc body is data.
  ['heredoc bodies are scanned as commands', 'shell-command/shell-command.mjs', "if (operator === '\\n') this.skipHeredocBodies();", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['sdd-attempt-cwd-guard', 'shell-command', 'cherry-pick-guard', 'mutation-proof', 'hook-payloads', 'hook-state', 'selftest-fixtures', 'hook-dispatch/manifests'],
  selftest: 'sdd-attempt-cwd-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
