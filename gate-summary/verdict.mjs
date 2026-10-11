/**
 * The verdict of one finished command: which of the five states it is. KILLED and NOT-RUN are never
 * verdicts about the code, so they are kept apart from RED.
 * @es El veredicto de una orden terminada: cuál de los cinco estados es. KILLED y NOT-RUN nunca son un
 * veredicto sobre el código, por eso se separan de RED.
 */

export const VERDICTS = Object.freeze({ GREEN: 'GREEN', RED: 'RED', MARKS: 'GREEN-WITH-MARKS', KILLED: 'KILLED', NOT_RUN: 'NOT-RUN' });

/** The codes this tool returns when the command has none of its own. @es Los códigos que devuelve la herramienta cuando la orden no tiene propio. */
export const EXIT_KILLED = 124;
export const EXIT_NOT_RUN = 127;

/**
 * Classifies a finished run.
 * @param outcome `{ status, timedOut, error }` as `run-command.mjs` reports it.
 * @param markerCount How many marker lines the log holds.
 * @es Clasifica una corrida terminada.
 */
export function classify(outcome, markerCount) {
  if (outcome.error !== undefined) return VERDICTS.NOT_RUN;
  if (outcome.timedOut || outcome.status === null) return VERDICTS.KILLED;
  if (outcome.status !== 0) return VERDICTS.RED;

  return markerCount > 0 ? VERDICTS.MARKS : VERDICTS.GREEN;
}

/** The exit code to return: the command's own, or a fixed one when it has none. @es El código a devolver: el propio de la orden, o uno fijo si no tiene. */
export function exitCodeOf(verdict, outcome) {
  if (verdict === VERDICTS.NOT_RUN) return EXIT_NOT_RUN;

  return verdict === VERDICTS.KILLED ? EXIT_KILLED : outcome.status;
}
