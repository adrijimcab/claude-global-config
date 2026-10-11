/**
 * The files a selftest needs, derived from the source instead of listed by hand. A campaign used to name in
 * `paths` every folder its selftest imports; that list is the selftest's import closure written down, and the
 * closure differs per install (one install's `hook-state/locations.mjs` imports `bilingual-output/`, another's
 * imports nothing), so a vendored campaign could not be right in both. The runner asks this module instead.
 *
 * What counts as an import: a static `import … from '…'`, a side-effect `import '…'`, an `export … from '…'`
 * and a dynamic `import('…')` whose specifier is a string literal. Only specifiers starting with `./` or
 * `../` are followed; a bare one (`node:fs`, a package) is not a file of the fleet. The source is LEXED, not
 * grepped: the same text inside a comment, a string, a template or a regex is data, and a selftest that
 * builds fixtures holds plenty of it. `require()` is not followed: the fleet is ESM.
 *
 * A specifier that resolves outside the root, or to a file that does not exist, is a PROBLEM, never a silent
 * drop: the runner refuses to measure rather than copy a closure it knows is incomplete.
 *
 * @es Los ficheros que necesita un selftest, derivados del código en vez de listados a mano. El cierre de
 * imports cambia según la instalación, así que una campaña vendorizada no podía acertar en las dos. Cuenta
 * como import el estático, el de efecto, el `export … from` y el `import('…')` dinámico con literal; solo se
 * siguen los especificadores que empiezan por `./` o `../`. El código se ANALIZA LÉXICAMENTE: el mismo texto
 * en un comentario, una cadena, una plantilla o una regex es dato. Un especificador que sale de la raíz o
 * apunta a un fichero inexistente es un PROBLEMA, nunca se descarta en silencio.
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** Extensions whose source is read for imports. @es Extensiones cuyo código se lee buscando imports. */
const READ_EXTENSIONS = new Set(['.mjs', '.cjs', '.js']);

/** A specifier that names a file of the fleet. @es Un especificador que nombra un fichero de la flota. */
const RELATIVE = /^\.{1,2}\//;

/** A character of a name or a number. @es Un carácter de un nombre o de un número. */
const NAME = /[\p{ID_Continue}$‌‍]/u;

/** Words after which a `/` starts a regex rather than a division. @es Palabras tras las que `/` abre una regex. */
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);

/** Punctuation that closes an operand, so a `/` after it divides. @es Puntuación que cierra un operando: `/` tras ella divide. */
const OPERAND_CLOSERS = new Set([')', ']']);

/**
 * Every string-literal specifier the source imports, in source order, bare ones included.
 * @es Cada especificador literal que importa el código, en orden, incluidos los desnudos.
 */
export function specifiersOf(source) {
  const tokens = [];

  lexCode(source, source.startsWith('#!') ? endOf(source, '\n', 0) : 0, tokens, false);

  return tokens.flatMap((token, at) => (token.kind === 'name' && !isMember(tokens[at - 1]) ? importedBy(token.value, tokens.slice(at + 1, at + 4)) : []));
}

function isMember(previous) {
  return previous?.kind === 'punct' && previous.value === '.';
}

function importedBy(word, [first, second, third]) {
  if (word === 'from' && first?.kind === 'string') return [first.value];
  if (word !== 'import') return [];
  if (first?.kind === 'string') return [first.value];
  if (first?.value === '(' && second?.kind === 'string' && (third?.value === ')' || third?.value === ',')) return [second.value];

  return [];
}

/** Lexes code from `at`; inside a template substitution, stops after its closing brace. @es Analiza código; en una sustitución, para tras su llave de cierre. */
function lexCode(source, at, tokens, substitution) {
  let depth = 0;

  while (at < source.length) {
    const char = source[at];
    const pair = source.slice(at, at + 2);

    if (/\s/.test(char)) at += 1;
    else if (pair === '//') at = endOf(source, '\n', at);
    else if (pair === '/*') at = endOf(source, '*/', at + 2) + 2;
    else if (char === "'" || char === '"') at = lexString(source, at, tokens);
    else if (char === '`') at = lexTemplate(source, at + 1, tokens);
    else if (char === '/' && opensRegex(tokens.at(-1))) at = lexRegex(source, at + 1, tokens);
    else if (NAME.test(char)) at = lexName(source, at, tokens);
    else {
      if (substitution && char === '}' && depth === 0) return at + 1;
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;

      tokens.push({ kind: 'punct', value: char });
      at += 1;
    }
  }

  return at;
}

