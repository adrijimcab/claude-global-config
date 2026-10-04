#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-dispatch/latency.mjs`, the P3b Stop-latency procedure. Every case runs on
 * state CONSTRUCTED in a temp directory (transcripts with chosen ages, git repos, a trivial guard), never on
 * the real home.
 *
 * THE STATE SPACE: the statistics (odd, even, unsorted, one value, none; nearest-rank p95 at n = 1, 20, 21),
 * the census (live main, live worker, finished worker inside the horizon, old worker, old main, a near miss
 * on each side of both limits, a non-transcript file), the payload (newest MAIN transcript wins, a newer
 * worker never does, none at all), the repo states (clean, untracked, external git dir, unreadable), the
 * scenario label, the run loop (count, sequence, environment, a failing run), and the command line.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `latency.mjs`, el procedimiento P3b. Cada caso corre sobre estado
 * CONSTRUIDO en un directorio temporal, nunca sobre el home real. Espacio de estados: estadística, censo
 * de transcripts (con casos límite a ambos lados de las dos ventanas), payload, estado de los repos,
 * etiqueta de escenario, bucle de corridas y línea de comandos.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTIVE_WINDOW_MS, buildStopPayload, FINISHED_HORIZON_MS, measureStop, medianOf, percentile95, repoState, RUN_TIMEOUT_MS, runDispatcher, runLatencyCli as unsafeCli, scenarioOf, timeRuns, transcriptCensus } from './latency.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns, or its error message: a throw is a checked value, never a crash. @es Lo que devuelve `action`, o el mensaje de su error. */
function outcome(action) {
  try {
    return action();
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

/** Whether `action` throws a bilingual message. @es Si `action` lanza un mensaje bilingüe. */
const throwsBilingual = (action) => /^threw: .*@es /s.test(String(outcome(action)));

const scratch = mkdtempSync(path.join(tmpdir(), 'latency-selftest-'));
const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;
let counter = 0;

/** A fresh empty directory. @es Un directorio nuevo y vacío. */
function fresh() {
  counter += 1;
  const dir = path.join(scratch, `case-${counter}`);

  mkdirSync(dir, { recursive: true });

  return dir;
}

/** A file of `bytes` bytes whose last write was `ageMs` before NOW. @es Un fichero con la última escritura hace `ageMs`. */
function aged(file, ageMs, bytes = 10) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'x'.repeat(bytes));
  utimesSync(file, new Date(NOW - ageMs), new Date(NOW - ageMs));
}

/** The JSON of `text`, or `{}`. @es El JSON de `text`, o `{}`. */
const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

/** The command line, with a throw read as a checked value. @es La línea de comandos, con un fallo leído como valor comprobado. */
const runLatencyCli = (argv, options) => {
  try {
    return unsafeCli(argv, options);
  } catch (error) {
    return `threw: ${error.message}`;
  }
};

const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8' });

// --- statistics ---
check('median of an odd count', medianOf([3, 1, 2]), 2);
check('median of an even count is the mean of the middle two', medianOf([4, 1, 3, 2]), 2.5);
check('median does not require sorted input', medianOf([9, 1, 5, 7, 3]), 5);
check('median of one value', medianOf([7]), 7);
check('median of nothing throws, bilingual', throwsBilingual(() => medianOf([])), true);
check('median leaves its input untouched', ((values) => (medianOf(values), values))([3, 1, 2]), [3, 1, 2]);

const twenty = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);

check('p95 of 20 is the 19th value, nearest rank', percentile95(twenty), 190);
check('p95 of 20 shuffled is the same', percentile95([...twenty].reverse()), 190);
check('p95 of one value is that value', percentile95([42]), 42);
check('p95 of 21 is the 20th value', percentile95(Array.from({ length: 21 }, (_, index) => index + 1)), 20);
check('p95 of nothing throws, bilingual', throwsBilingual(() => percentile95([])), true);

