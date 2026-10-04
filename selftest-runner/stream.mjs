/**
 * Writes ONE report line to a file descriptor, synchronously, whole and with its newline. The runner blocks
 * the event loop for the whole life of each selftest (`spawnSync`), so `console.log` could sit unflushed
 * behind a pipe until the run ends; a synchronous write is what makes a line appear when its selftest does.
 *
 * Two things a plain `writeSync` does not give: a write may take FEWER bytes than asked (the rest is written
 * on the next turn, in order), and a non-blocking pipe that is momentarily full raises `EAGAIN` (retried
 * after a short pause, a bounded number of times, then raised). Sleeping between retries is a courtesy to the
 * CPU and is not observable, so it is not asserted. Any other error is raised at once.
 *
 * @es Escribe UNA línea de informe en un descriptor, de forma síncrona, entera y con su salto de línea. El
 * runner bloquea el bucle de eventos durante cada selftest (`spawnSync`), así que `console.log` podría
 * quedarse sin volcar detrás de una tubería hasta el final; una escritura síncrona hace que la línea aparezca
 * cuando acaba su selftest. Una escritura puede tomar MENOS bytes de los pedidos (el resto va en la siguiente
 * vuelta, en orden), y una tubería no bloqueante llena da `EAGAIN` (se reintenta tras una pausa corta, un
 * número acotado de veces, y luego se propaga). Cualquier otro error se propaga de inmediato.
 */

import { writeSync } from 'node:fs';

const RETRIES = 1000;
const PAUSE_MS = 1;

/**
 * @param {string} line The text, without its newline.
 * @param {{ write?: typeof writeSync, fd?: number, retries?: number }} [options] Injectable so a pipe that is
 *   full or takes partial writes, which no host produces on demand, can be fed to it.
 * @es `write`, `fd` y `retries` son inyectables para alimentar una tubería llena o con escrituras parciales.
 */
export function writeLineSync(line, { write = writeSync, fd = 1, retries = RETRIES } = {}) {
  const bytes = Buffer.from(`${line}\n`, 'utf8');
  let offset = 0;
  let refusals = 0;

  while (offset < bytes.length) {
    try {
      offset += write(fd, bytes, offset, bytes.length - offset);
    } catch (error) {
      refusals += 1;

      if (error?.code !== 'EAGAIN' || refusals > retries) throw error;

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PAUSE_MS);
    }
  }
}
