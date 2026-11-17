/**
 * Scans a set of selftest files for elapsed-time assertions. The file list and the reader are injected, so the
 * scan knows nothing about git or the disk: `tree.selftest.mjs` hands it the tree's own selftest population and
 * the real reader, and the proofs hand it constructed sources.
 *
 * @es Escanea un conjunto de ficheros de selftest en busca de aserciones de tiempo transcurrido. La lista de
 * ficheros y el lector se inyectan, así que el escaneo no sabe de git ni del disco: `tree.selftest.mjs` le da la
 * población de selftests del árbol y el lector real, y las pruebas le dan fuentes construidos.
 */

import { elapsedAssertionLines } from './check-calls.mjs';
import { fixedSleepLines } from './fixed-sleeps.mjs';
import { findingMessage, fixedSleepMessage } from './messages.mjs';

/**
 * Both rules: elapsed wall time asserted against a bound, and a fixed sleep outside a loop.
 * @es Las dos reglas: tiempo de pared afirmado contra una cota, y una espera fija fuera de un bucle.
 * @param {string[]} files names to report, as the reader knows them @es nombres a informar, como los conoce el lector
 * @param {(file: string) => string} read the source of a file @es el fuente de un fichero
 * @returns {{ scanned: number, findings: { file: string, line: number, message: string }[] }}
 */
export function scanFiles(files, read) {
  const findings = files.flatMap((file) => {
    const source = read(file);

    return [
      ...elapsedAssertionLines(source).map((line) => ({ file, line, message: findingMessage(file, line) })),
      ...fixedSleepLines(source).map((line) => ({ file, line, message: fixedSleepMessage(file, line) })),
    ];
  });

  return { scanned: files.length, findings };
}
