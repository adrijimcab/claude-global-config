/**
 * Prosa visible de una respuesta: lo que el dueño LEE como redacción del orquestador, sin lo citado.
 *
 * Qué se descarta y por qué. El guard juzga el idioma en el que yo REDACTO, no el idioma de lo que
 * cito. Por eso fuera: bloques de código (``` y ~~~), código en línea (`…`), citas en bloque (líneas
 * que empiezan con >), texto entre comillas («…», “…”, "…"), y cada palabra que es en realidad un
 * identificador, una ruta, una URL o un número. Un log en inglés citado entre comillas no es una
 * respuesta en inglés; un párrafo en inglés sin comillas sí lo es.
 *
 * Unidad de salida: el PÁRRAFO (texto separado por línea en blanco). Se juzga párrafo a párrafo porque
 * un párrafo en inglés escondido dentro de una respuesta larga en español es exactamente uno de los
 * casos que hay que frenar, y un promedio sobre toda la respuesta lo diluiría.
 *
 * SIN REGEX, a propósito: una regex que no matchea SALTEA en silencio, que es el defecto que este
 * guard existe para cerrar. Todo es recorrido literal de caracteres.
 */

const FENCES = ['```', '~~~'];

/** Pares de apertura/cierre cuyo contenido es CITA, no redacción propia. */
const QUOTE_PAIRS = [
  ['`', '`'],
  ['«', '»'],
  ['“', '”'],
  ['"', '"']
];

/** Puntuación que envuelve una palabra y se recorta antes de clasificarla. */
const WRAPPING = new Set([...',.;:!?¡¿()[]{}*_#|~—–-…\'"“”«»‘’<>']);

const APOSTROPHES = new Set(["'", '’']);

const isLetter = (ch) => ch.toLowerCase() !== ch.toUpperCase();

/** Quita el contenido de cada par abierto-cerrado; un delimitador sin cierre se conserva como texto. */
function withoutDelimited(text, open, close) {
  let result = '';
  let at = 0;

  while (at < text.length) {
    const start = text.indexOf(open, at);

    if (start === -1) return result + text.slice(at);

    const end = text.indexOf(close, start + open.length);

    if (end === -1) return result + text.slice(at);

    result += `${text.slice(at, start)} `;
    at = end + close.length;
  }

  return result;
}

/** Párrafos de la respuesta fuera de bloques de código y de citas en bloque. */
function paragraphsOf(markdown) {
  const paragraphs = [];
  let current = [];
  let insideFence = false;

  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(' '));

    current = [];
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    const trimmed = line.trim();

    if (FENCES.some((fence) => trimmed.startsWith(fence))) {
      insideFence = !insideFence;
      flush();
      continue;
    }

    if (insideFence) continue;

    if (trimmed.length === 0) {
      flush();
      continue;
    }

    if (trimmed.startsWith('>')) continue;

    current.push(trimmed);
  }

  flush();

  return paragraphs;
}

/** Recorta la puntuación envolvente de un token separado por espacios. */
function unwrapped(token) {
  let start = 0;
  let end = token.length;

  while (start < end && WRAPPING.has(token[start])) start += 1;
  while (end > start && WRAPPING.has(token[end - 1])) end -= 1;

  return token.slice(start, end);
}

/**
 * La palabra de prosa que representa el token, en minúsculas, o `undefined` si el token no es prosa.
 *
 * Después de recortar la puntuación envolvente, un token de prosa tiene SOLO letras, apóstrofos y
 * guiones internos (cherry-pick). Eso deja afuera, sin listas aparte, toda ruta (/ \), URL (: /),
 * identificador con punto o guion bajo, comando, número y hash. Un identificador camelCase sí pasa,
 * pero en minúsculas nunca coincide con una palabra funcional, así que no suma para ningún idioma.
 */
function proseWordOf(token) {
  const core = unwrapped(token);

  if (core.length === 0) return undefined;
  if (![...core].every((ch) => isLetter(ch) || APOSTROPHES.has(ch) || ch === '-')) return undefined;

  return [...core].map((ch) => (APOSTROPHES.has(ch) ? "'" : ch)).join('').toLowerCase();
}

/** Palabras de prosa de un párrafo, sin código en línea ni texto entrecomillado. */
function proseWordsOf(paragraph) {
  const unquoted = QUOTE_PAIRS.reduce((text, [open, close]) => withoutDelimited(text, open, close), paragraph);
  const words = [];

  for (const token of unquoted.split(' ')) {
    for (const piece of token.split('\t')) {
      const word = proseWordOf(piece);

      if (word !== undefined) words.push(word);
    }
  }

  return words;
}

/**
 * Cada párrafo de prosa visible con sus palabras: `{ text, words }`. `text` es el párrafo original
 * (para citar un extracto en el rechazo); `words` es lo que se juzga.
 */
export function proseParagraphs(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];

  return paragraphsOf(markdown)
    .map((text) => ({ text, words: proseWordsOf(text) }))
    .filter(({ words }) => words.length > 0);
}
