#!/usr/bin/env node
/**
 * The decisions of worker-stash-guard, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules (green baseline first, exactly-once targets, parse-checked mutants) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de worker-stash-guard, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  ['the main session is treated as a worker, so the orchestrator is refused too', 'worker-stash-guard/guard.mjs', 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['every caller is allowed, so a worker may stash', 'worker-stash-guard/guard.mjs', 'if (!isSubagentCaller(payload)) return undefined;', 'return undefined;'],
  ['PowerShell is not a shell this guard reads', 'worker-stash-guard/guard.mjs', 'if (dialect === undefined || typeof command !== \'string\') return undefined;', 'if (dialect !== \'bash\' || typeof command !== \'string\') return undefined;'],
  ['a refusal is never produced', 'worker-stash-guard/guard.mjs', 'if (offenders.length === 0) return undefined;', 'return undefined;'],
  ['an internal failure refuses the command instead of failing open', 'worker-stash-guard/guard.mjs', 'return undefined; // fail open: a malfunction of the decision must never block a command', 'throw new Error(\'boom\');'],
  ['a mentioned stash counts as a command (substring scan over the text)', 'worker-stash-guard/stash-invocations.mjs', 'return gitInvocations(script, dialect, cwd)', 'return gitInvocations(`${script}\\ngit stash`, dialect, cwd)'],
  ['the subcommand test accepts a prefix, so `git stashed` is a stash', 'worker-stash-guard/stash-invocations.mjs', 'invocation.subcommand === STASH', 'String(invocation.subcommand).startsWith(STASH)'],
  ['`list` is refused', 'worker-stash-guard/stash-invocations.mjs', "const READ_ONLY_VERBS = new Set(['list', 'show']);", "const READ_ONLY_VERBS = new Set(['show']);"],
  ['`show` is refused', 'worker-stash-guard/stash-invocations.mjs', "const READ_ONLY_VERBS = new Set(['list', 'show']);", "const READ_ONLY_VERBS = new Set(['list']);"],
  ['reading verbs are not exempt, so any verb is refused only when bare', 'worker-stash-guard/stash-invocations.mjs', '!READ_ONLY_VERBS.has(invocation.args[0])', 'invocation.args.length === 0'],
  ['the English half of the refusal loses the incident', 'worker-stash-guard/refusal.mjs', "'shared it; the `git stash pop` of f5 applied the lint-staged backup stash (124b632f, 7 spec files) of f4',", "'shared it.',"],
  ['the refusal stops naming the working alternative', 'worker-stash-guard/refusal.mjs', "'USE INSTEAD: commit the work in progress on your OWN branch (a commit is per-branch and nobody else',", "'USE INSTEAD: ask someone (a commit is per-branch and nobody else',"],
  ['the Spanish half loses its accent mark', 'worker-stash-guard/refusal.mjs', "'WORKER-STASH GUARD RECHAZÓ este comando", "'WORKER-STASH GUARD RECHAZO este comando"],
  ['the offending command is not named', 'worker-stash-guard/guard.mjs', 'refusalText(offenders[0].text)', "refusalText('(command)')"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['worker-stash-guard', 'mutation-proof', 'hook-caller', 'hook-payloads', 'shell-command', 'cherry-pick-guard', 'bilingual-output'],
  selftest: 'worker-stash-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
