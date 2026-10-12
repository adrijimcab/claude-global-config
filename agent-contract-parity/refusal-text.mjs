/**
 * The words of the parity refusal, bilingual, and the one function that turns a verdict into them. The table
 * goes through `bilingual-output/`, which refuses at load a message that lacks a half or whose halves disagree,
 * so no sentence of the guard can be English only.
 *
 * @es Las palabras del rechazo de paridad, bilingües, y la única función que convierte un veredicto en ellas.
 * La tabla pasa por `bilingual-output/`, que rechaza al cargar un mensaje al que le falta una mitad o cuyas
 * mitades no coinciden, así que ninguna frase del guard puede ser solo inglés.
 */

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { ANCHORS_FILE } from './anchors-file.mjs';

/** The messages. Placeholders are `{name}`. @es Los mensajes; los marcadores son `{name}`. */
export const MESSAGE_TABLE = {
  'drift-header': {
    en: 'AGENT-CONTRACT PARITY REFUSED: the two contracts of this project do not carry the same rules.',
    es: 'PARIDAD DE CONTRATO RECHAZADA: los dos contratos de este proyecto no llevan las mismas reglas.'
  },
  'missing-english': {
    en: 'Missing from the English contract: {anchors}',
    es: 'Faltan en el contrato en inglés: {anchors}'
  },
  'missing-spanish': {
    en: 'Missing from the Spanish contract: {anchors}',
    es: 'Faltan en el contrato en español: {anchors}'
  },
  'embedded-english': {
    en: 'In the English contract these appear only inside a longer token, which does not count (M1 inside M10 is not M1): {anchors}',
    es: 'En el contrato en inglés estos aparecen solo dentro de un token más largo, y eso no cuenta (M1 dentro de M10 no es M1): {anchors}'
  },
  'embedded-spanish': {
    en: 'In the Spanish contract these appear only inside a longer token, which does not count (M1 inside M10 is not M1): {anchors}',
    es: 'En el contrato en español estos aparecen solo dentro de un token más largo, y eso no cuenta (M1 dentro de M10 no es M1): {anchors}'
  },
  'drift-footer': {
    en: 'A rule added to one contract must be added to the other, in its own language. Fix, then retry. The anchors are declared in {file}.',
    es: 'Una regla añadida a un contrato debe añadirse al otro, en su idioma. Corregí y reintentá. Los anchors se declaran en {file}.'
  },
  'invalid-header': {
    en: 'AGENT-CONTRACT PARITY NOT MEASURED: {file} is not a valid declaration, so nothing was compared.',
    es: 'PARIDAD DE CONTRATO SIN MEDIR: {file} no es una declaración válida, así que no se comparó nada.'
  },
  'invalid-problem': {
    en: 'Problem: {problem}',
    es: 'Problema: {problem}'
  },
  'invalid-footer': {
    en: 'Fix the file (or delete it to opt the project out of the check), then retry.',
    es: 'Corregí el fichero (o borralo para que el proyecto no participe del chequeo) y reintentá.'
  }
};

const { line } = makeSpeaker(MESSAGE_TABLE);

/**
 * The refusal text for a `drift` or `invalid` verdict, or `undefined` for any other.
 * @es El texto del rechazo para un veredicto `drift` o `invalid`, o `undefined` para cualquier otro.
 */
export function refusalReason(verdict) {
  if (verdict.status === 'invalid') return [line('invalid-header', { file: ANCHORS_FILE }), ...verdict.problems.map((problem) => line('invalid-problem', { problem })), line('invalid-footer')].join('\n');

  if (verdict.status !== 'drift') return undefined;

  const sides = [
    ['missing-english', verdict.missingInEnglish],
    ['embedded-english', verdict.embeddedInEnglish],
    ['missing-spanish', verdict.missingInSpanish],
    ['embedded-spanish', verdict.embeddedInSpanish]
  ].filter(([, anchors]) => anchors.length > 0);

  return [line('drift-header'), ...sides.map(([id, anchors]) => line(id, { anchors: anchors.join(', ') })), line('drift-footer', { file: ANCHORS_FILE })].join('\n');
}