// --- census ---
{
  const root = fresh();
  const main = (name, ageMs, bytes) => aged(path.join(root, 'proj', `${name}.jsonl`), ageMs, bytes);
  const worker = (session, id, ageMs, bytes) => aged(path.join(root, 'proj', session, 'subagents', `${id}.jsonl`), ageMs, bytes);

  main('live-main', 10 * MIN, 100);
  main('old-main', 2 * 60 * MIN, 1000);
  worker('s1', 'live-worker', 5 * MIN, 10);
  worker('s1', 'finished-worker', 2 * 60 * MIN, 20);
  worker('s1', 'old-worker', 10 * 60 * MIN, 5000);
  worker('s1', 'edge-in-live', 30 * MIN - 1000, 1);
  worker('s1', 'edge-out-live', 30 * MIN + 1000, 2);
  worker('s1', 'edge-in-horizon', 6 * 60 * MIN - 1000, 4);
  worker('s1', 'edge-out-horizon', 6 * 60 * MIN + 1000, 8000);
  worker('s1', 'edge-eq-live', 30 * MIN, 3);
  worker('s1', 'edge-eq-horizon', 6 * 60 * MIN, 16);
  aged(path.join(root, 'stray.jsonl'), 1 * MIN, 55555);
  aged(path.join(root, 'proj', 's1', 'subagents', 'live-worker.meta.json'), 1 * MIN, 99999);
  aged(path.join(root, 'proj', 'notes.txt'), 1 * MIN, 77777);

  const census = outcome(() => transcriptCensus(root, NOW));

  check('census: live window counts main and workers under 30 minutes', census.live30min, 3);
  check('census: a worker written exactly 30 minutes ago is finished, not live; finished workers inside 6 hours', census.finished6h, 4);
  check('census: bytes cover only what is in reach, a stray top-level file included in none', census.transcriptBytes, 100 + 10 + 1 + 20 + 2 + 4 + 3);
  check('census: the limits are the constants of the guard', [ACTIVE_WINDOW_MS, FINISHED_HORIZON_MS], [30 * MIN, 6 * 60 * MIN]);
  check('census: a missing root is an empty census', outcome(() => transcriptCensus(path.join(root, 'absent'), NOW)), { live30min: 0, finished6h: 0, transcriptBytes: 0 });
}

// --- payload ---
{
  const root = fresh();

  check('payload without any transcript throws, bilingual', throwsBilingual(() => buildStopPayload(root, 'C:/work')), true);
  aged(path.join(root, 'p', 'older.jsonl'), 60 * MIN);
  aged(path.join(root, 'p', 'newest.jsonl'), 5 * MIN);
  aged(path.join(root, 'p', 'newest', 'subagents', 'worker.jsonl'), 1 * MIN);

  const payload = buildStopPayload(root, 'C:/work');

  check('payload: the newest MAIN transcript is used, never a newer worker', payload.transcript_path, path.join(root, 'p', 'newest.jsonl'));
  check('payload: session id is the transcript name', payload.session_id, 'newest');
  check('payload: real Stop shape', [payload.hook_event_name, payload.stop_hook_active, payload.cwd], ['Stop', false, 'C:/work']);
}

// --- repo state and scenario ---
{
  const repo = fresh();

  git(['init', '-q'], repo);
  check('repo: clean is not dirty', repoState({ name: 'a', worktree: repo }), { name: 'a', dirty: false });
  writeFileSync(path.join(repo, 'new.txt'), 'x');
  check('repo: an untracked file is dirty', repoState({ name: 'a', worktree: repo }).dirty, true);

  // A BARE git dir has no work tree of its own, so only the explicit `--work-tree` says where to look; the
  // process directory is moved to a decoy so a missing flag reads the decoy instead.
  // @es Un git dir BARE no tiene árbol propio: solo `--work-tree` dice dónde mirar; el directorio del proceso
  // se mueve a un señuelo para que, sin la bandera, se lea el señuelo.
  const bare = path.join(fresh(), 'external.git');
  const tree = fresh();
  const decoy = fresh();
  const before = process.cwd();

  git(['init', '-q', '--bare', bare], fresh());
  process.chdir(decoy);
  check('repo: an external git dir with an empty tree is clean, whatever the process directory holds', repoState({ name: 'b', worktree: tree, gitDir: bare }).dirty, false);
  writeFileSync(path.join(decoy, 'decoy.txt'), 'x');
  check('repo: the decoy in the process directory is never read', repoState({ name: 'b', worktree: tree, gitDir: bare }).dirty, false);
  writeFileSync(path.join(tree, 'f.txt'), 'x');
  check('repo: an external git dir sees the untracked file of its work tree', repoState({ name: 'b', worktree: tree, gitDir: bare }).dirty, true);
  process.chdir(before);
  check('repo: an unreadable repo is reported, not clean', repoState({ name: 'c', worktree: fresh(), gitDir: path.join(scratch, 'no-such.git') }).dirty, 'unreadable');
}

