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
  }
};

/** The one-line bilingual text of a message of the table. @es El texto bilingüe de una línea de un mensaje de la tabla. */
export const { line: bilingual } = makeSpeaker(MESSAGE_TABLE);
