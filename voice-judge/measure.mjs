#!/usr/bin/env node
/**
 * Measures the voice judge against a real model: every fixture of `fixtures/` goes through a rubric N times, by the
 * same model call and the same verdict reader the gate uses (`../judge-gate/`), and the pass/fail matrix is printed
 * with the cost and latency of the runs. The judge is a model call, so the selftest can only pin its text; this
 * script is the measurement of what the text DOES. It is a tool, not a gate: it calls a model (cost, latency,
 * nondeterminism), so no selftest runs a model through it; the selftest pins its pure parts (the rubric it loads,
 * the summary it prints). Usage:
 * `node voice-judge/measure.mjs [--runs N] [--model haiku] [--only id,id] [--rubric path/to/prompt.mjs]
 * [--rates [--prefix held-] [--parallel 6]]`. Every output starts with the path of the rubric it ran.
 *
 * CLASSES. A fixture's `expect` is `pass` or `fail` (labelled by the rubric as written), `owner-accepted` (a real
 * reply the owner accepted, whose rubric label is the owner's to adjudicate: excluded from recall and precision,
 * and the share the rubric blocks is printed apart as the false-positive rate the owner cares about) or `borderline`
 * (informational: judged and printed, never counted). A fixture with `pinsRule4: true` pins rule 4: a block whose
 * reason cites tuteo or usted on it is a rule-4 false positive, whatever its label.
 *
 * Exit 1 in the matrix view when a fixture with an expectation did not get it in every run, or a pinned fixture got
 * a rule-4 reason; in the `--rates` view when a run misses the ship bar on the held-out set. A `?` is an answer that
 * is no rubric verdict: the gate would pass it as a malfunction.
 *
 * @es Mide el juez de voz contra un modelo real: cada fixture de `fixtures/` pasa N veces por una rúbrica, con la
 * misma llamada al modelo y el mismo lector de veredictos que usa la compuerta, y se imprime la matriz pasa/falla
 * con el costo y la latencia. Es una herramienta, no un gate: el selftest no le hace llamar a un modelo, pero fija
 * sus partes puras (la rúbrica que carga y el resumen que imprime). Toda salida empieza por la ruta de la rúbrica.
 * CLASES: `pass` o `fail` (etiquetadas por la rúbrica tal como está escrita), `owner-accepted` (respuestas reales
 * que el dueño aceptó, cuya etiqueta adjudica él: fuera de recall y precisión, y la proporción que la rúbrica bloquea
 * se imprime aparte como la tasa de falsos positivos que le importa) y `borderline` (informativas: se juzgan y se
 * imprimen, nunca se cuentan). Un fixture con `pinsRule4: true` fija la regla 4: un bloqueo cuyo motivo cita tuteo
 * o usted sobre él es un falso positivo de la regla 4. Sale con 1 si un fixture con expectativa no la cumplió, si
 * un fixture fijado recibió un motivo de la regla 4, o, con `--rates`, si una corrida no alcanza la barra en el
 * conjunto reservado. Un `?` no es veredicto de rúbrica: la compuerta lo dejaría pasar como fallo de funcionamiento.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { askModel } from '../judge-gate/model.mjs';
import { readVerdict } from '../judge-gate/verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The rubric measured when `--rubric` is absent. @es La rúbrica medida cuando falta `--rubric`. */
export const DEFAULT_RUBRIC = path.join(HERE, 'prompt.mjs');

/**
 * The prefix of the held-out fixtures, never used to tune a rubric: the ship bar is computed on them and only them.
 * @es El prefijo de los fixtures reservados, nunca usados para ajustar una rúbrica: la barra se calcula solo sobre ellos.
 */
export const HELD_OUT_PREFIX = 'held-';

/**
 * The path of the rubric module the runs use: `DEFAULT_RUBRIC`, or the value of `--rubric`, which must be present
 * and must not be another flag. @es La ruta del módulo de rúbrica: `DEFAULT_RUBRIC`, o el valor de `--rubric`, que
 * debe estar y no puede ser otra opción.
 */
