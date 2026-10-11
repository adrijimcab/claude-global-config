/**
 * Runs one command from an argv array, never a shell string, with its output streamed to a log file.
 * @es Corre una orden desde un array argv, nunca una cadena de shell, volcando su salida a un fichero de log.
 */

import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync } from 'node:fs';
import path from 'node:path';

/**
 * `npm` is a `.cmd` on Windows, which Node refuses to spawn without a shell; running its own CLI script
 * through `node` keeps the argv array and needs no shell.
 * @es En Windows `npm` es un `.cmd` que Node no lanza sin shell; correr su script con `node` conserva el array argv.
 */
export function resolveCommand([command, ...args], nodeDirectory = path.dirname(process.execPath)) {
  const cli = path.join(nodeDirectory, 'node_modules', 'npm', 'bin', command === 'npx' ? 'npx-cli.js' : 'npm-cli.js');

  return (command === 'npm' || command === 'npx') && existsSync(cli) ? [process.execPath, cli, ...args] : [command, ...args];
}

/** @returns `{ status, timedOut, error, ms }`; `status` is null when no exit code exists. @es Devuelve el resultado; `status` es null si no hay código de salida. */
export function runCommand({ argv, cwd, logFile, timeoutSeconds }) {
  const [command, ...args] = resolveCommand(argv);
  const descriptor = openSync(logFile, 'w');
  const started = Date.now();

  try {
    const result = spawnSync(command, args, { cwd, stdio: ['ignore', descriptor, descriptor], windowsHide: true, timeout: timeoutSeconds > 0 ? timeoutSeconds * 1000 : undefined });
    const timedOut = result.error?.code === 'ETIMEDOUT';

    return { status: result.status, timedOut, error: timedOut ? undefined : result.error?.code, ms: Date.now() - started };
  } finally {
    closeSync(descriptor);
  }
}
