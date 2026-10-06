#!/usr/bin/env node
/**
 * Hand labelling of guard blocks, the input of the false-block rate (`report.mjs`). The rate may only be
 * estimated from a RANDOM sample, so this command is the only way to make a label that counts: without a label
 * option it draws, per guard (or for `--mechanism <name>` only), a reproducible random sample of blocks
 * (`--sample <n>`, default 10; `--seed <text>`, default 1) and prints the evidence of each one still to label:
 * the time, the event, the tool use, the start of the input digest and the reason the guard journaled. With
 * `--mechanism <name> --correct <blockId>` or `--false <blockId>` (and the same `--seed` and `--sample` as the
 * draw) it records the judgement through the journal, never by editing JSONL by hand, and ONLY for a block that
 * draw contains: `--correct` appends a `true-positive-report`, `--false` a `false-positive-report`, both with
 * `sampled: true` and the seed. A false label does not lift the block (only `dismiss.mjs` does). A block
 * labelled again takes the new label (the last one decides); labelling it the same way twice is refused.
 * The population of the draw is every block nobody reported on their own (a dismissal, or a report made
 * outside the sample, is a self-reported label: it is counted apart and is not drawn). The sample ranks that
 * population by a hash of seed, guard and block id, so the same inputs give the same sample on every platform,
 * and a smaller sample is the start of a larger one. Every printed line is a bilingual message of
 * `label-messages.mjs`; a refusal exits 2 and writes nothing.
 *
 * @es Etiquetado a mano de los bloqueos de los guards, la entrada de la tasa de falsos bloqueos
 * (`report.mjs`). La tasa solo puede estimarse con una muestra ALEATORIA, así que este comando es la única
 * manera de hacer una etiqueta que cuente: sin opción de etiqueta saca, por guard (o solo `--mechanism
 * <nombre>`), una muestra aleatoria reproducible de bloqueos (`--sample <n>`, por defecto 10; `--seed
 * <texto>`, por defecto 1) e imprime la evidencia de cada uno por etiquetar: la hora, el evento, el uso de herramienta,
 * el inicio de la huella de la entrada y el motivo que el guard registró. Con `--mechanism <nombre> --correct
 * <blockId>` o `--false <blockId>` (y la misma `--seed` y `--sample` del sorteo) registra el juicio por el
 * journal, nunca editando JSONL a mano, y SOLO para un bloqueo que ese sorteo contiene: `--correct` añade un
 * `true-positive-report`, `--false` un `false-positive-report`, ambos con `sampled: true` y la semilla. Una
 * etiqueta falsa no levanta el bloqueo (solo lo hace `dismiss.mjs`). Un bloqueo etiquetado de nuevo toma la
 * nueva etiqueta (decide la última); etiquetarlo igual dos veces se rechaza. La población del sorteo es todo
 * bloqueo del que nadie informó por su cuenta (un descarte, o un informe hecho fuera de la muestra, es una
 * etiqueta autoinformada: se cuenta aparte y no se sortea). La muestra ordena esa población por un hash de
 * semilla, guard e id de bloqueo, así que las mismas entradas dan la misma muestra en cualquier plataforma, y
 * una muestra menor es el comienzo de una mayor. Cada línea impresa es un mensaje bilingüe de
 * `label-messages.mjs`; un rechazo sale con 2 y no escribe nada.
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

/**
 * The blocks the sample draws from: every block that is unlabelled or was labelled by a sample, never one that
 * somebody reported on their own.
 * @es Los bloqueos de los que sortea la muestra: todo bloqueo sin etiqueta o etiquetado por una muestra, nunca uno del que alguien informó por su cuenta.
 */
const populationOf = ({ decisions, labels }) => [...decisions.keys()].filter((blockId) => labels.get(blockId)?.sampled ?? true);

/** Prints the sample of one guard: the blocks of the draw still to label. @es Imprime la muestra de un guard: los bloqueos del sorteo por etiquetar. */
function printSample(mechanism, blocks, { size, seed }, speaker) {
  const { decisions, labels } = blocks;
  const drawn = drawSample(populationOf(blocks), { seed, mechanism, size });
  const pending = drawn.filter((blockId) => !labels.has(blockId));
  const labelled = [...labels.values()].filter((entry) => entry.sampled).length;

  speaker.say('sample-header', { mechanism, shown: pending.length, drawn: drawn.length, seed, labelled, blocks: decisions.size });

  for (const blockId of pending) {
    const { ts, event, toolUseId, inputDigest, reason } = decisions.get(blockId);

    speaker.say('sample-block', { blockId, ts: shown(ts), event: shown(event), toolUseId: shown(toolUseId), digest: shown(inputDigest?.slice(0, DIGEST_WIDTH)), reason: shown(reason) });
  }
}

/**
 * Records `label` for block `blockId` of `mechanism` as a SAMPLED label and returns the record; throws a Refusal
 * for a guard with no journal, a block that does not exist, a block the draw of `seed` and `size` does not
 * contain, and a block that already has that sampled label.
 * @es Registra la etiqueta `label` del bloqueo `blockId` de `mechanism` como etiqueta de MUESTRA y devuelve el registro; lanza un Refusal si el guard no tiene journal, el bloqueo no existe, el sorteo de `seed` y `size` no lo contiene, o el bloqueo ya tiene esa etiqueta de muestra.
 */
function recordLabel(mechanism, { blockId, label, seed, size }, { now }) {
  if (!mechanismNames(readdirSync).includes(mechanism)) throw new Refusal(bilingual('no-guard', { mechanism }));

  const blocks = classifyBlocks(readMechanism(mechanism, readdirSync).records);

  if (!blocks.decisions.has(blockId)) throw new Refusal(bilingual('unknown-block', { blockId, mechanism }));
  if (!drawSample(populationOf(blocks), { seed, mechanism, size }).includes(blockId)) throw new Refusal(bilingual('not-sampled', { blockId, mechanism, seed, size }));
  if (blocks.labels.get(blockId)?.label === label) throw new Refusal(bilingual('already-labelled', { blockId, mechanism, label }));

  return appendRecord(mechanism, { kind: KIND_OF_LABEL[label], blockId, inputDigest: digestInput(blockId), sampled: true, seed }, { now });
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

    if (withBlocks.length === 0) speaker.say('no-blocks');
    else speaker.say('sample-usage', { seed: options.seed, size: options.size });

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
