#!/usr/bin/env node
/**
 * Measures the pending judge against a real model: every fixture of `fixtures/` goes through the rubric of
 * `prompt.mjs` N times, by the same model call (`../judge-gate/model.mjs`) and the same verdict reader the gate
 * uses, and prints the RECALL on the fixtures expected to be blocked (`expect: fail`: the share the judge blocked)
 * and the PRECISION on the fixtures expected to pass (`expect: pass`: the share it let through), per run, per
 * PROVENANCE and over all. It also prints how many fixtures the lexical prefilter would send to the judge, since the
 * pipeline's recall is the prefilter's AND the judge's. The judge is a model call, so the selftest only pins its
 * text; this script is the measurement of what the text DOES. A tool, not a gate: it costs money and is
 * nondeterministic. A `?` is an answer that is no rubric verdict (the gate would fall back to the lexical block),
 * counted as neither.
 *
 * PROVENANCE: who decided a fixture's label. `owner`: the owner. `author`: the mechanism's author, by reading
 * (synthetic sentences, or a real reply carrying a written LABEL). `unadjudicated`: a real reply whose label only
 * mirrors what a session did with the old guard's refusal, read by nobody. Only owner labels can ship the judge:
 * THE SHIP BAR is at least `SHIP_BAR_OWNER_LABELS` of them, and every run prints whether it is met. `--packet <path>`
 * writes the OWNER PACKET: five stops the judge blocked and five it passed (run 1, unadjudicated first, those that
 * disagree with their current label first), each an excerpt of at most `PACKET_EXCERPT_CHARS` characters, for the
 * owner to label.
 *
 * Usage: `node pending-judge/measure.mjs [--runs N] [--model haiku] [--parallel N] [--only id,id] [--explain]
 * [--packet <path>]`.
 *
 * @es Mide el juez de pendientes contra un modelo real: cada fixture pasa N veces por la rúbrica, con la misma
 * llamada al modelo y el mismo lector de veredictos de la compuerta, e imprime el RECALL sobre los que deben
 * bloquearse y la PRECISIÓN sobre los que deben pasar, por corrida, por PROCEDENCIA y sobre todos. También cuenta
 * cuántos fixtures enviaría el prefiltro léxico al juez. Una herramienta, no un gate: cuesta dinero y no es
 * determinista. PROCEDENCIA: quién decidió la etiqueta (`owner` el dueño, `author` el autor del mecanismo leyendo,
 * `unadjudicated` una respuesta real cuya etiqueta solo refleja lo que hizo una sesión, sin que nadie la leyera).
 * Solo las etiquetas del dueño habilitan al juez: LA VARA DE SALIDA son al menos `SHIP_BAR_OWNER_LABELS`, y cada
 * corrida imprime si se cumple. `--packet <ruta>` escribe el PAQUETE DEL DUEÑO: cinco paradas que el juez bloqueó y
 * cinco que dejó pasar, cada una un extracto de como mucho `PACKET_EXCERPT_CHARS` caracteres, para que el dueño las
 * etiquete.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCandidate } from '../backlog-guard/announcement.mjs';
import { askModel } from '../judge-gate/model.mjs';
import { readVerdict } from '../judge-gate/verdict.mjs';
import { MARKER, PROMPT } from './prompt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Who decided a label, from the strongest. @es Quién decidió una etiqueta, de la más fuerte a la más débil. */
export const PROVENANCES = Object.freeze(['owner', 'author', 'unadjudicated']);

/** The owner labels the judge needs before it ships. @es Las etiquetas del dueño que el juez necesita para salir. */
export const SHIP_BAR_OWNER_LABELS = 10;

/** The characters of one excerpt in the owner packet. @es Los caracteres de un extracto del paquete del dueño. */
export const PACKET_EXCERPT_CHARS = 600;

/** The cases of each verdict in the owner packet. @es Los casos de cada veredicto en el paquete del dueño. */
const PACKET_PER_VERDICT = 5;

/** The provenances the packet draws from, in order: the owner's own labels need no packet. @es Las procedencias del paquete, en orden. */
const PACKET_PROVENANCES = ['unadjudicated', 'author'];

/** The rubric with the hook input a Stop payload would carry. @es La rúbrica con la entrada que llevaría un payload de Stop. */
export const promptFor = (message) => PROMPT.replace('$ARGUMENTS', () => JSON.stringify({ hook_event_name: 'Stop', session_id: 'measure', stop_hook_active: false, last_assistant_message: message }));

