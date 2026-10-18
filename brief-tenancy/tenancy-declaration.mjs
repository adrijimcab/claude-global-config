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
 * WHAT COUNTS AS NAMING THE CHECKOUT. The full path, or its last segment — `plugin-eslint` — written as
 * a WORD of the declaration, never as part of one (`declares` below says which words count). The segment
 * is enough because it is the name the author would naturally write, and requiring the whole path would
 * refuse a correct declaration over a spelling difference, which is the near miss that cost
 * `brief-provenance` three real delegations before its marker check was re-aimed.
 *
 * THE MARKER MUST HEAD ITS OWN LINE, for the reason that guard measured and wrote down: a marker is a
 * HEADING, not a word inside a sentence, and `…as the TENANCY: line shows…` is prose. What sits between
 * the word and the colon is the author's — a qualifier, a date, a command.
 *
 * NO REGEX (M5): `startsWith`, `includes`, `split` and `trim` on literals, so a malformed brief can never
 * be silently skipped by a pattern that failed to match.
 *
 * @es Si un brief DECLARA la tenencia de un checkout que nombra. LA FORMA ESTÁ TOMADA DE
 * `brief-provenance`, LA PROPIEDAD NO: aquel comprueba PRESENCIA, y aquí un `TENANCY: none` de plantilla
 * satisfaría todos los briefs para siempre y el control se quedaría sin NO que dar. Por eso la
 * declaración va LIGADA A UNA RUTA: la línea debe nombrar el checkout que declara, y una plantilla no
 * puede anticiparlo porque no sabe a qué repositorio irá un brief futuro. Vale la ruta entera o su
 * último segmento, escritos como PALABRA de la declaración, nunca como parte de una. El marcador ENCABEZA
 * su línea, por la razón que aquel guard midió.
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
 * The text after the marker on every line that HEADS a `TENANCY` marker, in order. The one place that
 * decides what a marker line is, so a second reader of tenancy lines (the errand identity of
 * `resume-before-fresh`) never grows a second parser.
 * @es El texto tras el marcador en cada línea que ENCABEZA un marcador `TENANCY`, en orden. El único sitio
 * que decide qué es una línea marcadora, para que un segundo lector (la identidad de encargo de
 * `resume-before-fresh`) no cree un segundo parser.
 */
export function tenancyLines(text) {
  const rests = [];

  for (const rawLine of text.split('\n')) {
    const line = stripLead(rawLine.split('\r').join(''));

    if (!line.startsWith(TENANCY_WORD)) continue;

    const rest = line.slice(TENANCY_WORD.length);

    if (rest.length > 0 && LETTERS.includes(rest.charAt(0))) continue;

    rests.push(rest);
  }

  return rests;
}

/**
 * What separates the words of a declaration: whitespace and the punctuation that wraps or lists a name.
 * A trailing period is trimmed apart (`trimPeriods`), because a period inside a path (`.claude`) is part
 * of it.
 * @es Lo que separa las palabras de una declaración: espacio en blanco y la puntuación que envuelve o
 * enumera un nombre. El punto final se recorta aparte, porque un punto dentro de una ruta es parte de ella.
 */
const WORD_SEPARATORS = ' \t,;()[]{}"\'`';

const BACKSLASH = '\\';

/**
 * Whether a word (already slash-spelled) is a CHECKOUT PATH: absolute — a drive letter and colon, or a
 * leading `/` or `~` — or holding a `worktrees` segment. Any other word with a slash is prose: a branch
 * name (`test/e2e-rescue-e5-e6`, measured 2026-10-18 crediting `e2e-rescue`) or a relative junction target
 * (`b100-am-ui/node_modules`). Decided on the shape of the word, never on the word before it, because
 * briefs are written in English and Spanish (`branch`, `rama`).
 * @es Si una palabra (ya escrita con barras) es una RUTA DE CHECKOUT: absoluta —letra de unidad y dos
 * puntos, o `/` o `~` al inicio— o con un segmento `worktrees`. Cualquier otra palabra con barra es prosa:
 * un nombre de rama (`test/e2e-rescue-e5-e6`, medido el 2026-10-18 acreditando `e2e-rescue`) o un destino
 * de junction relativo. Se decide por la forma de la palabra, nunca por la anterior, porque los briefs se
 * escriben en inglés y en español (`branch`, `rama`).
 */
function isPath(word) {
  const absolute = (LETTERS.includes(word.charAt(0)) && word.slice(1, 3) === ':/') || word.startsWith('/') || word.startsWith('~');

  return absolute || (word.includes('/') && word.split('/').includes('worktrees'));
}

function trimPeriods(word) {
  let trimmed = word;

  while (trimmed.endsWith('.')) trimmed = trimmed.slice(0, -1);

  return trimmed;
}

