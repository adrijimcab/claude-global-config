/**
 * What the guard journals say about their blocks, shared by the report and the hand-labelling command so that
 * both read the same truth. `readMechanism` returns the v2 records of one mechanism's journal and counts, per
 * `*.jsonl` file, the lines it could not classify (v1 lines, a torn line, an unknown kind, no `blockId`, any
 * `*.jsonl` beside the journal): no outcome is guessed for them. `classifyBlocks` turns those records into
 * blocks (distinct `blockId` of `decision` records: an allow is never journaled) and LABELS: a `dismissal` or
 * a `false-positive-report` labels a block `false`, a `true-positive-report` labels it `correct`, and a block
 * with several labels has the LAST one, in journal order, because a human who changes their mind is right the
 * second time. A label is SAMPLED when the random sample of `label.mjs` drew its block (`sampled: true`) and
 * SELF-REPORTED otherwise (a dismissal, or a report somebody chose to make): only sampled labels may estimate a
 * rate, because the blocks people choose to report are not a random sample. A block with no label is unlabelled and contributes nothing to any rate. A label whose
 * `blockId` matches no block is ORPHANED: listed, never counted.
 *
 * @es Lo que los journals de los guards dicen de sus bloqueos, compartido por el informe y el comando de
 * etiquetado a mano para que ambos lean la misma verdad. `readMechanism` devuelve los registros v2 del
 * journal de un mecanismo y cuenta, por fichero `*.jsonl`, las líneas que no pudo clasificar (v1, cortada,
 * tipo desconocido, sin `blockId`, otro `*.jsonl` junto al journal): no se adivina un desenlace para ellas.
 * `classifyBlocks` convierte esos registros en bloqueos (`blockId` distintos de los registros `decision`: un
 * permiso nunca se registra) y ETIQUETAS: un `dismissal` o un `false-positive-report` etiqueta un bloqueo
 * como `false`, un `true-positive-report` como `correct`, y un bloqueo con varias etiquetas se queda con la
 * ÚLTIMA, en orden de journal, porque quien cambia de opinión acierta la segunda vez. Una etiqueta es de MUESTRA
 * cuando la muestra aleatoria de `label.mjs` sorteó su bloqueo (`sampled: true`) y AUTOINFORMADA si no (un
 * descarte, o un informe que alguien eligió hacer): solo las etiquetas de muestra pueden estimar una tasa,
 * porque los bloqueos que la gente elige informar no son una muestra aleatoria. Un bloqueo sin
 * etiqueta no está etiquetado y no aporta nada a ninguna tasa. Una etiqueta cuyo `blockId` no coincide con
 * ningún bloqueo es HUÉRFANA: se lista, nunca se cuenta.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { KINDS, journalPath } from '../hook-state/journal.mjs';
import { assertMechanism, claudeHome, stateDir } from '../hook-state/locations.mjs';

/** The label of a block a human judged wrong. @es La etiqueta de un bloqueo que una persona juzgó erróneo. */
export const FALSE_LABEL = 'false';

/** The label of a block a human judged right. @es La etiqueta de un bloqueo que una persona juzgó acertado. */
export const CORRECT_LABEL = 'correct';

/** The label each outcome kind gives its block. @es La etiqueta que cada tipo de desenlace da a su bloqueo. */
const LABEL_OF_KIND = { dismissal: FALSE_LABEL, 'false-positive-report': FALSE_LABEL, 'true-positive-report': CORRECT_LABEL };

const isPlainName = (name) => {
  try {
    assertMechanism(name);

    return true;
  } catch {
    return false;
  }
};

/** The mechanisms that have a state directory, sorted. @es Los mecanismos con directorio de estado, ordenados. */
export function mechanismNames(readDirectory) {
  const root = process.env.HOOK_STATE_DIR ? path.resolve(process.env.HOOK_STATE_DIR) : claudeHome();

  if (!existsSync(root)) return [];

  return readDirectory(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isPlainName(entry.name))
    .map((entry) => entry.name)
    .filter((name) => existsSync(stateDir(name)))
    .sort();
}

/** The parsed line, or undefined when it is not JSON. @es La línea parseada, o undefined si no es JSON. */
function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** Whether a parsed line is a v2 record of a known kind with a blockId. @es Si una línea parseada es un registro v2 de tipo conocido con blockId. */
const isV2Record = (record) => record?.v === 2 && KINDS.has(record.kind) && typeof record.blockId === 'string' && record.blockId !== '';

/**
 * The v2 records of one mechanism's journal, and how many lines of each `*.jsonl` file could not be classified.
 * @es Los registros v2 del journal de un mecanismo, y cuántas líneas de cada `*.jsonl` no se pudieron clasificar.
 */
export function readMechanism(mechanism, readDirectory) {
  const directory = stateDir(mechanism);
  const journal = path.basename(journalPath(mechanism));
  const records = [];
  const unclassifiedFiles = {};
  const files = readDirectory(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl')).map((entry) => entry.name).sort();

  for (const file of files) {
    for (const line of readFileSync(path.join(directory, file), 'utf8').split('\n')) {
      if (line.trim() === '') continue;

      const record = file === journal ? parse(line) : undefined;

      if (isV2Record(record)) records.push(record);
      else unclassifiedFiles[file] = (unclassifiedFiles[file] ?? 0) + 1;
    }
  }

  return { records, unclassifiedFiles };
}

/**
 * The blocks of `records` and their labels: `decisions` maps each block id to its first `decision` record
 * (the evidence), `labels` maps each LABELLED block id to its last label as `{ label, sampled }` (`sampled` is
 * true only for a record that says `sampled: true`: the random sample of `label.mjs` drew it), `orphaned` lists
 * the sorted ids of labels that name no block.
 * @es Los bloqueos de `records` y sus etiquetas: `decisions` asocia cada id de bloqueo a su primer registro `decision` (la evidencia), `labels` asocia cada id de bloqueo ETIQUETADO a su última etiqueta como `{ label, sampled }` (`sampled` es true solo si el registro dice `sampled: true`: la muestra aleatoria de `label.mjs` lo sorteó), `orphaned` lista los ids ordenados de etiquetas que no nombran ningún bloqueo.
 */
export function classifyBlocks(records) {
  const decisions = new Map();
  const labels = new Map();
  const orphans = new Set();

  for (const record of records) {
    if (record.kind === 'decision' && !decisions.has(record.blockId)) decisions.set(record.blockId, record);
  }

  for (const record of records) {
    const label = LABEL_OF_KIND[record.kind];

    if (label === undefined) continue;

    const entry = { label, sampled: record.sampled === true };

    if (decisions.has(record.blockId)) labels.set(record.blockId, entry);
    else orphans.add(record.blockId);
  }

  return { decisions, labels, orphaned: [...orphans].sort() };
}
