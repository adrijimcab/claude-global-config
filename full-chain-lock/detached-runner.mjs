#!/usr/bin/env node
/**
 * The process a detached chain runs in: started by a launcher (`detach-launcher.mjs`) with one argument, the run
 * directory. It reads `job.json` and DELETES it at once (it carries the caller's environment), runs the normal locked
 * chain (`run.mjs` without `--detach`, so the same lock and the same `--tree` semantics) with the job's environment and
 * its output going to `output.log`, and writes `verdict.json` when that ends:
 *
 *   { exitCode, signal, startedAt, endedAt, command }       (plus `error` when the chain could not be started)
 *
 * The verdict is written whole and renamed into place, so a reader never sees half of it. It is written on EVERY way
 * out: the chain's exit, a chain that was killed by a signal, a runner that cannot start the chain (exit code `null`
 * and the error) and a run directory with no readable job.
 *
 * @es El proceso en el que corre una cadena desacoplada: lo inicia un lanzador con un argumento, el directorio de
 * corrida. Lee `job.json` y lo BORRA enseguida (lleva el entorno de quien llamó), ejecuta la cadena normal con lock
 * (`run.mjs` sin `--detach`, el mismo lock y la misma semántica de `--tree`) con el entorno del trabajo y su salida
 * en `output.log`, y escribe `verdict.json` al terminar. El veredicto se escribe entero y se renombra, y se escribe
 * en TODA salida: la de la cadena, una señal, un runner que no puede iniciarla (código `null` y el error) y un
 * directorio de corrida sin un trabajo legible.
 */

import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { realTempRoot } from '../session-temp/session-temp.mjs';
import { RUN_FILES } from './run-directory.mjs';

const RUN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'run.mjs');

/** Writes the verdict whole, then renames it into place. @es Escribe el veredicto entero y lo renombra a su sitio. */
function writeVerdict(runDir, verdict) {
  const partial = path.join(runDir, `${RUN_FILES.verdict}.partial`);

  writeFileSync(partial, JSON.stringify(verdict));
  renameSync(partial, path.join(runDir, RUN_FILES.verdict));
}

/** The words of the command as the caller typed them. @es Las palabras del comando como las escribió quien llamó. */
const commandText = (job) => [job.command, ...job.args].join(' ');

/** The arguments of the normal locked run for a job. @es Los argumentos de la corrida normal con lock para un trabajo. */
const runArguments = (job) => [RUN, '--chain', job.chain, '--project', job.project, '--session', job.session, '--tree', job.tree, '--wait-seconds', String(job.waitSeconds), '--poll-ms', String(job.pollMs), '--', job.command, ...job.args];

/**
 * The TEMP folder of a detached chain: `<shared temp root>/claude/detached-chain-tmp/<run directory name>`. It is NOT
 * inside the run directory: that lives under the Claude home, a git repository, and the mutation engine refuses a TEMP
 * inside any repository (measured: "NOT MEASURED ... is inside the git repository"). It is not under `session-tmp`
 * either, so the end-of-session sweep never matches it.
 * @es La carpeta TEMP de una cadena desacoplada: `<raíz temporal compartida>/claude/detached-chain-tmp/<nombre del
 * directorio de corrida>`. NO está dentro del directorio de corrida: ese vive bajo el home de Claude, un repositorio
 * git, y el motor de mutantes rechaza un TEMP dentro de cualquier repositorio (medido). Tampoco está bajo
 * `session-tmp`, así que el barrido de fin de sesión nunca la reconoce.
 */
export const chainTempDir = (runDir) => path.join(realTempRoot(), 'claude', 'detached-chain-tmp', path.basename(runDir));

/**
 * The environment the chain runs in: the job's, with TEMP, TMP and TMPDIR pointing at `tempDir`. A detached chain must
 * outlive the session that started it, and the session's end sweeps (`session-processes/`) every process whose TEMP is
 * the session's private folder, so the chain carries a TEMP of its own, never the session's.
 * @es El entorno en el que corre la cadena: el del trabajo, con TEMP, TMP y TMPDIR apuntando a `tempDir`. Una cadena
 * desacoplada debe sobrevivir a la sesión que la inició, y el fin de sesión barre (`session-processes/`) todo proceso
 * cuyo TEMP sea la carpeta privada de la sesión, así que la cadena lleva un TEMP propio, nunca el de la sesión.
 */
export function chainEnvironment(environment, tempDir) {
  return { ...environment, TEMP: tempDir, TMP: tempDir, TMPDIR: tempDir };
}

/** Runs the chain of `job` with its output in `outputFile`; resolves `{ code, signal }`, rejects when it cannot start. @es Corre la cadena de `job` con su salida en `outputFile`; resuelve `{ code, signal }`, rechaza si no puede iniciarse. */
function runLocked(job, outputFile, tempDir, spawnProcess) {
  const output = openSync(outputFile, 'a');

  return new Promise((resolve, reject) => {
    let child;

    try {
      mkdirSync(tempDir, { recursive: true });
      child = spawnProcess(process.execPath, runArguments(job), { cwd: job.cwd, env: chainEnvironment(job.environment, tempDir), stdio: ['ignore', output, output], windowsHide: true });
    } catch (error) {
      closeSync(output);
      reject(error);

      return;
    }

    child.once('error', (error) => {
      closeSync(output);
      reject(error);
    });
    child.once('close', (code, signal) => {
      closeSync(output);
      resolve({ code, signal });
    });
  });
}

/**
 * Runs the job of `runDir` and writes its verdict.
 * @param {string} runDir
 * @param {{ spawnProcess?: Function, now?: () => Date }} [ports]
 * @returns {Promise<object>} the verdict that was written.
 * @es Ejecuta el trabajo de `runDir` y escribe su veredicto; devuelve el veredicto escrito.
 */
export async function runJob(runDir, { spawnProcess = spawn, now = () => new Date() } = {}) {
  const startedAt = now().toISOString();
  let job;

  try {
    const jobFile = path.join(runDir, RUN_FILES.job);

    job = JSON.parse(readFileSync(jobFile, 'utf8'));
    rmSync(jobFile, { force: true });
  } catch (error) {
    const verdict = { exitCode: null, signal: null, startedAt, endedAt: now().toISOString(), command: null, error: `the job file could not be read: ${error.message}. @es no se pudo leer el fichero del trabajo: ${error.message}.` };

    writeVerdict(runDir, verdict);

    return verdict;
  }

  let ended;
  const tempDir = chainTempDir(runDir);

  try {
    const { code, signal } = await runLocked(job, path.join(runDir, RUN_FILES.output), tempDir, spawnProcess);

    ended = { exitCode: code, signal };
  } catch (error) {
    ended = { exitCode: null, signal: null, error: `the chain could not be started: ${error.message}. @es no se pudo iniciar la cadena: ${error.message}.` };
  }

  rmSync(tempDir, { recursive: true, force: true });

  const verdict = { ...ended, startedAt, endedAt: now().toISOString(), command: commandText(job) };

  writeVerdict(runDir, verdict);

  return verdict;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runJob(process.argv[2]).then(
    () => {
      process.exitCode = 0;
    },
    () => {
      process.exitCode = 1;
    }
  );
}