/** The verdict in the model's answer: `true` pass, `false` block, `null` no rubric verdict. @es El veredicto: `true` pasa, `false` bloquea, `null` no es veredicto de rúbrica. */
export function verdictOf(answer) {
  const { kind } = readVerdict(answer, MARKER);

  return kind === 'pass' ? true : kind === 'block' ? false : null;
}

/**
 * The ship bar over `fixtures`: how many owner labels there are (an owner fixture marked unknowable is no label),
 * how many are required, and whether that is met.
 * @es La vara de salida sobre `fixtures`: cuántas etiquetas del dueño hay, cuántas se exigen y si se cumple.
 */
export function shipBar(fixtures) {
  const ownerLabels = fixtures.filter((fixture) => fixture.provenance === 'owner' && fixture.expect !== 'unknowable').length;

  return { ownerLabels, required: SHIP_BAR_OWNER_LABELS, met: ownerLabels >= SHIP_BAR_OWNER_LABELS };
}

/** The ship bar as one bilingual line. @es La vara de salida como una línea bilingüe. */
export function describeShipBar({ ownerLabels, required, met }) {
  const count = `${String(ownerLabels)}/${String(required)}`;

  return met
    ? `ship bar: ${count} owner labels, MET @es vara de salida: ${count} etiquetas del dueño, CUMPLIDA`
    : `ship bar: ${count} owner labels, NOT MET: author and unadjudicated labels do not ship the judge @es vara de salida: ${count} etiquetas del dueño, NO CUMPLIDA: las etiquetas del autor y las no adjudicadas no habilitan al juez`;
}

/**
 * At most `size` characters of `message`, centred on its first marker when it has one, so the owner sees the
 * sentence that reached the judge.
 * @es Como mucho `size` caracteres de `message`, centrados en su primer marcador si lo tiene.
 */
export function excerptAround(message, size = PACKET_EXCERPT_CHARS) {
  if (message.length <= size) return message;

  const marker = findCandidate(message);
  const at = marker === undefined ? -1 : message.toLowerCase().indexOf(marker.toLowerCase());
  const start = at < 0 ? 0 : Math.min(Math.max(0, at - Math.floor(size / 2)), message.length - size);

  return message.slice(start, start + size);
}

/** The label a fixture expects as a verdict, or `null` for unknowable. @es La etiqueta como veredicto. */
const expectedVerdict = (fixture) => (fixture.expect === 'fail' ? false : fixture.expect === 'pass' ? true : null);

/** One case of the packet. @es Un caso del paquete. */
function packetCase(number, { fixture, verdict, reason }) {
  const excerpt = excerptAround(fixture.message);
  const heading = verdict === false ? 'the judge BLOCKED @es el juez BLOQUEÓ' : 'the judge PASSED @es el juez DEJÓ PASAR';

  return [
    `## ${String(number)}. ${fixture.id} — ${heading}`,
    '',
    `- provenance: ${fixture.provenance}; current label: ${fixture.expect}`,
    `- judge reason: ${typeof reason === 'string' ? reason.replace(/\s+/g, ' ').slice(0, 300) : '(none: the judge passed it)'}`,
    `- excerpt: ${String(excerpt.length)} of ${String(fixture.message.length)} characters @es extracto: ${String(excerpt.length)} de ${String(fixture.message.length)} caracteres`,
    '',
    ...excerpt.split('\n').map((line) => `> ${line}`),
    '',
    'Owner label: ____ (pending / not pending) @es Etiqueta del dueño: ____ (pendiente / no pendiente)',
    '',
  ];
}

/**
 * The owner packet over `judged` (`{ fixture, verdict, reason }` of one run): up to five stops the judge blocked and
 * five it passed, unadjudicated before author, a disagreement with the current label before an agreement, then by
 * id. Owner fixtures and answers that are no verdict are left out.
 * @es El paquete del dueño: hasta cinco paradas bloqueadas y cinco que pasaron, no adjudicadas antes que del autor,
 * un desacuerdo con la etiqueta actual antes que un acuerdo, y luego por id.
 */
