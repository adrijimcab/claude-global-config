/**
 * Asks knip itself how many `ignore*` entries its configuration holds, instead of reading a `knip.ts`, `knip.js` or
 * `knip.jsonc` as if it were JSON (it is code, or JSON with comments). The same decision as `eslint-facts.mjs`:
 * the tool that loads the config is the one that knows it. knip has no `--print-config`; its `--debug` run prints
 * the configuration it resolved (`parsedConfig`) as Node's `util.inspect` text, so the answer is read from that
 * block, whether `util.inspect` printed it over several lines or, being small, on one: every entry of every
 * `ignore*` list, workspaces included. When the output has no such block, or knip cut
 * it short (`[Object]`), or knip is not installed, or its run failed, the answer is "not measured" with the reason,
 * never zero. The knip run is the only process this module starts.
 *
 * Known limit: the text format of `--debug` is knip's diagnostic output, not a contract; a format change makes the
 * answer "not measured" (the parser refuses what it cannot read), it cannot make it a wrong number.
 *
 * @es Pregunta a knip mismo cuántas entradas `ignore*` guarda su configuración, en vez de leer un `knip.ts`,
 * `knip.js` o `knip.jsonc` como si fuera JSON (es código, o JSON con comentarios). La misma decisión que
 * `eslint-facts.mjs`: la herramienta que carga la config es la que la conoce. knip no tiene `--print-config`; su
 * ejecución `--debug` imprime la configuración que resolvió (`parsedConfig`) como texto de `util.inspect` de Node,
 * así que la respuesta se lee de ese bloque, lo imprima `util.inspect` en varias líneas o, por ser pequeño, en
 * una: cada entrada de cada lista `ignore*`, workspaces incluidos. Si la
 * salida no trae ese bloque, o knip lo cortó (`[Object]`), o knip no está instalado, o su ejecución falló, la
 * respuesta es "no medido" con el motivo, nunca cero. La ejecución de knip es el único proceso que lanza este módulo.
 * Límite conocido: el formato de texto de `--debug` es salida de diagnóstico de knip, no un contrato; si cambia, la
 * respuesta pasa a "no medido" (el parser rechaza lo que no sabe leer), nunca a un número equivocado.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const KNIP_TIMEOUT_MS = 300_000;
const ANSI = /\u001B\[[0-9;]*m/g;
const QUOTED = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
/** The first line of a `parsedConfig` printed over several lines. @es La primera línea de un `parsedConfig` en varias líneas. */
const PARSED_CONFIG_OPEN = /^ {2}parsedConfig: \{$/;
/** A `parsedConfig` small enough for `util.inspect` to print on one line (`{}` included); its body is captured. @es Un `parsedConfig` en una línea; se captura su cuerpo. */
const PARSED_CONFIG_INLINE = /^ {2}parsedConfig: \{(.*)\},?$/;
const BLOCK_CLOSE = /^ {2}\},?$/;
const IGNORE_LIST = /\bignore\w*:\s*\[([^\]]*)\]/g;
const MORE_ITEMS = /\.\.\. (\d+) more items?/g;

const NOT_MEASURED = Object.freeze({
  noBlock: 'knip printed no parsed configuration @es knip no imprimió la configuración resuelta',
  cut: 'knip cut its parsed configuration short ([Object]) @es knip cortó la configuración resuelta ([Object])',
  entry: 'an ignore list holds an entry that is not a string (a regular expression?) and cannot be counted safely @es una lista ignore trae una entrada que no es un string (¿una expresión regular?) y no se puede contar con seguridad',
  notInstalled: 'knip is not installed under node_modules @es knip no está instalado en node_modules',
});

/**
 * The body lines of the `parsedConfig` block, printed on one line or on several, or undefined when there is none.
 * @es Las líneas del cuerpo del bloque `parsedConfig`, impreso en una línea o en varias, o undefined si no lo hay.
 */
function parsedConfigLines(lines) {
  const start = lines.findIndex((line) => PARSED_CONFIG_OPEN.test(line) || PARSED_CONFIG_INLINE.test(line));

  if (start === -1) return undefined;

  const inline = PARSED_CONFIG_INLINE.exec(lines[start]);

  if (inline !== null) return [inline[1]];

  const length = lines.slice(start + 1).findIndex((line) => BLOCK_CLOSE.test(line));

  return length === -1 ? undefined : lines.slice(start + 1, start + 1 + length);
}

/**
 * What a `knip --debug` run says about the ignore entries of the configuration: `{ ignoreEntries }` or `{ error }`.
 * @es Lo que dice una ejecución `knip --debug` de las entradas ignore de la configuración: `{ ignoreEntries }` o `{ error }`.
 */
export function parseKnipDebug(text) {
  const block = parsedConfigLines(String(text).replace(ANSI, '').split(/\r?\n/));

  if (block === undefined) return { error: NOT_MEASURED.noBlock };

  // Strings are replaced first so a bracket or a key name inside an entry cannot be read as structure.
  // @es Primero se sustituyen los strings para que un corchete o un nombre de clave dentro de una entrada no se lea como estructura.
  const code = block.join('\n').replace(QUOTED, 'S');

  if (/\[(?:Object|Array)\]/.test(code)) return { error: NOT_MEASURED.cut };

  const lists = [...code.matchAll(IGNORE_LIST)].map((match) => match[1]);

  if (lists.some((body) => body.replace(MORE_ITEMS, '').replace(/\bS\b/g, '').replace(/[,\s]/g, '') !== '')) return { error: NOT_MEASURED.entry };

  const listed = lists.reduce((total, body) => total + (body.match(/\bS\b/g) ?? []).length, 0);
  const hidden = lists.reduce((total, body) => total + [...body.matchAll(MORE_ITEMS)].reduce((sum, more) => sum + Number(more[1]), 0), 0);

  return { ignoreEntries: listed + hidden };
}

/**
 * The real runner: the project's own installed knip, `--debug`, on `file`. A non-zero exit is not an error here
 * (knip exits 1 when it finds issues); only the printed configuration decides.
 * @es El ejecutor real: el knip instalado del propio proyecto, `--debug`, sobre `file`. Una salida distinta de cero
 * no es un error aquí (knip sale con 1 si encuentra problemas); decide solo la configuración impresa.
 */
export function runInstalledKnip(root, file, timeoutMs = KNIP_TIMEOUT_MS) {
  const bin = path.join(root, 'node_modules', 'knip', 'bin', 'knip.js');

  if (!existsSync(bin)) return { error: NOT_MEASURED.notInstalled };

  const result = spawnSync(process.execPath, [bin, '--debug', '--no-progress', '--no-config-hints', '-c', file], {
    cwd: root,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });

  if (result.error !== undefined) return { error: `knip could not run: ${result.error.message} @es knip no pudo ejecutarse: ${result.error.message}` };

  return parseKnipDebug(result.stdout);
}
