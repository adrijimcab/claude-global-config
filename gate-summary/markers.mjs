/**
 * Finds the lines of a log that look like errors, and cuts the excerpt a verdict prints.
 * @es Halla las líneas de un log que parecen errores y corta el extracto que imprime un veredicto.
 */

const MARKER = /\b\w*(error|exception)s?\b|\b(failed|failure|fatal|panic)\b|ERR!/i;
const CLEAN_COUNT = /\b(0|no|zero) (errors?|failures?|failed)\b/i;
const LINE_WIDTH = 300;

/** Whether one log line is an error marker; "0 errors" is a clean count, not a marker. @es Si una línea es marca de error; «0 errors» es un recuento limpio. */
export const isMarker = (line) => MARKER.test(line) && !CLEAN_COUNT.test(line);

/** The lines of `text` that are error markers. @es Las líneas de `text` que son marcas de error. */
export const markerLines = (text) => text.split(/\r?\n/).filter(isMarker);

/**
 * The last `limit` lines of `lines`, each cut to a readable width. A failure's cause is at the end.
 * @es Las últimas `limit` líneas de `lines`, cortadas a un ancho legible. La causa de un fallo está al final.
 */
export const tail = (lines, limit) => (limit > 0 ? lines.slice(-limit) : []).map((line) => (line.length > LINE_WIDTH ? `${line.slice(0, LINE_WIDTH)}…` : line));
