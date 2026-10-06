#!/usr/bin/env node
/**
 * The decisions of `hook-dispatch/latency.mjs` (and the latency branch of `replay.mjs`), each broken once,
 * that `latency.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`;
 * `crashKills: 'fail'` makes a mutant that only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `latency.mjs` (y la rama latency de `replay.mjs`), rotas una a una, que
 * `latency.selftest.mjs` debe detectar. Un mutante que solo hace caer el selftest cuenta como superviviente.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const L = 'hook-dispatch/latency.mjs';
const R = 'hook-dispatch/replay.mjs';

const MUTANTS = [
  // --- statistics ---
  ['the median of an even count takes the upper middle value', L, '(sorted[middle - 1] + sorted[middle]) / 2', 'sorted[middle]'],
  ['the median of an odd count reads the wrong parity', L, 'sorted.length % 2 === 1 ?', 'sorted.length % 2 === 0 ?'],
  ['the median does not sort', L, 'const sorted = [...values].sort((left, right) => left - right);\n  const middle', 'const sorted = [...values];\n  const middle'],
  ['the median sorts its input in place', L, 'const sorted = [...values].sort((left, right) => left - right);\n  const middle', 'const sorted = values.sort((left, right) => left - right);\n  const middle'],
  ['the median of nothing returns instead of throwing', L, "if (values.length === 0) throw fail('Cannot take the median", "if (false) throw fail('Cannot take the median"],
  ['the p95 does not sort', L, 'const sorted = [...values].sort((left, right) => left - right);\n\n  return sorted[Math.ceil', 'const sorted = [...values];\n\n  return sorted[Math.ceil'],
  ['the p95 rounds the rank down', L, 'Math.ceil(0.95 * sorted.length) - 1', 'Math.floor(0.95 * sorted.length) - 1'],
  ['the p95 is the 90th percentile', L, 'Math.ceil(0.95 * sorted.length) - 1', 'Math.ceil(0.9 * sorted.length) - 1'],
  ['the p95 is the maximum', L, 'Math.ceil(0.95 * sorted.length) - 1', 'sorted.length - 1'],
  ['the p95 of nothing returns instead of throwing', L, "if (values.length === 0) throw fail('Cannot take the p95", "if (false) throw fail('Cannot take the p95"],

  // --- the census ---
  ['the live window is 31 minutes', L, 'export const ACTIVE_WINDOW_MS = 30 * 60 * 1000;', 'export const ACTIVE_WINDOW_MS = 31 * 60 * 1000;'],
  ['the horizon is 24 hours', L, 'export const FINISHED_HORIZON_MS = 6 * 60 * 60 * 1000;', 'export const FINISHED_HORIZON_MS = 24 * 60 * 60 * 1000;'],
  ['a transcript written exactly at the live limit is still live', L, 'const live = age < ACTIVE_WINDOW_MS;', 'const live = age <= ACTIVE_WINDOW_MS;'],
  ['a worker written exactly at the horizon is still finished', L, 'age < FINISHED_HORIZON_MS;', 'age <= FINISHED_HORIZON_MS;'],
  ['finished workers outside the horizon are counted', L, 'const finished = !live && worker && age < FINISHED_HORIZON_MS;', 'const finished = !live && worker;'],
  ['a finished MAIN transcript is counted like a worker', L, 'const finished = !live && worker && age < FINISHED_HORIZON_MS;', 'const finished = !live && age < FINISHED_HORIZON_MS;'],
  ['a live worker is also counted as finished', L, 'const finished = !live && worker && age < FINISHED_HORIZON_MS;', 'const finished = worker && age < FINISHED_HORIZON_MS;'],
  ['live transcripts are not counted', L, 'if (live) census.live30min += 1;', ''],
  ['finished workers are not counted', L, 'if (finished) census.finished6h += 1;', ''],
  ['only live transcripts add bytes', L, 'if (live || finished) census.transcriptBytes += size;', 'if (live) census.transcriptBytes += size;'],
  ['only finished workers add bytes', L, 'if (live || finished) census.transcriptBytes += size;', 'if (finished) census.transcriptBytes += size;'],
  ['a session file is a transcript whatever its extension', L, "if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push", 'if (entry.isFile()) found.push'],
  ['a worker file is a transcript whatever its extension', L, "readdirSync(workers).filter((name) => name.endsWith('.jsonl'))", 'readdirSync(workers)'],
  ['a project entry that is a file is walked as a directory', L, 'readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())', 'readdirSync(root, { withFileTypes: true })'],
  ['a missing root throws instead of being an empty census', L, 'if (!existsSync(root)) return [];', ''],
  ['workers are never looked for', L, 'if (existsSync(workers)) {', 'if (false) {'],

  // --- the payload ---
  ['the OLDEST session transcript is used', L, 'entry.mtime > best.mtime ? entry : best', 'entry.mtime < best.mtime ? entry : best'],
  ['a worker transcript can be the session transcript', L, 'filter((entry) => !entry.worker).map', 'map'],
  ['no transcript at all is not refused', L, 'if (mains.length === 0) throw', 'if (false) throw'],
  ['the payload claims the Stop hook is already active', L, 'stop_hook_active: false', 'stop_hook_active: true'],
  ['the payload names another event', L, "hook_event_name: 'Stop'", "hook_event_name: 'SubagentStop'"],
  ['the session id keeps the extension', L, "path.basename(newest.file, '.jsonl')", 'path.basename(newest.file)'],
  ['the payload loses the working directory', L, 'transcript_path: newest.file, cwd,', 'transcript_path: newest.file, cwd: undefined,'],

  // --- repo state and scenario ---
  ['the default git dir is the work tree itself', L, "gitDir = path.join(worktree, '.git')", 'gitDir = worktree'],
  ['the explicit work tree is not passed to git', L, '`--work-tree=${worktree}`, ', ''],
  ['the explicit git dir is not passed to git', L, '`--git-dir=${gitDir}`, ', ''],
  ['a clean status reads as dirty', L, "run.stdout !== '' : 'unreadable'", "run.stdout === '' : 'unreadable'"],
  ['a failed git reads as clean', L, "run.stdout !== '' : 'unreadable'", "run.stdout !== '' : false"],
  ['a failed git reads as dirty', L, "run.stdout !== '' : 'unreadable'", "run.stdout !== '' : true"],
  ['an unreadable repo is not enough for dirty to win', L, "repos.some((repo) => repo.dirty === true)", "repos.some((repo) => repo.dirty !== false)"],
  ['no repos at all read as clean', L, 'repos.length > 0 && repos.every', 'repos.every'],
  ['an unreadable repo counts as clean', L, 'repos.every((repo) => repo.dirty === false)', 'repos.every((repo) => repo.dirty !== true)'],

  // --- the dispatcher process and the run loop ---
  ['the dispatcher timeout is in seconds', L, 'export const RUN_TIMEOUT_MS = 120_000;', 'export const RUN_TIMEOUT_MS = 120;'],
  ['the dispatcher timeout is ignored', L, 'timeout: timeoutMs });', 'timeout: RUN_TIMEOUT_MS });'],
  ['a killed dispatcher reads as exit 0', L, 'code: run.status ?? 1', 'code: run.status ?? 0'],
  ['the run count is not validated', L, 'if (!Number.isInteger(runs) || runs < 1) throw', 'if (false) throw'],
  ['zero runs is accepted', L, 'runs < 1) throw', 'runs < 0) throw'],
  ['one run too few', L, 'Array.from({ length: runs }', 'Array.from({ length: runs - 1 }'],
  ['the temp state dir is not given to the dispatcher', L, '[STATE_ROOT_VARIABLE]: stateDir', '[STATE_ROOT_VARIABLE]: undefined'],
  ['the ambient environment is dropped', L, '{ ...process.env, [STATE_ROOT_VARIABLE]', '{ [STATE_ROOT_VARIABLE]'],
  ['times are not rounded', L, 'Math.round(result.ms * 10) / 10', 'result.ms'],
  ['times are rounded to whole milliseconds', L, 'Math.round(result.ms * 10) / 10', 'Math.round(result.ms)'],
  ['a failed run is not counted', L, 'result.code !== 0).length', 'result.code !== 0 && false).length'],
  ['a run that exits 0 is counted as failed', L, 'result.code !== 0).length', 'result.code === 0).length'],

  // --- the record ---
  ['the record carries the p95 as its median', L, 'medianMs: medianOf(timed.runsMs), p95Ms: percentile95(timed.runsMs)', 'medianMs: percentile95(timed.runsMs), p95Ms: percentile95(timed.runsMs)'],
  ['the record carries the median as its p95', L, 'p95Ms: percentile95(timed.runsMs)', 'p95Ms: medianOf(timed.runsMs)'],
  ['the first run is the last run', L, 'firstMs: timed.runsMs[0]', 'firstMs: timed.runsMs.at(-1)'],
  ['the live count is the finished count', L, 'liveTranscripts30min: census.live30min', 'liveTranscripts30min: census.finished6h'],
  ['the finished count is the live count', L, 'finishedWorkerTranscripts6h: census.finished6h', 'finishedWorkerTranscripts6h: census.live30min'],
  ['the bytes are dropped from the record', L, 'transcriptBytes: census.transcriptBytes,', 'transcriptBytes: 0,'],
  ['the repos are not read', L, 'const states = repos.map(repoState);', 'const states = [];'],
  ['the run times are dropped from the record', L, 'runsMs: timed.runsMs,', ''],

  // --- the command line ---
  ['the default run count is 2', L, "runs: { type: 'string', default: '20' }", "runs: { type: 'string', default: '2' }"],
  ['a manifest is not required', L, "if (values.manifest === undefined) throw", 'if (false) throw'],
  ['the run count may carry trailing text', L, '/^[1-9]\\d*$/', '/^[1-9]\\d*/'],
  ['the run count may be zero', L, '/^[1-9]\\d*$/', '/^\\d+$/'],
  ['the refusal exits 1, not 2', L, '    return 2;', '    return 1;'],
  ['a refusal loses its Spanish half', L, ' @es RECHAZADO: argumentos inválidos (${error.message})', ''],
  ['the gitDir of a repo spec is ignored', L, "...(spec.split('|')[2] === undefined ? {} : { gitDir: spec.split('|')[2] })", ''],
  ['a failed run still exits 0', L, 'return record.failedRuns === 0 ? 0 : 1;', 'return 0;'],
  ['the temp state dir is left behind', L, "rmSync(stateDir, { recursive: true, force: true });", ''],
  ['the injected runner is ignored', L, 'repos: values.repo.map(repoOf), stateDir, runOnce }', 'repos: values.repo.map(repoOf), stateDir }'],
  ['the projects root is not the one given', L, "values['projects-root'] ?? path.join(homedir(), '.claude', 'projects')", "path.join(homedir(), '.claude', 'projects')"],
  ['the Spanish half of a refusal loses its accent', L, 'argumentos inválidos', 'argumentos invalidos'],

  // --- replay.mjs wiring ---
  ['replay never enters the latency mode', R, "process.argv[2] === 'latency'", "process.argv[2] === 'latency-never'"],
  ['the latency mode demands --root', R, 'if (!LATENCY && rootAt === -1) throw', 'if (rootAt === -1) throw'],
  ['the equivalence mode no longer demands --root', R, 'if (!LATENCY && rootAt === -1) throw', 'if (LATENCY && rootAt === -1) throw'],
  ['the latency mode receives its own name as an argument', R, 'runLatencyCli(process.argv.slice(3))', 'runLatencyCli(process.argv.slice(2))'],
  ['the equivalence mode never runs', R, 'else await main();', ';']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-dispatch', 'hook-state', 'bilingual-output'],
  selftest: 'hook-dispatch/latency.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
