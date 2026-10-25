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
 * LABELS. A fixture's `expect` is `pass` or `fail`, a scored label, or `unadjudicated`. A scored label records who
 * set it in `labelledBy`: `owner` (the owner judged that very reply; `labelledOn` holds the date) or `author` (a
 * constructed fixture whose label follows from the rubric text). Silence is never a label: a real reply nobody
 * judged is `unadjudicated`, printed with its verdict and never scored, however the author leaned. `--rates` prints
 * the owner set and the author set apart, and the ship bar is computed on the owner set only, once it holds
 * `OWNER_LABELS_NEEDED` fixtures. A fixture with `pinsRule4` (the second-person forms rule 4 must read as voseo) pins
 * rule 4: a block whose reason cites tuteo or usted, or quotes one of those forms alone, is a rule-4 false positive.
 *
 * Exit 1 in the matrix view when a scored fixture did not get its label in every run, or a pinned fixture got a
 * rule-4 reason; in the `--rates` view when the ship bar is not met or cannot be computed; exit 2 for a wrong
 * `--rubric`. A `?` is an answer that is no rubric verdict: the gate would pass it as a malfunction.
 *
 * @es Mide el juez de voz contra un modelo real: cada fixture de `fixtures/` pasa N veces por una rúbrica, con la
 * misma llamada al modelo y el mismo lector de veredictos que usa la compuerta, y se imprime la matriz pasa/falla
 * con el costo y la latencia. Es una herramienta, no un gate: el selftest no le hace llamar a un modelo, pero fija
 * sus partes puras. Toda salida empieza por la ruta de la rúbrica. ETIQUETAS: `pass` o `fail` puntúan y registran
 * en `labelledBy` quién las puso: `owner` (el dueño juzgó esa respuesta; `labelledOn` lleva la fecha) o `author`
 * (un fixture construido cuya etiqueta sale del texto de la rúbrica). El silencio nunca es una etiqueta: una
 * respuesta real que nadie juzgó es `unadjudicated`, se imprime con su veredicto y nunca puntúa. `--rates` imprime
 * aparte el conjunto del dueño y el del autor, y la barra se calcula solo sobre el del dueño, cuando tiene
 * `OWNER_LABELS_NEEDED` fixtures. Un fixture con `pinsRule4` (las formas que la regla 4 debe leer como voseo) fija la
 * regla 4: un bloqueo cuyo motivo cita tuteo o usted, o cita sola una de esas formas, es un falso positivo de la
 * regla 4. Sale con 1 si un fixture puntuado no recibió su etiqueta, si un fijado recibió un motivo de la regla 4, o
 * si la barra no se alcanza o no se puede calcular; con 2 si `--rubric` es incorrecto.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { askModel, spawnAsync } from '../judge-gate/model.mjs';
import { readVerdict } from '../judge-gate/verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The rubric measured when `--rubric` is absent. @es La rúbrica medida cuando falta `--rubric`. */
export const DEFAULT_RUBRIC = path.join(HERE, 'prompt.mjs');

/** The prefix `--rates` measures when `--prefix` is absent: the held-out set. @es El prefijo que mide `--rates` por defecto: el conjunto reservado. */
export const DEFAULT_PREFIX = 'held-';

/** How many owner labels the ship bar needs before it is computed. @es Cuántas etiquetas del dueño necesita la barra antes de calcularse. */
export const OWNER_LABELS_NEEDED = 10;

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
 * Whether a block reason cites rule 4: tuteo, usted, a tú form named as such, rule 4 by number, or one of the
 * `forms` a fixture pins, quoted alone. @es Si un motivo de bloqueo cita la regla 4: tuteo, usted, una forma de tú
 * nombrada así, la regla 4 por número, o una de las `forms` que fija el fixture, citada sola. Only the English half
 * of a bilingual reason is read: the `@es` half mirrors it and names tú and the quoted forms in its own words.
 * @es Solo se lee la mitad inglesa de un motivo bilingüe: la mitad `@es` la repite con sus propias palabras.
 */
export function citesRule4(bilingualReason, forms = []) {
  const reason = bilingualReason.split(' @es ')[0];

  if (/tuteo|usted|(^|[^\p{L}])t[uú][ -]forms?([^\p{L}]|$)|(^|[^\p{L}])tú([^\p{L}]|$)|rule 4\b|regla 4\b/iu.test(reason)) return true;

  return forms.some((form) => new RegExp(`["“«'‘]${form}["”»'’]`, 'iu').test(reason));
}

