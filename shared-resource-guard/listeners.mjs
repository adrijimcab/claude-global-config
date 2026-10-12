/**
 * The operating-system adapter of the shared-resource guard: which process IDs LISTEN on a TCP port right
 * now. It exists so a stop by PID can be attributed to a resource at decision time: a worker that looks the
 * PID up in one tool call (`netstat -ano | findstr :3100`) and kills it in the next (`taskkill /PID 4321`)
 * shows the guard a bare number, and only the live listener table says that number is the shared PROD.
 *
 * Windows reads `netstat -ano -p tcp`; every other platform reads `lsof -nP -t -iTCP:<port> -sTCP:LISTEN`.
 * A tool that cannot run, or prints nothing, yields an EMPTY set: the guard then cannot attribute the PID and
 * lets the command through (it fails open on its own malfunction, the fleet convention), and the port and
 * name routes of the same guard still apply.
 *
 * @es El adaptador del sistema operativo del guard de recursos compartidos: qué PIDs ESCUCHAN ahora en un
 * puerto TCP. Existe para atribuir un kill por PID a un recurso en el momento de decidir: un worker que busca
 * el PID en una llamada (`netstat -ano | findstr :3100`) y lo mata en la siguiente (`taskkill /PID 4321`)
 * enseña un número pelado, y solo la tabla viva de escuchas dice que es el PROD compartido. Windows lee
 * `netstat -ano -p tcp`; el resto, `lsof`. Una herramienta que no corre da un conjunto VACÍO: el guard no
 * puede atribuir el PID y deja pasar (falla abierto); las rutas por puerto y por nombre siguen valiendo.
 */

import { spawnSync } from 'node:child_process';

const LISTENING = 'LISTENING';
const TOOL_TIMEOUT_MS = 10_000;

/** The PIDs `netstat -ano -p tcp` reports listening on `port`. @es Los PIDs que `netstat` da escuchando en `port`. */
function windowsPids(port, run) {
  const result = run('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: TOOL_TIMEOUT_MS });
  const pids = new Set();

  for (const line of String(result.stdout ?? '').split('\n')) {
    const columns = line.split(' ').filter((column) => column.trim() !== '');
    const [, local, , state, pid] = columns;

    if (state?.trim() === LISTENING && local.endsWith(`:${port}`)) pids.add(pid.trim());
  }

  return pids;
}

/** The PIDs `lsof` reports listening on `port`. @es Los PIDs que `lsof` da escuchando en `port`. */
function unixPids(port, run) {
  const result = run('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8', timeout: TOOL_TIMEOUT_MS });

  return new Set(String(result.stdout ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== ''));
}

/**
 * @param {number} port A TCP port.
 * @param {string} [platform] Injectable; defaults to this process's.
 * @param {Function} [run] Injectable `spawnSync`.
 * @returns {Set<string>} The PIDs listening on the port, as text; empty when unknowable.
 * @es Los PIDs que escuchan en el puerto, como texto; vacío si no se puede saber.
 */
export function pidsListeningOn(port, platform = process.platform, run = spawnSync) {
  try {
    return platform === 'win32' ? windowsPids(port, run) : unixPids(port, run);
  } catch {
    return new Set();
  }
}
