/**
 * Which files an instruction text imports with `@path`, as the Claude Code harness reads them: `importTargets`
 * (text, the importing file, the home) answers the absolute paths, each once, in order of first appearance.
 * Read on 2026-09-30 from the JavaScript embedded in the installed Claude Code 2.1.286 binary: an import is an
 * `@` at the start of a text or after whitespace, followed by non-blank characters (an escaped space stays
 * in the path), cut at the first `#`; it is accepted when it starts with `~/` or `/` (but is not `/`
 * alone) or with a letter, digit, `.`, `_` or `-` (so `./` and `../` qualify); a path is resolved against the importing file's directory
 * (`~/` against the home); a target whose extension is not in the harness's list of text extensions is not
 * loaded. Text in code blocks and code spans is not scanned, nor is text the harness removes from the content.
 * NOT PORTED, so this may list a file the harness does not: code indented four spaces is not recognised as
 * code, a code span is recognised within one line only, and the harness's own check that rejects some special
 * paths is not modelled. NO REGEX.
 *
 * @es Qué ficheros importa un texto de instrucciones con `@ruta`, como los lee el harness de Claude Code:
 * `importTargets` (texto, fichero importador, home) responde las rutas absolutas, cada una una vez, en orden
 * de primera aparición. Leído el 2026-09-30 del JavaScript embebido en el binario instalado de Claude Code
 * 2.1.286: un import es una `@` al inicio de un texto o tras un blanco, seguida de caracteres no blancos (un
 * espacio escapado queda en la ruta), cortada en el primer `#`; se acepta si empieza con `~/` o `/`
 * (pero no es solo `/`) o con letra, dígito, `.`, `_` o `-` (así `./` y `../` califican); la ruta se resuelve contra el directorio del
 * fichero importador (`~/` contra el home); un destino cuya extensión no está en la lista de extensiones de
 * texto del harness no se carga. No se escanea el texto de bloques ni de tramos de código, ni el que el
 * harness quita del contenido. NO PORTADO, así que puede listar un fichero que el harness no: el código
 * sangrado cuatro espacios no se reconoce como código, un tramo de código se reconoce solo dentro de una
 * línea, y no se modela la comprobación propia del harness que rechaza algunas rutas especiales. SIN REGEX.
 */

import path from 'node:path';

import { fenceAfter, instructionContent } from './harness-count.mjs';

const IMPORT_MARK = '@';
const FRAGMENT_MARK = '#';
const BACKTICK = '`';
const ESCAPED_SPACE = '\\ ';
const PATH_START = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-'];
const TEXT_EXTENSIONS = new Set(
  (
    '.md .txt .text .json .yaml .yml .toml .xml .csv .html .htm .css .scss .sass .less .js .ts .tsx .jsx .mjs .cjs .mts .cts ' +
    '.py .pyi .pyw .rb .erb .rake .go .rs .java .kt .kts .scala .c .cpp .cc .cxx .h .hpp .hxx .cs .swift .sh .bash .zsh .fish ' +
    '.ps1 .bat .cmd .env .ini .cfg .conf .config .properties .sql .graphql .gql .proto .vue .svelte .astro .ejs .hbs .pug ' +
    '.jade .php .pl .pm .lua .r .dart .ex .exs .erl .hrl .clj .cljs .cljc .edn .hs .lhs .elm .ml .mli .f .f90 .f95 .for ' +
    '.cmake .make .makefile .gradle .sbt .rst .adoc .asciidoc .org .tex .latex .lock .log .diff .patch'
  ).split(' '),
);

const isBlank = (character) => character.trim() === '';

/** The length of the run of backticks that starts at `from`. @es El largo de la racha de comillas invertidas que empieza en `from`. */
function backtickRun(line, from) {
  let length = 0;

  while (line[from + length] === BACKTICK) length += 1;

  return length;
}

/** Where the next run of exactly `length` backticks starts at or after `from`, or -1. @es Dónde empieza la siguiente racha de exactamente `length` comillas invertidas desde `from`, o -1. */
function nextRunOf(line, from, length) {
  for (let at = line.indexOf(BACKTICK, from); at !== -1; at = line.indexOf(BACKTICK, at + backtickRun(line, at))) {
    if (backtickRun(line, at) === length) return at;
  }

  return -1;
}

/** `line` without its code spans; backticks that open no span stay as text. @es `line` sin sus tramos de código; las comillas que no abren tramo quedan como texto. */
function withoutCodeSpans(line) {
  let kept = '';
  let index = 0;

  while (index < line.length) {
    if (line[index] !== BACKTICK) {
      kept += line[index];
      index += 1;
      continue;
    }

    const length = backtickRun(line, index);
    const close = nextRunOf(line, index + length, length);

    kept += close === -1 ? BACKTICK.repeat(length) : '';
    index = close === -1 ? index + length : close + length;
  }

  return kept;
}

/** The `@` words of one line: what follows each `@` that starts the line or follows a blank, up to a blank. @es Las palabras `@` de una línea. */
function importWords(line) {
  const words = [];
  let index = 0;

  while (index < line.length) {
    if (line[index] !== IMPORT_MARK || (index > 0 && !isBlank(line[index - 1]))) {
      index += 1;
      continue;
    }

    let end = index + 1;

    for (;;) {
      if (line.startsWith(ESCAPED_SPACE, end)) end += ESCAPED_SPACE.length;
      else if (end < line.length && !isBlank(line[end]) && line[end] !== '\\') end += 1;
      else break;
    }

    words.push(line.slice(index + 1, end));
    index = end;
  }

  return words;
}

/** Whether a word, once cut at `#`, is a path the harness treats as an import. @es Si una palabra, cortada en `#`, es una ruta que el harness trata como import. */
function isImportPath(word) {
  if (word.startsWith('~/')) return true;
  if (word.startsWith('/')) return word !== '/';

  return PATH_START.includes(word[0]);
}

/** The absolute path of an import word, from the importing file's directory and the home. @es La ruta absoluta de una palabra de import. */
const resolveImport = (word, importer, home) => (word.startsWith('~/') ? path.join(home, word.slice(2)) : path.resolve(path.dirname(importer), word));

/** The absolute paths `text` imports, each once, in order of first appearance. @es Las rutas absolutas que `text` importa, cada una una vez, en orden de primera aparición. */
export function importTargets(text, importer, home) {
  const targets = new Set();
  let fence;

  for (const line of instructionContent(text).split('\n')) {
    const scannable = fence === undefined && fenceAfter(undefined, line) === undefined;

    fence = fenceAfter(fence, line);

    if (!scannable) continue;

    for (const raw of importWords(withoutCodeSpans(line))) {
      const word = raw.split(FRAGMENT_MARK)[0].replaceAll(ESCAPED_SPACE, ' ');

      if (!isImportPath(word)) continue;

      const target = resolveImport(word, importer, home);

      if (TEXT_EXTENSIONS.has(path.extname(target).toLowerCase()) || path.extname(target) === '') targets.add(target);
    }
  }

  return [...targets];
}
