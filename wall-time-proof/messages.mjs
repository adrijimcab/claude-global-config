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

/** The fixed-sleep rule, as one sentence (key spec-waits-on-a-timer-not-a-condition). @es La regla de esperas fijas, en una frase. */
export const SLEEP_RULE =
  'A selftest waits for something to happen as a condition polled up to a deadline (a loop), never with a bare fixed sleep, which a loaded machine outlasts; a window that proves something did NOT happen fires an injected timer instead of sleeping. @es Un selftest espera a que algo pase como una condición sondeada hasta un plazo (un bucle), nunca con una pausa fija suelta, que una máquina cargada supera; una ventana que prueba que algo NO pasó dispara un timer inyectado en vez de dormir.';

/**
 * One finding line: where, and the rule. @es Una línea de hallazgo: dónde, y la regla.
 * @param {string} file @param {number} line
 */
export function findingMessage(file, line) {
  return `${file}:${String(line)} compares an elapsed wall time against a bound inside a check. ${RULE}`;
}

/**
 * One fixed-sleep finding line: where, and the rule. @es Una línea de hallazgo de espera fija: dónde, y la regla.
 * @param {string} file @param {number} line
 */
export function fixedSleepMessage(file, line) {
  return `${file}:${String(line)} sleeps a fixed time outside a loop. ${SLEEP_RULE}`;
}

/** The verdict line of a scan that found nothing / something. @es La línea de veredicto de un escaneo sin hallazgos / con hallazgos. */
export function summaryMessage(scanned, findings) {
  return findings === 0
    ? `${String(scanned)} selftest file(s) scanned, no elapsed wall time is asserted and no fixed sleep waits outside a loop. @es ${String(scanned)} fichero(s) de selftest escaneados, ningún tiempo de pared transcurrido se afirma y ninguna espera fija queda fuera de un bucle.`
    : `${String(findings)} wall-time finding(s) (an elapsed time asserted, or a fixed sleep) in ${String(scanned)} selftest file(s). @es ${String(findings)} hallazgo(s) de tiempo de pared (un tiempo transcurrido afirmado, o una espera fija) en ${String(scanned)} fichero(s) de selftest.`;
}