export function rubricPathOf(argv) {
  if (!argv.includes('--rubric')) return DEFAULT_RUBRIC;

  const value = argv[argv.indexOf('--rubric') + 1];

  if (value === undefined || value === '' || value.startsWith('--')) {
    throw new Error('--rubric needs the path of a rubric module after it @es --rubric necesita a continuación la ruta de un módulo de rúbrica');
  }

  return path.resolve(value);
}

/**
 * The rubric module at `file`: its `PROMPT` (a string holding `$ARGUMENTS`) and its `MARKER` (a non-empty string),
 * both required, so a wrong module is an error and never a silent run of another rubric.
 * @es El módulo de rúbrica en `file`: su `PROMPT` (un string con `$ARGUMENTS`) y su `MARKER` (un string no vacío),
 * ambos obligatorios, para que un módulo equivocado sea un error y nunca una corrida silenciosa de otra rúbrica.
 */
export async function loadRubric(file) {
  let module;

  try {
    module = await import(pathToFileURL(file).href);
  } catch (error) {
    throw new Error(`the rubric module ${file} cannot be loaded: ${error?.message ?? error} @es el módulo de rúbrica ${file} no se puede cargar`);
  }
  if (typeof module.PROMPT !== 'string' || !module.PROMPT.includes('$ARGUMENTS')) {
    throw new Error(`the rubric module ${file} exports no PROMPT string holding $ARGUMENTS @es el módulo de rúbrica ${file} no exporta un PROMPT string con $ARGUMENTS`);
  }
  if (typeof module.MARKER !== 'string' || module.MARKER === '') {
    throw new Error(`the rubric module ${file} exports no MARKER string @es el módulo de rúbrica ${file} no exporta un MARKER string`);
  }

  return { path: file, prompt: module.PROMPT, marker: module.MARKER };
}

/** The rubric with the hook input a Stop payload would carry. @es La rúbrica con la entrada que llevaría un payload de Stop. */
export const promptFor = (message, prompt) => prompt.replace('$ARGUMENTS', () => JSON.stringify({ hook_event_name: 'Stop', session_id: 'measure', stop_hook_active: false, last_assistant_message: message }));

/**
 * The verdict in the model's answer and the reason of a block: `true` pass, `false` block, `null` no rubric verdict.
 * @es El veredicto de la respuesta y el motivo de un bloqueo: `true` pasa, `false` bloquea, `null` no es veredicto.
 */
export function judgedOf(answer, marker) {
  const read = readVerdict(answer, marker);

  if (read.kind === 'pass') return { verdict: true, reason: '' };
  if (read.kind === 'block') return { verdict: false, reason: read.reason };

  return { verdict: null, reason: '' };
}

/**
 * Whether a block reason cites rule 4: tuteo, usted, a tú form or rule 4 by number.
 * @es Si un motivo de bloqueo cita la regla 4: tuteo, usted, una forma de tú o la regla 4 por número.
 */
export const citesRule4 = (reason) => /tuteo|usted|(^|[^\p{L}])tú([^\p{L}]|$)|rule 4\b|regla 4\b/iu.test(reason);

/** The share of `part` in `whole`, as a percentage with one decimal. @es La proporción de `part` en `whole`, en porcentaje. */
const percent = (part, whole) => (whole === 0 ? 'n/a' : `${((100 * part) / whole).toFixed(1)}%`);

/** A verdict as the matrix prints it. @es Un veredicto tal como lo imprime la matriz. */
const shown = (verdict) => (verdict === null ? '?' : verdict ? 'pass' : 'FAIL');

/**
 * One run over `fixtures`, read through `judgedFor(fixture)`: recall on `fail`, precision on `pass`, the blocked
 * share of `owner-accepted`, every `borderline` verdict and the rule-4 false positives of the pinned fixtures.
 * @es Una corrida sobre `fixtures`: recall sobre `fail`, precisión sobre `pass`, la proporción bloqueada de
 * `owner-accepted`, cada veredicto `borderline` y los falsos positivos de la regla 4 de los fixtures fijados.
 */
