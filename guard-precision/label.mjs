#!/usr/bin/env node
/**
 * Hand labelling of guard blocks, the input of the false-block rate (`report.mjs`). Without a label option it
 * draws, per guard (or for `--mechanism <name>` only), a reproducible random sample of UNLABELLED blocks
 * (`--sample <n>`, default 10; `--seed <text>`, default 1) and prints each block's evidence: the time, the
 * tool use, the start of the input digest and the reason the guard journaled. With `--mechanism <name>
 * --correct <blockId>` or `--false <blockId>` it records the judgement through the journal, never by editing
 * JSONL by hand: `--correct` appends a `true-positive-report`, `--false` a `false-positive-report`, which is
 * information about the guard and does NOT lift the block (only `dismiss.mjs` does). A block that is
 * labelled again takes the new label (the last one decides); labelling it the same way twice is refused. The
 * sample is the unlabelled blocks ranked by a hash of seed, guard and block id, so the same inputs give the
 * same sample on every platform, labelled blocks leave it, and a smaller sample is the start of a larger one.
 * Every printed line is a bilingual message of `label-messages.mjs`; a refusal exits 2 and writes nothing.
 *
 * @es Etiquetado a mano de los bloqueos de los guards, la entrada de la tasa de falsos bloqueos
 * (`report.mjs`). Sin opción de etiqueta saca, por guard (o solo `--mechanism <nombre>`), una muestra
 * aleatoria reproducible de bloqueos SIN ETIQUETAR (`--sample <n>`, por defecto 10; `--seed <texto>`, por
 * defecto 1) e imprime la evidencia de cada uno: la hora, el uso de herramienta, el inicio de la huella de
 * la entrada y el motivo que el guard registró. Con `--mechanism <nombre> --correct <blockId>` o `--false
 * <blockId>` registra el juicio por el journal, nunca editando JSONL a mano: `--correct` añade un
 * `true-positive-report`, `--false` un `false-positive-report`, que es información sobre el guard y NO
 * levanta el bloqueo (solo lo hace `dismiss.mjs`). Un bloqueo etiquetado de nuevo toma la nueva etiqueta
 * (decide la última); etiquetarlo igual dos veces se rechaza. La muestra son los bloqueos sin etiquetar
 * ordenados por un hash de semilla, guard e id de bloqueo, así que las mismas entradas dan la misma muestra
 * en cualquier plataforma, los etiquetados salen de ella y una muestra menor es el comienzo de una mayor.
 * Cada línea impresa es un mensaje bilingüe de `label-messages.mjs`; un rechazo sale con 2 y no escribe nada.
 */

import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { valueAfter } from '../hook-state/dismiss.mjs';
import { appendRecord, digestInput } from '../hook-state/journal.mjs';
import { assertMechanism } from '../hook-state/locations.mjs';
import { CORRECT_LABEL, FALSE_LABEL, classifyBlocks, mechanismNames, readMechanism } from './blocks.mjs';
import { MESSAGE_TABLE, bilingual } from './label-messages.mjs';
import { MIN_LABELLED } from './report.mjs';

/** Blocks sampled per guard when `--sample` is not given: one round reaches the report's minimum. @es Bloqueos muestreados por guard sin `--sample`: una ronda alcanza el mínimo del informe. */
export const DEFAULT_SAMPLE = MIN_LABELLED;

/** The seed used when `--seed` is not given. @es La semilla usada sin `--seed`. */
export const DEFAULT_SEED = '1';

/** The journal kind each label is recorded as. @es El tipo de journal con que se registra cada etiqueta. */
const KIND_OF_LABEL = { [CORRECT_LABEL]: 'true-positive-report', [FALSE_LABEL]: 'false-positive-report' };

const DIGEST_WIDTH = 12;
const VALUE_OPTIONS = ['--mechanism', '--correct', '--false', '--sample', '--seed'];
const LABEL_OPTIONS = { '--correct': CORRECT_LABEL, '--false': FALSE_LABEL };
const SAMPLE_OPTIONS = ['--sample', '--seed'];

/** A refusal of the command's own input: exit 2, nothing written. @es Un rechazo de la entrada del comando: sale con 2, sin escribir nada. */
class Refusal extends Error {}

/**
 * A reproducible random sample of `size` ids of `blockIds`, sorted by id: the ids ranked by the sha256 of
 * `seed`, `mechanism` and the id, first `size` kept. It does not depend on the order of `blockIds`.
 * @es Una muestra aleatoria reproducible de `size` ids de `blockIds`, ordenada por id: los ids ordenados por el sha256 de `seed`, `mechanism` y el id, y se conservan los primeros `size`. No depende del orden de `blockIds`.
 */
export function drawSample(blockIds, { seed, mechanism, size }) {
  const rank = (blockId) => createHash('sha256').update(JSON.stringify([seed, mechanism, blockId])).digest('hex');

  return [...blockIds]
    .sort((left, right) => (rank(left) < rank(right) ? -1 : 1))
    .slice(0, size)
    .sort();
}

/**
 * The options of a command line; throws a Refusal for an unknown token, a value option without a value, a
 * repeated option, conflicting options, a label without `--mechanism`, a mechanism name that is not plain,
 * and a sample size that is not a positive whole number.
 * @es Las opciones de una línea de comandos; lanza un Refusal ante un token desconocido, una opción de valor sin valor, una opción repetida, opciones en conflicto, una etiqueta sin `--mechanism`, un nombre de mecanismo que no es simple y un tamaño de muestra que no es un entero positivo.
 */