// --- the dispatcher process and its timeout ---
{
  const dir = fresh();

  writeFileSync(path.join(dir, 'hang.mjs'), 'export async function evaluate() { await new Promise((resolve) => setTimeout(resolve, 4000)); }\n');
  writeFileSync(path.join(dir, 'hang.json'), JSON.stringify({ event: 'Stop', guards: ['hang.mjs'] }));

  const hung = runDispatcher({ manifest: path.join(dir, 'hang.json'), payload: '{}', env: process.env, timeoutMs: 400 });

  check('dispatcher: a hung run is killed at the timeout and counted as failed', [hung.code !== 0, hung.ms < 3000], [true, true]);
  check('dispatcher: the default timeout is two minutes in milliseconds', RUN_TIMEOUT_MS, 120000);
  check('dispatcher: a healthy run exits 0 with its wall time', ((run) => [run.code, run.ms > 0])(runDispatcher({ manifest: path.join(dir, 'none.json'), payload: '{}', env: process.env })), [0, true]);
}

check('scenario: every repo clean', scenarioOf([{ dirty: false }, { dirty: false }]), 'clean');
check('scenario: one dirty repo makes the run dirty', scenarioOf([{ dirty: false }, { dirty: true }]), 'dirty');
check('scenario: dirty wins over unreadable', scenarioOf([{ dirty: 'unreadable' }, { dirty: true }]), 'dirty');
check('scenario: an unreadable repo with no dirty one is unknown', scenarioOf([{ dirty: false }, { dirty: 'unreadable' }]), 'unknown');
check('scenario: no repos is unknown, never clean', scenarioOf([]), 'unknown');

// --- run loop ---
{
  const seen = [];
  const runOnce = ({ manifest, payload, env }) => {
    seen.push({ manifest, payload, state: env.HOOK_STATE_DIR, inherits: env[Object.keys(process.env)[0]] === process.env[Object.keys(process.env)[0]] });

    return { ms: seen.length * 10 + 0.04, code: 0 };
  };
  const timed = timeRuns({ manifest: 'm.json', payload: '{"p":1}', runs: 5, stateDir: 'S', runOnce });

  check('loop: runs exactly the requested count', seen.length, 5);
  check('loop: runs in sequence and keeps each time, rounded to a tenth of a millisecond', timed.runsMs, [10, 20, 30, 40, 50]);
  check('loop: the environment is inherited', seen.every((call) => call.inherits), true);
  check('loop: the unrounded precision is a tenth', timeRuns({ manifest: 'm', payload: 'p', runs: 1, stateDir: 'S', runOnce: () => ({ ms: 12.34, code: 0 }) }).runsMs, [12.3]);
  check('loop: every run gets the manifest, the payload and the temp state dir', seen.every((call) => call.manifest === 'm.json' && call.payload === '{"p":1}' && call.state === 'S'), true);
  check('loop: no failures', timed.failedRuns, 0);

  const failing = timeRuns({ manifest: 'm', payload: 'p', runs: 3, stateDir: 'S', runOnce: () => ({ ms: 1, code: 1 }) });

  check('loop: a non-zero exit is counted, not hidden', failing.failedRuns, 3);
  check('loop: zero runs is refused, bilingual', throwsBilingual(() => timeRuns({ manifest: 'm', payload: 'p', runs: 0, stateDir: 'S', runOnce })), true);
}

// --- the whole measurement, on constructed state ---
{
  const root = fresh();

  aged(path.join(root, 'p', 'sess.jsonl'), 1 * MIN, 50);
  aged(path.join(root, 'p', 'sess', 'subagents', 'w.jsonl'), 90 * MIN, 25);
  aged(path.join(root, 'p', 'sess', 'subagents', 'live.jsonl'), 2 * MIN, 40);

  const times = [10, 40, 20, 30];
  const record = measureStop({ manifest: 'm.json', projectsRoot: root, runs: 4, cwd: 'C:/work', repos: [], now: NOW, stateDir: 'S', runOnce: () => ({ ms: times.shift(), code: 0 }) });

  check('measure: median, p95 and first run are three different figures', [record.medianMs, record.p95Ms, record.firstMs], [25, 40, 10]);
  check('measure: census fields are on the record', [record.liveTranscripts30min, record.finishedWorkerTranscripts6h, record.transcriptBytes], [2, 1, 115]);
  check('measure: the run count and every run time are kept', [record.runs, record.runsMs], [4, [10, 40, 20, 30]]);
  check('measure: the manifest is named on the record', record.manifest, 'm.json');
  check('measure: no repos is an unknown scenario', record.scenario, 'unknown');
}

