/**
 * Owns ONE question: when did the process behind this transcript last load its hook configuration. The marker
 * is the timestamp of the latest `SessionStart` record of kind startup, resume or clear (the kinds that start a
 * fresh process or context; `compact` keeps the process, so it is not one). `undefined` when the transcript
 * cannot be read or holds none.
 *
 * @es Responde UNA pregunta: cuándo cargó por última vez su configuración de hooks el proceso detrás de este
 * transcript. La marca es el timestamp del último registro `SessionStart` de tipo startup, resume o clear (los
 * que arrancan un proceso o contexto nuevo; `compact` conserva el proceso, así que no cuenta). `undefined` si el
 * transcript no se puede leer o no tiene ninguno.
 */

import { readFileSync } from 'node:fs';

/** The SessionStart kinds that load the configuration afresh. @es Los tipos que cargan la configuración de nuevo. */
const RELOADING_KINDS = new Set(['SessionStart:startup', 'SessionStart:resume', 'SessionStart:clear']);

/** Cheap pre-filter: only lines that mention a SessionStart hook name are parsed. @es Prefiltro barato. */
const LINE_FILTER = '"SessionStart:';

/** The timestamp of a line when it is a reloading SessionStart record, else `undefined`. @es El timestamp de una línea o `undefined`. */
function startTimestamp(line) {
  try {
    const record = JSON.parse(line);

    return record?.attachment?.hookEvent === 'SessionStart' && RELOADING_KINDS.has(record.attachment.hookName) && typeof record.timestamp === 'string' ? record.timestamp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The latest reloading SessionStart timestamp of the transcript at `file`, or `undefined`.
 * @es El último timestamp de SessionStart que recarga, del transcript en `file`, o `undefined`.
 */
export function processStartMarker(file) {
  if (typeof file !== 'string' || file.length === 0) return undefined;

  try {
    const stamps = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes(LINE_FILTER))
      .map(startTimestamp)
      .filter((stamp) => stamp !== undefined)
      .sort();

    return stamps.at(-1);
  } catch {
    return undefined;
  }
}
