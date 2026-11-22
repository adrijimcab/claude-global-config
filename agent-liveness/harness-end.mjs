/**
 * Whether the harness itself recorded that a started agent ENDED, though no SubagentStop reached the lifecycle. The
 * harness fires no stop for an agent cut by an API error (a 5-hour usage limit, HTTP 429), so its START stays open and
 * holds its worktree for the whole ceiling. Two marks the harness does write say it ended, measured 2026-11-18 on
 * agent aaad56c5e2955c98c and 2026-11-22 on a9ea8c6a06b3e6f39:
 *
 *   - its `agent-<id>.meta.json` beside the transcript carries `"finished": true`;
 *   - its transcript's LAST record is the synthetic error the harness appends (`isApiErrorMessage: true`).
 *
 * A mark counts only when it is not older than the recorded START, so an agent resumed after it finished (a new
 * START, new records) is never read as ended by the mark of its earlier run.
 *
 *   endedByHarness(transcript, startedAt, { readMeta, readLastRecord }) -> boolean
 *
 * @es Si el propio harness registró que un agente arrancado TERMINÓ aunque ningún SubagentStop llegó al ciclo de vida.
 * El harness no dispara stop para un agente cortado por un error de API (el límite de 5 horas, HTTP 429), así que su
 * START queda abierto y retiene su worktree todo el techo. Dos marcas que el harness sí escribe dicen que terminó,
 * medidas el 2026-11-18 y el 2026-11-22: su `agent-<id>.meta.json` junto al transcript con `"finished": true`, y el
 * ÚLTIMO registro del transcript como el error sintético que añade el harness (`isApiErrorMessage: true`). Una marca
 * cuenta solo si no es anterior al START registrado, así que un agente reanudado tras terminar nunca se lee como
 * terminado por la marca de su corrida anterior.
 */

import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';

/** How much of a transcript's end is read to find its last record. @es Cuánto del final del transcript se lee. */
const TAIL_BYTES = 64 * 1024;

/** The meta file the harness keeps beside a transcript, with its mtime, or undefined. @es El meta junto al transcript, con su mtime. */
export function readMeta(transcript) {
  const file = transcript.replace(/\.jsonl$/, '.meta.json');

  try {
    return { ...JSON.parse(readFileSync(file, 'utf8')), mtimeMs: statSync(file).mtimeMs };
  } catch {
    return undefined;
  }
}

/** The last parsable record of a transcript, read from its tail only, or undefined. @es El último registro legible, leído solo de la cola. */
export function readLastRecord(transcript) {
  let fd;

  try {
    fd = openSync(transcript, 'r');
    const { size } = statSync(transcript);
    const length = Math.min(size, TAIL_BYTES);
    const buffer = Buffer.alloc(length);

    readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString('utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '');

    return lines.length === 0 ? undefined : JSON.parse(lines[lines.length - 1]);
  } catch {
    return undefined;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * @param {string} transcript @param {number} startedAt the recorded START, in ms
 * @param {{ readMeta?: typeof readMeta, readLastRecord?: typeof readLastRecord }} [ports]
 */
export function endedByHarness(transcript, startedAt, ports = {}) {
  if (typeof transcript !== 'string' || transcript === '') return false;

  const meta = (ports.readMeta ?? readMeta)(transcript);

  if (meta?.finished === true && meta.mtimeMs >= startedAt) return true;

  const last = (ports.readLastRecord ?? readLastRecord)(transcript);

  return last?.isApiErrorMessage === true && Date.parse(last.timestamp) >= startedAt;
}