/** The share of `part` in `whole`, as a percentage with one decimal. @es La proporción de `part` en `whole`, en porcentaje. */
const percent = (part, whole) => (whole === 0 ? 'n/a' : `${((100 * part) / whole).toFixed(1)}%`);

/** A verdict as the outputs print it. @es Un veredicto tal como lo imprimen las salidas. */
const shown = (verdict) => (verdict === null ? '?' : verdict ? 'pass' : 'FAIL');

/** A verdict as the Spanish half of an output prints it. @es Un veredicto en la mitad española de una salida. */
const mostrado = (verdict) => (verdict === null ? '?' : verdict ? 'pasa' : 'FALLA');

/** Whether a matrix row met its label, in Spanish. @es Si una fila de la matriz cumplió su etiqueta, en español. */
const CUMPLIDO = { OK: 'bien', MISS: 'FALLO', 'n/a': 'n/a' };

/**
 * One row of the matrix view: whether the label was met (`OK`, `MISS` or `n/a`), the fixture, its label and the
 * verdict of every run. @es Una fila de la matriz: si se cumplió la etiqueta, el fixture, su etiqueta y el veredicto
 * de cada corrida.
 */
export const matrixRow = (met, fixture, verdicts) => `${met.padEnd(4)} ${fixture.id.padEnd(40)} expect=${fixture.expect.padEnd(14)} ${verdicts.map(shown).join(' ')} @es ${CUMPLIDO[met]} ${fixture.id} esperado=${fixture.expect} ${verdicts.map(mostrado).join(' ')}`;

/** Recall and precision of one labelled set. @es Recall y precisión de un conjunto etiquetado. */
function scored(fixtures, judgedFor) {
  const red = fixtures.filter((fixture) => fixture.expect === 'fail');
  const green = fixtures.filter((fixture) => fixture.expect === 'pass');
  const miss = (fixture) => ({ id: fixture.id, verdict: judgedFor(fixture).verdict, reason: judgedFor(fixture).reason });

  return {
    red: red.length,
    missedRed: red.filter((fixture) => judgedFor(fixture).verdict !== false).map(miss),
    green: green.length,
    blockedGreen: green.filter((fixture) => judgedFor(fixture).verdict !== true).map(miss),
  };
}

/**
 * One run over `fixtures`, read through `judgedFor(fixture)`: the owner set and the author set scored apart, every
 * unadjudicated verdict with its reason, the rule-4 false positives of the pinned fixtures and the malfunctions.
 * @es Una corrida sobre `fixtures`: el conjunto del dueño y el del autor puntuados aparte, cada veredicto sin
 * adjudicar con su motivo, los falsos positivos de la regla 4 de los fijados y los fallos de funcionamiento.
 */
export function summarise(fixtures, judgedFor) {
  const pinned = fixtures.filter((fixture) => Array.isArray(fixture.pinsRule4));

  return {
    owner: scored(fixtures.filter((fixture) => fixture.labelledBy === 'owner'), judgedFor),
    author: scored(fixtures.filter((fixture) => fixture.labelledBy === 'author'), judgedFor),
    unadjudicated: fixtures.filter((fixture) => fixture.expect === 'unadjudicated').map((fixture) => ({ id: fixture.id, ...judgedFor(fixture) })),
    pinned: pinned.length,
    rule4FalsePositives: pinned.filter((fixture) => judgedFor(fixture).verdict === false && citesRule4(judgedFor(fixture).reason, fixture.pinsRule4)).map((fixture) => ({ id: fixture.id, reason: judgedFor(fixture).reason })),
    malfunction: fixtures.filter((fixture) => judgedFor(fixture).verdict === null).length,
  };
}

/** Whether a scored set meets recall 90% and precision 95%; an empty side scores 0. @es Si un conjunto alcanza recall 90% y precisión 95%. */
export function meetsShipBar(set) {
  const share = (part, whole) => (whole === 0 ? 0 : part / whole);

  return share(set.red - set.missedRed.length, set.red) >= 0.9 && share(set.green - set.blockedGreen.length, set.green) >= 0.95;
}

/**
 * The ship-bar verdict over every run's owner set: `not enough owner labels` until it holds `OWNER_LABELS_NEEDED`
 * fixtures, then MET only when every run meets the bar. @es El veredicto de la barra sobre el conjunto del dueño de
 * cada corrida: faltan etiquetas hasta que tenga `OWNER_LABELS_NEEDED`, y luego ALCANZADA solo si toda corrida la alcanza.
 */