/**
 * The words of a declaration, lower-cased, with backslashes spelled as slashes so both path spellings
 * compare equal. An empty word can come out (two separators in a row, a lone period); it equals no
 * checkout name and is no path, so it declares nothing.
 * @es Las palabras de una declaración, en minúsculas y con las barras invertidas escritas como barras. Puede
 * salir una palabra vacía (dos separadores seguidos, un punto suelto): no es nombre de checkout ni ruta, así
 * que no declara nada.
 */
function wordsOf(declaration) {
  let spaced = declaration.toLowerCase().split(BACKSLASH).join('/');

  for (const separator of WORD_SEPARATORS) spaced = spaced.split(separator).join(' ');

  return spaced.split(' ').map(trimPeriods);
}

/**
 * Whether one declaration — the text after a marker's colon — names the checkout called `name`.
 *
 * A NAME IS A WORD, COMPARED BY EQUALITY. The reader used to test the whole line by substring, and so
 * credited every checkout the line mentioned anywhere: measured 2026-10-18 by the master session, the
 * line `TENANCY: you work ONLY in <…>/e2e-uc (branch test/e2e-rescue-e5-e6). Never … (chain, frame,
 * icons, net, pdt belong to other live writers).` declared every one of those names, `e2e-rescue`
 * included, and `net` would match `network`.
 *
 * A PATH, WHEN THE LINE HOLDS ONE, IS THE ONLY DECLARATION. It declares the checkout of its last segment
 * (which the full path also matches), and every bare word on that line is prose: an exclusion list, a
 * junction target. A line with no path declares by its bare words. `isPath` says what a path is.
 *
 * THE BOUNDS THAT REMAIN: a line with no path credits every bare name on it, even one the sentence
 * forbids (`TENANCY: e2e-uc; never chain` declares both) — write the checkout's path to make the rest
 * prose. And a line that names its checkout by a bare word but ALSO holds a path declares only the path
 * (`TENANCY: plugin-eslint — junction into C:/x/node_modules` does not declare plugin-eslint) — write
 * the checkout's own path, or keep that path off the line.
 *
 * @es Si una declaración —el texto tras los dos puntos del marcador— nombra el checkout llamado `name`.
 * UN NOMBRE ES UNA PALABRA, COMPARADA POR IGUALDAD: el lector probaba la línea entera por subcadena y
 * acreditaba todo checkout mencionado en ella (medido el 2026-10-18 por la sesión maestra: la lista de
 * exclusiones y el nombre de rama de un brief real salían declarados, y `net` casaría con `network`). UNA
 * RUTA, SI LA LÍNEA TIENE ALGUNA, ES LA ÚNICA DECLARACIÓN: declara el checkout de su último segmento, y
 * toda palabra suelta de esa línea es prosa. Una línea sin rutas declara por sus palabras sueltas. LÍMITES
 * QUE QUEDAN: una línea sin rutas acredita todo nombre suelto, aunque la frase lo prohíba
 * (`TENANCY: e2e-uc; never chain` declara ambos); y una línea que nombra su checkout con una palabra suelta
 * pero TAMBIÉN lleva una ruta declara solo la ruta. Escribe la ruta del propio checkout.
 */
function declares(declaration, name) {
  const words = wordsOf(declaration);
  const paths = words.filter(isPath);

  if (paths.length > 0) return paths.some((path) => checkoutName(path) === name);

  return words.includes(name);
}

/**
 * How `text` declares the tenancy of `checkout`.
 *
 * @returns `'present'` when a `TENANCY` line carries a colon and the text after it declares the
 *   checkout (see `declares`); `'unnamed'` when such a line exists but declares some OTHER checkout;
 *   `'no-colon'` when the word heads a line with no colon on it; `'buried'` when the word appears only
 *   inside a sentence; `'absent'` otherwise.
 * @es Cómo declara `text` la tenencia de `checkout`. Los cinco estados se distinguen porque el rechazo
 * los distingue: decir «falta» a quien escribió el marcador dos caracteres desviado es ocultarle el
 * hecho que hace obvio el arreglo.
 */
export function declarationOf(text, checkout) {
  const name = checkoutName(checkout.toLowerCase().split(BACKSLASH).join('/'));
  const rests = tenancyLines(text);
  const headsALine = rests.length > 0;
  let sawColon = false;

  for (const rest of rests) {
    const colon = rest.indexOf(':');

    if (colon === -1) continue;

    sawColon = true;

    if (declares(rest.slice(colon + 1), name)) return 'present';
  }

  if (sawColon) return 'unnamed';
  if (headsALine) return 'no-colon';

  return text.includes(TENANCY_WORD) ? 'buried' : 'absent';
}
