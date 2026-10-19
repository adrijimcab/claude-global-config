#!/usr/bin/env node
/**
 * Measures the pending judge against a real model: every fixture of `fixtures/` goes through the rubric of
 * `prompt.mjs` N times, by the same model call (`../judge-gate/model.mjs`) and the same verdict reader the gate
 * uses, and prints the RECALL on the fixtures expected to be blocked (`expect: fail`: the share the judge blocked)
 * and the PRECISION on the fixtures expected to pass (`expect: pass`: the share it let through), per run and over
 * the real fixtures (`real` in their source) apart from all. It also prints how many fixtures the lexical
 * prefilter would send to the judge, since the pipeline's recall is the prefilter's AND the judge's. The judge is
 * a model call, so the selftest only pins its text; this script is the measurement of what the text DOES. A tool,
 * not a gate: it costs money and is nondeterministic. A `?` is an answer that is no rubric verdict (the gate would
 * pass it as a malfunction), counted as neither. Usage:
 * `node pending-judge/measure.mjs [--runs N] [--model haiku] [--parallel N] [--only id,id]`.
 *
 * @es Mide el juez de pendientes contra un modelo real: cada fixture pasa N veces por la rúbrica, con la misma
 * llamada al modelo y el mismo lector de veredictos de la compuerta, e imprime el RECALL sobre los que deben
 * bloquearse y la PRECISIÓN sobre los que deben pasar, por corrida, sobre los fixtures reales y sobre todos.
 * También cuenta cuántos fixtures enviaría el prefiltro léxico al juez: el recall del conjunto es el del
 * prefiltro Y el del juez. Una herramienta, no un gate: cuesta dinero y no es determinista.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCandidate } from '../backlog-guard/announcement.mjs';
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

/** One judged run; the cost, the latency and the reason travel with the verdict. @es Una corrida juzgada. */
async function judge(message, model) {
  try {
    const { answer, costUsd, durationMs } = await askModel(promptFor(message), { timeoutMs: 120000, model });
    const verdict = verdictOf(answer);

    if (verdict === null) console.error(`? not a rubric verdict: ${String(answer).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { verdict, costUsd, durationMs, answer };
  } catch (error) {
    console.error(`? model call failed: ${String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { verdict: null, costUsd: 0, durationMs: 0, answer: '' };
  }
}

/** The share of `part` in `whole`, as a percentage with one decimal. @es La proporción de `part` en `whole`. */
const percent = (part, whole) => (whole === 0 ? 'n/a' : `${((100 * part) / whole).toFixed(1)}%`);

async function main(argv) {
  const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  const runs = Number(option('--runs', '3'));
  const model = option('--model', 'haiku');
  const parallel = Number(option('--parallel', '6'));
  const only = option('--only', '')?.split(',').filter(Boolean);
  const fixtures = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8'))).filter((fixture) => only.length === 0 || only.includes(fixture.id));
  const jobs = fixtures.flatMap((fixture) => Array.from({ length: runs }, (_, run) => ({ fixture, run })));
  const results = new Map();
  let next = 0;
  let cost = 0;
  const latencies = [];

  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < jobs.length) {
      const job = jobs[next];

      next += 1;

      const result = await judge(job.fixture.message, model);

      cost += result.costUsd;
      latencies.push(result.durationMs);
      results.set(`${job.fixture.id}#${job.run}`, result);
    }
  }));

  const reach = (subset) => subset.filter((fixture) => findCandidate(fixture.message) !== undefined);
  const red = fixtures.filter((fixture) => fixture.expect === 'fail');
  const green = fixtures.filter((fixture) => fixture.expect === 'pass');

  console.log(`fixtures=${String(fixtures.length)} (expected block ${String(red.length)}, expected pass ${String(green.length)}) prefilter reaches the judge: blocks ${String(reach(red).length)}/${String(red.length)}, passes ${String(reach(green).length)}/${String(green.length)}`);
  for (const fixture of red) if (findCandidate(fixture.message) === undefined) console.log(`    prefilter MISSED ${fixture.id}`);

  for (let run = 0; run < runs; run += 1) {
    const line = (label, subset) => {
      const subRed = subset.filter((fixture) => fixture.expect === 'fail');
      const subGreen = subset.filter((fixture) => fixture.expect === 'pass');
      const verdict = (fixture) => results.get(`${fixture.id}#${run}`).verdict;
      const caught = subRed.filter((fixture) => verdict(fixture) === false);
      const letThrough = subGreen.filter((fixture) => verdict(fixture) === true);
      const unknown = subset.filter((fixture) => verdict(fixture) === null).length;
      const unknowable = subset.filter((fixture) => fixture.expect === 'unknowable');

      if (unknowable.length > 0) console.log(`run ${String(run + 1)} ${label.padEnd(5)} unknowable (the item is recorded in a store the reply does not cite; not an error either way): blocked ${String(unknowable.filter((fixture) => verdict(fixture) === false).length)}/${String(unknowable.length)}`);

      console.log(`run ${String(run + 1)} ${label.padEnd(5)} recall ${percent(caught.length, subRed.length)} (${String(caught.length)}/${String(subRed.length)}) precision ${percent(letThrough.length, subGreen.length)} (${String(letThrough.length)}/${String(subGreen.length)}) malfunction=${String(unknown)}`);

      if (label === 'all') {
        if (argv.includes('--explain')) for (const fixture of subRed) if (verdict(fixture) === false) console.log(`    caught         ${fixture.id} :: ${String(readVerdict(results.get(`${fixture.id}#${run}`).answer, MARKER).reason).slice(0, 300)}`);
        for (const fixture of subRed) if (verdict(fixture) !== false) console.log(`    missed block   ${fixture.id}${argv.includes('--explain') ? ` :: answer ${String(results.get(`${fixture.id}#${run}`).answer).replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
        for (const fixture of subGreen) if (verdict(fixture) !== true) console.log(`    wrong block    ${fixture.id}${argv.includes('--explain') ? ` :: ${String(readVerdict(results.get(`${fixture.id}#${run}`).answer, MARKER).reason).slice(0, 260)}` : ''}`);
      }
    };

    line('real', fixtures.filter((fixture) => String(fixture.source).startsWith('real')));
    line('all', fixtures);
  }

  latencies.sort((left, right) => left - right);
  console.log(`cost=$${cost.toFixed(4)} (mean $${(cost / Math.max(1, latencies.length)).toFixed(5)}/run) latency median=${latencies[Math.floor(latencies.length / 2)] ?? 0}ms max=${latencies.at(-1) ?? 0}ms`);

  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(await main(process.argv.slice(2)));
