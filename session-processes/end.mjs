#!/usr/bin/env node
/**
 * SessionEnd hook: ends every process the session started and left alive, and nothing else (`sweep.mjs`). The session
 * is identified by its private TEMP folder (`session-temp/session-temp.mjs`, the one function that computes it), which
 * every command of the session inherits and which an orphan keeps after its parent dies. Prints nothing on stdout and
 * always exits 0; what it ended, and any failure, go to stderr, one bilingual line each: a session that could not be
 * swept leaves processes behind, so that is said, never silent.
 * @es Hook SessionEnd: termina todo proceso que la sesión inició y dejó vivo, y nada más (`sweep.mjs`). La sesión se
 * identifica por su carpeta TEMP privada (`session-temp/session-temp.mjs`, la única función que la calcula), que heredan
 * todos los comandos de la sesión y que un huérfano conserva cuando muere su padre. No imprime nada por stdout y siempre
 * sale con 0; lo que terminó, y todo fallo, van a stderr, una línea bilingüe cada uno: una sesión que no se pudo barrer
 * deja procesos vivos, así que se dice, nunca en silencio.
 */

import { hookMain, runWhenMain, tryParsePayload } from '../hook-io/hook-io.mjs';
import { killTree } from '../process-control/process-port.mjs';
import { realTempRoot, sessionTempOf } from '../session-temp/session-temp.mjs';
import { killProcess } from './kill-process.mjs';
import { readEnvironments } from './process-table.mjs';
import { sweepSession } from './sweep.mjs';

const toStderr = (line) => process.stderr.write(`${line}\n`);

/** The stderr line for one swept process. @es La línea de stderr de un proceso barrido. */
function lineFor(entry) {
  const how = entry.tree ? 'with everything below it @es con todo lo de abajo' : 'alone @es solo';

  if (entry.outcome === 'failed') return `session-processes: could not end ${entry.name} ${String(entry.pid)}: ${String(entry.detail)}. @es no se pudo terminar ${entry.name} ${String(entry.pid)}: ${String(entry.detail)}.`;

  return `session-processes: ${entry.outcome} ${entry.name} ${String(entry.pid)} ${how}. @es proceso ${entry.name} ${String(entry.pid)}: ${entry.outcome}.`;
}

/**
 * @param {string} raw the SessionEnd payload @es el payload de SessionEnd
 * @param {{ root?: string, hookPid?: number, readEnvironments?: Function, killTree?: Function, killProcess?: Function, record?: (line: string) => void }} [ports] seams for the temp root, the hook's pid, the process table, both ways of ending a process and the stderr record. @es costuras.
 */
export function evaluate(raw, { root = realTempRoot(), hookPid = process.pid, readEnvironments: read = readEnvironments, killTree: endTree = killTree, killProcess: endOne = killProcess, record = toStderr } = {}) {
  try {
    const sessionTemp = sessionTempOf(tryParsePayload(raw)?.session_id, root);

    if (sessionTemp === undefined) return undefined;

    for (const entry of sweepSession({ sessionTemp, hookPid, readEnvironments: read, killTree: endTree, killProcess: endOne })) record(lineFor(entry));
  } catch (error) {
    record(`session-processes: the sweep failed, processes may be left alive: ${error instanceof Error ? error.message : String(error)}. @es el barrido falló, pueden quedar procesos vivos: ${error instanceof Error ? error.message : String(error)}.`);
  }

  return undefined;
}

runWhenMain(import.meta.url, hookMain(evaluate));
