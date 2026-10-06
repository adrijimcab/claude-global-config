/**
 * Writing a ledger and trusting nothing about the write: the new text is written, READ BACK from disk, and
 * the old text is put back unless the disk holds exactly what was meant. Shared by every command that
 * rewrites a ledger line in place (`condense`, `supersede`), so none of them can trust a write the others
 * check.
 *
 * @es Escribir un ledger sin fiarse de la escritura: se escribe el texto nuevo, se RELEE de disco y se
 * restaura el viejo salvo que el disco tenga exactamente lo que se quería. Lo comparten todos los comandos
 * que reescriben una línea del ledger en su sitio (`condense`, `supersede`), así ninguno se fía de una
 * escritura que los demás comprueban.
 */

import { readFileSync, writeFileSync } from 'node:fs';

/** The real write, replaceable so a proof can make the disk lie. @es La escritura real, sustituible para que una prueba haga mentir al disco. */
export const writeText = (file, text) => writeFileSync(file, text, 'utf8');

/**
 * Writes `next` through `io.writeText`, reads it back, and restores `text` unless the file is exactly `next`.
 * @returns whether the file now holds `next`.
 * @es Escribe `next` con `io.writeText`, lo relee y restaura `text` salvo que el fichero sea exactamente `next`. Devuelve si el fichero tiene ahora `next`.
 */
export function writeVerified({ io, file, text, next }) {
  let onDisk;

  try {
    io.writeText(file, next);
    onDisk = readFileSync(file, 'utf8');
  } catch {
    onDisk = undefined;
  }

  if (onDisk === next) return true;

  writeFileSync(file, text, 'utf8');

  return false;
}
