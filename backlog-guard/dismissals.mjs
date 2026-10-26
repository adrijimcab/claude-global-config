/**
 * The dismissal log: where a stated reason for «this is not a pending item» is kept, and how it is read back.
 * `dismiss.mjs` writes it; the pending judge's prefilter (`../pending-judge/prefilter.mjs`) reads it, so a
 * dismissal ends the question for the turn in which it was made.
 *
 * @es El registro de descartes: dónde se guarda el motivo escrito de «esto no es un pendiente» y cómo se lee.
 * Lo escribe `dismiss.mjs`; lo lee el prefiltro del juez de pendientes, así que un descarte cierra la pregunta
 * del turno en que se hizo.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { stateDirectory } from './state.mjs';

/** The JSONL file of dismissals. @es El fichero JSONL de descartes. */
export const dismissalsFile = () => path.join(stateDirectory(), 'dismissals.jsonl');

/**
 * Whether `session` recorded a dismissal strictly after `sinceMs` (epoch milliseconds). A missing log is no
 * dismissal; a torn line is skipped; any other read failure throws, for the caller to fail open.
 * @es Si `session` registró un descarte estrictamente posterior a `sinceMs`. Sin registro no hay descarte; una
 * línea rota se salta; cualquier otro fallo de lectura lanza, para que quien llama falle abierto.
 */
export function dismissedSince(session, sinceMs) {
  let text;

  try {
    text = readFileSync(dismissalsFile(), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }

  return text.split('\n').some((line) => {
    try {
      const record = JSON.parse(line);

      return record?.session === session && Date.parse(record.at) > sinceMs;
    } catch {
      return false;
    }
  });
}