export function summarise(fixtures, judgedFor) {
  const of = (expect) => fixtures.filter((fixture) => fixture.expect === expect);
  const red = of('fail');
  const green = of('pass');
  const accepted = of('owner-accepted');

  return {
    red: red.length,
    missedRed: red.filter((fixture) => judgedFor(fixture).verdict !== false).map((fixture) => fixture.id),
    green: green.length,
    blockedGreen: green.filter((fixture) => judgedFor(fixture).verdict !== true).map((fixture) => fixture.id),
    accepted: accepted.length,
    blockedAccepted: accepted.filter((fixture) => judgedFor(fixture).verdict === false).map((fixture) => ({ id: fixture.id, reason: judgedFor(fixture).reason })),
    borderline: of('borderline').map((fixture) => ({ id: fixture.id, verdict: judgedFor(fixture).verdict })),
    pinned: fixtures.filter((fixture) => fixture.pinsRule4 === true).length,
    rule4FalsePositives: fixtures.filter((fixture) => fixture.pinsRule4 === true && judgedFor(fixture).verdict === false && citesRule4(judgedFor(fixture).reason)).map((fixture) => ({ id: fixture.id, reason: judgedFor(fixture).reason })),
    malfunction: fixtures.filter((fixture) => judgedFor(fixture).verdict === null).length,
  };
}

/**
 * Whether a summary of the held-out set meets the ship bar: at least one labelled fixture of each side, recall 90%
 * and precision 95%. @es Si el resumen del conjunto reservado alcanza la barra: al menos un fixture etiquetado de
 * cada lado, recall 90% y precisión 95%.
 */
export function meetsShipBar(summary) {
  const share = (part, whole) => (whole === 0 ? 0 : part / whole);

  return share(summary.red - summary.missedRed.length, summary.red) >= 0.9 && share(summary.green - summary.blockedGreen.length, summary.green) >= 0.95;
}

/** The lines `--rates` prints for one run's `summary` under `label`. @es Las líneas que imprime `--rates` para el resumen de una corrida. */
export function ratesLines(label, summary) {
  const caught = summary.red - summary.missedRed.length;
  const letThrough = summary.green - summary.blockedGreen.length;

  return [
    `${label} recall ${percent(caught, summary.red)} (${caught}/${summary.red}) precision ${percent(letThrough, summary.green)} (${letThrough}/${summary.green}) malfunction=${summary.malfunction}`,
    ...summary.missedRed.map((id) => `    missed red    ${id}`),
    ...summary.blockedGreen.map((id) => `    blocked green ${id}`),
    `${label} owner-accepted blocked ${percent(summary.blockedAccepted.length, summary.accepted)} (${summary.blockedAccepted.length}/${summary.accepted}), the false-positive rate for the owner to adjudicate`,
    ...summary.blockedAccepted.map(({ id, reason }) => `    blocked owner-accepted ${id}: ${reason}`),
    `${label} borderline verdicts (${summary.borderline.length}, never counted)`,
    ...summary.borderline.map(({ id, verdict }) => `    borderline ${shown(verdict).padEnd(4)} ${id}`),
    `${label} rule-4 false positives ${summary.rule4FalsePositives.length}/${summary.pinned} pinned`,
    ...summary.rule4FalsePositives.map(({ id, reason }) => `    rule-4 false positive ${id}: ${reason}`),
  ];
}

