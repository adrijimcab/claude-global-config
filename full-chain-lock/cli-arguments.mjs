/**
 * The command line of the runner: `--chain <name> [--project <name>] [--session <id>] [--tree <dir>]
 * [--wait-seconds <n>] [--poll-ms <n>] [--detach [--run-dir <dir>]] -- <command> [args...]`, and `--read <run dir>`
 * (`parseReadArguments`). `--detach` takes no value; `--run-dir` is a usage problem without it. `--tree` names the directory whose tree the chain
 * MEASURES (default: the directory it runs in); the runner records it so a write into that tree can be refused while
 * the chain runs. Everything after the FIRST `--` is the command, taken word by word and
 * never reparsed; everything before it must be a known flag with a value. An unknown flag, a missing value, a
 * missing chain, a missing command or a number that is not positive is a usage problem, never a guess.
 *
 * @es La línea de comandos del runner. Todo lo que sigue al PRIMER `--` es el comando, palabra por palabra y sin
 * reinterpretar; lo anterior debe ser un flag conocido con valor. `--tree` nombra el directorio cuyo árbol MIDE la
 * cadena (por defecto, el directorio donde corre); el runner lo registra para poder rechazar una escritura en ese árbol
 * mientras la cadena corre. Un flag desconocido, un valor ausente, una
 * cadena o un comando ausentes o un número no positivo es un problema de uso, nunca una suposición.
 */

import { DEFAULT_POLL_MS, DEFAULT_WAIT_SECONDS } from './chain-runner.mjs';

/** The flags that carry a text value. @es Los flags con valor de texto. */
const TEXT_FLAGS = new Set(['--chain', '--project', '--session', '--tree', '--run-dir']);

/** The flag that starts the chain detached; it carries no value. @es El flag que inicia la cadena desacoplada; no lleva valor. */
const DETACH_FLAG = '--detach';

/** The flags that carry a positive number. @es Los flags con un número positivo. */
const NUMBER_FLAGS = new Set(['--wait-seconds', '--poll-ms']);

/**
 * @param {string[]} argv The words after the script name.
 * @param {{ cwd: string, cwdName: string, sessionFromEnvironment?: string }} defaults
 * @returns {{ request: object } | { problem: { id: string, params: object } }} the problem is a message id of `messages.mjs` with its parameters.
 * @es Lee los argumentos: `{ request }` o `{ problem }`.
 */
export function parseArguments(argv, { cwd, cwdName, sessionFromEnvironment }) {
  const separator = argv.indexOf('--');

  if (separator === -1) return { problem: { id: 'usage-no-separator', params: {} } };

  const command = argv.slice(separator + 1);
  const flags = {};
  let detach = false;

  for (let index = 0; index < separator; index += 2) {
    // `--detach` takes no value, so the pairs after it shift by one word.
    // @es `--detach` no lleva valor, así que los pares que le siguen se desplazan una palabra.
    if (argv[index] === DETACH_FLAG) {
      detach = true;
      index -= 1;
      continue;
    }

    const flag = argv[index];
    const value = argv[index + 1];

    if (!TEXT_FLAGS.has(flag) && !NUMBER_FLAGS.has(flag)) return { problem: { id: 'usage-unknown-flag', params: { flag } } };
    if (index + 1 >= separator) return { problem: { id: 'usage-missing-value', params: { flag } } };

    if (NUMBER_FLAGS.has(flag)) {
      const number = Number(value);

      if (!Number.isFinite(number) || number <= 0) return { problem: { id: 'usage-bad-number', params: { flag, value } } };

      flags[flag] = number;
    } else {
      flags[flag] = value;
    }
  }

  if (flags['--chain'] === undefined || flags['--chain'].trim() === '') return { problem: { id: 'usage-no-chain', params: {} } };
  if (command.length === 0 || command[0] === '') return { problem: { id: 'usage-no-command', params: {} } };
  if (flags['--run-dir'] !== undefined && !detach) return { problem: { id: 'usage-run-dir-without-detach', params: {} } };

  return {
    request: {
      chain: flags['--chain'],
      project: flags['--project'] ?? cwdName,
      session: flags['--session'] ?? sessionFromEnvironment ?? 'unknown',
      tree: flags['--tree'] ?? cwd,
      command: command[0],
      args: command.slice(1),
      waitMs: (flags['--wait-seconds'] ?? DEFAULT_WAIT_SECONDS) * 1000,
      pollMs: flags['--poll-ms'] ?? DEFAULT_POLL_MS,
      detach,
      runDir: flags['--run-dir']
    }
  };
}

/**
 * The arguments of `--read <run dir>`: exactly one non-empty directory.
 * @param {string[]} argv The words after the script name, starting with `--read`.
 * @returns {{ runDir: string } | { problem: { id: string, params: object } }}
 * @es Los argumentos de `--read <directorio>`: exactamente un directorio no vacío.
 */
export function parseReadArguments(argv) {
  if (argv.length !== 2 || argv[1] === '') return { problem: { id: 'usage-read', params: {} } };

  return { runDir: argv[1] };
}
