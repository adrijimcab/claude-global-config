#!/usr/bin/env node
/**
 * The per-guard FALSE-BLOCK RATE report (the folder keeps its old name `guard-precision/` because the live
 * state paths depend on it). For every mechanism with a state directory it reads the v2 journal
 * (`journal.jsonl`) through `blocks.mjs`: the blocks, and the blocks a human LABELLED, `false`
 * (`dismissal`, `false-positive-report`) or `correct` (`true-positive-report`). The rate is estimated ONLY
 * from labelled blocks: falseBlockRate = labelled-false / labelled, with a 95% Wilson interval. An unlabelled
 * block contributes nothing, because counting it as correct is what inflated the old precision figure. A
 * guard with fewer than 10 labelled blocks reads `insufficient` and no rate, no percent and no interval is
 * printed or computed for it, so a guard nobody labelled can never read 0% or 100%. Label a sample by hand
 * with `label.mjs`. Every other line (v1 lines, a torn line, an unknown kind, no `blockId`, any other
 * `*.jsonl` beside the journal) is UNCLASSIFIED and counted per file. `--json` prints the report
 * untranslated; otherwise a bilingual table is printed through `bilingual-output/`.
 *
 * @es El informe de TASA DE FALSOS BLOQUEOS por guard (la carpeta conserva su nombre antiguo
 * `guard-precision/` porque las rutas de estado vivas dependen de él). De cada mecanismo con directorio de
 * estado lee el journal v2 (`journal.jsonl`) a través de `blocks.mjs`: los bloqueos y los que una persona
 * ETIQUETÓ, `false` (`dismissal`, `false-positive-report`) o `correct` (`true-positive-report`). La tasa se
 * estima SOLO con bloqueos etiquetados: tasaFalsosBloqueos = falsos etiquetados / etiquetados, con un
 * intervalo de Wilson del 95 %. Un bloqueo sin etiquetar no aporta nada, porque contarlo como acertado era
 * lo que inflaba la antigua cifra de precisión. Un guard con menos de 10 bloqueos etiquetados dice
 * `insufficient` y no se calcula ni se imprime tasa, porcentaje ni intervalo, así que un guard que nadie
 * etiquetó nunca puede leerse como 0 % ni 100 %. Etiqueta una muestra a mano con `label.mjs`. Toda otra
 * línea (v1, cortada, tipo desconocido, sin `blockId`, otro `*.jsonl` junto al journal) es SIN CLASIFICAR y
 * se cuenta por fichero. `--json` imprime el informe sin traducir; si no, una tabla bilingüe por
 * `bilingual-output/`.
 */

import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { FALSE_LABEL, classifyBlocks, mechanismNames, readMechanism } from './blocks.mjs';
import { MESSAGE_TABLE } from './report-messages.mjs';

/** The labelled blocks a guard needs before a rate is printed. @es Los bloqueos etiquetados que un guard necesita antes de imprimir una tasa. */
export const MIN_LABELLED = 10;

/** The normal quantile of a two-sided 95% interval. @es El cuantil normal de un intervalo bilateral del 95 %. */
const Z_95 = 1.96;

/**
 * The 95% Wilson score interval of `falseCount` out of `total`, or null for an empty population. It is
 * clamped to [0, 1]: the formula overshoots by rounding at the edges (0 of n, n of n).
 * @es El intervalo de Wilson del 95 % de `falseCount` sobre `total`, o null si la población está vacía. Se acota a [0, 1]: la fórmula se pasa por redondeo en los bordes (0 de n, n de n).
 */
export function wilsonInterval(falseCount, total) {
  if (total === 0) return null;

  const proportion = falseCount / total;
  const scale = 1 + Z_95 ** 2 / total;
  const center = (proportion + Z_95 ** 2 / (2 * total)) / scale;
  const margin = (Z_95 * Math.sqrt((proportion * (1 - proportion)) / total + Z_95 ** 2 / (4 * total ** 2))) / scale;

  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/** The figures of one mechanism. @es Las cifras de un mecanismo. */
function summarize(mechanism, { records, unclassifiedFiles }) {
  const { decisions, labels, orphaned } = classifyBlocks(records);
  const labelled = labels.size;
  const falseBlocks = [...labels.values()].filter((label) => label === FALSE_LABEL).length;
  const status = labelled < MIN_LABELLED ? 'insufficient' : 'ok';

  return {
    mechanism,
    blocks: decisions.size,
    labelled,
    falseBlocks,
    correctBlocks: labelled - falseBlocks,
    orphaned,
    unclassified: Object.values(unclassifiedFiles).reduce((sum, count) => sum + count, 0),
    unclassifiedFiles,
    falseBlockRate: status === 'ok' ? falseBlocks / labelled : null,
    interval: status === 'ok' ? wilsonInterval(falseBlocks, labelled) : null,
    status
  };
}

/**
 * The report of every mechanism with a journal file, read now.
 * @es El informe de cada mecanismo con un fichero de journal, leído ahora.
 * @param options.readDirectory Replaces `fs.readdirSync` (a test seam for a listing order the platform does not give). @es Sustituye a `fs.readdirSync` (punto de prueba para un orden de listado que la plataforma no da).
 */
export function buildReport({ readDirectory = readdirSync } = {}) {
  const guards = mechanismNames(readDirectory)
    .map((mechanism) => ({ mechanism, read: readMechanism(mechanism, readDirectory) }))
    .filter(({ read }) => read.records.length + Object.keys(read.unclassifiedFiles).length > 0)
    .map(({ mechanism, read }) => summarize(mechanism, read));

  return { guards, unclassifiedTotal: guards.reduce((sum, guard) => sum + guard.unclassified, 0) };
}

const ROW_OF = { ok: 'row-ok', insufficient: 'row-insufficient' };

/** A fraction as a percent with one decimal. @es Una fracción como porcentaje con un decimal. */
const percentOf = (fraction) => (fraction * 100).toFixed(1);

/** Prints the bilingual table of `report`. @es Imprime la tabla bilingüe de `report`. */
function printTable(report, speaker) {
  if (report.guards.length === 0) speaker.say('no-journals');

  for (const guard of report.guards) {
    const figures = guard.status === 'ok' ? { percent: percentOf(guard.falseBlockRate), low: percentOf(guard.interval.low), high: percentOf(guard.interval.high) } : {};

    speaker.say(ROW_OF[guard.status], { ...guard, ...figures, minimum: MIN_LABELLED });
    if (guard.orphaned.length > 0) speaker.say('orphans', { mechanism: guard.mechanism, ids: guard.orphaned.join(', ') });
  }

  if (report.unclassifiedTotal > 0) speaker.say('unclassified-total', { count: report.unclassifiedTotal });
}

/**
 * Runs the command on `argv` and returns its exit code: 0 printed, 2 refused.
 * @es Corre el comando sobre `argv` y devuelve su código de salida: 0 impreso, 2 rechazado.
 */
export function main(argv, { sink = console } = {}) {
  const speaker = makeSpeaker(MESSAGE_TABLE, sink);
  const unknown = argv.find((argument) => argument !== '--json');

  if (unknown !== undefined) {
    speaker.complain('unknown-option', { option: unknown });

    return 2;
  }

  const report = buildReport();

  if (argv.includes('--json')) speaker.data(JSON.stringify(report));
  else printTable(report, speaker);

  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
