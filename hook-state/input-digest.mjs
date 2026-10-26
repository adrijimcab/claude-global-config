/**
 * The digest policy every journal of this install records an input under: the sha256 hex of a string, or of
 * the JSON of anything else. The hook journal (`journal.mjs`, which re-exports it) correlates its records by
 * this digest, and a module that keeps a journal of its own (the eval-guard denials, the rotation that redacts
 * them) digests with the same policy without depending on the hook journal and its record kinds.
 *
 * @es La política de digest con que todo journal de esta instalación registra una entrada: el sha256 hex de una
 * cadena, o del JSON de cualquier otra cosa. El journal de hooks (`journal.mjs`, que la reexporta) correlaciona
 * sus registros por este digest, y un módulo con journal propio (las denegaciones de eval-guard, la rotación que
 * las redacta) usa la misma política sin depender del journal de hooks ni de sus tipos de registro.
 */

import { createHash } from 'node:crypto';

/** The sha256 hex digest of an input (a string, or the JSON of anything else). @es El sha256 hex de una entrada. */
export function digestInput(input) {
  return createHash('sha256').update(typeof input === 'string' ? input : JSON.stringify(input)).digest('hex');
}
