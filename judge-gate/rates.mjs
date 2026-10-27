#!/usr/bin/env node
/**
 * The LIVE rates of the Stop judges, read from the outcome log the gate writes (`outcome-log.mjs`): per judge, how
 * many first stops the model judged and what share of them it blocked, with the Wilson interval (`wilson.mjs`), plus
 * the continued stops, the capped ones, the non-verdicts, the malfunctions, the cost and the median latency.
 *
 *   node judge-gate/rates.mjs [--judge <name>] [--since <ISO date or instant>] [--log <outcomes.jsonl>]
 *
 * Exit 0 once printed; 2 when nothing was measured: the log is missing or unreadable, or an option is wrong. A
 * missing log is never a clean zero, it is a log nobody wrote.
 *
 * WHAT COUNTS. The block rate is over FIRST stops (`continued` absent) whose outcome is a model verdict: `pass`,
 * `block` or `shadow-block` with no `cause` (a block with a `cause` is the pending judge's fallback, the gate's text
 * and not the model's verdict, and is counted apart). A continued stop is the rewrite after a block, so it is not a
 * new reply and stays out of the rate. A shadow block counts as a block: the rate measures what the judge decided,
 * whatever its mode.
 *
 * WHAT IT DOES NOT SAY. A block rate is not a false-block rate: it says how often the judge blocks, never whether
 * the owner would have. Only owner labels say that (`../voice-judge/DECISION.md`).
 *
 * @es Las tasas EN VIVO de los jueces de Stop, leídas del registro de desenlaces que escribe la compuerta: por juez,
 * cuántas primeras paradas juzgó el modelo y qué parte bloqueó, con el intervalo de Wilson, más las paradas
 * continuadas, las topadas, los no-veredictos, los fallos, el costo y la latencia mediana. Sale con 0 al imprimir; con
 * 2 si no se midió nada: el registro falta o es ilegible, o una opción es incorrecta. Un registro ausente nunca es un
 * cero limpio. QUÉ CUENTA: la tasa de bloqueo es sobre PRIMERAS paradas cuyo desenlace es un veredicto del modelo
 * (`pass`, `block` o `shadow-block` sin `cause`; un bloqueo con `cause` es el respaldo del juez de pendientes y se
 * cuenta aparte). Una parada continuada es el reescrito tras un bloqueo y queda fuera de la tasa. Un bloqueo en sombra
 * cuenta como bloqueo. QUÉ NO DICE: una tasa de bloqueo no es una tasa de falsos bloqueos; eso solo lo dicen las
 * etiquetas del dueño.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JUDGE_NAMES } from './judges.mjs';
import { outcomesPath } from './outcome-log.mjs';
import { describeRate } from './wilson.mjs';

const EXIT_NOT_MEASURED = 2;

/** The outcomes that are a model verdict. @es Los desenlaces que son un veredicto del modelo. */
const VERDICTS = Object.freeze(['pass', 'block', 'shadow-block']);

/** Whether a judged record is a block, live or in shadow. @es Si un registro juzgado es un bloqueo, vivo o en sombra. */
const verdictBlock = (record) => record.outcome === 'block' || record.outcome === 'shadow-block';

/** The middle value of `values`, 0 for none. @es El valor del medio de `values`, 0 si no hay. */
function median(values) {
  const sorted = [...values].sort((left, right) => left - right);

  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)];
}

/**
 * The records of a log text: one JSON object per line, torn or blank lines skipped and counted.
 * @es Los registros de un texto de registro: un objeto JSON por línea; las líneas rotas o vacías se saltan y se cuentan.
 */
export function parseLog(text) {
  const records = [];
  let torn = 0;

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;

    try {
      const record = JSON.parse(line);

      if (record !== null && typeof record === 'object' && !Array.isArray(record)) records.push(record);
      else torn += 1;
    } catch {
      torn += 1;
    }
  }

  return { records, torn };
}

/**
 * The rates of `judge` over `records` from `sinceMs` on (epoch milliseconds, records without a readable `ts` are
 * left out once a start is given).
 * @es Las tasas de `judge` sobre `records` desde `sinceMs` (los registros sin `ts` legible quedan fuera si hay inicio).
 */
