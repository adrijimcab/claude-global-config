/**
 * Which outcome kinds of the hook journal (`journal.mjs` `KINDS`) some module READS, which some module WRITES,
 * and the kinds that are read but written by no non-test module: a reader waiting for a record nothing produces.
 *
 * WHY. `guard-precision` reads `decision` records to count the blocks a human later labels. A reader whose
 * kind no module writes passes every selftest, because each side is proven against records the TEST writes:
 * nothing asks "does a real module produce what this module consumes?". This scan asks it, from the source, so
 * a kind with a reader and no producer turns a selftest red.
 *
 * HOW, PRECISELY. The source is TOKENIZED (comments, strings, templates and regular expressions are single
 * tokens or nothing), never searched as text, so a kind named in a comment or a string is neither a write nor a
 * read. A WRITE is a call of the journal's `appendRecord` (imported from `journal.mjs`, under any alias, or
 * bound to another name by `x = appendRecord`, which is how a test seam is spelled) whose argument holds a
 * `kind:` property; its value is read as a string, a ternary of values, or a constant of the same module
 * (a string, or an object whose VALUES are strings, indexed by anything). A READ is a comparison of a `.kind`
 * member with a string (`record.kind === 'decision'`, either order, `?.` included) or an index of a constant
 * object by a `.kind` member (`LABEL_OF_KIND[record.kind]`: its KEYS are the kinds read). In a module that
 * imports the journal, a `.kind` member used in any other way, a `kind` the scan cannot resolve and a call with
 * no `kind` are reported as problems: the scan names what it cannot prove, it never skips it silently.
 *
 * @es Qué tipos de desenlace del journal de hooks (`KINDS` de `journal.mjs`) LEE algún módulo, cuáles ESCRIBE y
 * los que se leen pero ningún módulo de producción escribe: un lector esperando un registro que nadie produce.
 * POR QUÉ: `guard-precision` lee registros `decision`. Un lector de un tipo que ningún módulo escribe pasa
 * todos los selftests, porque cada lado se prueba con registros que escribe el TEST: nadie pregunta «¿produce un
 * módulo real lo que este consume?». Este análisis lo pregunta desde la fuente. CÓMO, CON PRECISIÓN: la fuente se TOKENIZA (comentarios,
 * cadenas, plantillas y regex son un solo token o nada), nunca se busca como texto, así que un tipo nombrado en
 * un comentario o una cadena no es ni escritura ni lectura. ESCRITURA: una llamada a `appendRecord` del journal
 * (importado con cualquier alias, o ligado a otro nombre con `x = appendRecord`) cuyo argumento lleva una
 * propiedad `kind:`; su valor se lee como cadena, un ternario o una constante del mismo módulo. LECTURA: una
 * comparación de un miembro `.kind` con una cadena (cualquier orden) o un índice de un objeto constante por un
 * miembro `.kind` (sus CLAVES son los tipos leídos). En un módulo que importa el journal, cualquier otro uso de
 * `.kind`, un `kind` irresoluble y una llamada sin `kind` se informan como problemas: el análisis nombra lo que
 * no puede probar, nunca lo salta en silencio.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { isCampaignFile } from '../mutation-proof/campaign-plan.mjs';

/** The modules that hand out journal records or append them: a module importing one of them uses the journal. @es Los módulos que reparten registros del journal o los añaden. */
export const JOURNAL_MODULES = Object.freeze(['journal.mjs', 'dismiss.mjs', 'blocks.mjs']);

/** The journal module itself: where `appendRecord` and `KINDS` come from. @es El propio módulo del journal. */
const JOURNAL_FILE = 'journal.mjs';
const APPEND_API = 'appendRecord';
const VALIDATION_SET = 'KINDS';

