/**
 * The runtime messages of the transcript index, as a table consumed through `bilingual-output/`: the speaker
 * refuses at load a table with a message that lacks a half, and renders every line English first with the
 * Spanish half marked `@es`. An id the table does not carry throws.
 *
 * @es Los mensajes de ejecución del índice de transcripts, como una tabla consumida por `bilingual-output/`:
 * el speaker rechaza al cargar una tabla con un mensaje al que le falta una mitad, y renderiza cada línea en
 * inglés primero con la mitad española marcada `@es`. Un id que la tabla no lleva lanza un error.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  'bad-transcript-argument': {
    en: 'A transcript path must be a non-empty string, got {value}.',
    es: 'La ruta de un transcript debe ser una cadena no vacía, se recibió {value}.'
  },
  'unreadable-transcript': {
    en: 'The transcript {file} does not exist or is not a regular file.',
    es: 'El transcript {file} no existe o no es un fichero regular.'
  }
};

/** The one-line bilingual text of a message of the table. @es El texto bilingüe de una línea de un mensaje de la tabla. */
export const { line: bilingual } = makeSpeaker(MESSAGE_TABLE);