function endOf(source, marker, from) {
  const at = source.indexOf(marker, from);

  return at === -1 ? source.length : at;
}

function opensRegex(previous) {
  if (previous === undefined) return true;
  if (previous.kind === 'name') return REGEX_AFTER_WORDS.has(previous.value);

  return previous.kind === 'punct' && !OPERAND_CLOSERS.has(previous.value);
}

function lexString(source, start, tokens) {
  let at = start + 1;

  while (at < source.length && source[at] !== source[start]) at += source[at] === '\\' ? 2 : 1;

  tokens.push({ kind: 'string', value: source.slice(start + 1, at) });

  return at + 1;
}

function lexTemplate(source, at, tokens) {
  while (at < source.length && source[at] !== '`') {
    if (source[at] === '\\') at += 2;
    else if (source.startsWith('${', at)) at = lexCode(source, at + 2, tokens, true);
    else at += 1;
  }

  tokens.push({ kind: 'template' });

  return at + 1;
}

/**
 * A regex ends at its line: whether a `/` opens one is a guess from the token before it, and a wrong guess
 * must not swallow the imports on the lines below. @es Una regex acaba en su línea: abrirla es una conjetura.
 */
function lexRegex(source, at, tokens) {
  let inClass = false;

  while (at < source.length && source[at] !== '\n' && (inClass || source[at] !== '/')) {
    if (source[at] === '[') inClass = true;
    else if (source[at] === ']') inClass = false;

    at += source[at] === '\\' ? 2 : 1;
  }

  tokens.push({ kind: 'regex' });

  return at + 1;
}

function lexName(source, at, tokens) {
  const start = at;

  while (at < source.length && NAME.test(source[at])) at += 1;

  tokens.push({ kind: 'name', value: source.slice(start, at) });

  return at;
}

function isFile(root, relative) {
  return statSync(path.join(root, relative), { throwIfNoEntry: false })?.isFile() === true;
}

/**
 * Walks the relative imports from each entry, recursively.
 * @param options.root The directory every path is relative to.
 * @param options.entries Files relative to `root` (either separator).
 * @returns `files`, every file reached, root-relative with `/`, sorted; `problems`, each import or entry
 *   that could not be followed, bilingual.
 * @es Recorre los imports relativos desde cada entrada; devuelve los ficheros alcanzados y los problemas.
 */
export function importClosure({ root, entries }) {
  const files = new Set();
  const problems = [];
  const queue = [];

  for (const entry of entries.map((file) => path.posix.normalize(file.split(path.win32.sep).join('/')))) {
    if (isFile(root, entry)) queue.push(entry);
    else problems.push(`${entry} does not exist, so its imports cannot be followed @es ${entry} no existe, así que sus imports no se pueden seguir`);
  }

  while (queue.length > 0) {
    const file = queue.shift();

    if (files.has(file)) continue;

    files.add(file);

    if (!READ_EXTENSIONS.has(path.posix.extname(file))) continue;

    for (const specifier of specifiersOf(readFileSync(path.join(root, file), 'utf8')).filter((found) => RELATIVE.test(found))) {
      const target = path.posix.join(path.posix.dirname(file), specifier);

      if (target.startsWith('../')) problems.push(`${file} imports '${specifier}', which resolves outside the root (${target}) @es ${file} importa '${specifier}', que resuelve fuera de la raíz (${target})`);
      else if (!isFile(root, target)) problems.push(`${file} imports '${specifier}', which resolves to ${target}, a file that does not exist @es ${file} importa '${specifier}', que resuelve a ${target}, un fichero que no existe`);
      else queue.push(target);
    }
  }

  return { files: [...files].toSorted(), problems };
}

/**
 * The paths a set of files copies: the folder of each, or the file itself when it sits at the root (copying
 * the root would copy the sandbox into itself), each once, sorted.
 * @es Las rutas que copia un conjunto de ficheros: la carpeta de cada uno, o el fichero si está en la raíz.
 */
export function copiedPaths(files) {
  return [...new Set(files.map((file) => (path.posix.dirname(file) === '.' ? file : path.posix.dirname(file))))].toSorted();
}