/** One judged run; the cost and latency of the call travel with the verdict. @es Una corrida juzgada; costo y latencia viajan con el veredicto. */
async function judge(message, model, rubric) {
  try {
    const { answer, costUsd, durationMs } = await askModel(promptFor(message, rubric.prompt), { timeoutMs: 120000, model });
    const judged = judgedOf(answer, rubric.marker);

    if (judged.verdict === null) console.error(`? not a rubric verdict: ${String(answer).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { ...judged, costUsd, durationMs };
  } catch (error) {
    console.error(`? model call failed: ${String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { verdict: null, reason: '', costUsd: 0, durationMs: 0 };
  }
}

/**
 * The calibration view: `--rates` runs the fixtures `runs` times, `parallel` calls at a time, and prints for each run
 * the held-out summary (the ship bar is computed on it and only on it) and, when the run holds other fixtures, the
 * summary of all of them. Exit 1 when a run misses the ship bar on the held-out set.
 * @es La vista de calibración: ejecuta los fixtures `runs` veces, `parallel` llamadas a la vez, e imprime por corrida
 * el resumen del conjunto reservado (la barra se calcula solo sobre él) y, si la corrida trae otros, el de todos.
 */
async function rates(fixtures, runs, model, parallel, rubric) {
  const jobs = fixtures.flatMap((fixture) => Array.from({ length: runs }, (_, run) => ({ fixture, run })));
  const results = new Map();
  let next = 0;
  let cost = 0;

  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < jobs.length) {
      const job = jobs[next];

      next += 1;

      const result = await judge(job.fixture.message, model, rubric);

      cost += result.costUsd;
      results.set(`${job.fixture.id}#${job.run}`, result);
    }
  }));

  const heldOut = fixtures.filter((fixture) => fixture.id.startsWith(HELD_OUT_PREFIX));
  // An empty held-out set meets no bar: `meetsShipBar` scores an empty side 0. @es Un conjunto reservado vacío no alcanza ninguna barra.
  let ships = true;

  for (let run = 0; run < runs; run += 1) {
    const judgedFor = (fixture) => results.get(`${fixture.id}#${run}`);
    const held = summarise(heldOut, judgedFor);

    for (const text of ratesLines(`run ${run + 1} held`, held)) console.log(text);
    if (heldOut.length < fixtures.length) for (const text of ratesLines(`run ${run + 1} all `, summarise(fixtures, judgedFor))) console.log(text);
    if (!meetsShipBar(held)) ships = false;
  }

  console.log(`rubric=${rubric.path} cost=$${cost.toFixed(4)} ship-bar(held-out set, every run: recall>=90% and precision>=95%)=${ships ? 'MET' : 'NOT MET'}${heldOut.length === 0 ? ' (no held-out fixture in this run)' : ''}`);

  return ships ? 0 : 1;
}

/** The command line: exit 0, 1 (an expectation missed, or the ship bar missed) or 2 (a wrong `--rubric`). @es La línea de comandos. */
export async function main(argv) {
  const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  let rubric;

  try {
    rubric = await loadRubric(rubricPathOf(argv));
  } catch (error) {
    console.error(String(error?.message ?? error));

    return 2;
  }
  console.log(`rubric=${rubric.path}`);

  const runs = Number(option('--runs', '3'));
  const model = option('--model', 'haiku');
  const only = option('--only', '')?.split(',').filter(Boolean);
  const fixtures = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8'))).filter((fixture) => only.length === 0 || only.includes(fixture.id));

  if (argv.includes('--rates')) {
    const prefix = option('--prefix', HELD_OUT_PREFIX);

    return rates(fixtures.filter((fixture) => fixture.id.startsWith(prefix)), runs, model, Number(option('--parallel', '6')), rubric);
  }

  let wrong = 0;
  let cost = 0;
  const latencies = [];

  for (const fixture of fixtures) {
    const results = [];

    for (let run = 0; run < runs; run += 1) results.push(await judge(fixture.message, model, rubric));

    const verdicts = results.map((result) => result.verdict);
    const wanted = fixture.expect === 'pass' ? true : fixture.expect === 'fail' ? false : undefined;
    const rule4 = fixture.pinsRule4 === true ? results.filter((result) => result.verdict === false && citesRule4(result.reason)) : [];
    const labelMet = wanted === undefined || verdicts.every((verdict) => verdict === wanted);
    const met = !labelMet || rule4.length > 0 ? 'MISS' : wanted === undefined && fixture.pinsRule4 !== true ? 'n/a' : 'OK';

    cost += results.reduce((sum, result) => sum + result.costUsd, 0);
    latencies.push(...results.map((result) => result.durationMs));
    if (met === 'MISS') wrong += 1;
    console.log(`${met.padEnd(4)} ${fixture.id.padEnd(40)} expect=${fixture.expect.padEnd(14)} ${verdicts.map(shown).join(' ')}`);
    for (const result of rule4) console.log(`    rule-4 false positive: ${result.reason}`);
  }

  latencies.sort((left, right) => left - right);
  console.log(`rubric=${rubric.path} runs=${latencies.length} cost=$${cost.toFixed(4)} (mean $${(cost / Math.max(1, latencies.length)).toFixed(5)}/run) latency median=${latencies[Math.floor(latencies.length / 2)] ?? 0}ms max=${latencies.at(-1) ?? 0}ms`);

  return wrong === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(await main(process.argv.slice(2)));
