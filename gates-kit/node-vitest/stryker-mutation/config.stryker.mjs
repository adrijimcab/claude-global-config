/**
 * Stryker config for the mutation gate: Vitest as the test runner, every source file of the target mutated, and
 * a failing score (`break`) that makes the run exit non-zero when the specs let too many mutants live. The
 * command runs Stryker from the target folder (`run-tool.mjs --cwd`), so the globs below are relative to it.
 * The working copy Stryker makes goes to the system temp directory and the only reporter prints to the console,
 * so a run leaves nothing in the kit. The Vitest config is read from this folder by absolute path.
 *
 * @es Config de Stryker para el gate de mutación: Vitest como runner de tests, cada fuente del directorio
 * mutada, y una puntuación de fallo (`break`) que hace que la corrida salga con código distinto de cero cuando
 * los specs dejan vivir demasiados mutantes. El comando corre Stryker desde la carpeta del directorio
 * (`run-tool.mjs --cwd`), así que los globs son relativos a ella. La copia de trabajo de Stryker va al
 * directorio temporal del sistema y el único reporter imprime en consola, así que una corrida no deja nada en
 * el kit. La config de Vitest se lee de esta carpeta por ruta absoluta.
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  testRunner: 'vitest',
  vitest: { configFile: path.join(here, 'config.vitest.mjs') },
  mutate: ['*.js', '!*.spec.js'],
  reporters: ['clear-text'],
  tempDirName: path.join(os.tmpdir(), 'gates-kit-stryker'),
  thresholds: { high: 95, low: 90, break: 80 },
  coverageAnalysis: 'perTest',
};
