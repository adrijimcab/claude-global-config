/**
 * Whether a brief DECLARES the tenancy of a checkout it names.
 *
 * THE SHAPE IS BORROWED, THE PROPERTY IS NOT. `brief-provenance` refuses a brief with no `MEASURED:`
 * line, and it checks PRESENCE: any text after the colon satisfies it. That is right for its question —
 * there is no machine that knows whether a number was measured — and it would be wrong here, because a
 * boilerplate `TENANCY: none` would satisfy every brief forever and the control would have no NO left to
 * give. So a declaration here is BOUND TO A PATH: the line must name the checkout it is declaring. An
 * author cannot pre-satisfy this in a template, because the template does not know which repository a
 * future brief will send a worker into.
 *
 * WHAT COUNTS AS NAMING THE CHECKOUT. The full path, or its last segment — `plugin-eslint`. The segment
 * is enough because it is the name the author would naturally write, and requiring the whole path would
 * refuse a correct declaration over a spelling difference, which is the near miss that cost
 * `brief-provenance` three real delegations before its marker check was re-aimed.
 *
 * THE MARKER MUST HEAD ITS OWN LINE, for the reason that guard measured and wrote down: a marker is a
 * HEADING, not a word inside a sentence, and `…as the TENANCY: line shows…` is prose. What sits between
 * the word and the colon is the author's — a qualifier, a date, a command.
 *
 * NO REGEX (M5): `startsWith`, `includes` and `trim` on literals, so a malformed brief can never be
 * silently skipped by a pattern that failed to match.
 *
 * @es Si un brief DECLARA la tenencia de un checkout que nombra. LA FORMA ESTÁ TOMADA DE
 * `brief-provenance`, LA PROPIEDAD NO: aquel comprueba PRESENCIA, y aquí un `TENANCY: none` de plantilla
 * satisfaría todos los briefs para siempre y el control se quedaría sin NO que dar. Por eso la
 * declaración va LIGADA A UNA RUTA: la línea debe nombrar el checkout que declara, y una plantilla no
 * puede anticiparlo porque no sabe a qué repositorio irá un brief futuro. Vale la ruta entera o su
 * último segmento. El marcador ENCABEZA su línea, por la razón que aquel guard midió.
 */

/** The marker word, matched literally. @es La palabra marcadora, casada literalmente. */
export const TENANCY_WORD = 'TENANCY';

/**
 * Rejects a marker that is merely the PREFIX of a longer word, so `TENANCYWISE:` cannot satisfy
 * `TENANCY`. Literal character-set membership, never a regex word boundary (M5).
 * @es Rechaza un marcador que solo es PREFIJO de otra palabra. Pertenencia literal a un conjunto.
 */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Leading characters that are LAYOUT rather than content, so a brief written as a markdown list
 * declares exactly as much as one written flat. It opens no hole: prose begins with a WORD.
 * @es Caracteres iniciales que son MAQUETACIÓN, no contenido. No abre agujero: la prosa empieza por
 * una PALABRA.
 */
const LIST_MARKUP = '-*+#>';

const isLead = (character) => LIST_MARKUP.includes(character) || character.trim() === '';

function stripLead(line) {
  let index = 0;

  while (index < line.length && isLead(line.charAt(index))) index += 1;

  return line.slice(index);
}

/** The last segment of a checkout path — the name an author writes. @es El último segmento de la ruta. */
export function checkoutName(checkout) {
  const segments = checkout.split('/').filter((segment) => segment.length > 0);

  return segments.length === 0 ? checkout : segments[segments.length - 1];
}

/**
 * How `text` declares the tenancy of `checkout`.
 *
 * @returns `'present'` when a `TENANCY` line carries a colon and names the checkout; `'unnamed'` when
 *   such a line exists but declares some OTHER checkout; `'no-colon'` when the word heads a line with no
 *   colon on it; `'buried'` when the word appears only inside a sentence; `'absent'` otherwise.
 * @es Cómo declara `text` la tenencia de `checkout`. Los cinco estados se distinguen porque el rechazo
 * los distingue: decir «falta» a quien escribió el marcador dos caracteres desviado es ocultarle el
 * hecho que hace obvio el arreglo.
 */
export function declarationOf(text, checkout) {
  const wanted = checkout.toLowerCase();
  const name = checkoutName(checkout).toLowerCase();
  let headsALine = false;
  let sawColon = false;

  for (const rawLine of text.split('\n')) {
    const line = stripLead(rawLine.split('\r').join(''));

    if (!line.startsWith(TENANCY_WORD)) continue;

    const rest = line.slice(TENANCY_WORD.length);

    if (rest.length > 0 && LETTERS.includes(rest.charAt(0))) continue;

    headsALine = true;

    if (!rest.includes(':')) continue;

    sawColon = true;

    const said = rest.toLowerCase();

    if (said.includes(wanted) || said.includes(name)) return 'present';
  }

  if (sawColon) return 'unnamed';
  if (headsALine) return 'no-colon';

  return text.includes(TENANCY_WORD) ? 'buried' : 'absent';
}
