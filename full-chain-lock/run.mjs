#!/usr/bin/env node
/**
 * The runner of a full chain, and the composition root of the full-chain lock: it wires the ports of
 * `chain-runner.mjs` to their real adapters and exits with the run's code.
 *
 *   node run.mjs --chain <name> [--project <name>] [--session <id>] [--wait-seconds <n>] -- <command> [args...]
 *
 * It takes ONE machine-wide lock (`hook-state/file-lock.mjs`, in the shared state directory `full-chain-lock` under
 * the Claude home, redirectable like every state by `HOOK_STATE_DIR`), records the holder, runs the command as a
 * child with its arguments as an array, exits with the child's exact exit code, and releases the lock on every
 * path out (a last-resort release also runs when the process exits). While another chain holds the lock it waits,
 * bounded, and prints the holder; when the wait expires it exits 75 with a bilingual message and runs nothing.
 *
 * Exit codes of its own: 2 usage, 70 the lock could not be taken because of a fault, 75 the wait expired, 127 the
 * command could not be started. Any other code is the command's.
 *
 * @es El runner de una cadena completa y la raíz de composición del lock: conecta los puertos de `chain-runner.mjs`
 * con sus adaptadores reales y sale con el código de la corrida. Toma UN lock de toda la máquina, registra al
 * dueño, ejecuta el comando como hijo con argumentos en array, sale con su código EXACTO y suelta el lock en toda
 * salida (también al salir el proceso, como último recurso). Si otra cadena lo tiene, espera acotado y muestra al
 * dueño; si la espera caduca, sale con 75 y un mensaje bilingüe sin ejecutar nada. Códigos propios: 2 uso, 70 fallo
 * del lock, 75 espera caducada, 127 comando no iniciado.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { childProcessAdapter } from './child-process-adapter.mjs';
import { parseArguments } from './cli-arguments.mjs';
import { EXIT, runChain } from './chain-runner.mjs';
import { fileLockAdapter } from './file-lock-adapter.mjs';
import { speak } from './messages.mjs';

/** The shared state mechanism of the lock. @es El mecanismo de estado compartido del lock. */
export const MECHANISM = 'full-chain-lock';

/** The real clock. @es El reloj real. */
const realClock = { now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

/**
 * Runs the runner for `argv` and returns its exit code.
 * @es Ejecuta el runner para `argv` y devuelve su código de salida.
 */
export async function main(argv) {
  const say = speak();
  const parsed = parseArguments(argv, { cwdName: path.basename(process.cwd()), sessionFromEnvironment: process.env.CLAUDE_SESSION_ID });

  if (parsed.problem !== undefined) {
    say.complain(parsed.problem.id, parsed.problem.params);
    say.complain('usage');

    return EXIT.usage;
  }

  const lock = fileLockAdapter(stateDir(MECHANISM));

  // Last resort: a process that exits without passing its `finally` still gives the lock back.
  // @es Último recurso: un proceso que sale sin pasar por su `finally` devuelve igualmente el lock.
  process.on('exit', () => {
    try {
      lock.release();
    } catch {
      // the exit path has nowhere to report to; the stale-age break covers a lock left behind
    }
  });

  return runChain(parsed.request, { lock, child: childProcessAdapter(), clock: realClock, say, processId: process.pid });
}

/**
 * The exit code of a run that failed for a reason of its own (a defect of a port, not the command's exit): tells
 * it bilingual, and answers 70. The lock was already released by the domain's `finally`.
 * @es El código de salida de una corrida que falló por algo propio (un defecto de un puerto, no la salida del
 * comando): lo cuenta bilingüe y responde 70. El lock ya lo soltó el `finally` del dominio.
 */
export function failureCode(error, say = speak()) {
  say.complain('run-failed', { detail: error instanceof Error ? error.message : String(error) });

  return EXIT.lockFault;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.exitCode = failureCode(error);
    }
  );
}
