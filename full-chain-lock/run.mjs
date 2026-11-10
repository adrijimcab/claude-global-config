#!/usr/bin/env node
/**
 * The runner of a full chain, and the composition root of the full-chain lock: it wires the ports of
 * `chain-runner.mjs` to their real adapters and exits with the run's code.
 *
 *   node run.mjs --chain <name> [--project <name>] [--session <id>] [--tree <dir>] [--wait-seconds <n>] -- <command> [args...]
 *   node run.mjs --detach [--run-dir <dir>] --chain <name> ... -- <command> [args...]   returns at once; the chain runs detached
 *   node run.mjs --read <run dir>                                                       running, finished (exit N) or lost
 *
 * `--detach` starts the same locked chain in a process no kill of the caller's process tree reaches (`detach-chain.mjs`),
 * with its output in `<run dir>/output.log` and its verdict in `<run dir>/verdict.json`; `--read` reports on it.
 * @es `--detach` inicia la misma cadena con lock en un proceso que ningún kill del árbol de quien llama alcanza, con su
 * salida en `<dir>/output.log` y su veredicto en `<dir>/verdict.json`; `--read` informa de ella.
 *
 * It takes ONE machine-wide lock (`hook-state/file-lock.mjs`, in the shared state directory `full-chain-lock` under
 * the Claude home, redirectable like every state by `HOOK_STATE_DIR`), records the holder, runs the command as a
 * child with its arguments as an array, exits with the child's exact exit code, and releases the lock on every
 * path out (a last-resort release also runs when the process exits). While another chain holds the lock it waits,
 * bounded, and prints the holder; when the wait expires it exits 75 with a bilingual message and runs nothing.
 *
 * The holder record names the session (`--session`, else the harness's `CLAUDE_CODE_SESSION_ID`) and the absolute
 * tree the chain measures (`measured-tree.mjs`), which `write-guard.mjs` reads to refuse writes into that tree.
 *
 * While the command runs it holds the lock, and the command's environment carries FULL_CHAIN_LOCK_TOKEN, the holder id the lock
 * port wrote into `chain.lock`. A heavy chain runner that must run only under the lock (`selftest-runner/run.mjs`) refuses to
 * start unless that value matches the live holder (`lock-token.mjs`); a copied, stale or forged value, or no lock file, is refused.
 * A value already in the caller's environment is replaced.
 *
 * Exit codes of its own: 2 usage, 70 the lock could not be taken because of a fault, 75 the wait expired, 127 the
 * command could not be started. Any other code is the command's.
 *
 * @es Mientras el comando corre, el runner tiene el lock y el entorno del comando lleva FULL_CHAIN_LOCK_TOKEN, el id de dueño que el
 * puerto del lock escribió en `chain.lock`. Un runner de cadenas pesadas que debe correr solo bajo el lock
 * (`selftest-runner/run.mjs`) se niega a arrancar si ese valor no coincide con el dueño vivo (`lock-token.mjs`); un valor
 * copiado, caducado o falsificado, o sin fichero de lock, se rechaza. Un valor ya presente en el entorno de quien llama se reemplaza.
 *
 * @es El runner de una cadena completa y la raíz de composición del lock: conecta los puertos de `chain-runner.mjs`
 * con sus adaptadores reales y sale con el código de la corrida. Toma UN lock de toda la máquina, registra al
 * dueño, ejecuta el comando como hijo con argumentos en array, sale con su código EXACTO y suelta el lock en toda
 * salida (también al salir el proceso, como último recurso). Si otra cadena lo tiene, espera acotado y muestra al
 * dueño; si la espera caduca, sale con 75 y un mensaje bilingüe sin ejecutar nada. El registro del dueño nombra la
 * sesión (`--session`, o el `CLAUDE_CODE_SESSION_ID` del harness) y el árbol absoluto que mide la cadena, que lee
 * `write-guard.mjs` para rechazar escrituras en él. Códigos propios: 2 uso, 70 fallo
 * del lock, 75 espera caducada, 127 comando no iniciado.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stateDir } from '../hook-state/locations.mjs';
import { childProcessAdapter } from './child-process-adapter.mjs';
import { parseArguments, parseReadArguments } from './cli-arguments.mjs';
import { EXIT, runChain } from './chain-runner.mjs';
import { detachChain, readChain } from './detach-chain.mjs';
import { detachedLauncher } from './detach-launcher.mjs';
import { RUNS_FOLDER } from './run-directory.mjs';
import { fileLockAdapter } from './file-lock-adapter.mjs';
import { measuredTree } from './measured-tree.mjs';
import { speak } from './messages.mjs';

/** The word that asks for the state of a detached run. @es La palabra que pide el estado de una corrida desacoplada. */
const READ_FLAG = '--read';

/** The real clock. @es El reloj real. */
const realClock = { now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

/**
 * Runs the runner for `argv` and returns its exit code.
 * @es Ejecuta el runner para `argv` y devuelve su código de salida.
 */
export async function main(argv) {
  const say = speak();

  if (argv[0] === READ_FLAG) return readRun(argv, say);

  // Claude Code exports CLAUDE_CODE_SESSION_ID to every shell it runs; nothing exports CLAUDE_SESSION_ID, which is why
  // records written without --session named the session 'unknown'.
  // @es Claude Code exporta CLAUDE_CODE_SESSION_ID a cada shell que ejecuta; nadie exporta CLAUDE_SESSION_ID, y por eso
  // los registros escritos sin --session nombraban la sesión 'unknown'.
  const parsed = parseArguments(argv, { cwd: process.cwd(), cwdName: path.basename(process.cwd()), sessionFromEnvironment: process.env.CLAUDE_CODE_SESSION_ID });

  if (parsed.problem !== undefined) return refuse(parsed.problem, say);

  // The shared state mechanism of the lock, named as a literal so the state census can see it.
  // @es El mecanismo de estado compartido del lock, con su nombre literal para que el censo de estado lo vea.
  const stateDirectory = stateDir('full-chain-lock');
  const request = { ...parsed.request, tree: measuredTree(parsed.request.tree) };

  if (request.detach) return detachChain(request, { launcher: detachedLauncher(), say, runsRoot: path.join(stateDirectory, RUNS_FOLDER), environment: process.env, cwd: process.cwd() });

  const lock = fileLockAdapter(stateDirectory);

  // Last resort: a process that exits without passing its `finally` still gives the lock back.
  // @es Último recurso: un proceso que sale sin pasar por su `finally` devuelve igualmente el lock.
  process.on('exit', () => {
    try {
      lock.release();
    } catch {
      // the exit path has nowhere to report to; the stale-age break covers a lock left behind
    }
  });

  return runChain(request, { lock, child: childProcessAdapter(), clock: realClock, say, processId: process.pid });
}

/**
 * Tells a usage problem and the synopsis, bilingual, and answers the usage code.
 * @es Cuenta un problema de uso y la sinopsis, bilingües, y responde el código de uso.
 */
function refuse(problem, say) {
  say.complain(problem.id, problem.params);
  say.complain('usage');

  return EXIT.usage;
}

/**
 * `--read <run dir>`: says what became of a detached run and answers its exit code.
 * @es `--read <directorio>`: dice qué fue de una corrida desacoplada y responde su código de salida.
 */
function readRun(argv, say) {
  const parsed = parseReadArguments(argv);

  if (parsed.problem !== undefined) return refuse(parsed.problem, say);

  return readChain(path.resolve(parsed.runDir), { say });
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
