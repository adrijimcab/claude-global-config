/**
 * The lexical structure of a JavaScript source: it turns text into tokens and says where strings, template
 * literals, comments and regular expression literals begin and end, so nothing that merely MENTIONS a clock
 * (a message, a comment, a pattern) is ever read as code. There is no parser package in this tree, so this is the
 * parser's first layer, written small: it knows nothing about meaning.
 *
 * Token kinds: `word` (identifier or keyword), `number`, `string` (a string or one chunk of a template literal,
 * text dropped), `regex` (text dropped) and `punct`. A template literal's `${ ... }` is emitted as the code it is:
 * its braces become the punctuation `(` and `)` flagged `synthetic`, so an expression inside a template never merges
 * with the code around it. A `/` is a division after a value and a regular expression elsewhere, decided from the
 * previous token (the usual rule; `if (x) /re/.test(y)` is the one shape it reads as a division).
 *
 * @es La estructura léxica de un fuente JavaScript: convierte texto en tokens y dice dónde empiezan y acaban las
 * cadenas, las plantillas, los comentarios y las expresiones regulares, así que nada que solo MENCIONE un reloj
 * (un mensaje, un comentario, un patrón) se lee como código. No hay paquete de parser en este árbol: esta es la
 * primera capa de un parser, escrita pequeña y sin conocer el significado. Las `${ ... }` de una plantilla salen
 * como el código que son: sus llaves pasan a ser `(` y `)` marcados `synthetic`. Una `/` es división tras un
 * valor y expresión regular en otro caso, según el token anterior.
 */

/** Words after which a `/` starts a regular expression. @es Palabras tras las que una `/` abre una expresión regular. */
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/** Punctuation after which a `/` is a division. @es Puntuación tras la que una `/` es una división. */
const VALUE_END = new Set([')', ']', '}', '++', '--']);

/** Operators of more than one character, longest first. @es Operadores de más de un carácter, el más largo primero. */
const OPERATORS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];

const IDENTIFIER_START = /[\p{L}_$]/u;
const IDENTIFIER_PART = /[\p{L}\p{N}_$]/u;
const DIGIT = /[0-9]/;

/**
 * Splits a source into tokens, each with the line it starts on.
 * @es Parte un fuente en tokens, cada uno con la línea en que empieza.
 * @param {string} source
 * @returns {{ kind: string, text: string, line: number, synthetic?: boolean }[]}
 */
export function tokenize(source) {
  const tokens = [];
  const templateBraces = [];
  let index = 0;
  let line = 1;

  const push = (kind, text, extra = {}) => tokens.push({ kind, text, line, ...extra });

  /** Reads a quoted string from its opening quote. @es Lee una cadena entre comillas desde su comilla de apertura. */
  function skipString(quote) {
    index += 1;

    while (index < source.length && source[index] !== quote && source[index] !== '\n') index += source[index] === '\\' ? 2 : 1;

    index += 1;
  }

  /** Reads template text up to the closing backtick or a `${`; true when an expression follows. @es Lee texto de plantilla hasta el cierre o un `${`; verdadero si sigue una expresión. */
  function skipTemplateText() {
    while (index < source.length) {
      const character = source[index];

      if (character === '`') {
        index += 1;

        return false;
      }

      if (character === '$' && source[index + 1] === '{') {
        index += 2;

        return true;
      }

      if (character === '\n') line += 1;

      index += character === '\\' ? 2 : 1;
    }

    return false;
  }

  /** Pushes one template chunk and, when an expression follows, its opening parenthesis. @es Empuja un trozo de plantilla y, si sigue una expresión, su paréntesis de apertura. */
  function templateChunk() {
    const startLine = line;
    const expression = skipTemplateText();

    tokens.push({ kind: 'string', text: '', line: startLine });

    if (expression) {
      push('punct', '(', { synthetic: true });
      templateBraces.push(0);
    }
  }

  /** Whether a `/` here starts a regular expression. @es Si una `/` aquí abre una expresión regular. */
  function slashStartsRegex() {
    const previous = tokens.at(-1);

    if (previous === undefined) return true;
    if (previous.kind === 'punct') return !VALUE_END.has(previous.text);
    if (previous.kind === 'word') return REGEX_KEYWORDS.has(previous.text);

    return false;
  }

  /** Skips a regular expression literal, honouring escapes and character classes. @es Salta una expresión regular, con escapes y clases de caracteres. */
  function skipRegex() {
    let inClass = false;

    index += 1;

    while (index < source.length && source[index] !== '\n') {
      const character = source[index];

      if (character === '\\') {
        index += 2;
        continue;
      }

      if (character === '[') inClass = true;
      else if (character === ']') inClass = false;
      else if (character === '/' && !inClass) break;

      index += 1;
    }

    index += 1;

    while (index < source.length && IDENTIFIER_PART.test(source[index])) index += 1;
  }

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '\n') {
      line += 1;
      index += 1;
    } else if (character === ' ' || character === '\t' || character === '\r') {
      index += 1;
    } else if (character === '#' && next === '!' && index === 0) {
      while (index < source.length && source[index] !== '\n') index += 1;
    } else if (character === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
    } else if (character === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;

      for (let at = index; at < stop; at += 1) if (source[at] === '\n') line += 1;

      index = stop;
    } else if (character === "'" || character === '"') {
      const startLine = line;

      skipString(character);
      tokens.push({ kind: 'string', text: '', line: startLine });
    } else if (character === '`') {
      index += 1;
      templateChunk();
    } else if (character === '}' && templateBraces.length > 0 && templateBraces.at(-1) === 0) {
      templateBraces.pop();
      index += 1;
      push('punct', ')', { synthetic: true });
      templateChunk();
    } else if (DIGIT.test(character) || (character === '.' && DIGIT.test(next ?? ''))) {
      const startLine = line;
      const begin = index;

      index += 1;

      while (index < source.length && /[0-9a-zA-Z_.]/.test(source[index])) index += 1;

      tokens.push({ kind: 'number', text: source.slice(begin, index), line: startLine });
    } else if (IDENTIFIER_START.test(character)) {
      const begin = index;

      while (index < source.length && IDENTIFIER_PART.test(source[index])) index += 1;

      push('word', source.slice(begin, index));
    } else if (character === '/' && slashStartsRegex()) {
      const startLine = line;

      skipRegex();
      tokens.push({ kind: 'regex', text: '', line: startLine });
    } else {
      const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index)) ?? character;

      if (templateBraces.length > 0) {
        if (operator === '{') templateBraces[templateBraces.length - 1] += 1;
        else if (operator === '}') templateBraces[templateBraces.length - 1] -= 1;
      }

      index += operator.length;
      push('punct', operator);
    }
  }

  return tokens;
}
