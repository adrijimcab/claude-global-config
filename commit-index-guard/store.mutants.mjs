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
  // --- the age limit.
  ['an entry lives a thousand times longer than its limit', STORE, 'export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;', 'export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 * 1000;'],
  ['an entry lives for only an instant', STORE, 'export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;', 'export const MAX_AGE_MS = 1;'],
  ['an entry dies at its limit instead of just after it', STORE, 'now - Date.parse(entry.since) <= MAX_AGE_MS', 'now - Date.parse(entry.since) < MAX_AGE_MS'],
  ['an entry age is counted backwards', STORE, 'now - Date.parse(entry.since) <= MAX_AGE_MS', 'Date.parse(entry.since) - now <= MAX_AGE_MS'],
  ['an expired entry is still read', STORE, 'return parsed.entries.filter((entry) => isEntry(entry) && isLive(entry, now));', 'return parsed.entries.filter((entry) => isEntry(entry));'],
  ['an ill-formed entry is read', STORE, 'return parsed.entries.filter((entry) => isEntry(entry) && isLive(entry, now));', 'return parsed.entries.filter((entry) => isLive(entry, now));'],
  ['an entry without a path is well formed', STORE, "typeof entry?.path === 'string' && ", ''],
  ['an entry without a blob is well formed', STORE, " && typeof entry?.blob === 'string'", ''],

  // --- rotation.
  ['rotation looks at every file of the state directory', STORE, 'if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) continue;', ''],
  ['rotation keeps the expired entries of a record', STORE, 'writeRecord(file, parsed.toplevel, parsed.entries.filter((entry) => isEntry(entry) && isLive(entry, now)));', 'writeRecord(file, parsed.toplevel, parsed.entries);'],
  ['an old unreadable file is kept', STORE, 'if (now - statSync(file).mtimeMs > MAX_AGE_MS) rmSync(file, { force: true });', ''],
  ['a young unreadable file is removed', STORE, 'if (now - statSync(file).mtimeMs > MAX_AGE_MS) rmSync(file, { force: true });', 'rmSync(file, { force: true });'],
  ['a write does not rotate old records', STORE, '    pruneOld(now);\n', ''],
  ['a record left with no entry keeps its file', STORE, 'if (entries.length === 0) {', 'if (false) {'],

  // --- recording only adds.
  ['recording forgets what was already recorded', STORE, 'new Map(kept.map((entry) => [entry.path, entry]))', 'new Map()'],
  ['a new blob for a recorded path is ignored', STORE, 'if (known === undefined || known.blob !== entry.blob)', 'if (known === undefined)'],
  ['a recorded path is refreshed on every recording', STORE, 'if (known === undefined || known.blob !== entry.blob)', 'if (true)'],
  ['a new entry is dated by the clock, not by the time given', STORE, 'since: new Date(now).toISOString()', 'since: new Date().toISOString()'],
  ['retaining does not write', STORE, 'writeRecord(fileFor(toplevel), toplevel, entries);\n  } catch {\n    /* the record stays as it was */', '/* nothing */\n  } catch {\n    /* the record stays as it was */'],

  // --- finding a record.
  ['a journal in the state directory counts as a record', STORE, 'readdirSync(stateDirectory()).some((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))', 'readdirSync(stateDirectory()).length > 0'],
  ['a repository path is compared with its case as written', STORE, '.toLowerCase();\n\nconst nameFor', ';\n\nconst nameFor'],
  ['every repository shares one record file', STORE, "createHash('sha256').update(comparable(toplevel))", "createHash('sha256').update('')"],
  ['the file of a repository is named by an empty key', STORE, '.slice(0, KEY_LENGTH)', '.slice(0, 0)']
];

runCampaign({ selftest: 'commit-index-guard/store.selftest.mjs', paths: ['commit-index-guard', 'mutation-proof'], mutants: MUTANTS });
