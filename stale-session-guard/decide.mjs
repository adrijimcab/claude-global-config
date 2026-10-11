/**
 * The decisions of the stale-session warning, pure: which registered groups a session lacks, whether a
 * process restart makes its baseline obsolete, and whether a lack was already warned. No file is read here.
 *
 * @es Las decisiones del aviso de sesión desactualizada, puras: qué grupos registrados le faltan a una
 * sesión, si un reinicio del proceso vuelve obsoleta su línea base y si una falta ya se avisó. Aquí no se lee
 * ningún fichero.
 */

import { createHash } from 'node:crypto';

/**
 * The groups of `current` (a Map by key) whose key is not in `baseline` (an array of keys): what the session
 * never loaded. A group the session had and that was later removed is not here.
 * @es Los grupos de `current` cuya clave no está en `baseline`: lo que la sesión nunca cargó. Uno que la
 * sesión tenía y se quitó después no está aquí.
 */
export function lackedGroups(baseline, current) {
  const known = new Set(baseline);

  return [...current.values()].filter((group) => !known.has(group.key));
}

/**
 * Whether the process behind the session was restarted since the baseline: both start markers are known and
 * differ. An unknown marker on either side is never a restart (no evidence).
 * @es Si el proceso de la sesión se reinició desde la línea base: ambas marcas de arranque se conocen y difieren.
 * Una marca desconocida de cualquier lado nunca es un reinicio (sin evidencia).
 */
export const processRestarted = (storedMarker, currentMarker) => typeof storedMarker === 'string' && typeof currentMarker === 'string' && storedMarker !== currentMarker;

/** A stable fingerprint of the lack, so the same lack is warned once. @es Huella estable de la falta, para avisar una vez. */
export const lackFingerprint = (lacked) => createHash('sha256').update(lacked.map((group) => group.key).sort().join('\n')).digest('hex');

/**
 * Whether to warn: there is a lack and its fingerprint is not the one already warned.
 * @es Si avisar: hay una falta y su huella no es la ya avisada.
 */
export const shouldWarn = (lacked, warnedFingerprint) => lacked.length > 0 && lackFingerprint(lacked) !== warnedFingerprint;