export function shipBarOf(ownerSets) {
  const labels = (ownerSets[0]?.red ?? 0) + (ownerSets[0]?.green ?? 0);

  if (labels < OWNER_LABELS_NEEDED) {
    return { met: false, en: `not enough owner labels (${labels}/${OWNER_LABELS_NEEDED})`, es: `faltan etiquetas del dueño (${labels}/${OWNER_LABELS_NEEDED})` };
  }

  return ownerSets.every(meetsShipBar) ? { met: true, en: 'MET', es: 'ALCANZADA' } : { met: false, en: 'NOT MET', es: 'NO ALCANZADA' };
}

/** The lines of one scored set. @es Las líneas de un conjunto puntuado. */
function scoredLines(run, who, quien, set) {
  const caught = set.red - set.missedRed.length;
  const letThrough = set.green - set.blockedGreen.length;
  const rates = `recall ${percent(caught, set.red)} (${caught}/${set.red})`;
  const precision = `${percent(letThrough, set.green)} (${letThrough}/${set.green})`;

  return [
    `run ${run} ${who} ${rates} precision ${precision} @es corrida ${run} ${quien}: ${rates}, precisión ${precision}`,
    ...set.missedRed.map(({ id, verdict }) => `    missed red ${id}, judged ${shown(verdict)} @es rojo no detectado ${id}, juzgado ${mostrado(verdict)}`),
    ...set.blockedGreen.map(({ id, verdict, reason }) => `    blocked green ${id}, judged ${shown(verdict)}${reason === '' ? '' : `: ${reason}`} @es verde bloqueado ${id}, juzgado ${mostrado(verdict)}${reason === '' ? '' : `: ${reason}`}`),
  ];
}

/** The lines `--rates` prints for run number `run`. @es Las líneas que imprime `--rates` para la corrida número `run`. */
export function ratesLines(run, summary) {
  const blocked = summary.unadjudicated.filter(({ verdict }) => verdict === false).length;
  const share = `${percent(blocked, summary.unadjudicated.length)} (${blocked}/${summary.unadjudicated.length})`;

  return [
    ...scoredLines(run, 'owner', 'dueño', summary.owner),
    ...scoredLines(run, 'author', 'autor', summary.author),
    `run ${run} unadjudicated blocked ${share}, never scored, for the owner to label @es corrida ${run} sin adjudicar: bloqueadas ${share}, nunca puntúan, para que las etiquete el dueño`,
    ...summary.unadjudicated.map(({ id, verdict, reason }) => `    ${shown(verdict).padEnd(4)} ${id}${reason === '' ? '' : `: ${reason}`}`),
    `run ${run} rule-4 false positives ${summary.rule4FalsePositives.length}/${summary.pinned} pinned @es corrida ${run} falsos positivos de la regla 4: ${summary.rule4FalsePositives.length}/${summary.pinned} fijados`,
    ...summary.rule4FalsePositives.map(({ id, reason }) => `    rule-4 false positive ${id} @es falso positivo de la regla 4: ${reason}`),
    `run ${run} malfunction=${summary.malfunction} @es corrida ${run} fallos de funcionamiento=${summary.malfunction}`,
  ];
}

/**
 * The fixtures `--rates` measures: those whose id starts with `prefix`, plus every rule-4 pin.
 * @es Los fixtures que mide `--rates`: los que empiezan por `prefix`, más cada fijado de la regla 4.
 */
export const ratesFixtures = (fixtures, prefix) => fixtures.filter((fixture) => fixture.id.startsWith(prefix) || Array.isArray(fixture.pinsRule4));

/**
 * The spawn the model runs go through: the asynchronous one, so `--parallel` calls are really in flight together.
 * @es El spawn por el que pasan las corridas del modelo: el asíncrono, para que `--parallel` sea real.
 */
export const MODEL_SPAWN = spawnAsync;

/** The default model call of a judged run. @es La llamada al modelo por defecto de una corrida juzgada. */
const askTheModel = (prompt, options) => askModel(prompt, { ...options, spawn: MODEL_SPAWN });

