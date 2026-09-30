/**
 * Runs one mechanism's mutant campaign through the vendored `mutation-proof/run-mutants.mjs`, over a
 * snapshot of every kit folder a selftest may import, and sets the exit code: 0 only when every mutant
 * was killed, 2 when the runner could not measure (it exits the process itself).
 * @es Corre la campaña de mutantes de un mecanismo con el corredor vendorizado y fija el código de salida.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../vendor/mutation-proof/run-mutants.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every kit folder a selftest can reach through its imports. @es Cada carpeta del kit alcanzable desde un selftest. */
export const KIT_PATHS = ['config', 'lib', 'testing', 'vendor', 'diff-coverage', 'gate-run', 'landing-guard', 'worktree-tenancy', 'orphan-work', 'handback'];

export function runCampaign(selftest, mutants) {
  const survivors = runMutants({ fleetRoot: KIT, paths: KIT_PATHS, selftest, mutants });

  process.exitCode = survivors === 0 ? 0 : 1;
}
