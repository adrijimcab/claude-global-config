/**
 * Whether a MEASURED claim cites a SOURCE LOCATION, the one form of evidence the dependency-claim face decides
 * lexically: a path with a directory (`/` or `\`), a letters-only file extension, then `:line` (or a
 * `line-line` range) and optionally `:col`. A claim that cites one is allowed with no model call.
 *
 * WHAT IS NOT A CITATION, STATED. A URL (`http://localhost:4200`); a host and port with no scheme
 * (`example.com:443`, `localhost:4200/app.js:12`), because the path may hold a colon only as a drive letter; a
 * bare file name with no directory (`app.ts:12`), which names no place the reader can open and cannot be told
 * from a host; a bare directory (`node_modules/playwright`), which names no line. Anything stricter than it
 * should be only costs a model call, never a wrong refusal: a claim this does not accept goes to the judge.
 * No regex (M5): literal character scans.
 *
 * @es Si una afirmación MEASURED cita una UBICACIÓN de código, la única evidencia que la cara decide de forma
 * léxica: una ruta con directorio, extensión de letras, `:línea` (o rango) y opcionalmente `:col`. NO es cita:
 * una URL, un host con puerto sin esquema (la ruta solo admite dos puntos como letra de unidad), un nombre de
 * fichero sin directorio ni un directorio sin línea. Ser más estricto solo cuesta una llamada al modelo, nunca
 * un rechazo erróneo. Sin regex (M5).
 */

import { words, trimPeriods } from './line-words.mjs';
import { LETTERS } from './provenance.mjs';

const DIGITS = '0123456789';

/** What separates the words of a citation; the colon stays inside, it joins path and line. @es Separadores de una cita; el dos puntos queda dentro. */
const CITATION_SEPARATORS = ' \t\r\n,;()[]{}<>|"\'`';

const isDigits = (text) => text.length > 0 && [...text].every((character) => DIGITS.includes(character));

/** Whether `text` is a line number or a range of two. @es Si `text` es un número de línea o un rango. */
function isLineRef(text) {
  const parts = text.split('-');

  return parts.length <= 2 && parts.every(isDigits);
}

/** The path without a leading drive letter (`C:`). @es La ruta sin su letra de unidad inicial. */
const withoutDrive = (path) => (LETTERS.includes(path.charAt(0)) && path.charAt(1) === ':' ? path.slice(2) : path);

/** Whether `path` is a file under a directory, with a letters-only extension and no port. @es Si `path` es un fichero bajo un directorio, con extensión de letras y sin puerto. */
function isSourcePath(path) {
  const local = withoutDrive(path);
  // With no dot this is the whole path, which holds a `/` (required below), never a letter: no extension.
  const extension = local.slice(local.lastIndexOf('.') + 1);

  return local.includes('/') && !local.includes(':') && extension.length > 0 && [...extension].every((character) => LETTERS.includes(character));
}

/**
 * Whether one word is `dir/file.ext:line` or `dir/file.ext:line:col`. A URL never is: its scheme puts a colon in
 * the path, which `isSourcePath` refuses. @es Si una palabra es una cita; una URL nunca, por el dos puntos del esquema.
 */
function isCitation(word) {
  const parts = trimPeriods(word).split(':');
  const withLine = isLineRef(parts.at(-1)) && isSourcePath(parts.slice(0, -1).join(':'));
  const withColumn = isDigits(parts.at(-1)) && isLineRef(parts.at(-2) ?? '') && isSourcePath(parts.slice(0, -2).join(':'));

  return withLine || withColumn;
}

/** Whether the text cites a source location; backslashes are read as slashes. @es Si el texto cita una ubicación de código. */
export function citesSource(text) {
  return words(text.split('\\').join('/'), CITATION_SEPARATORS).some(isCitation);
}