/** One judged run; the cost and latency of the call travel with the verdict. @es Una corrida juzgada; costo y latencia viajan con el veredicto. */
async function judge(message, model, rubric, ask) {
  try {
    const { answer, costUsd, durationMs } = await ask(promptFor(message, rubric.prompt), { timeoutMs: 120000, model });
    const judged = judgedOf(answer, rubric.marker);

    if (judged.verdict === null) console.error(`? not a rubric verdict @es no es un veredicto de rúbrica: ${String(answer).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { ...judged, costUsd, durationMs };
  } catch (error) {
    console.error(`? model call failed @es falló la llamada al modelo: ${String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 200)}`);

    return { verdict: null, reason: '', costUsd: 0, durationMs: 0 };
  }
}

/**
 * The calibration view: runs the fixtures `runs` times, `parallel` calls at a time, prints each run's summary, and
 * ends with the ship-bar verdict of the owner set. @es La vista de calibración: ejecuta los fixtures `runs` veces,
 * `parallel` llamadas a la vez, imprime el resumen de cada corrida y cierra con el veredicto de la barra del dueño.
 */
async function rates(fixtures, runs, model, parallel, rubric, ask) {
  const jobs = fixtures.flatMap((fixture) => Array.from({ length: runs }, (_, run) => ({ fixture, run })));
  const results = new Map();
  let next = 0;
  let cost = 0;

  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < jobs.length) {
      const job = jobs[next];

      next += 1;

      const result = await judge(job.fixture.message, model, rubric, ask);

      cost += result.costUsd;
      results.set(`${job.fixture.id}#${job.run}`, result);
    }
  }));

  const ownerSets = [];

  for (let run = 0; run < runs; run += 1) {
    const summary = summarise(fixtures, (fixture) => results.get(`${fixture.id}#${run}`));

    for (const text of ratesLines(run + 1, summary)) console.log(text);
    ownerSets.push(summary.owner);
  }

  const bar = shipBarOf(ownerSets);

  console.log(`rubric=${rubric.path} cost=$${cost.toFixed(4)} ship-bar(owner labels, every run: recall>=90% and precision>=95%)=${bar.en} @es rúbrica=${rubric.path} costo=$${cost.toFixed(4)} barra(etiquetas del dueño, toda corrida: recall>=90% y precisión>=95%)=${bar.es}`);

  return bar.met ? 0 : 1;
}

/**
 * The command line: exit 0, 1 (a label or the ship bar missed) or 2 (a wrong `--rubric`). `ask` is the model call,
 * injected only by the selftest. @es La línea de comandos; `ask` es la llamada al modelo, que solo inyecta el selftest.
 */
export async function main(argv, { ask = askTheModel } = {}) {
  const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
  let rubric;

  try {
    rubric = await loadRubric(rubricPathOf(argv));
  } catch (error) {
    console.error(String(error?.message ?? error));

    return 2;
  }
  console.log(`rubric=${rubric.path} @es rúbrica=${rubric.path}`);

  const runs = Number(option('--runs', '3'));
  const model = option('--model', 'haiku');
  const only = option('--only', '')?.split(',').filter(Boolean);
  const fixtures = readdirSync(path.join(HERE, 'fixtures')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(HERE, 'fixtures', name), 'utf8'))).filter((fixture) => only.length === 0 || only.includes(fixture.id));

  if (argv.includes('--rates')) return rates(ratesFixtures(fixtures, option('--prefix', DEFAULT_PREFIX)), runs, model, Number(option('--parallel', '6')), rubric, ask);

  let wrong = 0;
  let cost = 0;
  const latencies = [];

  for (const fixture of fixtures) {
    const results = [];

    for (let run = 0; run < runs; run += 1) results.push(await judge(fixture.message, model, rubric, ask));

    const verdicts = results.map((result) => result.verdict);
    const wanted = fixture.expect === 'pass' ? true : fixture.expect === 'fail' ? false : undefined;
    const rule4 = Array.isArray(fixture.pinsRule4) ? results.filter((result) => result.verdict === false && citesRule4(result.reason, fixture.pinsRule4)) : [];
    const labelMet = wanted === undefined || verdicts.every((verdict) => verdict === wanted);
    const met = !labelMet || rule4.length > 0 ? 'MISS' : wanted === undefined ? 'n/a' : 'OK';

    cost += results.reduce((sum, result) => sum + result.costUsd, 0);
    latencies.push(...results.map((result) => result.durationMs));
    if (met === 'MISS') wrong += 1;
    console.log(matrixRow(met, fixture, verdicts));
    for (const result of rule4) console.log(`    rule-4 false positive @es falso positivo de la regla 4: ${result.reason}`);
  }

  latencies.sort((left, right) => left - right);

  const total = cost.toFixed(4);
  const mean = (cost / Math.max(1, latencies.length)).toFixed(5);
  const median = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const max = latencies.at(-1) ?? 0;

  console.log(`rubric=${rubric.path} runs=${latencies.length} cost=$${total} (mean $${mean}/run) latency median=${median}ms max=${max}ms @es rúbrica=${rubric.path} corridas=${latencies.length} costo=$${total} (media $${mean}/corrida) latencia mediana=${median}ms máxima=${max}ms`);

  return wrong === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(await main(process.argv.slice(2)));
