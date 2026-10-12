/**
 * The ROUTE line of a delegation brief: its exact grammar, and what a brief's text says about it.
 *
 *   ROUTE: direct
 *   ROUTE: tracked-odd <feature-name>
 *
 * The line heads its own line (indentation, list bullets and heading marks before it are layout, the same
 * layout the MEASURED and HYPOTHESIS markers tolerate), the word is `ROUTE` in capitals followed at once by a
 * colon, and the value is one of the two forms above and nothing else: no trailing reason, no quotes. A worker
 * has to be able to PARSE the line, and a value with a free-text tail is a value two workers read differently.
 * `<feature-name>` is the stem of the feature document `odd/tasks/<feature-name>.md` and of its engram mirror
 * `odd/<feature-name>/tasks`: lowercase words of letters and digits joined by single hyphens, 64 characters at
 * most. The CHOICE between the two forms is the orchestrator's; nothing here looks at the size or risk of the
 * work, and nothing here guesses.
 *
 * States of a brief: `present` (exactly one well-formed ROUTE line), `absent` (no ROUTE anywhere), `buried`
 * (`ROUTE:` appears but not as a line heading), `malformed` (a line heads with ROUTE and its form is wrong; the
 * line is carried) and `multiple` (more than one ROUTE line: a worker cannot follow two routes).
 *
 * NO REGEX (M5): a pattern that fails to match skips silently. Every test is `startsWith`, `includes`, `===`,
 * `trim` and character-set membership on literals.
 *
 * @es La línea ROUTE de un brief de delegación: su gramática exacta y lo que dice el texto de un brief sobre
 * ella. `ROUTE: direct` o `ROUTE: tracked-odd <nombre-de-feature>`. La línea encabeza su propia línea
 * (sangría, viñetas y marcas de título antes son maquetación, la misma que toleran los marcadores MEASURED y
 * HYPOTHESIS), la palabra es `ROUTE` en mayúsculas seguida de inmediato por dos puntos, y el valor es una de
 * las dos formas y nada más: sin motivo al final, sin comillas. Un worker tiene que poder PARSEAR la línea.
 * `<nombre-de-feature>` es el nombre del documento `odd/tasks/<nombre>.md` y de su espejo en engram: palabras en
 * minúscula de letras y dígitos unidas por guiones simples, 64 caracteres como máximo. ELEGIR entre las dos
 * formas es del orquestador; aquí nada mira el tamaño ni el riesgo del trabajo, y nada adivina. Estados:
 * `present`, `absent`, `buried`, `malformed` (se lleva la línea) y `multiple`.
 */

import { stripLead } from '../brief-provenance/provenance.mjs';

/** The word that heads the line. @es La palabra que encabeza la línea. */
export const ROUTE_WORD = 'ROUTE';

/** The two route values. @es Los dos valores de ruta. */
export const DIRECT = 'direct';
export const TRACKED_ODD = 'tracked-odd';

/** The longest feature name. @es El nombre de feature más largo. */
export const MAX_FEATURE_NAME_LENGTH = 64;

const LOWER_AND_DIGITS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Whether `name` is a feature name: words of lowercase letters and digits joined by single hyphens. @es Si `name` es un nombre de feature. */
export function isFeatureName(name) {
  if (name.length > MAX_FEATURE_NAME_LENGTH) return false;

  return name.split('-').every((word) => word.length > 0 && [...word].every((character) => LOWER_AND_DIGITS.includes(character)));
}

/**
 * The parsed value of a ROUTE line, or `undefined` when its form is wrong. `value` is what follows the colon,
 * trimmed.
 * @es El valor parseado de una línea ROUTE, o `undefined` si su forma es errónea. `value` es lo que sigue a los dos puntos, recortado.
 * @returns {{ route: 'direct' } | { route: 'tracked-odd', feature: string } | undefined}
 */
export function parseRouteValue(value) {
  if (value === DIRECT) return { route: DIRECT };

  const prefix = `${TRACKED_ODD} `;

  if (!value.startsWith(prefix)) return undefined;

  const feature = value.slice(prefix.length);

  return isFeatureName(feature) ? { route: TRACKED_ODD, feature } : undefined;
}

/** The lines of `text` that head with ROUTE, each as the trimmed line after the layout. @es Las líneas de `text` que empiezan con ROUTE, ya recortadas tras la maquetación. */
function headingLines(text) {
  return text
    .split('\n')
    .map((rawLine) => stripLead(rawLine).trim())
    .filter((line) => line.startsWith(ROUTE_WORD) && !continuesTheWord(line.charAt(ROUTE_WORD.length)));
}

/** Whether `character` extends the word before it (`ROUTES`, `ROUTED`); the end of the line does not. @es Si `character` alarga la palabra anterior; el fin de línea no. */
const continuesTheWord = (character) => character !== '' && LETTERS.includes(character);

/**
 * What a brief's text says about its route.
 * @es Lo que dice el texto de un brief sobre su ruta.
 * @param {string} text
 * @returns {{ state: 'present', route: 'direct' } | { state: 'present', route: 'tracked-odd', feature: string } | { state: 'absent' } | { state: 'buried' } | { state: 'malformed', line: string } | { state: 'multiple', lines: string[] }}
 */
export function inspectRoute(text) {
  const headings = headingLines(text);

  if (headings.length === 0) return { state: text.includes(`${ROUTE_WORD}:`) ? 'buried' : 'absent' };
  if (headings.length > 1) return { state: 'multiple', lines: headings };

  const [line] = headings;
  const prefix = `${ROUTE_WORD}:`;
  const parsed = line.startsWith(prefix) ? parseRouteValue(line.slice(prefix.length).trim()) : undefined;

  return parsed === undefined ? { state: 'malformed', line } : { state: 'present', ...parsed };
}
