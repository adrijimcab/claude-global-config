/**
 * The `child` port of `chain-runner.mjs`, implemented over `child_process.spawn`: runs the command with its
 * arguments as an ARRAY (`launch-plan.mjs` decides how to start it), shares the terminal, and resolves its exit
 * code EXACTLY. A child ended by a signal resolves `128 + signal number`, the shell convention, because a number is
 * all an exit code can carry. A command that cannot be started rejects with `CommandNotStarted`.
 *
 * While the child runs, `SIGINT`, `SIGTERM` and `SIGHUP` received by the runner are forwarded to it instead of
 * killing the runner, so the runner outlives its child by exactly the time it needs to release the lock.
 *
 * @es El puerto `child` de `chain-runner.mjs`, sobre `child_process.spawn`: ejecuta el comando con sus argumentos
 * como ARRAY, comparte la terminal y resuelve su código de salida EXACTO. Un hijo terminado por señal resuelve
 * `128 + número de señal`. Un comando que no puede iniciarse rechaza con `CommandNotStarted`. Mientras el hijo
 * corre, `SIGINT`, `SIGTERM` y `SIGHUP` recibidas por el runner se le reenvían en vez de matar al runner, que así
 * sobrevive a su hijo justo lo necesario para soltar el lock.
 */

import { spawn } from 'node:child_process';
import { constants } from 'node:os';

import { CommandNotStarted } from './chain-runner.mjs';
import { launchPlan } from './launch-plan.mjs';

/** The signals the runner forwards to its child. @es Las señales que el runner reenvía a su hijo. */
const FORWARDED = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** The exit code a signal stands for. @es El código de salida que representa una señal. */
const codeOfSignal = (signal) => 128 + (constants.signals[signal] ?? 0);

/**
 * @param {object} [context] `spawnProcess` and the `launchPlan` context, injectable for a proof.
 * @returns {{ run: (command: string, args: string[], environment?: object) => Promise<number> }} `environment` is added to the child's own (the caller's) environment.
 * @es El puerto `child`; `spawnProcess` y el contexto de `launchPlan` son inyectables; `environment` se suma al entorno del hijo (el de quien llama).
 */
export function childProcessAdapter({ spawnProcess = spawn, ...context } = {}) {
  return {
    run(command, args, environment = {}) {
      const plan = launchPlan(command, args, context);

      return new Promise((resolve, reject) => {
        const child = spawnProcess(plan.file, plan.args, { ...plan.options, env: { ...process.env, ...environment } });
        const forwarders = FORWARDED.map((signal) => {
          const forward = () => child.kill(signal);

          process.on(signal, forward);

          return [signal, forward];
        });
        const stopForwarding = () => {
          for (const [signal, forward] of forwarders) process.off(signal, forward);
        };

        child.once('error', (error) => {
          stopForwarding();
          reject(new CommandNotStarted('spawn-failed', { code: String(error.code ?? 'unknown'), detail: error.message }, { cause: error }));
        });
        child.once('close', (code, signal) => {
          stopForwarding();
          resolve(signal === null ? (code ?? 1) : codeOfSignal(signal));
        });
      });
    }
  };
}
