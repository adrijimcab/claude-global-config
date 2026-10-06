/**
 * The runtime messages of the guard false-block rate report, as a table consumed through `bilingual-output/`:
 * the speaker refuses a table with a message that lacks a half, and renders every line English first with the
 * Spanish half marked `@es`. Placeholders are `{name}`.
 *
 * @es Los mensajes de ejecución del informe de tasa de falsos bloqueos de guards, como una tabla consumida
 * por `bilingual-output/`: el speaker rechaza una tabla con un mensaje al que le falta una mitad, y
 * renderiza cada línea en inglés primero con la mitad española marcada `@es`. Los marcadores son `{name}`.
 */

export const MESSAGE_TABLE = {
  'row-ok': {
    en: '{mechanism}: {blocks} blocks, {labelled} labelled, {falseBlocks} false, false-block rate {percent}% (95% interval {low}% to {high}%), {unclassified} unclassified lines.',
    es: '{mechanism}: {blocks} bloqueos, {labelled} etiquetados, {falseBlocks} falsos, tasa de falsos bloqueos {percent} % (intervalo del 95 % de {low} % a {high} %), {unclassified} líneas sin clasificar.'
  },
  'row-insufficient': {
    en: '{mechanism}: {blocks} blocks, {labelled} labelled, {falseBlocks} false, insufficient (fewer than {minimum} labelled blocks; label a sample with label.mjs), {unclassified} unclassified lines.',
    es: '{mechanism}: {blocks} bloqueos, {labelled} etiquetados, {falseBlocks} falsos, insuficiente (menos de {minimum} bloqueos etiquetados; etiqueta una muestra con label.mjs), {unclassified} líneas sin clasificar.'
  },
  orphans: {
    en: '{mechanism}: outcomes whose block does not exist, not counted: {ids}.',
    es: '{mechanism}: desenlaces de un bloqueo inexistente, no contados: {ids}.'
  },
  'unclassified-total': {
    en: '{count} lines of the guard journals could not be classified (not a v2 record with a blockId).',
    es: '{count} líneas de los journals de los guards no se pudieron clasificar (no son un registro v2 con blockId).'
  },
  'no-journals': {
    en: 'No guard journal was found.',
    es: 'No se encontró ningún journal de guards.'
  },
  'unknown-option': {
    en: 'Unknown option or argument "{option}"; usage: report.mjs [--json].',
    es: 'Opción o argumento desconocido «{option}»; uso: report.mjs [--json].'
  }
};
