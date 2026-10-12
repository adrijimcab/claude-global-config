/**
 * The hook the reload probe registers: appends `<tag> <event> <time>` to the file named by PROBE_LOG, so the
 * probe can read which registered groups actually fired on a turn.
 *
 * @es El hook que registra la sonda de recarga: agrega `<tag> <evento> <hora>` al fichero de PROBE_LOG, para
 * que la sonda lea qué grupos registrados dispararon de verdad en un turno.
 */

import { appendFileSync, readFileSync } from 'node:fs';

const tag = process.argv[2];
const logFile = process.env.PROBE_LOG;
let event = '';

try {
  event = JSON.parse(readFileSync(0, 'utf8')).hook_event_name;
} catch {
  // An unreadable payload is logged with an empty event. @es Un payload ilegible se registra sin evento.
}

if (logFile !== undefined) appendFileSync(logFile, `${tag} ${event} ${new Date().toISOString()}\n`);
