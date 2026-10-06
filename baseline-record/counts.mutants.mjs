#!/usr/bin/env node
/**
 * The decisions of `baseline-record/counts.mjs`, each broken once, that `counts.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `counts.mjs`, rotas una a una, que `counts.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const C = 'baseline-record/counts.mjs';

const MUTANTS = [
  // --- journal lines ---
  ['a carriage return is counted as a line end', C, 'byte === 10).length', 'byte === 13).length'],
  ['a last line without a newline is not counted', C, '(bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0)', '0'],
  ['every file gains a phantom last line', C, '(bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0)', '1'],
  ['an empty file gains a phantom line', C, 'bytes.length > 0 && bytes.at(-1) !== 10 ? 1 : 0', 'bytes.at(-1) !== 10 ? 1 : 0'],
  ['a file ending with a newline gains a phantom line', C, 'bytes.at(-1) !== 10 ? 1 : 0', 'bytes.at(-1) === 10 ? 1 : 0'],
  ['the guard of a journal is its second path segment', C, "file.split('/')[0]", "file.split('/')[1]"],
  ['a second journal of a guard overwrites the first instead of adding', C, '(perGuard[guard] ?? 0) + lines', 'lines'],
  ['the total counts journals, not lines', C, 'sum + entry.lines, 0)', 'sum + 1, 0)'],
  ['the total starts above zero', C, 'sum + entry.lines, 0)', 'sum + entry.lines, 1)'],
  ['the journals come from a hand-picked guard', C, 'discoverJournals(home).map', "discoverJournals(home).filter((file) => file.startsWith('failure-capture')).map"],

  // --- settings ---
  ['a missing settings file counts as empty', C, "if (settings === undefined) return 'unreadable';", 'if (settings === undefined) return { events: {}, totalHooks: 0 };'],
  ['settings without a hooks key throw', C, 'Object.entries(settings.hooks ?? {})', 'Object.entries(settings.hooks)'],
  ['groups are always one', C, 'groups: groups.length', 'groups: 1'],
  ['a group counts as one hook whatever it holds', C, 'sum + (group.hooks?.length ?? 0)', 'sum + 1'],
  ['a group without hooks counts as one', C, '(group.hooks?.length ?? 0)', '(group.hooks?.length ?? 1)'],
  ['the total sums groups instead of hooks', C, 'sum + entry.hooks, 0)', 'sum + entry.groups, 0)'],

  // --- manifests ---
  ['a missing manifests directory throws', C, 'existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []', 'readdirSync(dir, { withFileTypes: true })'],
  ['a file with another extension is read as a manifest', C, "entry.isFile() && entry.name.endsWith('.json')", 'entry.isFile()'],
  ['a directory named like a manifest is read as one', C, "entry.isFile() && entry.name.endsWith('.json')", "entry.name.endsWith('.json')"],
  ['a broken manifest counts as empty', C, "Array.isArray(guards) ? guards.length : 'unreadable'", 'Array.isArray(guards) ? guards.length : 0'],
  ['a manifest counts as one guard', C, 'Array.isArray(guards) ? guards.length', 'Array.isArray(guards) ? 1'],
  ['an unreadable manifest is added into the total', C, "typeof count === 'number' ? count : 0", 'count'],
  ['an unreadable manifest counts one in the total', C, "typeof count === 'number' ? count : 0", "typeof count === 'number' ? count : 1"],
  ['the manifest total starts above zero', C, "sum + (typeof count === 'number' ? count : 0), 0)", "sum + (typeof count === 'number' ? count : 0), 1)"],

  // --- sidecars ---
  ['tracked sidecars are not listed', C, "'--cached', ", ''],
  ['untracked sidecars are not listed', C, "'--others', ", ''],
  ['git-ignored sidecars are listed', C, "'--exclude-standard', ", ''],
  ['every file is listed, not only sidecars', C, "'--', '*.hook-registration.json'", "'--'"],
  ['the trailing empty line is counted', C, ".filter((line) => line !== '')", ''],
  ['a failed listing reads as zero sidecars', C, ": 'unmeasurable'", ': 0'],
  ['a successful listing reads as unmeasurable', C, 'run.status === 0 ?', 'run.status !== 0 ?'],
  ['the listing runs in the wrong directory', C, "['-C', home, 'ls-files'", "['-C', path.dirname(home), 'ls-files'"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['baseline-record', 'journal-backup', 'hook-state', 'bilingual-output'],
  selftest: 'baseline-record/counts.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
