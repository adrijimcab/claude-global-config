/**
 * Owns what a RED verification shows and keeps: the lines of a test run's output that NAME the failure, and the
 * file that holds the whole output. A declared unit suite (Karma, Playwright, any npm script) prints thousands of
 * lines and summarises its failures in the middle of them, so a tail alone loses the failing spec; the lines are
 * therefore picked by their CONTENT, never by guessing which tool ran: Karma's `FAILED` and `TOTAL:` lines,
 * Playwright's numbered failures, `✘` marks and `N failed` summary, and the first error with its stack frames.
 * The full output goes to a uniquely named file under the `worktree-landing` state directory, classified as
 * archive in `hook-state/rotate.mjs`, so the refusal can name it.
 *
 * @es Es dueño de lo que muestra y guarda una verificación en ROJO: las líneas de la salida de una corrida que
 * NOMBRAN el fallo, y el fichero con la salida completa. Una suite declarada (Karma, Playwright, cualquier script
 * de npm) imprime miles de líneas y resume sus fallos en medio, así que una cola sola pierde el spec que falló;
 * por eso las líneas se eligen por su CONTENIDO, nunca adivinando qué herramienta corrió: las líneas `FAILED` y
 * `TOTAL:` de Karma, los fallos numerados, las marcas `✘` y el resumen `N failed` de Playwright, y el primer error
 * con sus marcos de pila. La salida completa va a un fichero de nombre único bajo el directorio de estado de
 * `worktree-landing`, clasificado como archivo en `hook-state/rotate.mjs`, para que el rechazo lo nombre.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stateDir } from '../hook-state/locations.mjs';

/** The folder of the state directory that holds the full outputs of red runs. @es La carpeta con las salidas completas de corridas en rojo. */
export const RED_LOGS_FOLDER = 'red-logs';

/** Most failure lines a refusal carries. @es Máximo de líneas de fallo de un rechazo. */
const MAX_FAILURE_LINES = 60;

/** Most stack frames a refusal carries after the first error. @es Máximo de marcos de pila tras el primer error. */
const MAX_STACK_FRAMES = 8;

/** Karma's running tally, repeated at every spec: it is a counter, not a failure. @es El contador de Karma, repetido en cada spec. */
const PROGRESS_LINE = /Executed \d+ of \d+/;

/** A line that names a failure: Karma `FAILED`/`TOTAL:`, Playwright `1) [project]`, `✘`, `N failed`. @es Una línea que nombra un fallo. */
const FAILURE_LINE = /\bFAILED\b|^\s*TOTAL:|^\s*\d+\) \[|^\s*✘|^\s*\d+ (?:failed|flaky)\b/;

/** A stack frame. @es Un marco de pila. */
const STACK_FRAME = /^\s+at\s/;

/** Terminal colour codes, which would hide a line from the patterns above. @es Códigos de color, que ocultarían una línea. */
const COLOUR_CODES = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** The lines of an output, colour removed and trailing blanks trimmed. @es Las líneas de una salida, sin color. */
const linesOf = (output) => output.replace(COLOUR_CODES, '').split(/\r\n|\n|\r/).map((line) => line.trimEnd());

/** The distinct lines that name a failure, in order. @es Las líneas distintas que nombran un fallo, en orden. */
function failureLinesIn(lines) {
  return lines.filter((line, index) => FAILURE_LINE.test(line) && !PROGRESS_LINE.test(line) && lines.indexOf(line) === index).slice(0, MAX_FAILURE_LINES);
}

/** The first error: up to two message lines above the first stack frame, then its frames. @es El primer error: su mensaje y sus marcos. */
function firstStackIn(lines) {
  const frame = lines.findIndex((line) => STACK_FRAME.test(line));
  if (frame === -1) return [];
  let start = frame;
  while (start > 0 && frame - start < 2 && lines[start - 1] !== '') start -= 1;
  let end = frame;
  while (end < lines.length && end - frame < MAX_STACK_FRAMES && STACK_FRAME.test(lines[end])) end += 1;
  return lines.slice(start, end);
}

/**
 * @param {string} output a test run's whole output
 * @returns {string[]} the failure lines, then the first error and its stack; empty when the output names no failure
 * @es Devuelve las líneas de fallo y luego el primer error con su pila; vacío si la salida no nombra ningún fallo.
 */
export function failureLinesOf(output) {
  const lines = linesOf(output);
  const failing = failureLinesIn(lines);
  const stack = firstStackIn(lines).filter((line) => !failing.includes(line));
  return [...failing, ...stack].map((line) => `    ${line}`);
}

/**
 * Writes the whole output of a red run to a new file, never over an earlier one, and returns its path.
 * @param {string} output
 * @returns {string}
 * @es Escribe la salida completa de una corrida en rojo en un fichero nuevo, nunca sobre uno anterior, y devuelve su ruta.
 */
export function writeRedLog(output) {
  const directory = path.join(stateDir('worktree-landing'), RED_LOGS_FOLDER);
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(directory, `red-${stamp}-${process.pid}.log`);
  writeFileSync(file, output, { flag: 'wx' });
  return file;
}
