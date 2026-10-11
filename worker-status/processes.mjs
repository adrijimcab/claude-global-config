/**
 * Live processes whose command line names a worktree. The process listing is an injected function, so
 * the proof never depends on what runs on the machine.
 * @es Procesos vivos cuya línea de comandos nombra un worktree. El listado es una función inyectada.
 */

import { spawnSync } from 'node:child_process';

const normalized = (text) => text.split('\\').join('/').toLowerCase();
const WINDOWS_LISTING = 'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';

/** Rows from PowerShell JSON: one process is an object, many are an array. @es Filas del JSON de PowerShell: uno es objeto, varios arreglo. */
export function rowsOfJson(json) {
  const rows = JSON.parse(json || '[]');

  return (Array.isArray(rows) ? rows : [rows]).map((row) => ({ pid: row.ProcessId, commandLine: row.CommandLine ?? '' }));
}

/** Default listing: `[{ pid, commandLine }]` from the OS. @es Listado por defecto desde el SO. */
export function listProcesses() {
  if (process.platform === 'win32') {
    const run = spawnSync('powershell', ['-NoProfile', '-Command', WINDOWS_LISTING], { encoding: 'utf8', maxBuffer: 64 << 20 });

    return rowsOfJson(run.stdout);
  }

  const run = spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8', maxBuffer: 64 << 20 });

  return run.stdout.split('\n').filter((line) => line.trim() !== '').map((line) => ({ pid: Number(line.trim().split(' ')[0]), commandLine: line.trim().split(' ').slice(1).join(' ') }));
}

/** Processes (other than this one) whose command line contains `worktree`. @es Procesos que nombran el worktree. */
export function processesNaming(worktree, list = listProcesses) {
  const wanted = normalized(worktree);

  return list().filter((entry) => entry.pid !== process.pid && normalized(entry.commandLine).includes(wanted));
}
