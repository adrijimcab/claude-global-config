#!/usr/bin/env node
/**
 * Runs every kit selftest and the vendored-code provenance check, each in its own process, and exits
 * non-zero when any of them is not green.
 *   node ~/.claude/fleet-kit/selftest-all.mjs [--mutants]
 * `--mutants` runs every mechanism's mutant campaign instead.
 * @es Corre cada selftest del kit y la comprobación de procedencia, cada uno en su proceso; con
 * `--mutants`, las campañas de mutantes.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT = path.dirname(fileURLToPath(import.meta.url));

export const MECHANISMS = ['config', 'gate-run', 'diff-coverage', 'landing-guard', 'worktree-tenancy', 'orphan-work', 'handback'];

const mutants = process.argv.includes('--mutants');
const scripts = mutants ? MECHANISMS.map((name) => `${name}/mutants.mjs`) : [...MECHANISMS.map((name) => `${name}/selftest.mjs`), 'vendor/provenance.mjs'];
let failed = 0;

for (const script of scripts) {
  const run = spawnSync(process.execPath, [path.join(KIT, script)], { encoding: 'utf8', timeout: 1_800_000, maxBuffer: 256 * 1024 * 1024 });
  const lines = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim().split('\n');
  const green = run.status === 0 && run.signal === null;

  if (!green) failed += 1;
  process.stdout.write(`${green ? 'GREEN' : 'RED  '} ${script} (exit ${String(run.status)}): ${lines.at(-1)}\n`);
  if (!green) for (const line of lines.filter((text) => !text.startsWith('KILLED') && !text.startsWith('BASELINE'))) process.stdout.write(`      ${line}\n`);
}

process.stdout.write(`${scripts.length - failed}/${scripts.length} green\n`);
process.exitCode = failed === 0 ? 0 : 1;
