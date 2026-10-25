/**
 * A route's writes as ONE transaction: the bytes of every file the route writes are kept before the first write
 * (`io.snapshot`) and put back (`io.restore`) when a write or the re-read throws, or when the re-read files fail the
 * proof, so a failure between two writes never leaves a lesson or a rule in two files, or in none. Every failure that
 * escapes is rethrown in both languages. Shared by the lesson route (`ledger-route.mjs`) and the rule-block route
 * (`rule-block.mjs`); the files and how they are written are the caller's (`io`).
 *
 * @es Las escrituras de una ruta como UNA transacción: los bytes de cada fichero que escribe la ruta se guardan antes
 * de la primera escritura (`io.snapshot`) y se reponen (`io.restore`) cuando una escritura o la relectura lanza, o
 * cuando los ficheros releídos no pasan la prueba, así un fallo entre dos escrituras nunca deja una lección o una regla
 * en dos ficheros, ni en ninguno. Todo fallo que escapa se relanza en los dos idiomas. La comparten la ruta de lección
 * y la ruta de bloque de regla; los ficheros y cómo se escriben son de quien llama (`io`).
 */

/** The text of a thrown value. @es El texto de un valor lanzado. */
const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * The bilingual error a route rethrows when a write threw: what failed, and whether the files were put back.
 * @es El error bilingüe que relanza una ruta cuando una escritura lanzó: qué falló y si los ficheros se repusieron.
 */
function writeFailure(cause, restoreFailure) {
  const english = restoreFailure === undefined
    ? `route FAILED while writing (${messageOf(cause)}); both files were restored to the bytes they had.`
    : `route FAILED while writing (${messageOf(cause)}), and restoring the files failed too (${messageOf(restoreFailure)}); check both files by hand.`;
  const spanish = restoreFailure === undefined
    ? `route FALLÓ al escribir (${messageOf(cause)}); ambos ficheros se restauraron a los bytes que tenían.`
    : `route FALLÓ al escribir (${messageOf(cause)}), y restaurar los ficheros también falló (${messageOf(restoreFailure)}); revisa ambos ficheros a mano.`;

  return new Error(`${english} @es ${spanish}`, { cause });
}

/**
 * The bilingual error a route throws when the written files were not proved and putting them back threw as well.
 * @es El error bilingüe que lanza una ruta cuando los ficheros escritos no se probaron y reponerlos también lanzó.
 */
function unprovedRestoreFailure(deficits, restoreFailure) {
  return new Error(`route FAILED: the route was not proved on the written files (${deficits.join(' | ')}), and restoring them failed too (${messageOf(restoreFailure)}); check both files by hand. @es route FALLÓ: la ruta no se probó en los ficheros escritos, y restaurarlos también falló (${messageOf(restoreFailure)}); revisa ambos ficheros a mano.`, { cause: restoreFailure });
}

/**
 * Runs `write`, then `prove` on what was written, as one transaction over `io`.
 * @param input `{ io, write, prove }` — `io` `{ snapshot(), restore(saved) }`; `write()` makes every write; `prove()`
 *   re-reads and returns `{ ok: true }` or `{ ok: false, deficits }`.
 * @returns the proof; on `ok: false` every file was restored. Throws, bilingual, after restoring, when a write or the
 *   re-read threw, or when a restore threw.
 * @es Ejecuta `write` y luego `prove` sobre lo escrito, como una transacción sobre `io`. Devuelve la prueba; con
 * `ok: false` cada fichero se restauró. Lanza, bilingüe y tras restaurar, cuando una escritura o la relectura lanzó, o
 * cuando una restauración lanzó.
 */
export function commitTransaction({ io, write, prove }) {
  const saved = io.snapshot();
  let proof;

  try {
    write();
    proof = prove();
  } catch (cause) {
    try {
      io.restore(saved);
    } catch (restoreFailure) {
      throw writeFailure(cause, restoreFailure);
    }

    throw writeFailure(cause);
  }

  if (!proof.ok) {
    try {
      io.restore(saved);
    } catch (restoreFailure) {
      throw unprovedRestoreFailure(proof.deficits, restoreFailure);
    }
  }

  return proof;
}
