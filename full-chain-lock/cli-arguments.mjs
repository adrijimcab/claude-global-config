/**
 * The command line of the runner: `--chain <name> [--project <name>] [--session <id>] [--wait-seconds <n>]
 * [--poll-ms <n>] -- <command> [args...]`. Everything after the FIRST `--` is the command, taken word by word and
 * never reparsed; everything before it must be a known flag with a value. An unknown flag, a missing value, a
 * missing chain, a missing command or a number that is not positive is a usage problem, never a guess.
 *
 * @es La línea de comandos del runner. Todo lo que sigue al PRIMER `--` es el comando, palabra por palabra y sin
 * reinterpretar; lo anterior debe ser un flag conocido con valor. Un flag desconocido, un valor ausente, una
 * cadena o un comando ausentes o un número no positivo es un problema de uso, nunca una suposición.
 */

import { DEFAULT_POLL_MS, DEFAULT_WAIT_SECONDS } from './chain-runner.mjs';

/** The flags that carry a text value. @es Los flags con valor de texto. */
const TEXT_FLAGS = new Set(['--chain', '--project', '--session']);

/** The flags that carry a positive number. @es Los flags con un número positivo. */
const NUMBER_FLAGS = new Set(['--wait-seconds', '--poll-ms']);

/**
 * @param {string[]} argv The words after the script name.
 * @param {{ cwdName: string, sessionFromEnvironment?: string }} defaults
 * @returns {{ request: object } | { problem: { id: string, params: object } }} the problem is a message id of `messages.mjs` with its parameters.
 * @es Lee los argumentos: `{ request }` o `{ problem }`.
 */
export function parseArguments(argv, { cwdName, sessionFromEnvironment }) {
  const separator = argv.indexOf('--');

  if (separator === -1) return { problem: { id: 'usage-no-separator', params: {} } };

  const command = argv.slice(separator + 1);
  const flags = {};

  for (let index = 0; index < separator; index += 2) {
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

  return {
    request: {
      chain: flags['--chain'],
      project: flags['--project'] ?? cwdName,
      session: flags['--session'] ?? sessionFromEnvironment ?? 'unknown',
      command: command[0],
      args: command.slice(1),
      waitMs: (flags['--wait-seconds'] ?? DEFAULT_WAIT_SECONDS) * 1000,
      pollMs: flags['--poll-ms'] ?? DEFAULT_POLL_MS
    }
  };
}
