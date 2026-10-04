/**
 * The options of `record.mjs`, with the real machine as every default: the Claude home, the checkout whose
 * `hook-dispatch/` runs the Stop guards (the parent of this directory), the projects root and the two projects
 * under it, the backup git dir of the b100 tooling, the measurement scripts and the run count. The machine is
 * passed in (`machine`) so a selftest can prove each default without reading the real one.
 *
 * @es Las opciones de `record.mjs`, con la máquina real como valor por omisión de todas: el home de Claude, el
 * checkout cuyo `hook-dispatch/` corre las guardias de Stop (el padre de este directorio), la raíz de
 * proyectos y los dos proyectos bajo ella, el git dir de respaldo del tooling de b100, los scripts de medición
 * y el número de corridas. La máquina se pasa (`machine`) para que un selftest pruebe cada valor por omisión
 * sin leer la real.
 */

import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REAL_MACHINE = { home: homedir(), tmp: tmpdir(), fleet: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') };

/** The options of one record run from the parsed command-line `values`. @es Las opciones de una corrida a partir de los `values` de la línea de comandos. */
export function optionsFrom(values, machine = REAL_MACHINE) {
  const home = values.home ?? path.join(machine.home, '.claude');
  const fleet = values.fleet ?? machine.fleet;
  const projectsRoot = values.projects ?? path.join(machine.home, 'Desktop', 'Projects');
  const runs = Number(values.runs ?? '20');

  if (!Number.isInteger(runs) || runs < 1) throw new Error(`--runs must be a positive integer, got ${values.runs}`);

  return {
    home, fleet, projectsRoot, runs, tmp: machine.tmp,
    b100: values.b100 ?? path.join(projectsRoot, 'b100-am-ui'),
    discovery: values.discovery ?? path.join(projectsRoot, 'di_1700002_discovery_fe'),
    backupGitDir: values['backup-git-dir'] ?? path.join(machine.home, '.claude-backups', 'b100-am-ui-claude-tooling.git'),
    capture: values.capture ?? path.join(home, 'failure-capture', 'capture.mjs'),
    replay: values.replay ?? path.join(fleet, 'hook-dispatch', 'replay.mjs'),
    now: () => new Date().toISOString()
  };
}