const COMPARISONS = new Set(['===', '!==', '==', '!=']);
/** The operators that end the operand of a comparison (`x === a.kind && …`). @es Los operadores que terminan el operando de una comparación. */
const OPERAND_ENDS = new Set([';', ',', '&&', '||', '??', '?', ':', '===', '!==', '==', '!=']);
const MEMBER_ACCESS = new Set(['.', '?.']);
const OPENERS = new Map([['(', ')'], ['[', ']'], ['{', '}']]);
const CLOSERS = new Set(OPENERS.values());
/** Keywords after which an expression starts, so a `/` opens a regular expression and a `[` an array. @es Palabras clave tras las que empieza una expresión: una `/` abre una regex y un `[` un array. */
const EXPRESSION_AFTER = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'void', 'delete', 'throw', 'new', 'yield', 'await', 'instanceof']);
const PUNCTUATORS = Object.freeze(['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '**']);
/** White space that is not a line break: a no-break space and a byte-order mark are in it. @es Espacio en blanco que no es salto de línea. */
const WHITE_SPACE = ' \t\r\f\v\u00a0\ufeff';
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', 'worktrees', 'state', 'selftest-fixtures']);

const isDigit = (character) => character >= '0' && character <= '9';
const isIdentifierStart = (character) => (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || character === '_' || character === '$' || (character > '\u007f' && !WHITE_SPACE.includes(character));
const isIdentifierPart = (character) => isIdentifierStart(character) || isDigit(character);
const isPunct = (token, value) => token?.type === 'punct' && token.value === value;
const isMember = (token) => token?.type === 'punct' && MEMBER_ACCESS.has(token.value);
const isIdentifier = (token, value) => token?.type === 'id' && (value === undefined || token.value === value);
const newlinesIn = (text) => [...text].filter((character) => character === '\n').length;

/** Where a template literal that starts at `start` ends, past its closing backtick; `${…}` spans are skipped whole. @es Dónde acaba una plantilla que empieza en `start`. */
function templateEnd(text, start) {
  let index = start + 1;

  while (index < text.length) {
    if (text[index] === '\\') index += 2;
    else if (text[index] === '`') return index + 1;
    else if (text.startsWith('${', index)) index = interpolationEnd(text, index + 2);
    else index += 1;
  }

  return text.length;
}

/** Where the `${…}` span whose body starts at `start` ends, past its closing brace. @es Dónde acaba un tramo `${…}`. */
function interpolationEnd(text, start) {
  let depth = 1;
  let index = start;

  while (index < text.length && depth > 0) {
    const character = text[index];

    if (character === "'" || character === '"') index = quotedEnd(text, index);
    else if (character === '`') index = templateEnd(text, index);
    else {
      if (character === '{') depth += 1;
      if (character === '}') depth -= 1;
      index += 1;
    }
  }

  return index;
}

/** Where a quoted string that starts at `start` ends, past its closing quote (or at the line end when unterminated). @es Dónde acaba una cadena entrecomillada. */
function quotedEnd(text, start) {
  let index = start + 1;

  while (index < text.length && text[index] !== '\n') {
    if (text[index] === '\\') index += 2;
    else if (text[index] === text[start]) return index + 1;
    else index += 1;
  }

  return index;
}

/** The value of a quoted string or a plain template, with its escapes resolved to the escaped character. @es El valor de una cadena, con sus escapes resueltos al carácter escapado. */
function valueOfQuoted(raw) {
  let value = '';

  for (let index = 1; index < raw.length - 1; index += 1) {
    if (raw[index] === '\\') index += 1;

    value += raw[index];
  }

  return value;
}

/** Where a regular expression literal that starts at `start` ends, or `-1` when it is not one (no closing slash on its line). @es Dónde acaba una regex, o `-1` si no lo es. */
function regexEnd(text, start) {
  let index = start + 1;
  let inClass = false;

  while (index < text.length && text[index] !== '\n') {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '[') inClass = true;
    else if (text[index] === ']') inClass = false;
    else if (text[index] === '/' && !inClass) return index + 1;

    index += 1;
  }

  return -1;
}

/** Whether a `/` after `previous` opens a regular expression. @es Si una `/` tras `previous` abre una regex. */
function opensRegex(previous) {
  if (previous === undefined) return true;
  if (previous.type === 'punct') return !CLOSERS.has(previous.value);

  return previous.type === 'id' && EXPRESSION_AFTER.has(previous.value);
}

/**
 * The tokens of JavaScript source, each `{ type: 'id' | 'str' | 'tmpl' | 'num' | 'regex' | 'punct', value, line }`.
 * A plain template literal is a `str`; one with `${…}` is an opaque `tmpl`. Comments and white space yield nothing.
 * @es Los tokens de una fuente JavaScript. Una plantilla simple es un `str`; con `${…}`, un `tmpl` opaco. Los comentarios y el espacio no dan nada.
 */
export function tokenize(text) {
  const tokens = [];
  let index = 0;
  let line = 1;

  const take = (type, end, value = text.slice(index, end)) => {
    if (end <= index) throw new Error(`the tokenizer made no progress at line ${line}`);

    tokens.push({ type, value, line });
    line += newlinesIn(text.slice(index, end));
    index = end;
  };

  while (index < text.length) {
    const character = text[index];

    if (character === '\n') {
      line += 1;
      index += 1;
    } else if (WHITE_SPACE.includes(character)) {
      index += 1;
    } else if (text.startsWith('//', index)) {
      while (index < text.length && text[index] !== '\n') index += 1;
    } else if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 ? text.length : close + 2;

      line += newlinesIn(text.slice(index, end));
      index = end;
    } else if (character === "'" || character === '"') {
      const end = quotedEnd(text, index);

      take('str', end, valueOfQuoted(text.slice(index, end)));
    } else if (character === '`') {
      const end = templateEnd(text, index);
      const raw = text.slice(index, end);

      if (raw.includes('${')) take('tmpl', end);
      else take('str', end, valueOfQuoted(raw));
    } else if (isDigit(character)) {
      let end = index;

      while (end < text.length && (isIdentifierPart(text[end]) || text[end] === '.')) end += 1;
      take('num', end);
    } else if (isIdentifierStart(character)) {
      let end = index;

      while (end < text.length && isIdentifierPart(text[end])) end += 1;
      take('id', end);
    } else if (character === '/' && opensRegex(tokens.at(-1)) && regexEnd(text, index) !== -1) {
      let end = regexEnd(text, index);

      while (end < text.length && isIdentifierPart(text[end])) end += 1;
      take('regex', end);
    } else {
      const punctuator = PUNCTUATORS.find((candidate) => text.startsWith(candidate, index)) ?? character;

      take('punct', index + punctuator.length);
    }
  }

  return tokens;
}

/** The index of the token that closes the bracket opened at `open`, or past the last token when it never closes. @es El índice del token que cierra el paréntesis abierto en `open`, o más allá del último si nunca cierra. */
function closerOf(tokens, open) {
  let depth = 0;

  for (let index = open; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'punct') continue;
    if (OPENERS.has(tokens[index].value)) depth += 1;
    if (CLOSERS.has(tokens[index].value)) depth -= 1;
    if (depth === 0) return index;
  }

  return tokens.length;
}

