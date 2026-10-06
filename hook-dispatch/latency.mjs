#!/usr/bin/env node
/**
 * The P3b Stop-latency procedure: run a manifest on a real-shaped Stop payload N consecutive times as the
 * real dispatcher process, against the REAL transcripts and repos (read-only), and record median, p95, how
 * many transcripts are in reach (live in 30 minutes, finished workers in 6 hours), their bytes, and whether
 * each repo is clean or dirty. Guard journal writes are pointed at a temp `HOOK_STATE_DIR`.
 *
 * The census windows are the ones `config-sync-guard/attribution.mjs` reads (`ACTIVE_WINDOW_MS`,
 * `FINISHED_HORIZON_MS`), restated here so this procedure survives that guard being merged or moved.
 *
 * @es El procedimiento P3b de latencia de Stop: corre un manifiesto sobre un payload de Stop con forma
 * real N veces seguidas como el proceso real del dispatcher, contra los transcripts y repos REALES (solo
 * lectura), y registra mediana, p95, cuántos transcripts hay a su alcance (vivos en 30 minutos, workers
 * terminados en 6 horas), sus bytes y si cada repo está limpio o sucio. Las escrituras de diarios de las
 * guardias van a un `HOOK_STATE_DIR` temporal. Las ventanas del censo son las de `attribution.mjs`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { STATE_ROOT_VARIABLE } from '../hook-state/locations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A transcript written within this window is LIVE (30 minutes). @es Un transcript escrito dentro de esta ventana está VIVO. */
export const ACTIVE_WINDOW_MS = 30 * 60 * 1000;

/** A finished worker's transcript is still read within this horizon (6 hours). @es El de un worker terminado se lee dentro de este horizonte. */
export const FINISHED_HORIZON_MS = 6 * 60 * 60 * 1000;

/** A bilingual error: English first, then `@es` Spanish. @es Un error bilingüe: inglés primero y luego `@es` español. */
const fail = (en, es) => new Error(`${en} @es ${es}`);

