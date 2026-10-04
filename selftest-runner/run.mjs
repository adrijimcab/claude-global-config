#!/usr/bin/env node
/**
 * Runs every selftest the repository holds and gives ONE verdict: exit 0 all green, 1 any red, 2 not
 * measured. Each selftest runs in its own process with its own directory as cwd. There is no filter, skip
 * or fail-fast option on purpose: a self-selected subset is not a verdict about the repository, and a
 * selftest that is red at baseline is reported RED, never omitted. To run one selftest, call it with node.
 *
 * Usage: node run.mjs [--root <dir>]
 *
 * Each selftest's GREEN or RED line (and, for a RED one, its output) is printed the moment that selftest
 * ends, so a long run is watchable; the summary line comes last. Streaming changes WHEN lines appear, never
 * which lines, their order, or the exit code.
 *
 * @es Ejecuta todos los selftests del repositorio y da UN veredicto: 0 todo verde, 1 alguno rojo, 2 no
 * medido. La línea GREEN o RED de cada selftest (y, si es RED, su salida) se imprime en cuanto ese selftest
 * termina, para poder seguir una corrida larga; el resumen va al final. El flujo cambia CUÁNDO aparecen las
 * líneas, nunca cuáles, su orden ni el código de salida. Cada selftest corre en su propio proceso y con su
 * directorio como cwd. No hay opción de filtro, salto ni corte al primer fallo, a propósito: un subconjunto elegido no es un veredicto del repositorio, y
 * un selftest rojo de partida se informa ROJO, nunca se omite. Para uno solo, se invoca con node.
 */

import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DiscoveryError, discoverSelftests } from './discovery.mjs';
import { writeLineSync } from './stream.mjs';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_NOT_MEASURED = 2;
const OUTPUT_LIMIT_BYTES = 64 * 1024 * 1024;

/**
 * Runs one selftest. Returns why it is red, or null when it is green.
 * @es Ejecuta un selftest. Devuelve por qué está rojo, o null si está verde.
 */
function runOne({ root, entry, timeoutMs, spawn }) {
  const file = path.join(root, entry.path);
  try {
    statSync(file);
  } catch {
    return { exit: 'missing', reason: 'file missing on disk @es fichero ausente en disco', output: '' };
  }
  const result = spawn(process.execPath, [file], {
    cwd: path.dirname(file),
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: OUTPUT_LIMIT_BYTES,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error?.code === 'ETIMEDOUT') {
    const seconds = Math.round(timeoutMs / 1000);
    return { exit: 'timeout', reason: `timed out after ${seconds}s @es agotó el tiempo tras ${seconds}s`, output };
  }
  if (result.error) {
    return { exit: 'error', reason: `${result.error.message} @es no se pudo ejecutar`, output };
  }
  if (result.status === 0) return null;
  const signal = result.signal ? `killed by ${result.signal} @es terminado por ${result.signal}` : '';
  return { exit: result.status ?? 'signal', reason: signal, output };
}

/** @param {string} text @es Indenta cada línea de la salida del selftest. */
function indent(text) {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => `    ${line}`);
}

/**
 * `spawn` is injectable so a result no host produces on demand (a POSIX signal death) can be fed to the
 * verdict; it defaults to `spawnSync`.
 * @es `spawn` es inyectable para poder alimentar al veredicto un resultado que ningún host produce a
 * demanda (muerte por señal POSIX); por defecto es `spawnSync`.
 * `onLine` receives each report line as it is produced, before the next selftest starts; the returned
 * `report` is the same lines, so a caller that ignores the hook sees the old behaviour.
 * @es `onLine` recibe cada línea del informe al producirse, antes de que empiece el siguiente selftest; el
 * `report` devuelto son las mismas líneas, así que quien ignore el gancho ve el comportamiento de siempre.
 * @param {{ root: string, timeoutMs?: number, spawn?: typeof spawnSync, onLine?: (line: string) => void }} options
 * @returns {{ exitCode: number, report: string[] }}
 * @es Devuelve el código de salida y las líneas del informe.
 */
export function runSelftests({ root, timeoutMs = DEFAULT_TIMEOUT_MS, spawn = spawnSync, onLine = () => {} }) {
  let discovered;
  try {
    discovered = discoverSelftests(root);
  } catch (error) {
    if (!(error instanceof DiscoveryError)) throw error;
    return { exitCode: EXIT_NOT_MEASURED, report: [error.message] };
  }
  if (discovered.entries.length === 0) {
    return {
      exitCode: EXIT_NOT_MEASURED,
      report: [`No selftest found in ${discovered.root}; nothing was measured. @es No se encontró ningún selftest en ${discovered.root}; no se midió nada.`],
    };
  }

  const report = [];
  const emit = (...lines) => {
    for (const line of lines) {
      report.push(line);
      onLine(line);
    }
  };
  let green = 0;
  for (const entry of discovered.entries) {
    const label = entry.untracked ? ' UNTRACKED' : '';
    const failure = runOne({ root: discovered.root, entry, timeoutMs, spawn });
    if (failure === null) {
      green += 1;
      emit(`GREEN  ${entry.path} (exit 0)${label}`);
      continue;
    }
    emit(`RED    ${entry.path} (exit ${failure.exit})${label}`);
    if (failure.reason !== '') emit(`    ${failure.reason}`);
    emit(...indent(failure.output));
  }
  emit(`${green}/${discovered.entries.length} green`);
  return { exitCode: green === discovered.entries.length ? EXIT_GREEN : EXIT_RED, report };
}

/**
 * Reads the command line: nothing, or `--root <dir>`; anything else is refused, so no filter can exist.
 * @es Lee la línea de órdenes: nada, o `--root <dir>`; todo lo demás se rechaza, así no puede existir filtro.
 * @param {string[]} argv
 * @returns {{ root: string } | { error: string }}
 */
function parseArgs(argv) {
  if (argv.length === 0) return { root: process.cwd() };
  if (argv.length === 2 && argv[0] === '--root') return { root: argv[1] };
  return {
    error: `Usage: node run.mjs [--root <dir>]. No filter or skip option exists. @es Uso: node run.mjs [--root <dir>]. No existe ninguna opción de filtro ni de salto.`,
  };
}

/**
 * Runs the command line and prints the report; returns the process exit code.
 * @es Ejecuta la línea de órdenes e imprime el informe; devuelve el código de salida del proceso.
 */
function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    return EXIT_NOT_MEASURED;
  }
  const { exitCode, report } = runSelftests({ root: parsed.root, onLine: writeLineSync });
  // A run that measured nothing streamed nothing: its explanation goes to stderr, whole.
  // @es Una corrida que no midió nada no emitió nada: su explicación va entera a stderr.
  if (exitCode === EXIT_NOT_MEASURED) console.error(report.join('\n'));
  return exitCode;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = main();