/** The index of the first token of `tokens` from `from` that is `value` at bracket depth 0, or `-1`. @es El índice del primer token `value` a profundidad 0 desde `from`, o `-1`. */
function topLevelIndex(tokens, value, from = 0) {
  let depth = 0;

  for (let index = from; index < tokens.length; index += 1) {
    if (tokens[index].type !== 'punct') continue;
    if (depth === 0 && tokens[index].value === value) return index;
    if (OPENERS.has(tokens[index].value)) depth += 1;
    if (CLOSERS.has(tokens[index].value)) depth -= 1;
  }

  return -1;
}

/**
 * The entries of the object literal whose `{` is at `open`: `{ key, value }` with `key` the property name (a
 * computed `[X]` key has none) and `value` the string it is given (a value that is not one string has none).
 * @es Las entradas del literal de objeto cuyo `{` está en `open`.
 */
function objectEntries(tokens, open) {
  const end = closerOf(tokens, open);
  const entries = [];
  let index = open + 1;

  while (index < end) {
    let key;
    let colon = index;

    if (isPunct(tokens[index], '[')) {
      colon = closerOf(tokens, index) + 1;
    } else if (tokens[index].type === 'id' || tokens[index].type === 'str') {
      key = tokens[index].value;
      colon = index + 1;
    }

    const next = topLevelIndex(tokens.slice(0, end), ',', colon);
    const stop = next === -1 ? end : next;
    const valueTokens = tokens.slice(colon + 1, stop);

    entries.push({ key, value: valueTokens.length === 1 && valueTokens[0].type === 'str' ? valueTokens[0].value : undefined });
    index = stop + 1;
  }

  return entries;
}

