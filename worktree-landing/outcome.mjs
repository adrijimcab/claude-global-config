/**
 * The exit codes of a landing and the refusal that carries one: 0 landed (or ready, in check mode),
 * 1 verification red, 2 refused precondition or git failure.
 *
 * @es Los códigos de salida de un aterrizaje y el rechazo que lleva uno: 0 aterrizado (o listo, en modo
 * comprobación), 1 verificación en rojo, 2 precondición rechazada o fallo de git.
 */

export const EXIT_LANDED = 0;
export const EXIT_VERIFICATION_RED = 1;
export const EXIT_REFUSED = 2;

/**
 * Stops a landing. `reason` is a stable machine id (never translated); `lines` are the bilingual
 * explanation printed under it.
 * @es Detiene un aterrizaje. `reason` es un identificador estable (no se traduce); `lines` es la
 * explicación bilingüe que se imprime debajo.
 */
export class Refusal extends Error {
  /**
   * @param {string} reason
   * @param {string[]} lines
   * @param {number} [exitCode]
   */
  constructor(reason, lines, exitCode = EXIT_REFUSED) {
    super(`${reason}: ${lines[0] ?? ''}`);
    this.reason = reason;
    this.lines = lines;
    this.exitCode = exitCode;
  }
}
