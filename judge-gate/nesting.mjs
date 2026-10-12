/**
 * The marker of a run nested inside the gate's own model call. The gate sets it on the child; the gate reads it
 * to pass at once, so a hook that fires inside that child can never start another model call.
 *
 * @es La marca de una corrida anidada en la propia llamada al modelo de la compuerta. La compuerta la fija en el
 * hijo y la lee para pasar de inmediato: un hook que dispare dentro de ese hijo nunca inicia otra llamada.
 */

/** The environment variable. @es La variable de entorno. */
export const NESTED_VARIABLE = 'JUDGE_GATE_NESTED';

/** Whether this process runs nested. @es Si este proceso corre anidado. */
export const isNested = (env = process.env) => env[NESTED_VARIABLE] === '1';