/**
 * The module-level constants a kind can be read through: `const NAME = 'text'` and
 * `const NAME = { … }` / `const NAME = Object.freeze({ … })`.
 * @returns {Map<string, { string: string } | { entries: { key?: string, value?: string }[] }>}
 * @es Las constantes de nivel de módulo por las que se puede leer un tipo.
 */
function moduleConstants(tokens) {
  const constants = new Map();
  let depth = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'punct' && OPENERS.has(token.value)) depth += 1;
    if (token.type === 'punct' && CLOSERS.has(token.value)) depth -= 1;

    if (depth !== 0 || !isIdentifier(token, 'const') || !isIdentifier(tokens[index + 1]) || !isPunct(tokens[index + 2], '=')) continue;

    const name = tokens[index + 1].value;
    const first = index + 3;

    if (tokens[first]?.type === 'str' && !isPunct(tokens[first + 1], '+')) constants.set(name, { string: tokens[first].value });
    else if (isPunct(tokens[first], '{')) constants.set(name, { entries: objectEntries(tokens, first) });
    else if (isIdentifier(tokens[first], 'Object') && isPunct(tokens[first + 1], '.') && isIdentifier(tokens[first + 2], 'freeze') && isPunct(tokens[first + 3], '(') && isPunct(tokens[first + 4], '{')) constants.set(name, { entries: objectEntries(tokens, first + 4) });
  }

  return constants;
}

/**
 * The strings an expression can evaluate to, through a ternary, a string, or a constant of the module (a string,
 * or the VALUES of an object, whatever indexes it); `unresolved` says some branch is none of those.
 * @es Las cadenas a las que puede evaluar una expresión, por un ternario, una cadena o una constante del módulo.
 */
function valuesOf(tokens, constants) {
  const question = topLevelIndex(tokens, '?');

  if (question !== -1) {
    let depth = 1;
    let colon = -1;

    for (let index = question + 1; index < tokens.length && colon === -1; index += 1) {
      if (depth === 0 || !isPunct(tokens[index], '?') && !isPunct(tokens[index], ':')) continue;

      depth += isPunct(tokens[index], '?') ? 1 : -1;
      if (depth === 0) colon = index;
    }

    if (colon === -1) return { values: [], unresolved: true };

    const consequent = valuesOf(tokens.slice(question + 1, colon), constants);
    const alternate = valuesOf(tokens.slice(colon + 1), constants);

    return { values: [...consequent.values, ...alternate.values], unresolved: consequent.unresolved || alternate.unresolved };
  }

  if (tokens.length === 1 && tokens[0].type === 'str') return { values: [tokens[0].value], unresolved: false };

  const constant = tokens[0]?.type === 'id' ? constants.get(tokens[0].value) : undefined;
  const indexed = isPunct(tokens[1], '[') && closerOf(tokens, 1) === tokens.length - 1;

  if (constant?.string !== undefined && tokens.length === 1) return { values: [constant.string], unresolved: false };
  if (constant?.entries !== undefined && (tokens.length === 1 || indexed)) return { values: constant.entries.flatMap((entry) => (entry.value === undefined ? [] : [entry.value])), unresolved: constant.entries.some((entry) => entry.value === undefined) };

  return { values: [], unresolved: true };
}

/** The words of an import clause that are not names it binds. @es Las palabras de una cláusula de import que no son nombres que liga. */
const CLAUSE_WORDS = new Set(['from', 'as']);
const CLAUSE_PUNCTUATION = new Set(['{', '}', ',', '*']);