export function ownerPacket(judged, { generatedAt, model }) {
  const key = (entry) => [PACKET_PROVENANCES.indexOf(entry.fixture.provenance), expectedVerdict(entry.fixture) === entry.verdict ? 1 : 0];
  const eligible = judged
    .filter((entry) => PACKET_PROVENANCES.includes(entry.fixture.provenance))
    .sort((left, right) => {
      const [a, b] = [key(left), key(right)];

      return a[0] - b[0] || a[1] - b[1] || left.fixture.id.localeCompare(right.fixture.id);
    });
  const cases = [...eligible.filter((entry) => entry.verdict === false).slice(0, PACKET_PER_VERDICT), ...eligible.filter((entry) => entry.verdict === true).slice(0, PACKET_PER_VERDICT)];

  return [
    '# Pending judge: owner labelling packet',
    '@es # Juez de pendientes: paquete de etiquetado del dueño',
    '',
    `Generated ${generatedAt} with model ${model}, run 1. The judge ships only on at least ${String(SHIP_BAR_OWNER_LABELS)} owner labels. For each case, state whether the reply leaves an unrecorded item for later (pending) or not (not pending). Each label is then stored in its fixture as "provenance": "owner", with "expect": "fail" for pending and "pass" for not pending.`,
    `@es Generado ${generatedAt} con el modelo ${model}, corrida 1. El juez solo sale con al menos ${String(SHIP_BAR_OWNER_LABELS)} etiquetas del dueño. Para cada caso, indique si la respuesta deja para después un ítem sin registrar (pendiente) o no (no pendiente). Cada etiqueta se guarda luego en su fixture como "provenance": "owner", con "expect": "fail" para pendiente y "pass" para no pendiente.`,
    '',
    ...cases.flatMap((entry, index) => packetCase(index + 1, entry)),
  ].join('\n');
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
  const packetPath = option('--packet', '');
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

      if (unknowable.length > 0) console.log(`run ${String(run + 1)} ${label.padEnd(13)} unknowable (the item is recorded in a store the reply does not cite; not an error either way): blocked ${String(unknowable.filter((fixture) => verdict(fixture) === false).length)}/${String(unknowable.length)}`);

      console.log(`run ${String(run + 1)} ${label.padEnd(13)} n=${String(subset.length)} recall ${percent(caught.length, subRed.length)} (${String(caught.length)}/${String(subRed.length)}) precision ${percent(letThrough.length, subGreen.length)} (${String(letThrough.length)}/${String(subGreen.length)}) malfunction=${String(unknown)}`);

      if (label === 'all') {
        if (argv.includes('--explain')) for (const fixture of subRed) if (verdict(fixture) === false) console.log(`    caught         ${fixture.id} :: ${String(readVerdict(results.get(`${fixture.id}#${run}`).answer, MARKER).reason).slice(0, 300)}`);
        for (const fixture of subRed) if (verdict(fixture) !== false) console.log(`    missed block   ${fixture.id} [${fixture.provenance}]${argv.includes('--explain') ? ` :: answer ${String(results.get(`${fixture.id}#${run}`).answer).replace(/\s+/g, ' ').slice(0, 200)}` : ''}`);
        for (const fixture of subGreen) if (verdict(fixture) !== true) console.log(`    wrong block    ${fixture.id} [${fixture.provenance}]${argv.includes('--explain') ? ` :: ${String(readVerdict(results.get(`${fixture.id}#${run}`).answer, MARKER).reason).slice(0, 260)}` : ''}`);
      }
    };

    for (const provenance of PROVENANCES) line(provenance, fixtures.filter((fixture) => fixture.provenance === provenance));
    line('all', fixtures);
  }

  console.log(describeShipBar(shipBar(fixtures)));

  latencies.sort((left, right) => left - right);
  console.log(`cost=$${cost.toFixed(4)} (mean $${(cost / Math.max(1, latencies.length)).toFixed(5)}/run) latency median=${latencies[Math.floor(latencies.length / 2)] ?? 0}ms max=${latencies.at(-1) ?? 0}ms`);

  if (packetPath !== '') {
    const judged = fixtures.map((fixture) => {
      const result = results.get(`${fixture.id}#0`);

      return { fixture, verdict: result.verdict, reason: readVerdict(result.answer, MARKER).reason };
    });

    writeFileSync(packetPath, ownerPacket(judged, { generatedAt: new Date().toISOString(), model }), 'utf8');
    console.log(`owner packet written: ${packetPath} @es paquete del dueño escrito: ${packetPath}`);
  }

  return 0;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) process.exit(await main(process.argv.slice(2)));
