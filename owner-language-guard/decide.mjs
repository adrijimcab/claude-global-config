/**
 * Decisión PURA del guard de idioma: ¿el turno le habló al dueño en inglés?
 *
 * Sin E/S, sin reloj, sin estado: recibe los textos del turno y devuelve el veredicto. Así lo puede
 * cargar en proceso el despachador por evento que otro agente está construyendo, y el selftest lo
 * ejercita sin transcript ni hook.
 *
 * Regla: se bloquea si ALGÚN párrafo de prosa visible (ver `prose.mjs`) está dominado por el inglés.
 * Un párrafo está dominado por el inglés cuando tiene al menos `MIN_ENGLISH_MARKERS` palabras
 * funcionales inglesas y esas son al menos `ENGLISH_SHARE` del total de marcadores de ambos idiomas.
 *
 * Justificación de los umbrales, MEDIDA con `replay.mjs` sobre la sesión real c45d798b (5029 párrafos
 * de prosa del orquestador, 2026-09-28):
 *   - La distribución es bimodal y sin solapamiento: 4960 párrafos en español tienen proporción
 *     inglesa 0,0; los 38 en inglés, 1,0. Entre medio hay DOS: 0,1 y 0,4, ambos en español (el de 0,4
 *     es una tabla que cita en cursiva un error de git en inglés). `ENGLISH_SHARE = 0,6` queda por
 *     encima del peor caso español medido (0,4) y muy por debajo del inglés (1,0), con margen de ambos
 *     lados para prosa que mezcle citas sin comillas.
 *   - `MIN_ENGLISH_MARKERS = 2`: el párrafo inglés más corto medido fue «Retry right away with the
 *     markers.» (2 marcadores) y la línea de progreso del requisito, «Running the real sync now.», suma
 *     3 (running, the, now). Con 1 alcanzaría una palabra inglesa suelta sin comillas dentro de una
 *     frase sin marcadores españoles. Límite asumido: «Done.» sola (1 marcador) no se detecta.
 */

import { tally } from './language.mjs';
import { proseParagraphs } from './prose.mjs';

/** Mínimo de marcadores ingleses en un párrafo: con uno solo, una palabra suelta citada sin comillas bastaría. */
export const MIN_ENGLISH_MARKERS = 2;

/** Proporción mínima de marcadores ingleses sobre el total de marcadores del párrafo. */
export const ENGLISH_SHARE = 0.6;

const EXCERPT_LENGTH = 160;

/** Veredicto de un párrafo: `{ english, spanish, isEnglish }`. */
export function classifyParagraph(words) {
  const { english, spanish } = tally(words);
  const isEnglish = english >= MIN_ENGLISH_MARKERS && english >= ENGLISH_SHARE * (english + spanish);

  return { english, spanish, isEnglish };
}

const excerptOf = (text) => (text.length <= EXCERPT_LENGTH ? text : `${text.slice(0, EXCERPT_LENGTH)}…`);

/** Los párrafos en inglés de todos los textos del turno, en orden: `{ excerpt, english, spanish }`. */
export function englishParagraphs(texts) {
  const findings = [];

  for (const text of texts) {
    for (const paragraph of proseParagraphs(text)) {
      const verdict = classifyParagraph(paragraph.words);

      if (verdict.isEnglish) findings.push({ excerpt: excerptOf(paragraph.text), english: verdict.english, spanish: verdict.spanish });
    }
  }

  return findings;
}

function reasonFor(findings) {
  const [first] = findings;
  const more = findings.length > 1 ? ` (y ${findings.length - 1} párrafo(s) más en inglés en este mismo turno)` : '';

  return [
    'GUARD DE IDIOMA DEL DUEÑO: este turno le habló al dueño EN INGLÉS.',
    '',
    `Fragmento en inglés${more}:`,
    `  «${first.excerpt}»`,
    '',
    'Regla vinculante: TODA línea dirigida al dueño va en español rioplatense con el tono Gentleman',
    '(memory/feedback-all-replies-in-spanish-gentleman.md, engram #923). Que una notificación, un log',
    'o el reporte de un subagente llegue en inglés NO cambia el idioma de la respuesta.',
    '',
    'Reescribí esa respuesta completa en español rioplatense, tono Gentleman. Los términos técnicos',
    '(commit, merge, build, gate, worktree…) pueden quedar; la prosa no. Lo que cites textual en inglés',
    'va entre comillas, en cita (>) o en bloque de código.'
  ].join('\n');
}

/**
 * @param input.texts Bloques de texto visibles del turno, en orden.
 * @param input.stopHookActive `stop_hook_active` del payload: si ya se bloqueó una vez, se deja pasar.
 * @returns `{ block: false }` o `{ block: true, reason, findings }`.
 */
export function decide({ texts, stopHookActive }) {
  if (stopHookActive === true) return { block: false };
  if (!Array.isArray(texts) || texts.length === 0) return { block: false };

  const findings = englishParagraphs(texts.filter((text) => typeof text === 'string'));

  if (findings.length === 0) return { block: false };

  return { block: true, reason: reasonFor(findings), findings };
}