/** The names an import clause binds, as `{ imported, local }`: `a`, `a as b`; a namespace (`* as ns`) binds none. @es Los nombres que liga una cláusula de import. */
function namesOf(clause) {
  return clause.flatMap((token, at) => {
    if (!isIdentifier(token) || CLAUSE_WORDS.has(token.value) || isIdentifier(clause[at - 1], 'as')) return [];

    const aliased = isIdentifier(clause[at + 1], 'as') && isIdentifier(clause[at + 2]);

    return [{ imported: token.value, local: aliased ? clause[at + 2].value : token.value }];
  });
}

/**
 * The import statement that starts at `index` (`import { a as b } from 'm'`, `import 'm'`): the module it names
 * and the names it binds, or `undefined` when what follows `import` is not an import clause (`import('m')`).
 * @es La sentencia de import que empieza en `index`: el módulo que nombra y los nombres que liga, o `undefined`.
 */
export function importAt(tokens, index) {
  const clause = [];

  for (let at = index + 1; at < tokens.length; at += 1) {
    const token = tokens[at];

    if (token.type === 'str') return { module: token.value, names: namesOf(clause) };
    if (!isIdentifier(token) && !(token.type === 'punct' && CLAUSE_PUNCTUATION.has(token.value))) return undefined;

    clause.push(token);
  }

  return undefined;
}

/** The file name of an import specifier. @es El nombre de fichero de un especificador de import. */
const baseOf = (specifier) => specifier.split('/').at(-1);

/** Whether the token at `index` is the `kind` of a member access, whatever it is a member of (`record.kind`, `f().kind`, `a?.b.kind`). @es Si el token en `index` es el `kind` de un acceso a miembro, sea de lo que sea. */
const isKindAccess = (tokens, index) => isIdentifier(tokens[index], 'kind') && isMember(tokens[index - 1]);

/** The index of the last token of the operand that starts at `from`: up to the operator, the separator or the closing bracket that ends it. @es El índice del último token del operando que empieza en `from`. */
function operandEnd(tokens, from) {
  let depth = 0;
  let last = from - 1;

  for (let index = from; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'punct') {
      if (depth === 0 && (OPERAND_ENDS.has(token.value) || CLOSERS.has(token.value))) break;
      if (OPENERS.has(token.value)) depth += 1;
      if (CLOSERS.has(token.value)) depth -= 1;
    }

    last = index;
  }

  return last;
}

const note = (map, kind, line) => map.set(kind, [...(map.get(kind) ?? []), line]);

/**
 * Whether the module imports the journal, and the names it binds to the journal's `appendRecord`: its import
 * (under any alias), and every name bound to one of those by `x = name` (how a test seam, a default parameter
 * or a local alias is spelled), through any number of bindings.
 * @es Si el módulo importa el journal, y los nombres que liga a `appendRecord` del journal: su import (con cualquier alias) y cada nombre ligado a uno de ellos por `x = nombre`.
 */
function journalImports(tokens) {
  const apiNames = new Set();
  let usesJournal = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const imported = isIdentifier(tokens[index], 'import') ? importAt(tokens, index) : undefined;

    if (imported === undefined || !JOURNAL_MODULES.includes(baseOf(imported.module))) continue;

    usesJournal = true;

    if (baseOf(imported.module) === JOURNAL_FILE) for (const { imported: name, local } of imported.names) if (name === APPEND_API) apiNames.add(local);
  }

  for (let again = true; again;) {
    again = false;

    for (let index = 1; index < tokens.length - 1; index += 1) {
      if (isIdentifier(tokens[index - 1]) && isPunct(tokens[index], '=') && isIdentifier(tokens[index + 1]) && apiNames.has(tokens[index + 1].value) && !apiNames.has(tokens[index - 1].value)) {
        apiNames.add(tokens[index - 1].value);
        again = true;
      }
    }
  }

  return { usesJournal, apiNames };
}

