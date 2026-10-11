/**
 * Where a promoted lesson's stub is put in the ledger that keeps stubs: in the line the key already has
 * there, or at the end when it has none. A key therefore never has two stubs, even when a crash between the
 * two writes of a promotion left the full line AND an earlier stub behind.
 *
 * @es Dónde se pone el muñón de una lección promovida en el ledger que guarda muñones: en la línea que la
 * clave ya tiene allí, o al final si no tiene ninguna. Así una clave nunca tiene dos muñones, ni siquiera
 * cuando una caída entre las dos escrituras de una promoción dejó la línea completa Y un muñón anterior.
 */

/**
 * @param home the ledger that keeps stubs (`{ lines }`), `key` the lesson key, `line` the new stub,
 *   `readMarker` the line grammar's marker reader.
 * @returns `'replaced'` when the key already had a line in `home`, `'added'` otherwise.
 * @es `home` es el ledger que guarda muñones, `key` la clave de la lección, `line` el muñón nuevo y
 * `readMarker` el lector de marcadores de la gramática de línea.
 */
export function placeStub(home, key, line, readMarker) {
  const existing = home.lines.findIndex((candidate) => readMarker(candidate)?.key === key);

  if (existing === -1) {
    home.lines.push(line);

    return 'added';
  }

  home.lines[existing] = line;

  return 'replaced';
}
