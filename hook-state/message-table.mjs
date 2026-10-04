/**
 * The runtime messages of the hook-state module, as a table consumed through `bilingual-output/`: the
 * speaker refuses a table with a message that lacks a half at load, and renders every line English first
 * with the Spanish half marked `@es`. An id the table does not carry throws.
 *
 * @es Los mensajes de ejecución del módulo hook-state, como una tabla consumida por `bilingual-output/`: el
 * speaker rechaza al cargar una tabla con un mensaje al que le falta una mitad, y renderiza cada línea en
 * inglés primero con la mitad española marcada `@es`. Un id que la tabla no lleva lanza un error.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  'unknown-kind': {
    en: 'Unknown journal record kind "{kind}"; allowed kinds: {allowed}.',
    es: 'Tipo de registro de journal desconocido «{kind}»; tipos permitidos: {allowed}.'
  },
  'bad-field': {
    en: 'Journal record field "{field}" is missing or has the wrong type ({expected}).',
    es: 'El campo «{field}» del registro de journal falta o tiene un tipo erróneo ({expected}).'
  },
  'bad-mechanism': {
    en: 'A mechanism name must be a plain name (letters, digits, "-" and "_"), got {value}.',
    es: 'El nombre de un mecanismo debe ser un nombre simple (letras, dígitos, «-» y «_»), se recibió {value}.'
  },
  'fires-corrupt': {
    en: 'The fires counter {file} is not a valid counter and was left untouched.',
    es: 'El contador de disparos {file} no es un contador válido y se dejó intacto.'
  },
  dismissed: {
    en: 'Block {blockId} of {mechanism} dismissed; it is lifted.',
    es: 'Bloqueo {blockId} de {mechanism} descartado; queda levantado.'
  },
  'false-positive-recorded': {
    en: 'False positive reported for block {blockId} of {mechanism}; the block stays in force.',
    es: 'Falso positivo informado para el bloqueo {blockId} de {mechanism}; el bloqueo sigue vigente.'
  },
  'missing-argument': {
    en: 'Option {option} is required and needs a non-empty value.',
    es: 'La opción {option} es obligatoria y necesita un valor no vacío.'
  },
  'unknown-option': {
    en: 'Unknown option or argument "{option}"; usage: dismiss.mjs --mechanism <name> --block <id> --reason <text> [--false-positive].',
    es: 'Opción o argumento desconocido «{option}»; uso: dismiss.mjs --mechanism <nombre> --block <id> --reason <texto> [--false-positive].'
  },
  'already-dismissed': {
    en: 'Block {blockId} of {mechanism} is already dismissed; a dismissal is recorded once.',
    es: 'El bloqueo {blockId} de {mechanism} ya está descartado; un descarte se registra una sola vez.'
  },
  'write-failed': {
    en: 'The entry could not be recorded: {detail}.',
    es: 'No se pudo registrar la entrada: {detail}.'
  }
};

/** The one-line bilingual text of a message of the table. @es El texto bilingüe de una línea de un mensaje de la tabla. */
export const { line: bilingual } = makeSpeaker(MESSAGE_TABLE);