/** The median of `values`, without reordering them. @es La mediana de `values`, sin reordenarlos. */
export function medianOf(values) {
  if (values.length === 0) throw fail('Cannot take the median of no values.', 'No se puede calcular la mediana de cero valores.');

  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length / 2;

  return sorted.length % 2 === 1 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The 95th percentile of `values` by nearest rank. @es El percentil 95 de `values` por rango más cercano. */
export function percentile95(values) {
  if (values.length === 0) throw fail('Cannot take the p95 of no values.', 'No se puede calcular el p95 de cero valores.');

  const sorted = [...values].sort((left, right) => left - right);

  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}

/** Every `.jsonl` transcript under `<root>/<project>`: sessions' own and workers' (`<session>/subagents/`). @es Cada transcript `.jsonl`: el de la sesión y el de sus workers. */
function transcriptsUnder(root) {
  if (!existsSync(root)) return [];

  const found = [];

  for (const project of readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    for (const entry of readdirSync(path.join(root, project.name), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) found.push({ file: path.join(root, project.name, entry.name), worker: false });

      const workers = path.join(root, project.name, entry.name, 'subagents');

      if (existsSync(workers)) {
        for (const worker of readdirSync(workers).filter((name) => name.endsWith('.jsonl'))) found.push({ file: path.join(workers, worker), worker: true });
      }
    }
  }

  return found;
}

/** What the Stop guards can reach at `now`. @es Lo que las guardias de Stop pueden leer en `now`. */
export function transcriptCensus(root, now) {
  const census = { live30min: 0, finished6h: 0, transcriptBytes: 0 };

  for (const { file, worker } of transcriptsUnder(root)) {
    const { mtimeMs, size } = statSync(file);
    const age = now - mtimeMs;
    const live = age < ACTIVE_WINDOW_MS;
    const finished = !live && worker && age < FINISHED_HORIZON_MS;

    if (live) census.live30min += 1;
    if (finished) census.finished6h += 1;
    if (live || finished) census.transcriptBytes += size;
  }

  return census;
}

/** A Stop payload shaped like the harness's, on the newest session transcript. @es Un payload de Stop con la forma del harness, sobre el transcript de sesión más reciente. */
export function buildStopPayload(root, cwd) {
  const mains = transcriptsUnder(root).filter((entry) => !entry.worker).map((entry) => ({ file: entry.file, mtime: statSync(entry.file).mtimeMs }));

  if (mains.length === 0) throw fail(`No session transcript under ${root}.`, `No hay ningún transcript de sesión bajo ${root}.`);

  const newest = mains.reduce((best, entry) => (entry.mtime > best.mtime ? entry : best));

  return { session_id: path.basename(newest.file, '.jsonl'), transcript_path: newest.file, cwd, hook_event_name: 'Stop', stop_hook_active: false };
}

/** Clean, dirty, or `unreadable` for one repo, through its explicit git dir when it has one. @es Limpio, sucio o `unreadable`, por su git dir explícito si lo tiene. */
export function repoState({ name, worktree, gitDir = path.join(worktree, '.git') }) {
  const run = spawnSync('git', [`--git-dir=${gitDir}`, `--work-tree=${worktree}`, 'status', '--porcelain'], { encoding: 'utf8', windowsHide: true });

  return { name, dirty: run.status === 0 ? run.stdout !== '' : 'unreadable' };
}

/** `dirty` when any repo is dirty, `clean` when all are, otherwise `unknown`. @es `dirty` si alguno está sucio, `clean` si todos limpios, si no `unknown`. */
export function scenarioOf(repos) {
  if (repos.some((repo) => repo.dirty === true)) return 'dirty';

  return repos.length > 0 && repos.every((repo) => repo.dirty === false) ? 'clean' : 'unknown';
}

/** A dispatcher run longer than this is killed and counted as failed (milliseconds). @es Una corrida más larga que esto se mata y cuenta como fallida (milisegundos). */
export const RUN_TIMEOUT_MS = 120_000;

/** One real dispatcher process on one payload: wall time and exit code. @es Un proceso real del dispatcher sobre un payload: tiempo y salida. */
export function runDispatcher({ manifest, payload, env, timeoutMs = RUN_TIMEOUT_MS }) {
  const started = performance.now();
  const run = spawnSync(process.execPath, [path.join(HERE, 'dispatch.mjs'), manifest], { input: payload, env, encoding: 'utf8', windowsHide: true, timeout: timeoutMs });

  return { ms: performance.now() - started, code: run.status ?? 1 };
}

/** `runs` consecutive runs, each with the temp state dir in its environment. @es `runs` corridas seguidas, cada una con el directorio de estado temporal. */
export function timeRuns({ manifest, payload, runs, stateDir, runOnce = runDispatcher }) {
  if (!Number.isInteger(runs) || runs < 1) throw fail(`The run count must be a positive integer, got ${runs}.`, `El número de corridas debe ser un entero positivo, llegó ${runs}.`);

  const env = { ...process.env, [STATE_ROOT_VARIABLE]: stateDir };
  const results = Array.from({ length: runs }, () => runOnce({ manifest, payload, env }));

  return { runsMs: results.map((result) => Math.round(result.ms * 10) / 10), failedRuns: results.filter((result) => result.code !== 0).length };
}

/** The P3b record of one run set. @es El registro P3b de un conjunto de corridas. */
export function measureStop({ manifest, projectsRoot, runs, cwd, repos, now = Date.now(), stateDir, runOnce }) {
  const states = repos.map(repoState);
  const census = transcriptCensus(projectsRoot, now);
  const timed = timeRuns({ manifest, payload: JSON.stringify(buildStopPayload(projectsRoot, cwd)), runs, stateDir, runOnce });

  return {
    manifest, runs, runsMs: timed.runsMs, firstMs: timed.runsMs[0], medianMs: medianOf(timed.runsMs), p95Ms: percentile95(timed.runsMs), failedRuns: timed.failedRuns,
    liveTranscripts30min: census.live30min, finishedWorkerTranscripts6h: census.finished6h, transcriptBytes: census.transcriptBytes, repos: states, scenario: scenarioOf(states)
  };
}

const OPTIONS = { manifest: { type: 'string' }, runs: { type: 'string', default: '20' }, 'projects-root': { type: 'string' }, cwd: { type: 'string' }, repo: { type: 'string', multiple: true, default: [] } };

/** `name|worktree[|gitDir]`. @es `nombre|worktree[|gitDir]`. */
const repoOf = (spec) => ({ name: spec.split('|')[0], worktree: spec.split('|')[1], ...(spec.split('|')[2] === undefined ? {} : { gitDir: spec.split('|')[2] }) });

/** The command line of `replay.mjs latency`: one JSON line out, exit 0, 1 (a run failed) or 2 (misuse). @es La línea de comandos de `replay.mjs latency`. */
export function runLatencyCli(argv, { out = console.log, runOnce } = {}) {
  let values;

  try {
    values = parseArgs({ args: argv, options: OPTIONS }).values;
    if (values.manifest === undefined) throw new Error('--manifest is required.');
    if (!/^[1-9]\d*$/.test(values.runs)) throw new Error(`--runs must be a positive integer, got ${values.runs}.`);
  } catch (error) {
    out(`REFUSED: ${error.message} Usage: replay.mjs latency --manifest <file> [--runs 20] [--projects-root dir] [--cwd dir] [--repo name|worktree[|gitDir]]. @es RECHAZADO: argumentos inválidos (${error.message}). Uso: replay.mjs latency --manifest <fichero> [--runs 20] [--projects-root dir] [--cwd dir] [--repo nombre|worktree[|gitDir]].`);

    return 2;
  }

  const stateDir = mkdtempSync(path.join(tmpdir(), 'stop-latency-state-'));

  try {
    const record = measureStop({ manifest: path.resolve(values.manifest), projectsRoot: values['projects-root'] ?? path.join(homedir(), '.claude', 'projects'), runs: Number(values.runs), cwd: values.cwd ?? process.cwd(), repos: values.repo.map(repoOf), stateDir, runOnce });

    out(JSON.stringify(record));

    return record.failedRuns === 0 ? 0 : 1;
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}
