#!/usr/bin/env node
/**
 * The decisions of the per-repository record of `commit-index-guard` (`stale-store.mjs`), each broken once, that
 * `store.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del registro por repositorio de `commit-index-guard`, rotas una a una, que
 * `store.selftest.mjs` debe cazar.
 */

import { runCampaign } from './campaign.mjs';

const STORE = 'commit-index-guard/stale-store.mjs';

const MUTANTS = [
  ['a record lives for far longer than its limit', STORE, 'export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;', 'export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 * 1000;'],
  ['a record lives for only an instant', STORE, 'export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;', 'export const MAX_AGE_MS = 1;'],
  ['only a record YOUNGER than its limit is removed', STORE, 'if (now - statSync(file).mtimeMs > MAX_AGE_MS) rmSync(file, { force: true });', 'if (now - statSync(file).mtimeMs < MAX_AGE_MS) rmSync(file, { force: true });'],
  ['rotation removes any old file of the state directory', STORE, 'if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) continue;', ''],
  ['a write does not rotate old records', STORE, '    pruneOld(now);\n', ''],
  ['an ill-formed entry of a record is trusted', STORE, "parsed.entries.filter((entry) => typeof entry?.path === 'string')", 'parsed.entries'],
  ['a settled record is never forgotten', STORE, 'rmSync(fileFor(toplevel), { force: true });', ''],
  ['a journal in the state directory counts as a record', STORE, 'readdirSync(stateDirectory()).some((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))', 'readdirSync(stateDirectory()).length > 0'],
  ['a repository path is compared with its case as written', STORE, '.toLowerCase();\n\nconst fileFor', ';\n\nconst fileFor'],
  ['a record is kept in a file shared by every repository', STORE, 'createHash(\'sha256\').update(comparable(toplevel))', 'createHash(\'sha256\').update(\'\')']
];

runCampaign({ selftest: 'commit-index-guard/store.selftest.mjs', paths: ['commit-index-guard', 'mutation-proof'], mutants: MUTANTS });
