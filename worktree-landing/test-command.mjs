/**
 * Owns the question "which command proves this worktree?" for a landing. A project that declares its unit suite
 * in the MAIN checkout's `.claude/fleet-kit.json` (`unitSuite: { npmScript, cwd }`) is proved by that npm script,
 * run in that directory of the WORKTREE; otherwise the repository's own selftest runner
 * (`selftest-runner/run.mjs`, the worktree's copy) proves it; with neither, nothing can be verified and the landing
 * is refused. A declaration that exists but cannot be used refuses too (fail closed), naming the file: a script
 * name outside `[A-Za-z0-9:._-]`, or a directory that is absolute or climbs out of the worktree.
 *
 * @es Es dueño de la pregunta «¿qué orden prueba este worktree?» para un aterrizaje. Un proyecto que declara su
 * suite unitaria en el `.claude/fleet-kit.json` del checkout PRINCIPAL (`unitSuite: { npmScript, cwd }`) se prueba
 * con ese script de npm, ejecutado en ese directorio del WORKTREE; si no, lo prueba el runner de selftests del
 * propio repositorio (`selftest-runner/run.mjs`, la copia del worktree); sin ninguno no se puede verificar nada y el
 * aterrizaje se rechaza. Una declaración que existe pero no se puede usar también rechaza (falla cerrado),
 * nombrando el fichero: un nombre de script fuera de `[A-Za-z0-9:._-]`, o un directorio absoluto o que sale del worktree.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { Refusal } from './outcome.mjs';

const FLEET_KIT = path.join('.claude', 'fleet-kit.json');

/** The selftest runner's entry point, relative to the repository root. @es Punto de entrada del runner de selftests. */
export const TEST_RUNNER = path.join('selftest-runner', 'run.mjs');

/** The characters an npm script name may use here: the command runs through a shell. @es Los caracteres que puede usar un script de npm aquí: la orden pasa por un shell. */
const SCRIPT_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:._-';

/** Refuses because a declared unit suite cannot be used. @es Rechaza porque una suite declarada no se puede usar. */
function unreadable(file, why) {
  return new Refusal('test-command-unreadable', [
    `The unit suite declared in ${file} cannot be used (${why}); fix that file, a landing is refused until it declares a usable unitSuite. @es La suite unitaria declarada en ${file} no se puede usar (${why}); corrige ese fichero, el aterrizaje se rechaza hasta que declare un unitSuite utilizable.`,
  ]);
}

/** Whether `directory` stays inside the worktree it is joined to. @es Si `directory` queda dentro del worktree. */
const staysInside = (directory) => !path.isAbsolute(directory) && !path.normalize(directory).split(path.sep).includes('..');

/** The suite the main checkout declares, or undefined when it declares none. @es La suite que declara el checkout principal, o undefined. */
function declaredSuite(main) {
  const file = path.join(main, FLEET_KIT);
  if (!existsSync(file)) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw unreadable(file, error.message);
  }
  if (parsed === null || typeof parsed !== 'object' || !('unitSuite' in parsed)) return undefined;
  const script = parsed.unitSuite?.npmScript;
  const directory = parsed.unitSuite?.cwd ?? '.';
  if (typeof script !== 'string' || script === '' || ![...script].every((character) => SCRIPT_CHARACTERS.includes(character))) {
    throw unreadable(file, 'unitSuite.npmScript must be a script name of [A-Za-z0-9:._-] @es unitSuite.npmScript debe ser un nombre de script de [A-Za-z0-9:._-]');
  }
  if (typeof directory !== 'string' || !staysInside(directory)) {
    throw unreadable(file, 'unitSuite.cwd must be a directory inside the worktree @es unitSuite.cwd debe ser un directorio dentro del worktree');
  }
  return { script, directory };
}

/**
 * @param {{ worktree: string, main: string }} inputs
 * @returns {{ label: string, command: string, args: string[], cwd: string, shell: boolean, anyNonZeroIsRed: boolean }}
 *   the command; a declared suite's every non-zero exit is its red verdict, while the runner reserves exit 1 for red.
 * @es La orden; en una suite declarada toda salida distinta de cero es su veredicto rojo, el runner reserva la 1 para el rojo.
 */
export function testCommandOf({ worktree, main }) {
  const suite = declaredSuite(main);
  if (suite !== undefined) {
    return { label: `npm run ${suite.script} (in ${suite.directory})`, command: 'npm', args: ['run', suite.script], cwd: path.join(worktree, suite.directory), shell: true, anyNonZeroIsRed: true };
  }
  const runner = path.join(worktree, TEST_RUNNER);
  if (existsSync(runner)) {
    return { label: TEST_RUNNER, command: process.execPath, args: [runner, '--root', worktree], cwd: worktree, shell: false, anyNonZeroIsRed: false };
  }
  throw new Refusal('test-command-missing', [
    `The worktree has no test command: ${path.join(main, FLEET_KIT)} declares no unitSuite and there is no ${runner}; nothing can be verified, so nothing lands. @es El worktree no tiene orden de pruebas: ${path.join(main, FLEET_KIT)} no declara unitSuite y no existe ${runner}; no se puede verificar nada, así que no aterriza nada.`,
  ]);
}