/** The index in `argumentTokens` of a `kind` property name (`kind:`, `'kind':`, or the shorthand `kind`), or `-1`. @es El índice en `argumentTokens` del nombre de una propiedad `kind`, o `-1`. */
function kindProperty(argumentTokens) {
  return argumentTokens.findIndex((candidate, at) => {
    const named = isIdentifier(candidate, 'kind') || (candidate.type === 'str' && candidate.value === 'kind');
    const startsProperty = isPunct(argumentTokens[at - 1], '{') || isPunct(argumentTokens[at - 1], ',');
    const endsName = isPunct(argumentTokens[at + 1], ':') || isPunct(argumentTokens[at + 1], ',') || isPunct(argumentTokens[at + 1], '}');

    return named && startsProperty && endsName;
  });
}

/**
 * The kinds the calls of the journal's API write, with the lines, and what the scan could not resolve.
 * @es Los tipos que escriben las llamadas a la API del journal, con sus líneas, y lo que el análisis no pudo resolver.
 */
function writesOfCalls(tokens, apiNames, constants) {
  const writes = new Map();
  const problems = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!isIdentifier(token) || !apiNames.has(token.value) || !isPunct(tokens[index + 1], '(') || isMember(tokens[index - 1]) || isIdentifier(tokens[index - 1], 'function')) continue;

    const argumentTokens = tokens.slice(index + 2, closerOf(tokens, index + 1));
    const property = kindProperty(argumentTokens);

    if (property === -1) {
      problems.push({ line: token.line, message: `a call of ${token.value}() holds no \`kind:\` property, so the kind it writes is unknown` });
    } else if (!isPunct(argumentTokens[property + 1], ':')) {
      problems.push({ line: token.line, message: 'a `kind` passed as a bare name cannot be resolved to a string' });
    } else {
      const rest = argumentTokens.slice(property + 2);
      const valueEnd = [topLevelIndex(rest, ','), topLevelIndex(rest, '}')].filter((at) => at !== -1).reduce((least, at) => Math.min(least, at), rest.length);
      const { values, unresolved } = valuesOf(rest.slice(0, valueEnd), constants);

      for (const kind of values) note(writes, kind, token.line);
      if (unresolved) problems.push({ line: token.line, message: `the \`kind\` of a call of ${token.value}() is not a string, a ternary of strings or a constant of this module` });
    }
  }

  return { writes, problems };
}

/**
 * The kinds a module reads through a comparison of a `.kind` member or an index of a constant object by one, with
 * the lines, and every other use of a `.kind` member as a problem.
 * @es Los tipos que un módulo lee por una comparación de un miembro `.kind` o un índice de un objeto constante, con sus líneas, y cualquier otro uso de un miembro `.kind` como problema.
 */
function readsOfKinds(tokens, constants) {
  const reads = new Map();
  const problems = [];
  const classified = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.type === 'punct' && COMPARISONS.has(token.value)) {
      const before = tokens[index - 1];
      const after = tokens[index + 1];

      if (before?.type === 'str' && isKindAccess(tokens, operandEnd(tokens, index + 1))) {
        note(reads, before.value, token.line);
        classified.add(operandEnd(tokens, index + 1));
      } else if (after?.type === 'str' && isKindAccess(tokens, index - 1)) {
        note(reads, after.value, token.line);
        classified.add(index - 1);
      }
    }

    if (isPunct(token, '[') && isIdentifier(tokens[index - 1]) && !EXPRESSION_AFTER.has(tokens[index - 1].value) && !isMember(tokens[index - 2])) {
      const close = closerOf(tokens, index);

      if (isKindAccess(tokens, close - 1)) {
        const constant = constants.get(tokens[index - 1].value);

        classified.add(close - 1);

        if (constant?.entries === undefined) problems.push({ line: token.line, message: `${tokens[index - 1].value}[…kind] indexes something that is not an object constant of this module` });
        else for (const entry of constant.entries) if (entry.key !== undefined) note(reads, entry.key, token.line);
      }
    }

    if (isIdentifier(token, VALIDATION_SET) && isPunct(tokens[index + 1], '.') && isIdentifier(tokens[index + 2], 'has') && isPunct(tokens[index + 3], '(')) {
      classified.add(closerOf(tokens, index + 3) - 1);
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (isKindAccess(tokens, index) && !classified.has(index)) problems.push({ line: tokens[index].line, message: 'a `.kind` member is used in a way the scan does not read (a comparison with a string, an index of a constant object, `KINDS.has(…)`)' });
  }

  return { reads, problems };
}

