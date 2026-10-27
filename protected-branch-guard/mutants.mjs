#!/usr/bin/env node
/**
 * The decisions of protected-branch-guard, each broken once, that `selftest.mjs` must catch by an assertion. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de protected-branch-guard, rotas una a una, que `selftest.mjs` debe cazar con una aserción.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const G = 'protected-branch-guard/guard.mjs';
const D = 'protected-branch-guard/branch-deletions.mjs';
const P = 'protected-branch-guard/protected-branches.mjs';
const R = 'protected-branch-guard/refusal.mjs';
const B = 'protected-branch-guard/default-branch.mjs';

const MUTANTS = [
  // --- the hook entry
  ['PowerShell is not a shell this guard reads', G, "if (dialect === undefined || typeof command !== 'string') return undefined;", "if (dialect !== 'bash' || typeof command !== 'string') return undefined;"],
  ['a refusal is never produced', G, '  if (offenders.length === 0) return undefined;', '  return undefined;'],
  ['an internal failure refuses instead of failing open', G, 'return undefined; // fail open: a malfunction of the decision must never block a command', "throw new Error('boom');"],

  // --- the names
  ['develop is not protected', P, "Object.freeze(['main', 'develop'])", "Object.freeze(['main'])"],
  ['main is not protected', P, "Object.freeze(['main', 'develop'])", "Object.freeze(['develop'])"],
  ['a full refs/heads/ ref is not read as its branch', P, 'const name = ref.startsWith(HEADS) ? ref.slice(HEADS.length) : ref;', 'const name = ref;'],
  ['the match is a substring, so feature/main is protected', P, '  if (PROTECTED_BRANCHES.includes(name)) return name;', '  if (PROTECTED_BRANCHES.some((branch) => name.includes(branch))) return name;'],
  ['the match is a prefix, so main-fix is protected', P, '  if (PROTECTED_BRANCHES.includes(name)) return name;', '  if (PROTECTED_BRANCHES.some((branch) => name.startsWith(branch))) return name;'],

  // --- the default branch
  ['the default branch is never protected', P, '  return name === defaultBranch() ? name : undefined;', '  return undefined;'],
  ['the default branch is asked eagerly, for every deletion', P, '  if (PROTECTED_BRANCHES.includes(name)) return name;', '  const asked = defaultBranch();\n\n  if (PROTECTED_BRANCHES.includes(name)) return name;\n  if (name === asked) return name;'],
  ['the default branch is asked again for every deletion', D, '    if (!defaults.has(key)) defaults.set(key, defaultBranchOf(directory, remote));', '    defaults.set(key, defaultBranchOf(directory, remote));'],
  ['the cache ignores the remote', D, '    const key = JSON.stringify([directory, remote]);', '    const key = JSON.stringify([directory]);'],
  ['a push asks origin whatever remote it names', D, '  const remote = pushRemote(args);', "  const remote = 'origin';"],
  ['--repo= is not read as the remote', D, "  const fused = args.find((word) => word.startsWith('--repo='));", '  const fused = undefined;'],
  ['a separate --repo is not read as the remote', D, "(args.includes('--repo') ? args[args.indexOf('--repo') + 1] : operandsOf(args, PUSH_VALUE_OPTIONS)[0])", 'operandsOf(args, PUSH_VALUE_OPTIONS)[0]'],
  ['an unreadable remote is asked by its variable', D, '  return given === undefined || isUnresolvableWord(given) ? DEFAULT_REMOTE : given;', '  return given ?? DEFAULT_REMOTE;'],
  ['a local deletion asks in the line\'s cwd, not where git acts', D, '({ text: invocation.text, directory: invocationDirectory(invocation), ...entry })', '({ text: invocation.text, directory: invocation.directory, ...entry })'],
  ['a gh deletion asks in no directory', D, '({ text, directory: cwd, ...entry })', '({ text, directory: undefined, ...entry })'],
  ['an unknowable directory is still asked of git', B, '  if (directory === undefined) return undefined;\n', ''],
  ['a remote prefix is kept on the default branch', B, '? target.slice(remote.length + 1) : undefined;', '? target : undefined;'],
  ['a failed symbolic-ref is read as a branch', B, "  const target = run.status === 0 ? run.stdout.trim() : '';", "  const target = `${remote}/${run.stderr.trim() || 'x'}`;"],
  ['the HEAD of origin is read whatever remote is asked', B, '`refs/remotes/${remote}/HEAD`', '`refs/remotes/origin/HEAD`'],

  // --- git branch
  ['a short cluster is not read, so -df passes', D, "const isShortCluster = (word) => word.startsWith('-') && !word.startsWith('--') && word.length > 1;", 'const isShortCluster = () => false;'],
  ['-D is not a delete', D, "hasOption(args, ['--delete'], ['d', 'D'])", "hasOption(args, ['--delete'], ['d'])"],
  ['a remote-tracking delete counts as a branch delete', D, "const branchDeletes = (args) => !hasOption(args, ['--remotes'], ['r']) && ", 'const branchDeletes = (args) => '],
  ['a rename is not a deletion', D, '  if (!branchMoves(args)) return [];', '  return [];'],
  ['a rename takes the NEW name away', D, '  if (operands.length >= 2) return [named(operands[0])];', '  if (operands.length >= 2) return [named(operands[1])];'],
  ['a one-name rename never asks for the current branch', D, '  const current = currentBranchOf(directory);', '  const current = undefined;'],
  ['the current branch is asked of the line\'s cwd, not of git -C', D, '  const directory = invocationDirectory(invocation);', '  const directory = invocation.directory;'],
  ['a rename in an unknowable directory passes', D, '  if (directory === undefined) return [{ unknowable: UNKNOWABLE.currentBranch }];', '  if (directory === undefined) return [];'],

  // --- git push
  ['--delete is not a push deletion', D, "const pushDeletes = (args) => hasOption(args, ['--delete'], ['d']);", "const pushDeletes = (args) => args.includes('-d');"],
  ['-d is not a push deletion', D, "const pushDeletes = (args) => hasOption(args, ['--delete'], ['d']);", "const pushDeletes = (args) => args.includes('--delete');"],
  ['an empty-source refspec is not a deletion', D, "  return spec.startsWith(':') ? spec.slice(1) : undefined;", '  return undefined;'],
  ['a forced empty-source refspec is not a deletion', D, "  const spec = refspec.startsWith('+') ? refspec.slice(1) : refspec;", '  const spec = refspec;'],
  ['the remote is read as a refspec', D, '  return args.includes(\'--repo\') || args.some((word) => word.startsWith(\'--repo=\')) ? operands : operands.slice(1);', '  return operands;'],
  ['--repo= keeps the first operand as the remote', D, " || args.some((word) => word.startsWith('--repo=')) ? operands", ' ? operands'],
  ['--mirror and --prune pass', D, '  if (pushPrunes(args)) return [{ unknowable: UNKNOWABLE.unnamed }];', ''],
  ['the push -o value is read as the remote', D, "const PUSH_VALUE_OPTIONS = ['-o',", 'const PUSH_VALUE_OPTIONS = ['],

  // --- git update-ref
  ['update-ref -d is not a deletion', D, "const updateRefDeletes = (args) => args.includes('-d') || args.includes('--delete');", "const updateRefDeletes = (args) => args.includes('--delete');"],
  ['update-ref --stdin passes', D, "  if (args.includes('--stdin')) return [{ unknowable: UNKNOWABLE.stdin }];\n  if (!updateRefDeletes", '  if (!updateRefDeletes'],
  ['the update-ref -m value is read as the ref', D, "  const [ref] = operandsOf(args, ['-m']);", '  const [ref] = operandsOf(args);'],

  // --- gh
  ['gh api DELETE is not a deletion', D, "  if (method.toUpperCase() !== 'DELETE') return [];", '  return [];'],
  ['a lower-case delete method passes', D, "  if (method.toUpperCase() !== 'DELETE') return [];", "  if (method !== 'DELETE') return [];"],
  ['a fused -XDELETE is not read', D, "    if (word.startsWith('-X') && word.length > 2) return word.slice(2);\n", ''],
  ['--method= is not read', D, "    if (word.startsWith('--method=')) return word.slice('--method='.length);\n", ''],
  ['the query string stays on the branch name', D, ".split('?')[0])];", ')];'],
  ['an unresolvable DELETE endpoint passes', D, '  if (at === -1) return isUnresolvableWord(endpoint) ? [{ unknowable: UNKNOWABLE.variable }] : [];', '  if (at === -1) return [];'],
  ['an unresolvable method passes', D, '  if (isUnresolvableWord(method)) return [{ unknowable: UNKNOWABLE.variable }];\n', ''],
  ['gh pr --delete-branch passes', D, "  ['pr', ghPrNames]\n", ''],
  ['gh pr -d is not read', D, "hasOption(args.slice(1), ['--delete-branch'], ['d'])", "hasOption(args.slice(1), ['--delete-branch'], [])"],
  ['gh pr --delete-branch is not read', D, "hasOption(args.slice(1), ['--delete-branch'], ['d'])", "hasOption(args.slice(1), [], ['d'])"],
  ['every gh pr verb deletes its head branch', D, '  if (!GH_PR_BRANCH_DELETERS.has(args[0])) return [];\n', ''],

  // --- what cannot be read, and what is only mentioned
  ['a variable name is read as a literal name', D, 'const named = (word) => (isUnresolvableWord(word) ? { unknowable: UNKNOWABLE.variable } : { name: word });', 'const named = (word) => ({ name: word });'],
  ['a command xargs launches is read by its own words', D, '    if (fedByXargs.has(invocation.text) && deleter.deletes(invocation.args))', '    if (false)'],
  ['an xargs-fed command that deletes nothing is refused', D, '    if (fedByXargs.has(invocation.text) && deleter.deletes(invocation.args))', '    if (fedByXargs.has(invocation.text))'],
  ['a mentioned deletion counts (substring scan over the text)', D, '  for (const invocation of gitInvocations(script, dialect, cwd)) {', "  for (const invocation of gitInvocations(script.includes('branch -D main') ? 'git branch -D main' : script, dialect, cwd)) {"],
  ['an unknowable deletion is dropped', D, '    .filter((entry) => entry.unknowable !== undefined || entry.branch !== undefined);', '    .filter((entry) => entry.branch !== undefined);'],
  ['every named deletion is refused', D, '    .filter((entry) => entry.unknowable !== undefined || entry.branch !== undefined);', '    ;'],

  // --- the words
  ['the refusal loses the owner\'s rule', R, "'WHY. The owner\\'s rule, verbatim: «main y develop NUNCA se borran» (main and develop are NEVER deleted),',", "'WHY. Branches are precious,',"],
  ['the refusal stops naming the server-side layer', R, "'This guard is the client layer only. The real layer is server-side branch protection on the remote',", "'This guard is the client layer only.',"],
  ['the Spanish half loses its accent mark', R, "'PROTECTED-BRANCH GUARD RECHAZÓ este comando", "'PROTECTED-BRANCH GUARD RECHAZO este comando"],
  ['the offender is not named', R, '`  - ${text}: deletes the protected branch ${branch}`', '`  - (command): deletes the protected branch ${branch}`'],
  ['a stdin reason is worded as a variable', R, "[UNKNOWABLE.stdin]: { en: 'the branch names arrive on standard input',", "[UNKNOWABLE.stdin]: { en: 'the branch is named by a variable',"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['protected-branch-guard', 'mutation-proof', 'hook-io', 'hook-payloads', 'shell-command', 'cherry-pick-guard', 'company-remote', 'bilingual-output'],
  selftest: 'protected-branch-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
