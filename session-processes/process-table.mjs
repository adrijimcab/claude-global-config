/**
 * The process-table adapter: lists every process of the machine with its parent and the TEMP of its environment.
 *
 *   readEnvironments({ runPowershell }) -> [{ pid, parentPid, name, temp }]
 *
 * `temp` is the string the process carries (`''` when it has none) and `undefined` when its environment cannot be
 * read (another user, a protected process, a process that exited meanwhile). The environment cannot be asked of
 * Windows by a command (`wmic` and `Get-CimInstance Win32_Process` omit it), so `environment-reader.ps1` reads each
 * process environment block from the process memory; this module only runs that script and parses its lines.
 * Windows only: any other platform throws, because a silent empty list would read as "nothing to sweep".
 *
 * @es El adaptador de la tabla de procesos: lista cada proceso de la máquina con su padre y el TEMP de su entorno.
 * `temp` es el texto que lleva el proceso (`''` si no tiene) y `undefined` si su entorno no se puede leer (otro
 * usuario, un proceso protegido, uno que salió entretanto). Windows no entrega el entorno por un comando (`wmic` y
 * `Get-CimInstance Win32_Process` lo omiten), así que `environment-reader.ps1` lee el bloque de entorno de cada
 * proceso desde su memoria; este módulo solo ejecuta ese script y analiza sus líneas. Solo Windows: otra plataforma
 * lanza un error, porque una lista vacía silenciosa se leería como «nada que barrer».
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const READER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'environment-reader.ps1');
/** The marker the reader prints for an environment it could not read. @es La marca que imprime el lector para un entorno que no pudo leer. */
const UNREADABLE = '?';
/** A full machine read takes well under a second; this ceiling only ends a hung PowerShell. @es Una lectura completa tarda bastante menos de un segundo; el tope solo termina un PowerShell colgado. */
const READ_CEILING_MS = 60 * 1000;

/** The real PowerShell, run to completion. @es El PowerShell real, ejecutado hasta terminar. */
function spawnReader() {
  return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-File', READER], { encoding: 'utf8', windowsHide: true, timeout: READ_CEILING_MS, maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Parses the reader output: one `pid<TAB>parentPid<TAB>name<TAB>TEMP` line per process; a line that does not fit is dropped.
 * @es Analiza la salida del lector: una línea `pid<TAB>parentPid<TAB>nombre<TAB>TEMP` por proceso; una línea que no encaja se descarta.
 */
export function parseRows(text) {
  const rows = [];

  for (const line of String(text).split(/\r?\n/)) {
    const [pid, parentPid, name, ...rest] = line.split('\t');

    if (!/^\d+$/.test(pid) || !/^\d+$/.test(parentPid) || rest.length !== 1) continue;

    rows.push({ pid: Number(pid), parentPid: Number(parentPid), name, temp: rest[0] === UNREADABLE ? undefined : rest[0] });
  }

  return rows;
}

/**
 * Every process with its TEMP.
 * @param {{ platform?: string, runReader?: () => { status: number|null, stdout: string, stderr: string, error?: Error } }} [ports] seams for the platform and the PowerShell run.
 * @es Cada proceso con su TEMP; `platform` y `runReader` son costuras inyectables.
 */
export function readEnvironments({ platform = process.platform, runReader = spawnReader } = {}) {
  if (platform !== 'win32') throw new Error(`the environment of a process can be read only on Windows, not on ${platform}. @es el entorno de un proceso solo se puede leer en Windows, no en ${platform}.`);

  const answer = runReader();

  if (answer.error !== undefined || answer.status !== 0) throw new Error(`the environment reader failed (exit ${String(answer.status)}): ${answer.error?.message ?? String(answer.stderr ?? '').trim()}. @es el lector de entorno falló (salida ${String(answer.status)}): ${answer.error?.message ?? String(answer.stderr ?? '').trim()}.`);

  return parseRows(answer.stdout);
}

