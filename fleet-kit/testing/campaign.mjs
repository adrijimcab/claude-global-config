/**
 * Runs one mechanism's mutant campaign through the vendored `~/.claude/mutation-proof/run-mutants.mjs`, over a
 * snapshot of every kit folder a selftest may import plus the vendored modules the kit imports from
 * `~/.claude/` (the one vendoring of the install, `vendored/vendored.mjs`), and sets the exit code: 0 only
 * when every mutant was killed, 2 when the runner could not measure (it exits the process itself). Campaigns
 * name files relative to the kit; the runner is rooted at `~/.claude/` so the snapshot keeps the kit's
 * relative imports of `../../shell-command/…` resolving.
 * @es Corre la campaña de mutantes de un mecanismo con el corredor vendorizado, sobre una instantánea de las
 * carpetas del kit y de los módulos vendorizados de `~/.claude/` que el kit importa, y fija el código de
 * salida. Las campañas nombran ficheros relativos al kit; el corredor se enraíza en `~/.claude/`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../../mutation-proof/run-mutants.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.resolve(KIT, '..');
const KIT_FOLDER = path.basename(KIT);

/** The non-vendored folders outside the kit a kit module imports (the state-location module and its bilingual output, the git port, the one `-C` fold the guards share, and the role reader orphan-work uses with the roles it reads). @es Las carpetas de fuera del kit que importa un módulo del kit: el estado, su salida bilingüe, el puerto de git, el pliegue de `-C` compartido y el lector de roles de orphan-work con los roles que lee. */
const SHARED_PATHS = ['hook-state', 'bilingual-output', 'git-port', 'company-remote', 'agent-toolset-check', 'agents'];

/** Every kit folder a selftest can reach through its imports. @es Cada carpeta del kit alcanzable desde un selftest. */
export const KIT_PATHS = ['config', 'lib', 'testing', 'diff-coverage', 'gate-run', 'landing-guard', 'worktree-tenancy', 'orphan-work', 'handback'];

/** The vendored folders of `~/.claude/` the kit imports, relative to the install. @es Las carpetas vendorizadas que importa el kit. */
export const VENDORED_PATHS = ['shell-command', 'cherry-pick-guard', 'agent-liveness', 'brief-tenancy', 'diff-coverage', 'mutation-proof'];

const inKit = (relative) => `${KIT_FOLDER}/${relative}`;

export function runCampaign(selftest, mutants) {
  const survivors = runMutants({
    fleetRoot: INSTALL,
    paths: [...KIT_PATHS.map(inKit), ...VENDORED_PATHS, ...SHARED_PATHS],
    selftest: inKit(selftest),
    mutants: mutants.map(([label, file, original, replacement]) => [label, inKit(file), original, replacement])
  });

  process.exitCode = survivors === 0 ? 0 : 1;
}
