#!/usr/bin/env node
/**
 * The decisions of the linked-worktree predicate, each broken once, that `selftest.mjs` must catch. The runner and
 * its rules (green baseline, exactly-once target, parse check) live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del predicado de worktree enlazado, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'git-worktree/linked-worktree.mjs';
const Q = 'git-worktree/git-query.mjs';
const P = 'git-port/git.mjs';

const MUTANTS = [
  ['a main checkout reads as a linked worktree and a linked one as main', L, 'path.resolve(gitDir.trim()) !== path.resolve(commonDir.trim())', 'path.resolve(gitDir.trim()) === path.resolve(commonDir.trim())'],
  ['every directory reads as a linked worktree', L, 'path.resolve(gitDir.trim()) !== path.resolve(commonDir.trim())', 'true'],
  ['no directory reads as a linked worktree', L, 'path.resolve(gitDir.trim()) !== path.resolve(commonDir.trim())', 'false'],
  ['the git directory is asked of the process directory, not the one given', Q, "gitOptions: ['-C', directory]", "gitOptions: ['-C', '.']"],
  ['a repository selected by the environment is not ignored', P, 'for (const name of REPOSITORY_SELECTORS) delete childEnv[name];', ''],
  ['git is asked for a relative common directory, so a nested directory misreads', L, "'--path-format=absolute', ", '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['selftest-fixtures', 'hook-state'],
  selftest: 'git-worktree/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
