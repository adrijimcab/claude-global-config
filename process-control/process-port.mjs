/**
 * The process port: the one place that asks the operating system whether a process lives, lists every process
 * with its command line, and kills a tree (re-exported from `kill-tree.mjs`, which already owns it). A caller
 * that needs any of the three imports it from here, never re-implements it.
 *
 * MEASURED on Windows (Node 22): `process.kill(pid, 0)` throws `ESRCH` for a pid that never existed or died, and
 * `EPERM` for a live process the caller may not signal (the System process, pid 4), so `EPERM` means alive.
 *
 * @es El puerto de procesos: el único sitio que le pregunta al sistema operativo si un proceso vive, lista todos
 * los procesos con su línea de comandos y mata un árbol (reexportado de `kill-tree.mjs`, que ya lo posee).
 * MEDIDO en Windows (Node 22): `process.kill(pid, 0)` lanza `ESRCH` si el pid nunca existió o murió, y `EPERM` si
 * el proceso vive pero el llamador no puede señalizarlo (el proceso System, pid 4): `EPERM` significa vivo.
 */

import { spawnSync } from 'node:child_process';

export { killTree } from './kill-tree.mjs';

/**
 * Whether a process with `pid` exists. `kill` replaces `process.kill`, a seam for the `EPERM` answer no test
 * process can provoke as itself.
 * @es Si existe un proceso con `pid`. `kill` reemplaza a `process.kill`, una costura para el `EPERM`.
 */
export function isAlive(pid, kill = process.kill) {
  try {
    kill(pid, 0);

    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

// One line per process, `<pid>:<parent pid> <base64 of the UTF-8 command line>`: the output is pure ASCII, so
// neither the console code page nor PowerShell's JSON escaping can corrupt or break a command line.
// @es Una línea por proceso, `<pid>:<pid del padre> <base64 de la línea de comandos en UTF-8>`: la salida es ASCII
// puro, así que ni la página de códigos de la consola ni el escapado JSON de PowerShell pueden corromper una línea.
const WINDOWS_LISTING = "Get-CimInstance Win32_Process | ForEach-Object { $line = $_.CommandLine; if ($null -eq $line) { $line = '' }; '{0}:{1} {2}' -f $_.ProcessId, $_.ParentProcessId, [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($line)) }";

/**
 * Rows from the Windows listing, one `<pid>:<parent> <base64>` line each. The `:<parent>` half is optional, and a
 * parent that is not a number is no parent.
 * @es Filas del listado de Windows, una línea `<pid>:<padre> <base64>` cada una. La mitad `:<padre>` es opcional, y
 * un padre que no es un número no es padre.
 */
export function rowsOfListing(text) {
  return text.split('\n').map((line) => line.trim()).filter((line) => line !== '').map((line) => {
    const [identity, encoded = ''] = line.split(' ');
    const [pid, parent] = identity.split(':');
    const parentPid = parent !== undefined && /^\d+$/.test(parent) ? Number(parent) : undefined;

    return { pid: Number(pid), ...(parentPid === undefined ? {} : { parentPid }), commandLine: Buffer.from(encoded, 'base64').toString('utf8') };
  });
}

/**
 * Rows from `ps -eo pid=,ppid=,args=`: pid, parent pid, then the command line as the rest of the line.
 * @es Filas de `ps -eo pid=,ppid=,args=`: pid, pid del padre y la línea de comandos como resto de la línea.
 */
export function rowsOfPs(text) {
  return text.split('\n').filter((line) => line.trim() !== '').map((line) => {
    const [pid, parentPid, ...words] = line.trim().split(/\s+/);

    return { pid: Number(pid), parentPid: Number(parentPid), commandLine: words.join(' ') };
  });
}

/**
 * Every process as `{ pid, parentPid, commandLine }`. `env` is the environment of the listing tool: PowerShell
 * creates `%USERPROFILE%AppDataRoaming`, so a proof passes a private profile instead of the real one. `run` and
 * `platform` are seams: a proof reads the exact command asked of the tool, since a hostile PowerShell profile
 * (what `-NoProfile` shuts out) cannot be provoked portably.
 * @es Todos los procesos. `env` es el entorno de la herramienta: PowerShell crea `%USERPROFILE%AppDataRoaming`,
 * así que una prueba pasa un perfil privado en lugar del real. `run` y `platform` son costuras: una prueba lee el
 * comando exacto pedido a la herramienta, porque un perfil de PowerShell hostil no se puede provocar.
 */
export function listProcesses(env = process.env, run = spawnSync, platform = process.platform) {
  const options = { encoding: 'utf8', maxBuffer: 64 << 20, env };

  if (platform === 'win32') return rowsOfListing(run('powershell', ['-NoProfile', '-Command', WINDOWS_LISTING], options).stdout ?? '');

  return rowsOfPs(run('ps', ['-eo', 'pid=,ppid=,args='], options).stdout);
}
