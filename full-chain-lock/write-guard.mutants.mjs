#!/usr/bin/env node
/**
 * The decisions of the full-chain write guard (`write-guard.mjs`, `tree-writes.mjs`), each broken once, that
 * `write-guard.selftest.mjs` must catch by an assertion. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del guard de escrituras de cadena completa, rotas una a una, que `write-guard.selftest.mjs` debe
 * cazar con una aserción.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const G = 'full-chain-lock/write-guard.mjs';
const W = 'full-chain-lock/tree-writes.mjs';
const M = 'full-chain-lock/messages.mjs';

const MUTANTS = [
  // --- the hook entry
  ['the running chain is never read, so nothing is refused', G, "if (holder === undefined || typeof holder.tree !== 'string' || !path.isAbsolute(holder.tree)) return undefined;", 'return undefined;'],
  ['a record with no tree is read as the root of everything', G, "if (holder === undefined || typeof holder.tree !== 'string' || !path.isAbsolute(holder.tree)) return undefined;", "if (holder === undefined) return undefined;\n    holder = { ...holder, tree: holder.tree ?? path.parse(process.cwd()).root };"],
  ['a relative tree is accepted', G, " || !path.isAbsolute(holder.tree)) return undefined;", ') return undefined;'],
  ['a refusal is never produced', G, '  if (writes.length === 0) return undefined;', '  return undefined;'],
  ['a malfunction refuses instead of failing open', G, 'return undefined; // fail open: a malfunction of the lock reading or of the decision must never block a write', "throw new Error('boom');"],
  ['the guard reads every holder record, dead or alive', G, 'fileLockAdapter(stateDir(\'full-chain-lock\')).liveHolder()', "fileLockAdapter(stateDir('full-chain-lock')).readHolder()"],
  ['the guard reads the lock of another mechanism', G, "stateDir('full-chain-lock')", "stateDir('other-mechanism')"],
  ['the refusal does not name the targets', G, "targets: writes.map(({ path: target, via }) => `  - ${target} (${via})`).join('\\n'),", "targets: '',"],
  ['the refusal does not name the session', G, 'holderSession: holder.session,', "holderSession: 'unknown',"],
  ['the refusal does not name the tree', G, 'holderTree: holder.tree', "holderTree: '(tree)'"],
  ['the refusal does not name the pid', G, 'holderPid: holder.pid,', 'holderPid: 0,'],

  // --- the decision
  ['edit-tool writes are not counted', W, 'return [...toolCallWrites(payload), ...gitStatusWrites(payload)]', 'return [...toolCallWrites(payload).filter((write) => write.channel !== \'edit\'), ...gitStatusWrites(payload)]'],
  ['shell file writes are not counted', W, 'return [...toolCallWrites(payload), ...gitStatusWrites(payload)]', 'return [...toolCallWrites(payload).filter((write) => write.channel !== \'shell\'), ...gitStatusWrites(payload)]'],
  ['git commands are not counted', W, 'return [...toolCallWrites(payload), ...gitStatusWrites(payload)]', 'return [...toolCallWrites(payload)]'],
  ['git add is not a status change', W, "new Set(['add', 'am',", "new Set(['am',"],
  ['git commit is not a status change', W, "'clean', 'commit', 'merge',", "'clean', 'merge',"],
  ['stash list is a status change', W, "const STASH_READS = new Set(['list', 'show']);", "const STASH_READS = new Set(['show']);"],
  ['every stash verb reads', W, "!(subcommand === 'stash' && STASH_READS.has(args[0]))", "!(subcommand === 'stash')"],
  ['every git subcommand is a status change', W, 'const changesStatus = ({ subcommand, args }) => STATUS_CHANGING.has(subcommand) &&', 'const changesStatus = ({ subcommand, args }) => true &&'],
  ['git -C is not followed', W, "({ path: invocationDirectory(invocation), via: `git ${invocation.subcommand}` })", '({ path: invocation.directory, via: `git ${invocation.subcommand}` })'],
  ['an unresolvable target is refused as the tree root', W, ".filter((write) => typeof write.path === 'string')", '.map((write) => ({ ...write, path: write.path ?? tree }))'],
  ['containment is a string prefix, so a sibling counts', W, 'isWithin(tree, write.path) && !inNestedTree', 'write.path.startsWith(tree) && !inNestedTree'],
  ['a nested worktree is part of the tree', W, ' && !inNestedTree(tree, write.path, exists))', ')'],
  ['the tree itself counts as nested, so nothing at its root is refused', W, "isWithin(tree, directory) && path.relative(tree, directory) !== '';", 'isWithin(tree, directory);'],
  ['a nested tree is looked for only at the target itself', W, 'directory = path.dirname(directory)) {', 'directory = tree) {'],

  // --- the words
  ['the refusal stops saying how to wait', M, "'WAIT, DO NOT POLL: queue this write until the chain has finished and its verdict is read", "'Queue this write until the chain has finished and its verdict is read"],
  ['the Spanish half loses its accent mark', M, "'FULL-CHAIN WRITE GUARD RECHAZÓ esta llamada", "'FULL-CHAIN WRITE GUARD RECHAZO esta llamada"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['full-chain-lock', 'mutation-proof', 'hook-state', 'hook-io', 'hook-payloads', 'shell-command', 'cherry-pick-guard', 'write-targets', 'company-remote', 'worker-git-guard', 'selftest-runner', 'bilingual-output'],
  selftest: 'full-chain-lock/write-guard.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
