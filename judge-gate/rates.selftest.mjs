#!/usr/bin/env node
/**
 * Selftest of the live judge rates (`rates.mjs`) and of the Wilson interval they print (`wilson.mjs`): the interval
 * against published values, what counts as a judged first stop and as a block, the window, and the command line,
 * including a missing log, which is "not measured" and never a zero. No model is called; the log is a seam.
 *
 * @es Selftest de las tasas en vivo de los jueces y del intervalo de Wilson que imprimen: el intervalo contra valores
 * publicados, qué cuenta como primera parada juzgada y como bloqueo, la ventana y la línea de comandos, incluido un
 * registro ausente, que es «no medido» y nunca un cero. No se llama a ningún modelo; el registro es inyectable.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = mkdtempSync(path.join(tmpdir(), 'judge-rates-'));

let summarised = false;
process.on('exit', () => {
  rmSync(SCRATCH, { recursive: true, force: true });
  if (summarised) return;

  console.error('FAIL the selftest exited before printing its summary @es FALLO el selftest salió antes de imprimir su resumen');
  process.exitCode = 1;
});

const { describeRate, percentOf, wilson, Z95 } = await import('./wilson.mjs');
const { main, parseLog, rateLines, ratesOf } = await import('./rates.mjs');

let passed = 0;
const failures = [];
const check = (label, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else failures.push(`${label}: got ${JSON.stringify(actual)?.slice(0, 300)}, expected ${JSON.stringify(expected)?.slice(0, 300)}`);
};
const round = (interval) => (interval === undefined ? undefined : [interval.rate, interval.low, interval.high].map((value) => Number(value.toFixed(4))));

// --- WILSON. Reference values: Wilson score interval, z = 1.96 (Newcombe 1998, table I: 0/10, 1/10, 81/263).
// @es WILSON. Valores de referencia publicados.
check('wilson: the quantile is the two-sided 95% one', Z95, 1.959963984540054);
check('wilson: 0 of 10', round(wilson(0, 10)), [0, 0, 0.2775]);
check('wilson: 1 of 10', round(wilson(1, 10)), [0.1, 0.0179, 0.4042]);
check('wilson: 81 of 263', round(wilson(81, 263)), [0.308, 0.2553, 0.3662]);
check('wilson: 10 of 10 mirrors 0 of 10', round(wilson(10, 10)), [1, 0.7225, 1]);
check('wilson: 7 of 9, the v8g owner greens blocked on 2026-10-26', round(wilson(7, 9)), [0.7778, 0.4526, 0.9368]);
check('wilson: rounding never puts an end outside [0, 1] (raw 0/21 is below zero, raw 11/11 above one)', [wilson(0, 21).low, wilson(11, 11).high, describeRate(0, 21).en.includes('-0.0%')], [0, 1, false]);
check('wilson: a wider quantile widens the interval', wilson(3, 10, 2.5758).low < wilson(3, 10).low && wilson(3, 10, 2.5758).high > wilson(3, 10).high, true);
check('wilson: no cases, a negative, a fraction or k above n is no measurement', [wilson(0, 0), wilson(-1, 5), wilson(1.5, 5), wilson(6, 5), wilson(1, 2.5), wilson(1, -2)], [undefined, undefined, undefined, undefined, undefined, undefined]);
check('wilson: the rate is printed as a percentage with one decimal', [percentOf(0.30801), percentOf(0), percentOf(1)], ['30.8%', '0.0%', '100.0%']);
check('wilson: a rate reads with its interval, in both halves', describeRate(1, 10), { en: '1/10 = 10.0% (Wilson 95% 1.8%-40.4%)', es: '1/10 = 10.0% (Wilson 95% 1.8%-40.4%)' });
check('wilson: no cases reads as not measured, never 0%', (() => { try { return describeRate(0, 0); } catch (error) { return `threw: ${error.message}`; } })(), { en: '0/0 (not measured)', es: '0/0 (no medido)' });

// --- WHAT COUNTS. @es QUÉ CUENTA.
const at = (minute) => new Date(Date.UTC(2026, 9, 26, 10, minute)).toISOString();
const rec = (minute, judge, outcome, extra = {}) => ({ ts: at(minute), judge, session: 's', outcome, costUsd: 0.001, durationMs: 1000, ...extra });
const free = (minute, judge, outcome, extra = {}) => ({ ...rec(minute, judge, outcome, extra), costUsd: 0, durationMs: 0 });
const LOG = [
  rec(1, 'voice', 'pass'),
  rec(2, 'voice', 'block', { reason: 'r' }),
  rec(3, 'voice', 'block', { reason: 'r', continued: true }),
  free(4, 'voice', 'pass-continued-capped', { continued: true }),
  rec(5, 'voice', 'shadow-block', { reason: 'r' }),
  rec(6, 'voice', 'non-verdict', { why: 'w' }),
  free(7, 'voice', 'malfunction', { why: 'w' }),
  free(8, 'voice', 'pass-nested'),
  free(9, 'voice', 'pass-no-message'),
  rec(10, 'pending', 'block', { reason: 'fb', cause: 'non-verdict' }),
  rec(11, 'pending', 'block', { reason: 'fb', cause: 'malfunction' }),
  rec(12, 'pending', 'pass'),
  rec(13, 'premise', 'pass'),
  rec(14, 'voice', 'pass', { continued: true }),
];
const voice = ratesOf(LOG, 'voice');

check('rates: first-stop verdicts are the pass, the block and the shadow block', [voice.firstJudged, voice.firstBlocked], [3, 2]);
check('rates: every stop of the judge is counted, other judges never', voice.stops, 10);
check('rates: continued, capped, shadow, non-verdict and malfunction are counted apart', [voice.continued, voice.capped, voice.shadowBlocks, voice.nonVerdict, voice.malfunction], [3, 1, 1, 1, 1]);
check('rates: the cost adds every record, the median latency is over the model calls only', [Number(voice.costUsd.toFixed(4)), voice.medianMs], [0.006, 1000]);

const pending = ratesOf(LOG, 'pending');

check('rates: a fallback block is not a model verdict, and its non-verdict cause is counted', [pending.firstJudged, pending.firstBlocked, pending.fallbackBlocks, pending.nonVerdict], [1, 0, 2, 1]);
check('rates: a judge with no stops has nothing measured', [ratesOf(LOG, 'nobody').stops, ratesOf(LOG, 'nobody').firstJudged, ratesOf(LOG, 'nobody').medianMs], [0, 0, 0]);
check('rates: the window starts at --since, inclusive', [ratesOf(LOG, 'voice', Date.parse(at(5))).firstJudged, ratesOf(LOG, 'voice', Date.parse(at(5))).firstBlocked, ratesOf(LOG, 'voice', Date.parse(at(5))).stops], [1, 1, 6]);
check('rates: a record without a readable time is outside any window', ratesOf([{ ...rec(1, 'voice', 'pass'), ts: 'x' }], 'voice', 0).stops, 0);
check('rates: the stops that asked no model never pull the median down', ratesOf([rec(1, 'voice', 'pass', { durationMs: 900 }), free(2, 'voice', 'pass-nested'), free(3, 'voice', 'pass-no-message'), free(4, 'voice', 'pass-nested')], 'voice').medianMs, 900);
check('rates: the median of an even count is the upper middle', ratesOf([rec(1, 'voice', 'pass', { durationMs: 10 }), rec(2, 'voice', 'pass', { durationMs: 30 }), rec(3, 'voice', 'pass', { durationMs: 20 }), rec(4, 'voice', 'pass', { durationMs: 40 })], 'voice').medianMs, 30);
check('rates: a non-finite cost counts as zero', ratesOf([{ ...rec(1, 'voice', 'pass'), costUsd: 'x' }], 'voice').costUsd, 0);

check('parse: torn, blank and non-object lines are skipped and counted', (({ records, torn }) => [records.length, torn])(parseLog(`${JSON.stringify(rec(1, 'voice', 'pass'))}\n\n{torn\n[1]\nnull\n${JSON.stringify(rec(2, 'voice', 'pass'))}\n`)), [2, 3]);

const lines = rateLines(voice);

check('lines: the rate is printed with its Wilson interval, in both languages', [lines[0].startsWith('voice: first-stop block rate 2/3 = 66.7% (Wilson 95% '), lines[0].includes(' over 10 stops @es voice: tasa de bloqueo en primeras paradas 2/3 = 66.7%')], [true, true]);
check('lines: the second line names every count and the cost, in both languages', [lines[1].includes('shadow-blocks=1 continued=3 capped=1 non-verdict=1 fallback-blocks=0 malfunction=1 cost=$0.0060 median=1000ms'), lines[1].includes('@es  bloqueos-en-sombra=1 continuadas=3 topadas=1 no-veredictos=1')], [true, true]);

// --- COMMAND LINE. @es LÍNEA DE COMANDOS.
const printed = [];
const print = (line) => printed.push(line);
const read = () => LOG.map((record) => JSON.stringify(record)).join('\n');
const stderr = [];
const safeMain = (argv, seams) => {
  try {
    return main(argv, seams);
  } catch (error) {
    return `threw: ${error.message}`;
  }
};
const consoleError = console.error;

console.error = (line) => stderr.push(String(line));

const allExit = safeMain([], { read, print });
const allPrinted = printed.splice(0);

check('cli: every judge is printed, in wiring order, after the log line', [allExit, allPrinted[0].startsWith('log='), allPrinted.filter((line) => /^\w+: first-stop/.test(line)).map((line) => line.split(':')[0])], [0, true, ['premise', 'voice', 'pending']]);
check('cli: --judge prints that judge only', [safeMain(['--judge', 'voice'], { read, print }), printed.splice(0).filter((line) => /^\w+: first-stop/.test(line)).map((line) => line.split(':')[0])], [0, ['voice']]);
check('cli: --since narrows the window and is printed', [safeMain(['--judge', 'voice', '--since', at(5)], { read, print }), printed.splice(0).join('\n').includes('voice: first-stop block rate 1/1 ')], [0, true]);
check('cli: --log names the file read', [safeMain(['--log', '/x/outcomes.jsonl'], { read: (file) => (file === '/x/outcomes.jsonl' ? read() : ''), print }), printed.splice(0)[0].startsWith('log=/x/outcomes.jsonl records=14 torn=0')], [0, true]);

stderr.length = 0;
check('cli: a missing log is not measured, exit 2, never a zero', [safeMain([], { read: () => { throw Object.assign(new Error('gone'), { code: 'ENOENT' }); }, print }), printed.splice(0).length, stderr.some((line) => line.startsWith('NOT MEASURED: the outcome log') && line.includes('ENOENT') && line.includes('@es NO MEDIDO'))], [2, 0, true]);
stderr.length = 0;
check('cli: an unknown judge, a bad date or an option with no value is not measured, in both languages', [safeMain(['--judge', 'tone'], { read, print }), safeMain(['--since', 'yesterday'], { read, print }), safeMain(['--judge'], { read, print }), safeMain(['--log', '--judge'], { read, print }), printed.length, stderr.every((line) => line.startsWith('NOT MEASURED (NO MEDIDO): ') && line.includes('@es'))], [2, 2, 2, 2, 0, true]);
console.error = consoleError;

// The real CLI over a file. @es La CLI real sobre un fichero.
const file = path.join(SCRATCH, 'outcomes.jsonl');

writeFileSync(file, `${LOG.map((record) => JSON.stringify(record)).join('\n')}\n`);

const cli = spawnSync(process.execPath, [path.join(HERE, 'rates.mjs'), '--judge', 'voice', '--log', file], { encoding: 'utf8' });
const missing = spawnSync(process.execPath, [path.join(HERE, 'rates.mjs'), '--log', path.join(SCRATCH, 'none.jsonl')], { encoding: 'utf8' });
const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(path.join(HERE, 'rates.mjs'))});`], { encoding: 'utf8' });

check('cli: the real command prints the rate and exits 0', [cli.status, cli.stdout.includes('voice: first-stop block rate 2/3 = 66.7%')], [0, true]);
check('cli: the real command exits 2 on a missing log', [missing.status, missing.stdout], [2, '']);
check('cli: importing the module prints nothing', [imported.status, imported.stdout], [0, '']);

summarised = true;
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`${passed}/${passed + failures.length} passed`);
process.exitCode = failures.length === 0 ? 0 : 1;
