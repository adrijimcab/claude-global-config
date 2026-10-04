#!/usr/bin/env node
/**
 * The decisions of `baseline-record/summary.mjs`, each broken once, that `summary.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `summary.mjs`, rotas una a una, que `summary.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const S = 'baseline-record/summary.mjs';

const MUTANTS = [
  // --- the renderer ---
  ['an inherited object key is taken as a message id', S, 'Object.hasOwn(table, id) ? table[id] : undefined', 'table[id]'],
  ['an unknown message id is not refused', S, 'if (entry === undefined) throw', 'if (false) throw'],
  ['an English half that is not a string is accepted', S, "typeof entry.en !== 'string' || ", ''],
  ['an empty English half is accepted', S, "|| entry.en === '' ||", '||'],
  ['a Spanish half that is not a string is accepted', S, "typeof entry.es !== 'string' || entry.es === ''", "entry.es === ''"],
  ['an empty Spanish half is accepted', S, "|| entry.es === '') throw", ') throw'],
  ['a placeholder with no value is filled with the word undefined', S, 'if (!Object.hasOwn(params, name)) throw', 'if (false) throw'],
  ['a value of zero counts as no value', S, 'if (!Object.hasOwn(params, name)) throw', 'if (!params[name]) throw'],
  ['only the first occurrence of a placeholder is filled', S, '/\\{(\\w+)\\}/g', '/\\{(\\w+)\\}/'],
  ['the two halves swap places', S, '`${fill(entry.en)} @es ${fill(entry.es)}`', '`${fill(entry.es)} @es ${fill(entry.en)}`'],
  ['the Spanish half is the English one', S, '${fill(entry.es)}`;', '${fill(entry.en)}`;'],
  ['the separator is not the house form', S, '`${fill(entry.en)} @es ${', '`${fill(entry.en)} @en ${'],

  // --- the table: Spanish accents ---
  ['journals loses the accent of líneas', S, 'ficheros, {lines} líneas en total', 'ficheros, {lines} lineas en total'],
  ['journals per guard loses the accent of Líneas', S, 'Líneas de journal por guardia', 'Lineas de journal por guardia'],
  ['no repos loses the accent of encontró', S, 'No se encontró ningún', 'No se encontro ningun'],
  ['a missing discovery directory loses the accent of inventarió', S, 'no se inventarió nada', 'no se inventario nada'],
  ['the project budget loses the accent of más', S, '(global más proyecto)', '(global mas proyecto)'],

  // --- the budget ---
  ['a measured figure is printed as not measured', S, 'if (!figures.measured) return line(ids.none', 'if (figures.measured) return line(ids.none'],
  ['a figure that was not measured loses its exit code', S, 'line(ids.none, { exit: figures.exitCode', 'line(ids.none, { exit: 0'],
  ['the raw and harness figures are swapped', S, 'raw: figures.rawChars, counted: figures.harnessChars', 'raw: figures.harnessChars, counted: figures.rawChars'],
  ['the ceiling is the raw figure', S, 'ceiling: figures.ceiling', 'ceiling: figures.rawChars'],
  ['the project share is the raw figure', S, 'own: figures.projectRawChars', 'own: figures.rawChars'],
  ['the budget line loses its exit code', S, 'command: figures.command, exit: figures.exitCode })', 'command: figures.command, exit: 0 })'],

  // --- journals and registry ---
  ['the journal file count is the line count', S, 'files: journals.files.length', 'files: journals.totalLines'],
  ['the journal line count is the file count', S, 'lines: journals.totalLines', 'lines: journals.files.length'],
  ['a guard and its lines are separated by a colon', S, '`${guard}=${lines}`', '`${guard}:${lines}`'],
  ['the guards are joined without a space', S, ".map(([guard, lines]) => `${guard}=${lines}`).join(', ')", ".map(([guard, lines]) => `${guard}=${lines}`).join(',')"],
  ['the event count is the hook total', S, 'events: Object.keys(registry.settings.events).length', 'events: registry.settings.totalHooks'],
  ['the hook count is the event count', S, 'hooks: registry.settings.totalHooks', 'hooks: Object.keys(registry.settings.events).length'],
  ['the manifest count is the guard total', S, 'manifests: Object.keys(registry.manifests.files).length', 'manifests: registry.manifests.totalGuards'],
  ['the guard count is the manifest count', S, 'guards: registry.manifests.totalGuards', 'guards: Object.keys(registry.manifests.files).length'],
  ['unreadable settings are printed as a registry count', S, "registry.settings === 'unreadable' ? line(", "registry.settings !== 'unreadable' ? line("],
  ['the sidecar count is the guard count', S, 'sidecars: registry.sidecars', 'sidecars: registry.manifests.totalGuards'],

  // --- tips and repos ---
  ['a repo with no tip is printed with a tip', S, 'tip.tip === undefined ?', 'tip.tip !== undefined ?'],
  ['the branch of a tip is its commit', S, 'branch: tip.branch', 'branch: tip.tip'],
  ['a repo whose status failed is read before its lines', S, '(!repo.measured ? line(', '(repo.measured ? line('],
  ['a repo with changes is said clean', S, 'repo.lines.length === 0 ? line(', 'repo.lines.length !== 0 ? line('],
  ['a dirty repo reports no count', S, 'count: repo.lines.length', 'count: 0'],
  ['the paths of a dirty repo are joined with commas', S, "paths: repo.lines.join('; ')", "paths: repo.lines.join(', ')"],
  ['the paths of a dirty repo lose their leading column', S, "paths: repo.lines.join('; ')", "paths: repo.lines.map((entry) => entry.trim()).join('; ')"],
  ['no product repo is not said', S, 'productRepos.length === 0 ?', 'productRepos.length !== 0 ?'],

  // --- the discovery directory ---
  ['a missing directory is inventoried', S, 'if (!inventory.exists) return', 'if (inventory.exists) return'],
  ['a git status that failed is printed as a count', S, 'return porcelain.measured ? line(', 'return !porcelain.measured ? line('],
  ['the file and byte counts are swapped', S, 'files: inventory.totalFiles, bytes: inventory.totalBytes', 'files: inventory.totalBytes, bytes: inventory.totalFiles'],
  ['the entry count is zero', S, 'entries: inventory.entries.length', 'entries: 0'],
  ['the status line count is zero', S, 'status: porcelain.lines.length', 'status: 0'],
  ['a failed git status loses its exit code', S, 'exit: porcelain.exitCode', 'exit: 0'],

  // --- latency ---
  ['a measured latency is printed as not measured', S, 'if (!latency.measured) return', 'if (latency.measured) return'],
  ['a failed latency loses its exit code', S, "line('noLatency', { exit: latency.exitCode", "line('noLatency', { exit: 0"],
  ['the median and p95 are swapped', S, 'median: result.medianMs, p95: result.p95Ms', 'median: result.p95Ms, p95: result.medianMs'],
  ['the first run is the median', S, 'first: result.firstMs', 'first: result.medianMs'],
  ['the run count is zero', S, 'runs: result.runs }', 'runs: 0 }'],
  ['a clean run set is printed on the dirty line', S, "clean: [line('latencyClean', figures), line('latencyDirtyNone', {})]", "clean: [line('latencyDirty', figures), line('latencyCleanNone', {})]"],
  ['a dirty run set is printed on the clean line', S, "dirty: [line('latencyCleanNone', {}), line('latencyDirty', figures)]", "dirty: [line('latencyClean', figures), line('latencyDirtyNone', {})]"],
  ['an unknown run set is printed as clean', S, "unknown: [line('latencyUnknown', figures)]", "unknown: [line('latencyClean', figures)]"],
  ['a dirty run set also says the clean one was measured', S, "dirty: [line('latencyCleanNone', {}), ", "dirty: ["],
  ['the live and finished counts are swapped', S, 'live: result.liveTranscripts30min, finished: result.finishedWorkerTranscripts6h', 'live: result.finishedWorkerTranscripts6h, finished: result.liveTranscripts30min'],
  ['the transcript bytes are the live count', S, 'bytes: result.transcriptBytes', 'bytes: result.liveTranscripts30min'],
  ['a dirty repo is listed clean', S, "repo.dirty === true ? 'dirty'", "repo.dirty === true ? 'clean'"],
  ['a clean repo is listed dirty', S, "repo.dirty === false ? 'clean'", "repo.dirty === false ? 'dirty'"],
  ['an unreadable repo is listed clean', S, ": 'unreadable'", ": 'clean'"],
  ['the title carries no time', S, 'line(\'title\', { at: record.recordedAt })', "line('title', { at: 'now' })"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['baseline-record'],
  selftest: 'baseline-record/summary.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
