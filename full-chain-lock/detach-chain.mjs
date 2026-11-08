/**
 * The two commands around a detached chain: `detachChain` starts it and returns, `readChain` says what became of it.
 * Both talk to the world through ports handed in by the composition root (`run.mjs`): the `launcher` of
 * `detach-launcher.mjs`, the speaker of `messages.mjs` and the pid probe of `run-directory.mjs`.
 *
 * `detachChain` makes the run directory, writes `job.json` (the command, its arguments, the working directory, the
 * lock settings and the WHOLE environment: the chain must run as it would have in the caller's shell, and the
 * launcher's own channel, a WMI command line, must carry none of it), launches the detached runner, records its pid in
 * `run.json` and prints the run directory, the pid and the exact read command. A launch that fails removes the job
 * file again, so no environment is left on disk by a run that never started.
 *
 * `readChain` prints running, finished or lost and answers the exit code: the chain's own when it finished, 127 when
 * it never started, `EXIT.running` while it runs, 2 when it is lost.
 *
 * @es Los dos comandos alrededor de una cadena desacoplada: `detachChain` la inicia y vuelve, `readChain` dice qué fue
 * de ella. `detachChain` crea el directorio de corrida, escribe `job.json` (comando, argumentos, directorio de trabajo,
 * ajustes del lock y el entorno ENTERO: la cadena debe correr como en el shell de quien llamó, y el canal del
 * lanzador, una línea de comandos de WMI, no debe llevar nada de él), lanza el runner desacoplado, anota su pid en
 * `run.json` e imprime el directorio, el pid y el comando exacto de lectura. Si el lanzamiento falla, borra otra vez el
 * fichero del trabajo para no dejar el entorno en disco. `readChain` imprime corriendo, terminada o perdida y responde
 * el código de salida: el de la cadena si terminó, 127 si nunca inició, `EXIT.running` mientras corre, 2 si se perdió.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EXIT } from './chain-runner.mjs';
import { RUN_FILES, defaultRunDirectory, runStatus } from './run-directory.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The detached runner script and the runner that reads a run. @es El script del runner desacoplado y el que lee una corrida. */
const DETACHED_RUNNER = path.join(HERE, 'detached-runner.mjs');
const RUN = path.join(HERE, 'run.mjs');

/** The text of a failure. @es El texto de un fallo. */
const detailOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * Starts `request` detached.
 *
 * @param {{ chain: string, project: string, session: string, tree: string, command: string, args: string[], waitMs: number, pollMs: number, runDir?: string }} request
 * @param {{ launcher: object, say: object, runsRoot: string, environment: object, cwd: string, now?: () => Date }} ports
 * @returns {number} 0 once the runner was launched; `EXIT.usage` when the run directory already holds a run; `EXIT.detachFailed` when the launch failed.
 * @es Inicia `request` desacoplada; devuelve 0 si se lanzó el runner, `EXIT.usage` si el directorio ya tiene una corrida, `EXIT.detachFailed` si el lanzamiento falló.
 */
export function detachChain(request, { launcher, say, runsRoot, environment, cwd, now = () => new Date() }) {
  const runDir = path.resolve(request.runDir ?? defaultRunDirectory(runsRoot, request.chain, now()));

  if (existsSync(path.join(runDir, RUN_FILES.run))) {
    say.complain('run-dir-used', { runDir });

    return EXIT.usage;
  }

  const jobFile = path.join(runDir, RUN_FILES.job);

  try {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(jobFile, JSON.stringify({ command: request.command, args: request.args, cwd, environment, chain: request.chain, project: request.project, session: request.session, tree: request.tree, waitSeconds: request.waitMs / 1000, pollMs: request.pollMs }), { mode: 0o600 });

    const pid = launcher.launch({ nodePath: process.execPath, runnerPath: DETACHED_RUNNER, runDir, cwd });

    writeFileSync(path.join(runDir, RUN_FILES.run), JSON.stringify({ pid, chain: request.chain, command: [request.command, ...request.args].join(' '), startedAt: now().toISOString() }));
    say.say('detached', { runDir, pid, readCommand: `node "${RUN}" --read "${runDir}"` });

    return 0;
  } catch (error) {
    rmSync(jobFile, { force: true });
    say.complain('detach-failed', { detail: detailOf(error) });

    return EXIT.detachFailed;
  }
}

/**
 * Says what became of the run in `runDir`.
 * @param {string} runDir
 * @param {{ say: object, isAlive?: (pid: number) => boolean }} ports
 * @returns {number} the exit code described above.
 * @es Dice qué fue de la corrida de `runDir`; devuelve el código de salida descrito arriba.
 */
export function readChain(runDir, { say, isAlive }) {
  const status = runStatus(runDir, { isAlive });

  if (status.state === 'running') {
    say.say('read-running', { runDir, pid: status.pid });

    return EXIT.running;
  }

  if (status.state === 'lost') {
    say.complain('read-lost', { runDir });

    return EXIT.usage;
  }

  const { verdict } = status;

  if (typeof verdict.exitCode !== 'number') {
    say.complain('read-unstarted', { runDir, detail: verdict.error ?? `signal ${String(verdict.signal)}` });

    return EXIT.notStarted;
  }

  say.say('read-finished', { runDir, exitCode: verdict.exitCode, endedAt: verdict.endedAt });

  return verdict.exitCode;
}
