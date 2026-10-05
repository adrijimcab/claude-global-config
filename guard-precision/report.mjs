#!/usr/bin/env node
/**
 * The per-guard precision report. For every mechanism with a state directory it reads the v2 journal
 * (`journal.jsonl`), counts the blocks (distinct `blockId` of `decision` records: an allow is never journaled),
 * joins the explicit outcomes (`dismissal`, `false-positive-report`) to them by `blockId`, and computes
 * precision = 1 - flagged / blocks, where `flagged` counts a block ONCE however many outcomes it has. Fewer
 * than 10 blocks reads "insufficient data" and no blocks "no data": a figure is never printed for them, so
 * an empty guard can never read 100%. An outcome whose `blockId` matches no block is ORPHANED: listed, never
 * counted. Every other line (v1 lines, a torn line, an unknown kind, no `blockId`, any other `*.jsonl` beside
 * the journal) is UNCLASSIFIED and counted per file: no outcome is guessed for it. `--json` prints the report
 * untranslated; otherwise a bilingual table is printed through `bilingual-output/`.
 *
 * @es El informe de precisión por guard. De cada mecanismo con directorio de estado lee el journal v2
 * (`journal.jsonl`), cuenta los bloqueos (`blockId` distintos de los registros `decision`: un permiso nunca
 * se registra), une los desenlaces explícitos (`dismissal`, `false-positive-report`) por `blockId` y calcula
 * precisión = 1 - marcados / bloqueos; un bloqueo se marca UNA vez, tenga los desenlaces que tenga. Menos de 10
 * bloqueos dice «datos insuficientes» y ninguno «sin datos»: nunca se imprime una cifra para ellos, así que un
 * guard vacío no puede leerse como 100 %. Un desenlace cuyo `blockId` no coincide con ningún bloqueo es
 * HUÉRFANO: se lista, nunca se cuenta. Toda otra línea (v1, cortada, tipo desconocido, sin `blockId`, otro
 * `*.jsonl` junto al journal) es SIN CLASIFICAR y se cuenta por fichero: no se adivina un desenlace para ella.
 * `--json` imprime el informe sin traducir; si no, una tabla bilingüe por `bilingual-output/`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { KINDS, journalPath } from '../hook-state/journal.mjs';
import { assertMechanism, claudeHome, stateDir } from '../hook-state/locations.mjs';
import { MESSAGE_TABLE } from './report-messages.mjs';

/** The blocks a guard needs before a figure is printed. @es Los bloqueos que un guard necesita antes de imprimir una cifra. */
export const MIN_BLOCKS = 10;

const isPlainName = (name) => {
  try {
    assertMechanism(name);

    return true;
  } catch {
    return false;
  }
};

/** The mechanisms that have a state directory, sorted. @es Los mecanismos con directorio de estado, ordenados. */
function mechanismNames(readDirectory) {
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
function readMechanism(mechanism, readDirectory) {
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

/** The figures of one mechanism. @es Las cifras de un mecanismo. */
function summarize(mechanism, { records, unclassifiedFiles }) {
  const idsOf = (kind) => new Set(records.filter((record) => record.kind === kind).map((record) => record.blockId));
  const blockIds = idsOf('decision');
  const dismissals = idsOf('dismissal');
  const reports = idsOf('false-positive-report');
  const joined = (ids) => [...ids].filter((id) => blockIds.has(id));
  const flagged = new Set([...joined(dismissals), ...joined(reports)]).size;
  const orphaned = [...new Set([...dismissals, ...reports])].filter((id) => !blockIds.has(id)).sort();
  const blocks = blockIds.size;
  const status = blocks === 0 ? 'no-data' : blocks < MIN_BLOCKS ? 'insufficient-data' : 'ok';

  return {
    mechanism,
    blocks,
    dismissed: joined(dismissals).length,
    falsePositive: joined(reports).length,
    flagged,
    orphaned,
    unclassified: Object.values(unclassifiedFiles).reduce((sum, count) => sum + count, 0),
    unclassifiedFiles,
    precision: status === 'ok' ? 1 - flagged / blocks : null,
    status
  };
}

/**
 * The report of every mechanism with a journal file, read now.
 * @es El informe de cada mecanismo con un fichero de journal, leído ahora.
 * @param options.readDirectory Replaces `fs.readdirSync` (a test seam for a listing order the platform does not give). @es Sustituye a `fs.readdirSync` (punto de prueba para un orden de listado que la plataforma no da).
 */
export function buildReport({ readDirectory = readdirSync } = {}) {
  const guards = mechanismNames(readDirectory)
    .map((mechanism) => ({ mechanism, read: readMechanism(mechanism, readDirectory) }))
    .filter(({ read }) => read.records.length + Object.keys(read.unclassifiedFiles).length > 0)
    .map(({ mechanism, read }) => summarize(mechanism, read));

  return { guards, unclassifiedTotal: guards.reduce((sum, guard) => sum + guard.unclassified, 0) };
}

const ROW_OF = { ok: 'row-ok', 'insufficient-data': 'row-insufficient', 'no-data': 'row-no-data' };

/** Prints the bilingual table of `report`. @es Imprime la tabla bilingüe de `report`. */
function printTable(report, speaker) {
  if (report.guards.length === 0) speaker.say('no-journals');

  for (const guard of report.guards) {
    speaker.say(ROW_OF[guard.status], { ...guard, percent: (guard.precision * 100).toFixed(1), minimum: MIN_BLOCKS });
    if (guard.orphaned.length > 0) speaker.say('orphans', { mechanism: guard.mechanism, ids: guard.orphaned.join(', ') });
  }

  if (report.unclassifiedTotal > 0) speaker.say('unclassified-total', { count: report.unclassifiedTotal });
}

/**
 * Runs the command on `argv` and returns its exit code: 0 printed, 2 refused.
 * @es Corre el comando sobre `argv` y devuelve su código de salida: 0 impreso, 2 rechazado.
 */
export function main(argv, { sink = console } = {}) {
  const speaker = makeSpeaker(MESSAGE_TABLE, sink);
  const unknown = argv.find((argument) => argument !== '--json');

  if (unknown !== undefined) {
    speaker.complain('unknown-option', { option: unknown });

    return 2;
  }

  const report = buildReport();

  if (argv.includes('--json')) speaker.data(JSON.stringify(report));
  else printTable(report, speaker);

  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