/**
 * What one module does with the journal's kinds.
 * @param {string} text the module source
 * @returns {{ usesJournal: boolean, writes: Map<string, number[]>, reads: Map<string, number[]>, problems: { line: number, message: string }[] }}
 *   each kind with the lines that write or read it; `reads` is empty, and no `.kind` use is a problem, for a module that does not import the journal
 * @es Lo que hace un módulo con los tipos del journal.
 */
export function scanSource(text) {
  const tokens = tokenize(text);
  const constants = moduleConstants(tokens);
  const { usesJournal, apiNames } = journalImports(tokens);
  const written = writesOfCalls(tokens, apiNames, constants);
  const read = usesJournal ? readsOfKinds(tokens, constants) : { reads: new Map(), problems: [] };

  return { usesJournal, writes: written.writes, reads: read.reads, problems: [...written.problems, ...read.problems] };
}

/**
 * The `.mjs` modules of a repository that are not tests: every file under `root` but selftests and mutants
 * campaigns, and but the folders that are not the repository's own code.
 * @es Los módulos `.mjs` de un repositorio que no son pruebas.
 */
export function productionModules(root, folder = '') {
  const found = [];

  for (const entry of readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const relative = folder === '' ? entry.name : `${folder}/${entry.name}`;

    if (entry.isDirectory() && !SKIPPED_FOLDERS.has(entry.name)) found.push(...productionModules(root, relative));
    else if (entry.isFile() && entry.name.endsWith('.mjs') && !isCampaignFile(relative) && entry.name !== 'selftest.mjs' && !entry.name.endsWith('.selftest.mjs')) found.push(relative);
  }

  return found;
}

/**
 * The findings over a set of modules: a kind READ with no module that WRITES it, a kind read or written that the
 * journal does not know, and every problem a scan reported.
 * @param {{ files: string[], readText: (file: string) => string, kinds: Iterable<string> }} options
 * @returns {{ findings: string[], reads: Map<string, string[]>, writes: Map<string, string[]> }} the findings (each a bilingual line) and, per kind, the `file:line` places that read or write it
 * @es Los hallazgos sobre un conjunto de módulos.
 */
export function producerFindings({ files, readText, kinds }) {
  const known = new Set(kinds);
  const writes = new Map();
  const reads = new Map();
  const findings = [];
  const place = (map, kind, file, lines) => map.set(kind, [...(map.get(kind) ?? []), ...lines.map((line) => `${file}:${line}`)]);

  for (const file of files) {
    const scan = scanSource(readText(file));

    for (const [kind, lines] of scan.writes) place(writes, kind, file, lines);
    for (const [kind, lines] of scan.reads) place(reads, kind, file, lines);
    for (const { line, message } of scan.problems) findings.push(`${file}:${line} ${message} @es ${file}:${line} el análisis no puede probar este uso del tipo`);
  }

  for (const [kind, places] of reads) {
    if (!known.has(kind)) findings.push(`${places[0]} reads the kind '${kind}', which the journal does not know @es lee el tipo '${kind}', que el journal no conoce`);
    else if (!writes.has(kind)) findings.push(`'${kind}' is read at ${places.join(', ')} and no non-test module writes it @es '${kind}' se lee en ${places.join(', ')} y ningún módulo de producción lo escribe`);
  }

  for (const [kind, places] of writes) if (!known.has(kind)) findings.push(`${places[0]} writes the kind '${kind}', which the journal does not know @es escribe el tipo '${kind}', que el journal no conoce`);

  return { findings, reads, writes };
}
