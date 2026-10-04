#!/usr/bin/env node
/**
 * The decisions of stash-watch, each broken once, that `selftest.mjs` must catch. The runner and its
 * rules (green baseline first, exactly-once targets, parse-checked mutants) live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de stash-watch, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  ['a stash on the stack is treated as a clean stack, so the guard can never fire', 'stash-watch/guard.mjs', 'if (inventory.stashes.length === 0) {', 'if (inventory.stashes.length >= 0) {'],
  ['the unmeasured branch is skipped, so a git failure reaches the stash count (a crash-kill)', 'stash-watch/guard.mjs', 'if (!inventory.measured) {', 'if (false) {'],
  ['noticing is forgotten, so the refusal repeats every turn', 'stash-watch/guard.mjs', 'if (noticed[sessionId]?.seen === seen) {', 'if (false) {'],
  ['noticing is global, so a new session is never shown the stack', 'stash-watch/guard.mjs', 'if (noticed[sessionId]?.seen === seen) {', 'if (Object.values(noticed).some((entry) => entry?.seen === seen)) {'],
  ['noticing ignores WHICH stashes, so a new stash in a noticed session goes unseen', 'stash-watch/guard.mjs', 'if (noticed[sessionId]?.seen === seen) {', 'if (noticed[sessionId] !== undefined) {'],
  ['`stop_hook_active` is ignored, so a refusal can loop', 'stash-watch/guard.mjs', 'if (payload?.stop_hook_active === true) return undefined;', ''],
  ['a failed git listing reads as an empty stack', 'stash-watch/stashes.mjs', "return { measured: false, reason: `git stash list failed", "return { measured: true, stashes: [], reason: `git stash list failed"],
  ['untracked files a stash carries are dropped from the record', 'stash-watch/stashes.mjs', "if (!resolves(repoRoot, `${sha}^3`)) return [];", 'return [];'],
  ['paths are read without `-z`, so a non-ASCII name arrives git-quoted', 'stash-watch/stashes.mjs', "['ls-tree', '-r', '-z', '--name-only', `${sha}^3`]", "['-c', 'core.quotePath=true', 'ls-tree', '-r', '--name-only', `${sha}^3`]"],
  ['the `WIP on` prefix is lost, so a bare `git stash` names no branch', 'stash-watch/stashes.mjs', "const SUBJECT_PREFIXES = ['WIP on ', 'On '];", "const SUBJECT_PREFIXES = ['On '];"],
  ['the report stops listing what a stash holds', 'stash-watch/report.mjs', 'for (const change of stash.tracked) lines.push(', 'for (const change of []) lines.push('],
  ['the report stops naming untracked files', 'stash-watch/report.mjs', 'for (const file of stash.untracked) lines.push(', 'for (const file of []) lines.push('],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['stash-watch', 'mutation-proof'],
  selftest: 'stash-watch/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
