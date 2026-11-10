/**
 * The run directory of a detached chain: the files that live in it and how a reader tells what became of the run.
 *
 *   job.json      what to run and the environment to run it in; deleted by the detached runner once read
 *   run.json      the detached runner's pid, the chain and the command, written by the launcher
 *   output.log    the chain's standard output and error
 *   verdict.json  `{ exitCode, signal, startedAt, endedAt, command }`, written when the chain ends
 *
 * `runStatus` answers from those files alone: a verdict means FINISHED whatever the pid says; no verdict and a live
 * pid means RUNNING; no verdict and no live pid (or no pid recorded) means LOST. The pid probe is a parameter.
 *
 * @es El directorio de corrida de una cadena desacoplada: los ficheros que vive en él y cómo un lector sabe qué fue
 * de la corrida. `runStatus` responde solo con esos ficheros: un veredicto significa TERMINADA diga lo que diga el
 * pid; sin veredicto y con un pid vivo, CORRIENDO; sin veredicto y sin pid vivo (o sin pid registrado), PERDIDA.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { realTempRoot } from '../session-temp/session-temp.mjs';

/** The files of a run directory. @es Los ficheros de un directorio de corrida. */
export const RUN_FILES = Object.freeze({ job: 'job.json', run: 'run.json', output: 'output.log', verdict: 'verdict.json' });

/**
 * The TEMP folder of a detached chain: `<shared temp root>/fcl/<8 hex of the sha256 of the run directory path>`.
 * Decided by the CALLER (`detach-chain.mjs`, which shares the session's temp root) and carried in `job.json`, so the
 * detached runner, which WMI starts with another environment, never recomputes it.
 *   - NOT inside the run directory: that lives under the Claude home, a git repository, and the mutation engine refuses
 *     a TEMP inside any repository (measured: "NOT MEASURED ... is inside the git repository").
 *   - NOT under `session-tmp`, so the end-of-session sweep (`session-processes/`) never matches the chain.
 *   - SHORT and unique per run: at most `CHAIN_TEMP_BUDGET` characters for a realistic user TEMP, because b100's
 *     integrate fixture adds about 110 characters of its own to it and git fails with "Filename too long" past a
 *     176-character staging budget (b100 `STAGING_PATH_BUDGET`, commit f36e204). The run directory NAME is kept out of it.
 * @es La carpeta TEMP de una cadena desacoplada: `<raíz temporal compartida>/fcl/<8 hex del sha256 de la ruta del
 * directorio de corrida>`. La decide QUIEN LLAMA (`detach-chain.mjs`, que comparte la raíz temporal de la sesión) y
 * viaja en `job.json`, así el runner desacoplado, que WMI inicia con otro entorno, nunca la recalcula. NO va dentro
 * del directorio de corrida (vive bajo el home de Claude, un repositorio git, y el motor de mutantes rechaza un TEMP
 * dentro de cualquier repositorio); NO va bajo `session-tmp`, así el barrido de fin de sesión nunca la reconoce; es
 * CORTA y única por corrida: como mucho `CHAIN_TEMP_BUDGET` caracteres con un TEMP de usuario realista, porque el
 * fixture de integrate de b100 le suma unos 110 y git falla con «Filename too long» pasado un presupuesto de 176
 * (`STAGING_PATH_BUDGET` de b100, commit f36e204). El NOMBRE del directorio de corrida queda fuera.
 */
export const chainTempDir = (runDir, root = realTempRoot()) => path.join(root, 'fcl', createHash('sha256').update(path.resolve(runDir)).digest('hex').slice(0, 8));

/** The longest chain TEMP a realistic user TEMP (42 characters) may give. @es El TEMP de cadena más largo que da un TEMP de usuario realista (42 caracteres). */
export const CHAIN_TEMP_BUDGET = 70;

/** The runs root inside the lock's state directory. @es La raíz de las corridas dentro del directorio de estado del lock. */
export const RUNS_FOLDER = 'runs';

/** Characters a chain name keeps in a folder name. @es Caracteres que el nombre de una cadena conserva en el de una carpeta. */
const UNSAFE_IN_NAME = /[^A-Za-z0-9_-]+/g;

/**
 * The default run directory: `<runsRoot>/<YYYYMMDD-HHMMSSmmm>-<chain>`, the chain name reduced to plain characters.
 * @es El directorio de corrida por defecto: `<raíz>/<AAAAMMDD-HHMMSSmmm>-<cadena>`, con el nombre reducido a caracteres simples.
 */
export function defaultRunDirectory(runsRoot, chain, date) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('.', '').replace('Z', '');

  return path.join(runsRoot, `${stamp}-${chain.replace(UNSAFE_IN_NAME, '-')}`);
}

/** A JSON file's value, or `undefined` when it is missing or not JSON. @es El valor de un JSON, o `undefined` si falta o no es JSON. */
export function readJsonFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Whether a process with this pid exists (a permission refusal means it does). @es Si existe un proceso con ese pid (una negativa de permiso significa que sí). */
export function processExists(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * What became of the run in `runDir`.
 * @returns {{ state: 'finished', verdict: object } | { state: 'running', pid: number } | { state: 'lost' }}
 * @es Qué fue de la corrida de `runDir`.
 */
export function runStatus(runDir, { isAlive = processExists } = {}) {
  const verdict = readJsonFile(path.join(runDir, RUN_FILES.verdict));

  if (verdict !== undefined) return { state: 'finished', verdict };

  const pid = readJsonFile(path.join(runDir, RUN_FILES.run))?.pid;

  if (Number.isInteger(pid) && isAlive(pid)) return { state: 'running', pid };

  return { state: 'lost' };
}
