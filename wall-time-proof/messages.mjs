/**
 * The words of the wall-time guard, English first and the Spanish mirror marked `@es`, in one place so the finding
 * and the rule it quotes cannot drift apart.
 * Guard key of the ledger: wall-time-asserted-as-concurrency-proof.
 *
 * @es Los textos del guard de tiempo de pared, inglés primero y el espejo en español marcado `@es`, en un solo
 * lugar para que el hallazgo y la regla que cita no se separen. Clave del ledger: wall-time-asserted-as-concurrency-proof.
 */

/** The rule, as one sentence. @es La regla, en una frase. */
export const RULE =
  'A selftest check must not compare an elapsed wall time (a difference of Date.now(), performance.now() or process.hrtime readings) against a bound: prove the ordering with a condition the proof controls (a release file, an injected clock, a counted event); a deadline that bounds waiting is fine. @es Un check de selftest no debe comparar un tiempo de pared transcurrido (diferencia de lecturas de Date.now(), performance.now() o process.hrtime) con una cota: el orden se prueba con una condición que la prueba controla (un fichero de liberación, un reloj inyectado, un evento contado); un plazo que acota una espera está bien.';

/**
 * One finding line: where, and the rule. @es Una línea de hallazgo: dónde, y la regla.
 * @param {string} file @param {number} line
 */
export function findingMessage(file, line) {
  return `${file}:${String(line)} compares an elapsed wall time against a bound inside a check. ${RULE}`;
}

/** The verdict line of a scan that found nothing / something. @es La línea de veredicto de un escaneo sin hallazgos / con hallazgos. */
export function summaryMessage(scanned, findings) {
  return findings === 0
    ? `${String(scanned)} selftest file(s) scanned, no elapsed wall time is asserted. @es ${String(scanned)} fichero(s) de selftest escaneados, ningún tiempo de pared transcurrido se afirma.`
    : `${String(findings)} elapsed-time assertion(s) in ${String(scanned)} selftest file(s). @es ${String(findings)} aserción(es) de tiempo transcurrido en ${String(scanned)} fichero(s) de selftest.`;
}