// --- command line, through a real dispatcher and a constructed manifest ---
{
  const dir = fresh();
  const manifest = path.join(dir, 'm.json');
  const projects = path.join(dir, 'projects');
  const bare = path.join(fresh(), 'cli.git');
  const tree = fresh();

  writeFileSync(path.join(dir, 'g.mjs'), 'export function evaluate() { return undefined; }\n');
  writeFileSync(manifest, JSON.stringify({ event: 'Stop', guards: ['g.mjs'] }));
  aged(path.join(projects, 'p', 's.jsonl'), 1 * MIN, 30);
  git(['init', '-q', '--bare', bare], fresh());
  writeFileSync(path.join(tree, 'f.txt'), 'x');

  const lines = [];
  const code = runLatencyCli(['--manifest', manifest, '--runs', '3', '--projects-root', projects, '--cwd', dir, '--repo', `fx|${tree}|${bare}`], { out: (line) => lines.push(line) });
  const record = json(lines[0] ?? '{}');

  check('cli: exit 0 on a clean measurement', code, 0);
  check('cli: one JSON line, 3 runs, none failed', [lines.length, record.runs, record.runsMs?.length, record.failedRuns], [1, 3, 3, 0]);
  check('cli: the census reaches the output', record.liveTranscripts30min, 1);
  check('cli: the repo is read through its explicit git dir', [record.repos?.[0]?.name, record.repos?.[0]?.dirty, record.scenario], ['fx', true, 'dirty']);

  const defaults = [];

  runLatencyCli(['--manifest', manifest, '--projects-root', projects], { out: (line) => defaults.push(line) });
  check('cli: the default is 20 runs', json(defaults[0] ?? '{}').runs, 20);

  const seen = [];
  const failed = runLatencyCli(['--manifest', manifest, '--runs', '2', '--projects-root', projects], { out: () => {}, runOnce: ({ env }) => (seen.push([env.HOOK_STATE_DIR, existsSync(env.HOOK_STATE_DIR)]), { ms: 1, code: 1 }) });

  check('cli: a failed run makes the exit 1', failed, 1);
  check('cli: the temp state dir exists during the runs and is removed after', [seen.length, seen.every(([, present]) => present), existsSync(seen[0]?.[0] ?? '')], [2, true, false]);

  const bad = [];

  check('cli: an unknown flag exits 2', runLatencyCli(['--nope'], { out: (line) => bad.push(line) }), 2);
  check('cli: the refusal is bilingual, with the Spanish accents intact', [/@es /.test(bad.join('\n')), bad.join('\n').includes('argumentos inválidos')], [true, true]);
  check('cli: a missing manifest exits 2', runLatencyCli(['--runs', '3'], { out: () => {} }), 2);
  check('cli: a non-numeric run count exits 2', runLatencyCli(['--manifest', manifest, '--runs', 'abc'], { out: () => {} }), 2);
  check('cli: a run count with trailing text exits 2', runLatencyCli(['--manifest', manifest, '--runs', '3x'], { out: () => {} }), 2);
  check('cli: a run count of zero exits 2', runLatencyCli(['--manifest', manifest, '--runs', '0'], { out: () => {} }), 2);
}

// --- `replay.mjs`: the latency mode is wired, and the equivalence mode is still there ---
{
  const dir = fresh();
  const manifest = path.join(dir, 'm.json');
  const projects = path.join(dir, 'projects');
  const replay = (...args) => spawnSync(process.execPath, [path.join(HERE, 'replay.mjs'), ...args], { encoding: 'utf8' });

  writeFileSync(path.join(dir, 'g.mjs'), 'export function evaluate() { return undefined; }\n');
  writeFileSync(manifest, JSON.stringify({ event: 'Stop', guards: ['g.mjs'] }));
  aged(path.join(projects, 'p', 's.jsonl'), 1 * MIN, 30);

  const latency = replay('latency', '--manifest', manifest, '--runs', '2', '--projects-root', projects);

  check('replay latency: exit 0 with one JSON line of 2 runs, with no --root', [latency.status, json(latency.stdout.split('\n')[0] || '{}').runs], [0, 2]);
  check('replay: the equivalence mode still demands --root', [replay(manifest).status !== 0, /--root/.test(replay(manifest).stderr)], [true, true]);

  writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ hooks: {} }));
  writeFileSync(path.join(dir, 'payloads.jsonl'), `${JSON.stringify({ raw: '{"hook_event_name":"Stop"}', source: 'fixture' })}\n`);

  const equivalence = replay(path.join(dir, 'settings.json'), manifest, path.join(dir, 'payloads.jsonl'), '--root', dir, '--matcher-set', '');

  check('replay: the equivalence mode still compares the two paths and exits 0 when they agree', [equivalence.status, /"total": 1/.test(equivalence.stdout), /"same": 1/.test(equivalence.stdout)], [0, true, true]);
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
