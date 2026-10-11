#!/usr/bin/env node
/**
 * Mutant campaign of `processes.mjs` and `worktree-git.mjs`: each mutant reverts ONE decision and
 * `sources.selftest.mjs` must go red by assertion. Exit 2 = NOT MEASURED (no shared runner).
 * @es Campaña de mutantes de `processes.mjs` y `worktree-git.mjs`. Salida 2 = NO MEDIDO.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const W = 'worker-status';

const MUTANTS = [
  // processes.mjs
  ['backslashes are not normalized', `${W}/processes.mjs`, "text.split('\\\\').join('/').toLowerCase()", 'text.toLowerCase()'],
  ['matching is case sensitive', `${W}/processes.mjs`, "text.split('\\\\').join('/').toLowerCase()", "text.split('\\\\').join('/')"],
  ['the caller process is reported', `${W}/processes.mjs`, 'entry.pid !== process.pid && ', ''],
  ['every process matches', `${W}/processes.mjs`, '&& normalized(entry.commandLine).includes(wanted)', ''],
  ['a null command line crashes the row', `${W}/processes.mjs`, "row.CommandLine ?? ''", 'row.CommandLine'],
  ['empty output is not tolerated', `${W}/processes.mjs`, "json || '[]'", 'json'],
  ['the listing tool ignores the given environment', `${W}/processes.mjs`, "WINDOWS_LISTING], { encoding: 'utf8', maxBuffer: 64 << 20, env })", "WINDOWS_LISTING], { encoding: 'utf8', maxBuffer: 64 << 20 })"],
  ['a single row is not wrapped', `${W}/processes.mjs`, 'Array.isArray(rows) ? rows : [rows]', 'rows'],

  // worktree-git.mjs
  ['a non-checkout is described anyway', `${W}/worktree-git.mjs`, 'if (branch.status !== 0) return undefined;', ''],
  ['the upstream is never preferred', `${W}/worktree-git.mjs`, 'upstream.status === 0 ? upstream.stdout :', 'false ? upstream.stdout :'],
  ['the origin default is never used', `${W}/worktree-git.mjs`, "ask('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').stdout", "''"],
  ['ahead counts the wrong direction', `${W}/worktree-git.mjs`, '`${base}..HEAD`', '`HEAD..${base}`'],
  ['a failing count reads as zero', `${W}/worktree-git.mjs`, 'count?.status === 0 ? Number(count.stdout) : undefined', 'Number(count?.stdout)'],
  ['an empty base is reported as a name', `${W}/worktree-git.mjs`, "base: base === '' ? undefined : base,", 'base,'],
  ['a clean tree counts one dirty', `${W}/worktree-git.mjs`, "dirty === '' ? 0 :", "dirty === '' ? 1 :"],
  ['dirty is not counted by line', `${W}/worktree-git.mjs`, "dirty.split('\\n').length", '1'],
  ['the head drops the subject', `${W}/worktree-git.mjs`, "'--format=%h %s'", "'--format=%h'"],
  ['git runs in the wrong directory', `${W}/worktree-git.mjs`, "['-C', cwd, ...args]", "['-C', '.', ...args]"]
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(2);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: [W],
  selftest: `${W}/sources.selftest.mjs`,
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 180_000
});

process.exit(survivors === 0 ? 0 : 1);