export function ratesOf(records, judge, sinceMs) {
  const mine = records.filter((record) => record.judge === judge && (sinceMs === undefined || Date.parse(record.ts) >= sinceMs));
  const first = mine.filter((record) => record.continued !== true);
  const judged = first.filter((record) => VERDICTS.includes(record.outcome) && record.cause === undefined);
  const asked = mine.filter((record) => record.durationMs > 0);

  return {
    judge,
    stops: mine.length,
    firstJudged: judged.length,
    firstBlocked: judged.filter(verdictBlock).length,
    shadowBlocks: mine.filter((record) => record.outcome === 'shadow-block').length,
    continued: mine.filter((record) => record.continued === true).length,
    capped: mine.filter((record) => record.outcome === 'pass-continued-capped').length,
    nonVerdict: mine.filter((record) => record.outcome === 'non-verdict' || record.cause === 'non-verdict').length,
    fallbackBlocks: mine.filter((record) => record.outcome === 'block' && record.cause !== undefined).length,
    malfunction: mine.filter((record) => record.outcome === 'malfunction').length,
    costUsd: mine.reduce((sum, record) => sum + (Number.isFinite(record.costUsd) ? record.costUsd : 0), 0),
    medianMs: median(asked.map((record) => record.durationMs)),
  };
}

/** The lines printed for one judge's rates. @es Las líneas impresas para las tasas de un juez. */
export function rateLines(rates) {
  const rate = describeRate(rates.firstBlocked, rates.firstJudged);

  return [
    `${rates.judge}: first-stop block rate ${rate.en} over ${rates.stops} stops @es ${rates.judge}: tasa de bloqueo en primeras paradas ${rate.es} sobre ${rates.stops} paradas`,
    `  shadow-blocks=${rates.shadowBlocks} continued=${rates.continued} capped=${rates.capped} non-verdict=${rates.nonVerdict} fallback-blocks=${rates.fallbackBlocks} malfunction=${rates.malfunction} cost=$${rates.costUsd.toFixed(4)} median=${rates.medianMs}ms @es  bloqueos-en-sombra=${rates.shadowBlocks} continuadas=${rates.continued} topadas=${rates.capped} no-veredictos=${rates.nonVerdict} bloqueos-de-respaldo=${rates.fallbackBlocks} fallos=${rates.malfunction} costo=$${rates.costUsd.toFixed(4)} mediana=${rates.medianMs}ms`,
  ];
}

/** The value after `name` in `argv`, `undefined` when absent; throws when the value is missing. @es El valor tras `name`. */
function option(argv, name) {
  if (!argv.includes(name)) return undefined;

  const value = argv[argv.indexOf(name) + 1];

  if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value @es ${name} necesita un valor`);

  return value;
}

/**
 * The command line: prints the rates of every judge, or of `--judge`, and returns the exit code. `read` reads the
 * log (a seam for the selftest), `print` prints a line.
 * @es La línea de comandos: imprime las tasas de cada juez, o de `--judge`, y devuelve el código de salida.
 */
export function main(argv, { read = (file) => readFileSync(file, 'utf8'), print = (line) => console.log(line) } = {}) {
  let judges;
  let sinceMs;
  let file;

  try {
    const judge = option(argv, '--judge');
    const since = option(argv, '--since');

    if (judge !== undefined && !JUDGE_NAMES.includes(judge)) throw new Error(`unknown judge "${judge}" (known: ${JUDGE_NAMES.join(', ')}) @es juez desconocido "${judge}" (conocidos: ${JUDGE_NAMES.join(', ')})`);
    if (since !== undefined && !Number.isFinite(Date.parse(since))) throw new Error(`--since is not a date: "${since}" @es --since no es una fecha: "${since}"`);
    judges = judge === undefined ? JUDGE_NAMES : [judge];
    sinceMs = since === undefined ? undefined : Date.parse(since);
    file = option(argv, '--log') ?? outcomesPath();
  } catch (error) {
    console.error(`NOT MEASURED (NO MEDIDO): ${error.message}`);

    return EXIT_NOT_MEASURED;
  }

  let text;

  try {
    text = read(file);
  } catch (error) {
    console.error(`NOT MEASURED: the outcome log ${file} cannot be read (${error.code ?? error.message}); a log nobody wrote is not a zero. @es NO MEDIDO: no se puede leer el registro ${file}; un registro que nadie escribió no es un cero.`);

    return EXIT_NOT_MEASURED;
  }

  const { records, torn } = parseLog(text);

  print(`log=${file} records=${records.length} torn=${torn}${sinceMs === undefined ? '' : ` since=${new Date(sinceMs).toISOString()}`} @es registro=${file} registros=${records.length} rotos=${torn}`);
  for (const judge of judges) for (const line of rateLines(ratesOf(records, judge, sinceMs))) print(line);

  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(main(process.argv.slice(2)));