function parseOptions(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];

    if (!VALUE_OPTIONS.includes(option)) throw new Refusal(bilingual('unknown-option', { option }));
    if (values[option] !== undefined) throw new Refusal(bilingual('duplicate-option', { option }));

    const value = valueAfter(argv, index);

    if ((value ?? '').trim() === '') throw new Refusal(bilingual('missing-argument', { option }));

    values[option] = value;
    index += 1;
  }

  const [labelOption, otherLabelOption] = argv.filter((token) => Object.hasOwn(LABEL_OPTIONS, token));

  if (otherLabelOption !== undefined) throw new Refusal(bilingual('options-conflict', { first: labelOption, second: otherLabelOption }));

  const sampleOption = SAMPLE_OPTIONS.find((option) => values[option] !== undefined);

  if (labelOption !== undefined && sampleOption !== undefined) throw new Refusal(bilingual('options-conflict', { first: labelOption, second: sampleOption }));
  if (labelOption !== undefined && values['--mechanism'] === undefined) throw new Refusal(bilingual('missing-argument', { option: '--mechanism' }));

  if (values['--mechanism'] !== undefined) {
    try {
      assertMechanism(values['--mechanism']);
    } catch (error) {
      throw new Refusal(error.message);
    }
  }

  if (values['--sample'] !== undefined && !(/^[1-9]\d*$/.test(values['--sample']) && Number.isSafeInteger(Number(values['--sample'])))) throw new Refusal(bilingual('bad-sample', { value: values['--sample'] }));

  return {
    mechanism: values['--mechanism'],
    label: labelOption === undefined ? undefined : LABEL_OPTIONS[labelOption],
    blockId: values[labelOption],
    size: values['--sample'] === undefined ? DEFAULT_SAMPLE : Number(values['--sample']),
    seed: values['--seed'] ?? DEFAULT_SEED
  };
}

/** A value of the evidence as printed: a dash when the record has none. @es Un valor de la evidencia como se imprime: un guion si el registro no lo tiene. */
const shown = (value) => value ?? '-';

/** Prints the sample of one guard and returns whether the guard had blocks. @es Imprime la muestra de un guard y devuelve si el guard tenía bloqueos. */
function printSample(mechanism, { decisions, labels }, { size, seed }, speaker) {
  const unlabelled = [...decisions.keys()].filter((blockId) => !labels.has(blockId));
  const sample = drawSample(unlabelled, { seed, mechanism, size });

  speaker.say('sample-header', { mechanism, shown: sample.length, unlabelled: unlabelled.length, seed, labelled: labels.size, blocks: decisions.size });

  for (const blockId of sample) {
    const { ts, toolUseId, inputDigest, reason } = decisions.get(blockId);

    speaker.say('sample-block', { blockId, ts: shown(ts), toolUseId: shown(toolUseId), digest: shown(inputDigest?.slice(0, DIGEST_WIDTH)), reason: shown(reason) });
  }
}

/**
 * Records `label` for block `blockId` of `mechanism` and returns the record; throws a Refusal for a block
 * that does not exist or already has that label.
 * @es Registra la etiqueta `label` del bloqueo `blockId` de `mechanism` y devuelve el registro; lanza un Refusal si el bloqueo no existe o ya tiene esa etiqueta.
 */
function recordLabel(mechanism, { blockId, label }, { now }) {
  if (!mechanismNames(readdirSync).includes(mechanism)) throw new Refusal(bilingual('no-guard', { mechanism }));

  const { decisions, labels } = classifyBlocks(readMechanism(mechanism, readdirSync).records);

  if (!decisions.has(blockId)) throw new Refusal(bilingual('unknown-block', { blockId, mechanism }));
  if (labels.get(blockId) === label) throw new Refusal(bilingual('already-labelled', { blockId, mechanism, label }));

  return appendRecord(mechanism, { kind: KIND_OF_LABEL[label], blockId, inputDigest: digestInput(blockId) }, { now });
}

/**
 * Runs the command on `argv` and returns its exit code: 0 done, 2 refused, 1 failed.
 * @es Corre el comando sobre `argv` y devuelve su código de salida: 0 hecho, 2 rechazado, 1 falló.
 */
export function main(argv, { sink = console, now = Date.now() } = {}) {
  const speaker = makeSpeaker(MESSAGE_TABLE, sink);

  try {
    const options = parseOptions(argv);

    if (options.label !== undefined) {
      recordLabel(options.mechanism, options, { now });
      speaker.say(options.label === CORRECT_LABEL ? 'labelled-correct' : 'labelled-false', { blockId: options.blockId, mechanism: options.mechanism });

      return 0;
    }

    const names = mechanismNames(readdirSync);

    if (options.mechanism !== undefined && !names.includes(options.mechanism)) throw new Refusal(bilingual('no-guard', { mechanism: options.mechanism }));

    const withBlocks = (options.mechanism === undefined ? names : [options.mechanism])
      .map((mechanism) => ({ mechanism, blocks: classifyBlocks(readMechanism(mechanism, readdirSync).records) }))
      .filter(({ blocks }) => blocks.decisions.size > 0);

    for (const { mechanism, blocks } of withBlocks) printSample(mechanism, blocks, options, speaker);

    speaker.say(withBlocks.length === 0 ? 'no-blocks' : 'sample-usage');

    return 0;
  } catch (error) {
    if (error instanceof Refusal) {
      speaker.dataError(error.message);

      return 2;
    }

    speaker.complain('command-failed', { detail: error.message });

    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
