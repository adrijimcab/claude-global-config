/**
 * Live processes whose command line names a worktree. The process listing is an injected function, so
 * the proof never depends on what runs on the machine.
 * @es Procesos vivos cuya línea de comandos nombra un worktree. El listado es una función inyectada.
 */

import { spawnSync } from 'node:child_process';

const normalized = (text) => text.split('\\').join('/').toLowerCase();
// One line per process, `<pid> <base64 of the UTF-8 command line>`: the output is pure ASCII, so neither the
// console code page nor PowerShell's JSON escaping can corrupt or break a command line.
// @es Una línea por proceso, `<pid> <base64 de la línea de comandos en UTF-8>`: la salida es ASCII puro, así que
// ni la página de códigos de la consola ni el escapado JSON de PowerShell pueden corromper una línea de comandos.
const WINDOWS_LISTING = "Get-CimInstance Win32_Process | ForEach-Object { $line = $_.CommandLine; if ($null -eq $line) { $line = '' }; '{0} {1}' -f $_.ProcessId, [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($line)) }";

/** Rows from the Windows listing, one `<pid> <base64>` line each. @es Filas del listado de Windows, una línea `<pid> <base64>` cada una. */
export function rowsOfListing(text) {
  return text.split('\n').map((line) => line.trim()).filter((line) => line !== '').map((line) => {
    const [pid, encoded = ''] = line.split(' ');

    return { pid: Number(pid), commandLine: Buffer.from(encoded, 'base64').toString('utf8') };
  });
}

/**
 * Default listing: `[{ pid, commandLine }]` from the OS. `env` is the environment of the listing tool: PowerShell
 * creates `%USERPROFILE%AppDataRoaming`, so a proof passes a private profile instead of the real one.
 * @es Listado por defecto desde el SO. `env` es el entorno de la herramienta: PowerShell crea
 * `%USERPROFILE%AppDataRoaming`, así que una prueba pasa un perfil privado en lugar del real.
 */
export function listProcesses(env = process.env) {
  if (process.platform === 'win32') {
    const run = spawnSync('powershell', ['-NoProfile', '-Command', WINDOWS_LISTING], { encoding: 'utf8', maxBuffer: 64 << 20, env });

    return rowsOfListing(run.stdout ?? '');
  }

  const run = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', maxBuffer: 64 << 20, env });

  return run.stdout.split('\n').filter((line) => line.trim() !== '').map((line) => ({ pid: Number(line.trim().split(' ')[0]), commandLine: line.trim().split(' ').slice(1).join(' ') }));
}

/** Processes (other than this one) whose command line contains `worktree`. @es Procesos que nombran el worktree. */
export function processesNaming(worktree, list = listProcesses) {
  const wanted = normalized(worktree);

  return list().filter((entry) => entry.pid !== process.pid && normalized(entry.commandLine).includes(wanted));
}
