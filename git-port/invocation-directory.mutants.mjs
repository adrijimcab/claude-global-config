#!/usr/bin/env node
/**
 * The decisions of the `-C` fold and of its three migrated sites, each broken once, that
 * `invocation-directory.selftest.mjs` must catch.
 * @es Las decisiones del pliegue de `-C` y de sus tres sitios migrados, rotas una a una, que
 * `invocation-directory.selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const FOLD = 'git-port/invocation-directory.mjs';
const REPOSITORY = 'fleet-kit/lib/invocation-repository.mjs';
const ADDED = 'integrated-worktree-guard/added-worktree-path.mjs';
const SESSION = 'integrated-worktree-guard/session-repositories.mjs';

const MUTANTS = [
  ['-C is ignored', FOLD, "if (gitOptions[index] !== '-C') continue;", 'continue;'],
  ['a relative -C replaces instead of folding onto the directory', FOLD, 'else current = path.resolve(current, value);', 'else current = value;'],
  ['a relative -C on an unfollowable cd is trusted', FOLD, 'current = path.isAbsolute(value) ? value : undefined;', 'current = value;'],
  ['an absolute -C on an unfollowable cd is dropped', FOLD, 'current = path.isAbsolute(value) ? value : undefined;', 'current = undefined;'],
  ['a dangling -C erases the directory', FOLD, "if (typeof value !== 'string') continue;", "if (typeof value !== 'string') { current = undefined; continue; }"],
  ['until is ignored', FOLD, 'index < until', 'index < gitOptions.length'],
  ['until is inclusive', FOLD, 'index < until', 'index <= until'],
  ['the repository lookup ignores the -C folding', REPOSITORY, 'invocationDirectory(invocation, option === undefined ? invocation.gitOptions.length : option.at)', 'invocation.directory'],
  ['the created worktree path ignores -C', ADDED, 'const base = invocationDirectory(invocation);', 'const base = invocation.directory;'],
  ['an unknown directory still creates a path', ADDED, 'if (base === undefined) return undefined;', ''],
  ['the acting directory of a git call is not a path worked in', SESSION, 'if (acting !== undefined && acting !== invocation.directory) directories.push(acting);', ''],
  ['the line directory of a git call is not a path worked in', SESSION, "if (typeof invocation.directory === 'string') directories.push(invocation.directory);", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['git-port', 'fleet-kit', 'integrated-worktree-guard', 'mutation-proof', 'hook-state', 'hook-caller', 'agent-liveness', 'shell-command', 'cherry-pick-guard', 'bilingual-output', 'brief-tenancy'],
  selftest: 'git-port/invocation-directory.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
