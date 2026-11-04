/**
 * The environment every selftest run of a campaign gets, the unmutated baseline and each mutant alike, and the
 * temporary folder inside it. ONE function builds the environment and both paths call it, so the baseline and a
 * mutant can never differ in what they see: a divergence would show as a baseline that is green while every mutant
 * "survives" a kill signal, never at calibration.
 *
 * The temporary folder is an `mkdtemp` under `os.tmpdir()`, OUTSIDE every repository, named for the pid of the process
 * that creates it so a sweep can tell a live run from a dead one (`sandbox-removal.mjs`). It used to sit inside the
 * mutant's sandbox, which lives under `<fleet>/scratch/`, inside the project's git tree: a selftest that makes a
 * directory it believes is "outside any repository" got the enclosing repository instead, and hung or misread
 * git (MEASURED by the session that orchestrates the global fleet: 63 of 66 mutants of its selftest-runner campaign
 * ended as "killed by SIGTERM, not a verdict"). `os.tmpdir()` follows TEMP/TMP/TMPDIR, so a caller whose temp is
 * itself inside a repository reproduces the defect; `repositoryOfTemp` lets the engine refuse to run then.
 *
 * @es El entorno que recibe cada corrida de selftest de una campaña, la línea base sin mutar y cada mutante por
 * igual, y la carpeta temporal dentro de él. UNA función construye el entorno y los dos caminos la llaman. La carpeta
 * temporal es un `mkdtemp` bajo `os.tmpdir()`, FUERA de todo repositorio, con el pid de quien la crea en el nombre para
 * que un barrido distinga una corrida viva de una muerta. `os.tmpdir()` sigue a TEMP/TMP/TMPDIR: si el temporal de
 * quien llama está dentro de un repositorio se reproduce el defecto, y `repositoryOfTemp` deja que el motor se niegue.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ownedPrefix } from './sandbox-removal.mjs';

/** Creates a fresh temporary folder under `os.tmpdir()`. @es Crea una carpeta temporal nueva bajo `os.tmpdir()`. */
export function createMutantTemp() {
  return mkdtempSync(path.join(tmpdir(), ownedPrefix('mutant-temp')));
}

/**
 * The top level of the git repository that holds `os.tmpdir()`, or `undefined` when it holds none (or git is absent,
 * in which case there is no repository to find).
 * @es La raíz del repositorio git que contiene `os.tmpdir()`, o `undefined` si no hay ninguno (o no hay git).
 */
export function repositoryOfTemp() {
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: tmpdir(),
    encoding: 'utf8'
  });

  return probe.status === 0 ? probe.stdout.trim() : undefined;
}

/**
 * The environment of one selftest run: the caller's, the fleet the selftest imports from, and the private temp.
 * @es El entorno de una corrida de selftest: el de quien llama, la flota de la que importa y el temporal propio.
 */
export function mutantEnvironment(base, fleet, temp) {
  return { ...base, SELFTEST_FLEET: fleet, TEMP: temp, TMP: temp, TMPDIR: temp };
}
