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

    const verdict = verdictOf(answer);

    if (verdict === null) console.error(`? not a rubric verdict: ${String(answer).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { verdict, costUsd, durationMs };
  } catch (error) {
    console.error(`? model call failed: ${String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { verdict: null, costUsd: 0, durationMs: 0 };
  }
}

/** The share of `part` in `whole`, as a percentage with one decimal. @es La proporción de `part` en `whole`, en porcentaje con un decimal. */
const percent = (part, whole) => (whole === 0 ? 'n/a' : `${((100 * part) / whole).toFixed(1)}%`);

/**
 * The calibration view: `--rates` runs every fixture `runs` times, `--parallel` calls at a time, and prints for each
 * run the RECALL on the fixtures expected to fail (the share the judge blocked) and the PRECISION on the fixtures
 * expected to pass (the share it let through), for the real labelled set (`real-*`) and for all fixtures. A `?` is
 * counted as neither: it is a malfunction, reported apart. Exit 1 when a run misses the ship bar (recall 90,
 * precision 95) on the real set. @es La vista de calibración: ejecuta cada fixture `runs` veces, `--parallel`
 * llamadas a la vez, e imprime por corrida el RECALL sobre los que deben fallar y la PRECISIÓN sobre los que deben
 * pasar, del conjunto real etiquetado (`real-*`) y de todos. Un `?` no cuenta como ninguno: es un mal funcionamiento.
 */
async function rates(fixtures, runs, model, parallel, prefix) {
  const jobs = fixtures.flatMap((fixture) => Array.from({ length: runs }, (_, run) => ({ fixture, run })));
  const verdicts = new Map();
  let next = 0;
  let cost = 0;

  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < jobs.length) {
      const job = jobs[next];

      next += 1;

      const result = await judge(job.fixture.message, model);

      cost += result.costUsd;
      verdicts.set(`${job.fixture.id}#${job.run}`, result.verdict);
    }
  }));

  let ships = true;

  for (let run = 0; run < runs; run += 1) {
    const line = (label, subset) => {
      const red = subset.filter((fixture) => fixture.expect === 'fail');
      const green = subset.filter((fixture) => fixture.expect === 'pass');
      const caught = red.filter((fixture) => verdicts.get(`${fixture.id}#${run}`) === false);
      const letThrough = green.filter((fixture) => verdicts.get(`${fixture.id}#${run}`) === true);
      const unknown = subset.filter((fixture) => verdicts.get(`${fixture.id}#${run}`) === null).length;

      console.log(`run ${run + 1} ${label.padEnd(5)} recall ${percent(caught.length, red.length)} (${caught.length}/${red.length}) precision ${percent(letThrough.length, green.length)} (${letThrough.length}/${green.length}) malfunction=${unknown}`);
      for (const fixture of red) if (verdicts.get(`${fixture.id}#${run}`) !== false) console.log(`    missed red    ${fixture.id}`);
      for (const fixture of green) if (verdicts.get(`${fixture.id}#${run}`) !== true) console.log(`    blocked green ${fixture.id}`);

      return { recall: caught.length / Math.max(1, red.length), precision: letThrough.length / Math.max(1, green.length) };
    };
    const real = line('set', fixtures.filter((fixture) => fixture.id.startsWith(prefix)));

    line('all', fixtures);
    if (real.recall < 0.9 || real.precision < 0.95) ships = false;
  }

  console.log(`cost=$${cost.toFixed(4)} ship-bar(real set, every run: recall>=90% and precision>=95%)=${ships ? 'MET' : 'NOT MET'}`);

  return ships ? 0 : 1;
}

async function main(argv) {
  const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const runs = Number(option('--runs', '3'));
  const model = option('--model', 'haiku');
  const only = option('--only', '')?.split(',').filter(Boolean);
  const fixtures = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8'))).filter((fixture) => only.length === 0 || only.includes(fixture.id));
  const prefix = option('--prefix', 'real-');

  if (argv.includes('--rates')) return rates(argv.includes('--prefix') ? fixtures.filter((fixture) => fixture.id.startsWith(prefix)) : fixtures, runs, model, Number(option('--parallel', '6')), prefix);

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
