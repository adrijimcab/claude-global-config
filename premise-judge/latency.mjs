#!/usr/bin/env node
/**
 * The latency the premise judge adds to a turn, read from the transcripts the harness already writes. Every
 * Stop leaves a `system` record of subtype `stop_hook_summary` whose `hookInfos` lists each Stop hook with its
 * `durationMs` (seen in Claude Code 2.1.292 transcripts). The judge's entry is the one whose label holds
 * `PROMPT_SIGNATURE`, the rubric's first line. Stop hooks run in parallel, so what the judge ADDS to a stop is
 * how much longer it ran than the slowest other hook: `max(0, judge - slowest other)`.
 *
 *   node latency.mjs [--projects <dir>] [--since <ISO date>]
 *
 * Prints one JSON object: how many summaries were read, how many carry the judge, the median and p95 of the
 * judge's duration and of the latency it adds, and, when none carries it, the labels the summaries DO carry,
 * so a label format other than the one assumed is seen rather than read as "no latency". Exit 0 printed, 2
 * refused (an unknown option, an unreadable date).
 *
 * UNVERIFIED: that `hookInfos` lists a prompt hook, and under which label. The selftest proves the arithmetic
 * on records shaped like the command-hook ones; H8 (`checklists/host-backlog.md`) checks the real shape.
 *
 * @es La latencia que el juez de premisas añade a un turno, leída de los transcripts que el harness ya escribe:
 * cada Stop deja un registro `system` `stop_hook_summary` cuyo `hookInfos` lista cada hook con su `durationMs`.
 * La entrada del juez es la que lleva `PROMPT_SIGNATURE`. Los hooks de Stop corren en paralelo, así que lo que
 * AÑADE el juez es cuánto más tardó que el más lento de los otros. Imprime un JSON con las cifras y, si ningún
 * resumen lleva al juez, las etiquetas que sí llevan, para que un formato distinto del supuesto se vea. Sale
 * con 0 impreso y 2 rechazado. NO VERIFICADO: que `hookInfos` liste un hook `prompt` y con qué etiqueta (H8).
 */

import { createReadStream, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { medianOf, percentile95 } from '../hook-dispatch/latency.mjs';
import { claudeHome } from '../hook-state/locations.mjs';
import { PROMPT_SIGNATURE } from './prompt.mjs';

/** Labels listed when no summary carries the judge. @es Etiquetas listadas cuando ningún resumen lleva al juez. */
const LABELS_SHOWN = 10;
const LABEL_CHARS = 80;

/** The label of a `hookInfos` entry. @es La etiqueta de una entrada de `hookInfos`. */
const labelOf = (info) => (typeof info?.command === 'string' ? info.command : JSON.stringify(info?.command ?? null));

/**
 * `{ judgeMs, addedMs }` for one Stop summary record that carries the judge, `undefined` otherwise.
 * @es `{ judgeMs, addedMs }` para un resumen de Stop que lleva al juez; `undefined` si no.
 */
export function judgeLatency(record) {
  if (record?.type !== 'system' || record.subtype !== 'stop_hook_summary' || !Array.isArray(record.hookInfos)) return undefined;

  const timed = record.hookInfos.filter((info) => Number.isFinite(info?.durationMs));
  const judge = timed.find((info) => labelOf(info).includes(PROMPT_SIGNATURE));

  if (judge === undefined) return undefined;

  const slowestOther = Math.max(0, ...timed.filter((info) => info !== judge).map((info) => info.durationMs));

  return { judgeMs: judge.durationMs, addedMs: Math.max(0, judge.durationMs - slowestOther) };
}

/** Median and p95 of `values`, or null for none. @es Mediana y p95, o null si no hay. */
const spread = (values) => (values.length === 0 ? null : { median: medianOf(values), p95: percentile95(values) });

/**
 * The report over the Stop summary records `records` (any other record is ignored).
 * @es El informe sobre los resúmenes de Stop de `records` (los demás se ignoran).
 */
export function latencyReport(records) {
  const summaries = records.filter((record) => record?.type === 'system' && record.subtype === 'stop_hook_summary');
  const samples = summaries.map(judgeLatency).filter((sample) => sample !== undefined);
  const report = { summaries: summaries.length, withJudge: samples.length, judgeMs: spread(samples.map((sample) => sample.judgeMs)), addedMs: spread(samples.map((sample) => sample.addedMs)) };

  if (samples.length > 0 || summaries.length === 0) return report;

  const counts = new Map();

  for (const info of summaries.flatMap((record) => (Array.isArray(record.hookInfos) ? record.hookInfos : []))) {
    const label = labelOf(info).slice(0, LABEL_CHARS);

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return { ...report, labelsSeen: [...counts].sort((left, right) => right[1] - left[1]).slice(0, LABELS_SHOWN).map(([label, count]) => ({ label, count })) };
}

/** Every `.jsonl` under `root`, at any depth. @es Cada `.jsonl` bajo `root`, a cualquier profundidad. */
function jsonlFilesUnder(root) {
  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

/** The Stop summary records of `file` from `since` on, read line by line. @es Los resúmenes de Stop de `file` desde `since`. */
async function summariesOf(file, since) {
  const found = [];
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.includes('stop_hook_summary')) continue;

    try {
      const record = JSON.parse(line);

      if (since === undefined || Date.parse(record.timestamp) >= since) found.push(record);
    } catch {
      // A torn or corrupt line is no summary. @es Una línea rota no es un resumen.
    }
  }

  return found;
}

/**
 * Runs the command on `argv` and returns its exit code. @es Corre el comando y devuelve su código de salida.
 */
export async function main(argv, { out = (text) => process.stdout.write(`${text}\n`) } = {}) {
  let values;

  try {
    values = parseArgs({ args: argv, options: { projects: { type: 'string' }, since: { type: 'string' } } }).values;
  } catch (error) {
    out(`${error.message} @es opción desconocida o sin valor`);

    return 2;
  }

  const since = values.since === undefined ? undefined : Date.parse(values.since);

  if (Number.isNaN(since)) {
    out(`--since is not a date: ${values.since} @es --since no es una fecha`);

    return 2;
  }

  const root = values.projects ?? path.join(claudeHome(), 'projects');
  const records = [];

  for (const file of jsonlFilesUnder(root)) records.push(...(await summariesOf(file, since)));

  out(JSON.stringify(latencyReport(records), null, 2));

  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
