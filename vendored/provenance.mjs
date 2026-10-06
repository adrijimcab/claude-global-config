/**
 * Proves every vendored module is still exactly what was vendored, and that its source has not moved on.
 * `vendored.mjs check` is its only command line; this module holds the findings so they can be tested on
 * constructed roots.
 *
 * Two findings, both failures:
 *   - EDITED IN THE KIT: the vendored file's hash differs from the one `sync` recorded. The install forked a
 *     module whose behaviour is proven only by its owner's selftests.
 *   - SOURCE MOVED ON: the owner's file exists and its hash differs from the recorded one. The install runs
 *     an older copy than its owner; re-run `vendored.mjs sync` and the selftests.
 * A copy that is MISSING fails as well. An owner file that is ABSENT (the b100 checkout is not on this
 * machine) is reported, never a failure: the recorded hash still proves the copy is untouched.
 *
 * @es Prueba que cada módulo vendorizado sigue siendo exactamente lo vendorizado y que su fuente no avanzó.
 * `vendored.mjs check` es su única línea de órdenes. EDITADO EN EL KIT, FUENTE AVANZADA o FALTA EN EL KIT son
 * fallos; una fuente AUSENTE se informa, no falla.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The sha256 of a file's bytes, hex. @es El sha256 de los bytes de un fichero. */
export const sha256Of = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/**
 * The findings for a provenance record against the two roots, both required: no root is guessed.
 * @returns `{ failures: string[], notes: string[] }`.
 * @es Los hallazgos de un registro de procedencia contra las dos raíces, ambas obligatorias.
 */
export function provenanceFindings(record, { vendorRoot, sourceRoot }) {
  const failures = [];
  const notes = [];

  for (const { path: relative, sha256 } of record.files) {
    const vendored = path.join(vendorRoot, relative);
    const source = path.join(sourceRoot, relative);

    if (!existsSync(vendored)) failures.push(`MISSING IN THE KIT  ${relative} @es FALTA EN EL KIT`);
    else if (sha256Of(vendored) !== sha256) failures.push(`EDITED IN THE KIT   ${relative} @es EDITADO EN EL KIT`);

    if (!existsSync(source)) notes.push(`source absent       ${relative} @es fuente ausente`);
    else if (sha256Of(source) !== sha256) failures.push(`SOURCE MOVED ON     ${relative} — run vendored/vendored.mjs sync, then the selftests @es la fuente avanzó: correr vendored/vendored.mjs sync y luego los selftests`);
  }

  return { failures, notes };
}
