/**
 * Runs one mechanism's mutant campaign through the vendored `mutation-proof/run-mutants.mjs`, over a
 * snapshot of every kit folder a selftest may import, and sets the exit code: 0 only when every mutant
 * was killed, 2 when the runner could not measure (it exits the process itself). The snapshot is taken from
 * the tree that holds the kit, so it also carries the state-location module `lib/state.mjs` resolves through
 * (`hook-state/`, and the `bilingual-output/` it speaks with); a campaign still names its files from the kit.
 * @es Corre la campaña de mutantes de un mecanismo con el corredor vendorizado y fija el código de salida. La
 * instantánea sale del árbol que contiene el kit, así lleva también el módulo de ubicaciones de `lib/state.mjs`;
 * una campaña sigue nombrando sus ficheros desde el kit.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../vendor/mutation-proof/run-mutants.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The tree that holds the kit, and the kit's folder in it. @es El árbol que contiene el kit, y la carpeta del kit en él. */
const TREE = path.dirname(KIT);
const SELF = path.basename(KIT);

/** The folders outside the kit a kit module imports. @es Las carpetas de fuera del kit que importa un módulo del kit. */
const SHARED_PATHS = ['hook-state', 'bilingual-output'];

/** Every kit folder a selftest can reach through its imports. @es Cada carpeta del kit alcanzable desde un selftest. */
export const KIT_PATHS = ['config', 'lib', 'testing', 'vendor', 'diff-coverage', 'gate-run', 'landing-guard', 'worktree-tenancy', 'orphan-work', 'handback'];

export function runCampaign(selftest, mutants) {
  const inKit = (file) => `${SELF}/${file}`;
  const survivors = runMutants({
    fleetRoot: TREE,
    paths: [...KIT_PATHS.map(inKit), ...SHARED_PATHS],
    selftest: inKit(selftest),
    mutants: mutants.map(([label, file, original, replacement]) => [label, inKit(file), original, replacement])
  });

  process.exitCode = survivors === 0 ? 0 : 1;
}
