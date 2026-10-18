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

const MUTANTS = [
  // caller identification and fail-open
  ['the main session is treated as a worker, so the orchestrator is refused too', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', ''],
  ['every caller is allowed, so a worker may run anything', GUARD, 'if (!isSubagentCaller(payload)) return undefined;', 'return undefined;'],
  ['PowerShell is not a shell this guard reads', GUARD, "if (dialect === undefined || typeof command !== 'string') return undefined;", "if (dialect !== 'bash' || typeof command !== 'string') return undefined;"],
  ['a refusal is never produced', GUARD, 'if (offenders.length === 0) return undefined;', 'return undefined;'],
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
  ['commit --no-verify is allowed', DECISION, 'return longs.some(isNoVerify) || shorts.includes(\'n\') ?', 'return shorts.includes(\'n\') ?'],
  ['commit -n is allowed', DECISION, 'return longs.some(isNoVerify) || shorts.includes(\'n\') ?', 'return longs.some(isNoVerify) ?'],
  ['a value-taking short option does not end the cluster, so -m"no" reads as -n', DECISION, 'break; // the rest of the cluster is the value', ''],
  ['the value word after -m is read as an option', DECISION, 'if (at === word.length - 1) index += 1; // the value is the next word', ''],
  ['the value word after --message is read as an option', DECISION, 'if (!word.includes(\'=\') && LONG_WITH_VALUE[subcommand].has(name)) index += 1;', ''],
  ['words after -- are read as options', DECISION, "if (word === '--') {", "if (word === '--never') {"],
  ['words after -- are not counted as names', DECISION, 'positionals.push(...args.slice(index + 1));', ''],
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
  ['update-ref is allowed', DECISION, "return updateRefDeletes(args) ? 'updateRef' : undefined;", 'return undefined;'],
  ['every update-ref is refused', DECISION, "return updateRefDeletes(args) ? 'updateRef' : undefined;", "return 'updateRef';"],
  ['update-ref -d is not read', DECISION, "optionsOf('update-ref', args).shorts.includes('d')", 'false'],
  ['update-ref -m takes no value, so its value is read as -d', DECISION, "'update-ref': new Set(['m'])", "'update-ref': new Set()"],
  ['symbolic-ref is allowed', DECISION, "return symbolicRefWrites(args) ? 'symbolicRef' : undefined;", 'return undefined;'],
  ['symbolic-ref with two names is not read as a write', DECISION, 'positionals.length >= 2 ||', 'positionals.length >= 3 ||'],
  ['symbolic-ref with one name (a read) is refused', DECISION, 'positionals.length >= 2 ||', 'positionals.length >= 1 ||'],
  ['symbolic-ref -d is not read', DECISION, "|| shorts.includes('d') || longs.some((name) => isOption(name, '--delete'", "|| longs.some((name) => isOption(name, '--delete'"],
  ['symbolic-ref --delete is not read', DECISION, "shorts.includes('d') || longs.some((name) => isOption(name, '--delete', '--d'.length))", "shorts.includes('d')"],
  ['symbolic-ref -m takes no value, so its value is counted as a name', DECISION, "'symbolic-ref': new Set(['m'])", "'symbolic-ref': new Set()"],
  // refusal text
  ['the read-tree refusal stops naming the safe route', REFUSAL, "'USE INSTEAD: commit your work in progress on your branch, or ask the orchestrator to clear the index. A bare',", "'USE INSTEAD: ask. A bare',"],
  ['the symbolic-ref refusal stops naming the allowed read', REFUSAL, "'USE INSTEAD: nothing is needed; the orchestrator creates the branches and worktrees. Reading is allowed:',", "'USE INSTEAD: nothing is needed. Reading is allowed:',"],
  ['the reset refusal stops naming the alternative', REFUSAL, "'USE INSTEAD: to unstage, `git restore --staged -- <paths>` (it changes only the index). Never move HEAD;',", "'USE INSTEAD: to unstage, ask. Never move HEAD;',"],
  ['the Spanish half loses its accent mark', REFUSAL, "'WORKER-GIT GUARD RECHAZÓ este comando: un worker delegado no puede ejecutar `git reset`", "'WORKER-GIT GUARD RECHAZO este comando: un worker delegado no puede ejecutar `git reset`"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['worker-git-guard', 'mutation-proof', 'hook-caller', 'hook-payloads', 'shell-command', 'cherry-pick-guard', 'bilingual-output'],
  selftest: 'worker-git-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
