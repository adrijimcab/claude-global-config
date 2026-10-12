#!/usr/bin/env node
/**
 * Measures the voice judge against a real model: every fixture of `fixtures/` goes through the rubric of
 * `prompt.mjs` N times, by the same model call and the same verdict reader the gate uses (`../judge-gate/`), and
 * the pass/fail matrix is printed with the cost and latency of the runs. The judge is a model call, so the
 * selftest can only pin its text; this script is the measurement of what the text DOES. It is a tool, not a
 * gate: it calls a model (cost, latency, nondeterminism), so no selftest runs it. Usage:
 * `node voice-judge/measure.mjs [--runs N] [--model haiku] [--only id,id]`. Exit 1 when a fixture with an
 * expectation (`pass` or `fail`) did not get it in every run. A `?` is an answer that is no rubric verdict: the
 * gate would pass it as a malfunction.
 *
 * @es Mide el juez de voz contra un modelo real: cada fixture de `fixtures/` pasa N veces por la rúbrica de
 * `prompt.mjs`, con la misma llamada al modelo y el mismo lector de veredictos que usa la compuerta, y se imprime
 * la matriz pasa/falla con el costo y la latencia de las corridas. El juez es una llamada a un modelo, así que
 * el selftest solo fija su texto; este script mide qué HACE ese texto. Es una herramienta, no un gate. Sale con
 * 1 si un fixture con expectativa no la cumplió en todas las corridas. Un `?` es una respuesta que no es
 * veredicto de rúbrica: la compuerta la dejaría pasar como fallo de funcionamiento.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { askModel } from '../judge-gate/model.mjs';
import { readVerdict } from '../judge-gate/verdict.mjs';
import { MARKER, PROMPT } from './prompt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The rubric with the hook input a Stop payload would carry. @es La rúbrica con la entrada que llevaría un payload de Stop. */
export const promptFor = (message) => PROMPT.replace('$ARGUMENTS', () => JSON.stringify({ hook_event_name: 'Stop', session_id: 'measure', stop_hook_active: false, last_assistant_message: message }));

/** The verdict in the model's answer: `true` pass, `false` block, `null` no rubric verdict. @es El veredicto: `true` pasa, `false` bloquea, `null` no es veredicto de rúbrica. */
export function verdictOf(answer) {
  const { kind } = readVerdict(answer, MARKER);

  return kind === 'pass' ? true : kind === 'block' ? false : null;
}

/** One judged run; the cost and latency of the call travel with the verdict. @es Una corrida juzgada; costo y latencia viajan con el veredicto. */
async function judge(message, model) {
  try {
    const { answer, costUsd, durationMs } = await askModel(promptFor(message), { timeoutMs: 120000, model });

    return { verdict: verdictOf(answer), costUsd, durationMs };
  } catch {
    return { verdict: null, costUsd: 0, durationMs: 0 };
  }
}

async function main(argv) {
  const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const runs = Number(option('--runs', '3'));
  const model = option('--model', 'haiku');
  const only = option('--only', '')?.split(',').filter(Boolean);
  const fixtures = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8'))).filter((fixture) => only.length === 0 || only.includes(fixture.id));
  let wrong = 0;
  let cost = 0;
  const latencies = [];

  for (const fixture of fixtures) {
    const results = [];

    for (let run = 0; run < runs; run += 1) results.push(await judge(fixture.message, model));

    const verdicts = results.map((result) => result.verdict);
    const wanted = fixture.expect === 'pass' ? true : fixture.expect === 'fail' ? false : undefined;
    const met = wanted === undefined ? 'n/a' : verdicts.every((verdict) => verdict === wanted) ? 'OK' : 'MISS';

    cost += results.reduce((sum, result) => sum + result.costUsd, 0);
    latencies.push(...results.map((result) => result.durationMs));
    if (met === 'MISS') wrong += 1;
    console.log(`${met.padEnd(4)} ${fixture.id.padEnd(40)} expect=${fixture.expect.padEnd(10)} ${verdicts.map((verdict) => (verdict === null ? '?' : verdict ? 'pass' : 'FAIL')).join(' ')}`);
  }

  latencies.sort((left, right) => left - right);
  console.log(`runs=${latencies.length} cost=$${cost.toFixed(4)} (mean $${(cost / Math.max(1, latencies.length)).toFixed(5)}/run) latency median=${latencies[Math.floor(latencies.length / 2)] ?? 0}ms max=${latencies.at(-1) ?? 0}ms`);

  return wrong === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(await main(process.argv.slice(2)));
