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
import { findingMessage } from './messages.mjs';

/**
 * @param {string[]} files names to report, as the reader knows them @es nombres a informar, como los conoce el lector
 * @param {(file: string) => string} read the source of a file @es el fuente de un fichero
 * @returns {{ scanned: number, findings: { file: string, line: number, message: string }[] }}
 */
export function scanFiles(files, read) {
  const findings = files.flatMap((file) => elapsedAssertionLines(read(file)).map((line) => ({ file, line, message: findingMessage(file, line) })));

  return { scanned: files.length, findings };
}
