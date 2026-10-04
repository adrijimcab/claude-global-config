#!/usr/bin/env node
/**
 * The baseline record, taken once on the real machine: the JSON record on stdout and the bilingual human
 * summary on stderr, so the record can be piped to a file without the summary in it.
 *
 *   node record.mjs [--home dir] [--fleet dir] [--projects dir] [--b100 dir] [--discovery dir]
 *                   [--backup-git-dir dir] [--capture file] [--replay file] [--runs N]
 *
 * Exit 0 when every piece was measured, 1 when some piece was not (the JSON is still printed and the summary
 * names it NOT MEASURED), 2 for misuse. `--home` is read; `--fleet` is the checkout whose `hook-dispatch/` runs
 * the Stop guards, so their journals are written there and never into the real home.
 *
 * @es El registro base, tomado una vez en la máquina real: el registro JSON en stdout y el resumen humano
 * bilingüe en stderr, para poder redirigir el registro a un fichero sin el resumen. Salida 0 si todo se midió,
 * 1 si alguna pieza no (el JSON se imprime igual y el resumen la nombra SIN MEDIR), 2 por mal uso. `--home` se
 * lee; `--fleet` es el checkout cuyo `hook-dispatch/` corre las guardias de Stop, así que sus journals se
 * escriben allí y nunca en el home real.
 */

import { parseArgs } from 'node:util';

import { buildRecord, problemsOf } from './collect.mjs';
import { optionsFrom } from './options.mjs';
import { renderSummary } from './summary.mjs';

const OPTIONS = Object.fromEntries(['home', 'fleet', 'projects', 'b100', 'discovery', 'backup-git-dir', 'capture', 'replay', 'runs'].map((name) => [name, { type: 'string' }]));
const USAGE_EN = 'Usage: record.mjs [--home dir] [--fleet dir] [--projects dir] [--b100 dir] [--discovery dir] [--backup-git-dir dir] [--capture file] [--replay file] [--runs N].';
const USAGE_ES = 'Uso: record.mjs [--home dir] [--fleet dir] [--projects dir] [--b100 dir] [--discovery dir] [--backup-git-dir dir] [--capture fichero] [--replay fichero] [--runs N].';

let options;

try {
  options = optionsFrom(parseArgs({ args: process.argv.slice(2), options: OPTIONS }).values);
} catch (error) {
  process.stderr.write(`REFUSED: ${error.message}. ${USAGE_EN} @es RECHAZADO: argumentos inválidos (${error.message}). ${USAGE_ES}\n`);
  process.exit(2);
}

const record = buildRecord(options);

process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
process.stderr.write(`${renderSummary(record).join('\n')}\n`);
process.exitCode = problemsOf(record).length === 0 ? 0 : 1;
