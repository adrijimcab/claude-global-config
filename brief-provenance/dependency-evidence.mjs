/**
 * What makes a MEASURED line carry its own evidence, so a dependency it names is no unsourced claim:
 *
 *   - a SOURCE CITATION: a path token with a letters-only file extension followed by `:line` (or a
 *     `line-line` range), optionally `:col`. A URL is never a citation (`http://localhost:4200` is a port),
 *     and `node_modules/` counts only inside such a token: a bare directory names no line that was read;
 *   - a RUN RECEIPT: a backticked command (a code span holding more than one word), or an exit code
 *     written `exit N`, `exit=N` or `EXIT N`. A line that shows the run it reports is a measurement;
 *   - a MANIFEST VERSION: a version token together with the manifest it was read from (`package.json`,
 *     `package-lock.json`), so "typescript ~5.8.0 in package.json" is a reading, not a claim.
 *
 * Presence only, never truth: the same move as the marker check. No regex (M5): literal character scans.
 *
 * @es Lo que hace que una línea MEASURED lleve su propia evidencia: una CITA de fuente (ruta con extensión
 * de letras seguida de `:línea`, opcionalmente `:col`; nunca una URL, y `node_modules/` solo dentro de esa
 * ruta), un RECIBO de ejecución (un comando entre comillas invertidas con más de una palabra, o un código de
 * salida `exit N`, `exit=N`, `EXIT N`) o una VERSIÓN de manifiesto (una versión junto al manifiesto del que se
 * leyó). Solo presencia, nunca verdad. Sin regex (M5).
 */

import { words, trimPeriods } from './line-words.mjs';
import { LETTERS } from './provenance.mjs';

const DIGITS = '0123456789';

/** What separates the words of a citation; the colon stays inside, it joins path and line. @es Separadores de una cita; el dos puntos queda dentro. */
const CITATION_SEPARATORS = ' \t\r,;()[]{}<>|"\'`';

/** The manifests a version may be read from. @es Los manifiestos de los que se lee una versión. */
const MANIFESTS = ['package.json', 'package-lock.json'];

/**
 * The range operators that may open a version read from a manifest. `<` and `>` are not listed: they already
 * separate citation words, so `>=5.8.0` reaches this scan as `=5.8.0`.
 * @es Los operadores que pueden abrir una versión. `<` y `>` no están: ya separan las palabras de una cita.
 */
const VERSION_LEAD = '~^=v';

/** The word an exit code follows. @es La palabra a la que sigue un código de salida. */
const EXIT_WORD = 'exit';

const isDigits = (text) => text.length > 0 && [...text].every((character) => DIGITS.includes(character));

/** Whether `text` is a line number or a range of two. @es Si `text` es un número de línea o un rango. */
function isLineRef(text) {
  const parts = text.split('-');

  return parts.length <= 2 && parts.every(isDigits);
}

/** Whether a path ends in a letters-only extension, so `1.58` is not a file. @es Si una ruta acaba en extensión de letras. */
function hasExtension(text) {
  const dot = text.lastIndexOf('.');
  const extension = dot >= 0 ? text.slice(dot + 1) : '';

  return extension.length > 0 && [...extension].every((character) => LETTERS.includes(character));
}

/** Whether one word is `path.ext:line` or `path.ext:line:col`, and no URL. @es Si una palabra es una cita. */
function isCitation(word) {
  if (word.includes('://')) return false;

  const parts = trimPeriods(word).split(':');
  const withLine = isLineRef(parts.at(-1)) && hasExtension(parts.slice(0, -1).join(':'));
  const withColumn = isDigits(parts.at(-1)) && isLineRef(parts.at(-2) ?? '') && hasExtension(parts.slice(0, -2).join(':'));

  return withLine || withColumn;
}

/** The words of a line with its backslashes read as slashes. @es Las palabras de una línea, con barras normalizadas. */
const citationWords = (line) => words(line.split('\\').join('/'), CITATION_SEPARATORS).map(trimPeriods);

/** Whether the line cites a source location. @es Si la línea cita una ubicación de código. */
export function citesSource(line) {
  return words(line, CITATION_SEPARATORS).some(isCitation);
}

/** Whether a backticked code span of the line holds a command, i.e. more than one word. @es Si un tramo entre comillas invertidas es un comando. */
function quotesCommand(line) {
  const segments = line.split('`');

  // The odd segments sit between two backticks; the last one has no closing backtick when the count is odd.
  for (let index = 1; index < segments.length - 1; index += 2) if (segments[index].trim().includes(' ')) return true;

  return false;
}

/** Whether the line shows an exit code: `exit N`, `exit=N` or `EXIT N`. @es Si la línea muestra un código de salida. */
function showsExitCode(line) {
  const tokens = citationWords(line).map((token) => token.toLowerCase());

  return tokens.some(
    (token, index) => (token === EXIT_WORD && isDigits(tokens[index + 1] ?? '')) || (token.startsWith(`${EXIT_WORD}=`) && isDigits(token.slice(EXIT_WORD.length + 1)))
  );
}

/** Whether the line carries the receipt of a run. @es Si la línea lleva el recibo de una ejecución. */
export function carriesRunReceipt(line) {
  return quotesCommand(line) || showsExitCode(line);
}

/** Whether a word is a version: optional range operators, then a digit, with a dot somewhere. @es Si una palabra es una versión. */
function isVersion(word) {
  let index = 0;

  while (index < word.length && VERSION_LEAD.includes(word.charAt(index))) index += 1;

  const rest = word.slice(index);

  return isDigits(rest.charAt(0)) && rest.includes('.');
}

/** Whether the line reports a version and cites the manifest it was read from. @es Si la línea da una versión y cita su manifiesto. */
export function citesManifestVersion(line) {
  const tokens = citationWords(line);
  const manifest = tokens.some((token) => MANIFESTS.some((name) => token === name || token.endsWith(`/${name}`)));

  return manifest && tokens.some(isVersion);
}

/** Whether the line carries its own evidence, by any of the three forms. @es Si la línea lleva su propia evidencia. */
export function carriesEvidence(line) {
  return citesSource(line) || carriesRunReceipt(line) || citesManifestVersion(line);
}
