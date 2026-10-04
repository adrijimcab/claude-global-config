/**
 * The house form of a bilingual runtime message, and the proof that a table of them keeps both halves.
 * A message is `{ en, es }`; each half is one string, or an array of lines. Rendered, a one-line message
 * is `English. @es Español.` and a multi-line one is its English lines followed by the Spanish lines, each
 * marked `  @es`. A message names its data as `{name}` placeholders, filled from the call's parameters, so
 * the Spanish half cannot drift to say something the English half does not (`messageProblems` compares
 * their placeholders). Values a program parses (exit codes, JSON, keys) never pass through here.
 *
 * @es La forma de la casa de un mensaje de ejecución bilingüe, y la prueba de que una tabla de ellos
 * conserva las dos mitades. Un mensaje es `{ en, es }`; cada mitad es una cadena o un array de líneas.
 * Renderizado, uno de una línea es `English. @es Español.` y uno de varias son sus líneas en inglés seguidas
 * de las españolas, cada una marcada `  @es`. Un mensaje nombra sus datos como marcadores `{nombre}`,
 * rellenados desde los parámetros de la llamada, de modo que la mitad española no pueda decir algo que la
 * inglesa no dice (`messageProblems` compara sus marcadores). Los valores que un programa parsea (códigos
 * de salida, JSON, claves) nunca pasan por aquí.
 */

const NAME_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** A half as an array of lines. @es Una mitad como array de líneas. */
const linesOf = (half) => (Array.isArray(half) ? half : [half]);

/**
 * The `{name}` placeholders of `text`, in order of appearance. A brace group that is not a plain name (a
 * JSON example, say) is literal text, not a placeholder.
 * @es Los marcadores `{nombre}` de `text`, en orden de aparición. Un grupo entre llaves que no es un nombre simple es texto literal.
 */
export function placeholdersOf(text) {
  const names = [];

  for (let open = text.indexOf('{'); open !== -1; open = text.indexOf('{', open + 1)) {
    const close = text.indexOf('}', open);
    const name = close === -1 ? '' : text.slice(open + 1, close);

    if (name.length > 0 && [...name].every((character) => NAME_CHARACTERS.includes(character))) names.push(name);
  }

  return names;
}

/**
 * Fills the placeholders of one line from `params` in a single left-to-right pass, so a value that itself
 * looks like a placeholder is printed as it is, never filled again; a placeholder with no parameter throws.
 * @es Rellena los marcadores de una línea desde `params` en una sola pasada de izquierda a derecha, así un
 * valor que parece un marcador se imprime tal cual, nunca se rellena de nuevo; un marcador sin parámetro lanza.
 */
function fill(line, params) {
  const missing = placeholdersOf(line).filter((name) => !Object.hasOwn(params, name));

  if (missing.length > 0) throw new Error(`message parameter(s) not given: ${missing.join(', ')}. @es faltan parámetros del mensaje: ${missing.join(', ')}.`);

  let filled = '';
  let at = 0;

  for (let open = line.indexOf('{'); open !== -1; open = line.indexOf('{', at)) {
    const close = line.indexOf('}', open);
    const name = close === -1 ? '' : line.slice(open + 1, close);
    const isPlaceholder = name.length > 0 && Object.hasOwn(params, name) && [...name].every((character) => NAME_CHARACTERS.includes(character));

    filled += line.slice(at, isPlaceholder ? open : open + 1) + (isPlaceholder ? String(params[name]) : '');
    at = isPlaceholder ? close + 1 : open + 1;
  }

  return filled + line.slice(at);
}

/**
 * The text of a message in the house form, with its placeholders filled from `params`.
 * @es El texto de un mensaje en la forma de la casa, con sus marcadores rellenados desde `params`.
 */
export function render({ en, es }, params = {}) {
  const english = linesOf(en).map((line) => fill(line, params));
  const spanish = linesOf(es).map((line) => fill(line, params));

  if (english.length === 1 && spanish.length === 1) return `${english[0]} @es ${spanish[0]}`;

  return [...english, ...spanish.map((line) => `  @es ${line}`)].join('\n');
}

/**
 * What is wrong with a table of messages, as readable problems (empty when nothing is): a half missing or
 * empty, a Spanish half identical to the English one (an untranslated copy), and placeholders that differ
 * between the halves, so one language would show data the other omits.
 * @es Qué falla en una tabla de mensajes, como problemas legibles (vacío si nada): una mitad ausente o vacía, una mitad española idéntica a la inglesa y marcadores distintos entre las mitades.
 */
export function messageProblems(table) {
  const problems = [];

  for (const [id, message] of Object.entries(table)) {
    const english = linesOf(message?.en ?? []).join('\n');
    const spanish = linesOf(message?.es ?? []).join('\n');

    if (english.trim().length === 0 || spanish.trim().length === 0) {
      problems.push(`${id}: a half is missing or empty`);
      continue;
    }

    if (english === spanish) problems.push(`${id}: the Spanish half is a copy of the English one`);
    if ([...new Set(placeholdersOf(english))].sort().join() !== [...new Set(placeholdersOf(spanish))].sort().join()) problems.push(`${id}: the halves name different placeholders`);
  }

  return problems;
}
