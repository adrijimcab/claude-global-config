/**
 * The runtime messages of the guard precision report, as a table consumed through `bilingual-output/`: the
 * speaker refuses a table with a message that lacks a half, and renders every line English first with the
 * Spanish half marked `@es`. Placeholders are `{name}`.
 *
 * @es Los mensajes de ejecución del informe de precisión de guards, como una tabla consumida por
 * `bilingual-output/`: el speaker rechaza una tabla con un mensaje al que le falta una mitad, y renderiza cada
 * línea en inglés primero con la mitad española marcada `@es`. Los marcadores son `{name}`.
 */

export const MESSAGE_TABLE = {
  'row-ok': {
    en: '{mechanism}: {blocks} blocks, {dismissed} dismissed, {falsePositive} false positives, precision {percent}%, {unclassified} unclassified lines.',
    es: '{mechanism}: {blocks} bloqueos, {dismissed} descartados, {falsePositive} falsos positivos, precisión {percent} %, {unclassified} líneas sin clasificar.'
  },
  'row-insufficient': {
    en: '{mechanism}: {blocks} blocks, {dismissed} dismissed, {falsePositive} false positives, insufficient data (fewer than {minimum} blocks), {unclassified} unclassified lines.',
    es: '{mechanism}: {blocks} bloqueos, {dismissed} descartados, {falsePositive} falsos positivos, datos insuficientes (menos de {minimum} bloqueos), {unclassified} líneas sin clasificar.'
  },
  'row-no-data': {
    en: '{mechanism}: no data (0 blocks), {unclassified} unclassified lines.',
    es: '{mechanism}: sin datos (0 bloqueos), {unclassified} líneas sin clasificar.'
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
