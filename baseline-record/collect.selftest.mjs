#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `baseline-record/collect.mjs` and the `record.mjs` entry point. Every case runs on a
 * machine CONSTRUCTED in a temp directory (a Claude home that is a git repo, a projects root with a clean and a
 * dirty repo, a b100 project with an external backup git dir, a discovery repo with a git-excluded `.claude/`),
 * with constructed stand-ins for `capture.mjs budget` and `replay.mjs latency`. Nothing real is read or written.
 *
 * THE STATE SPACE: the record (every section present, the commands the stand-ins were called with, the time it
 * was taken, no aggregate anywhere), that collecting is read-only (a snapshot of every constructed tree is
 * unchanged), the completeness verdict (a complete record has no problem; each unmeasured piece is named; a
 * dirty repo is data, not a problem), and the entry point (JSON on stdout, the bilingual summary on stderr,
 * exit 0, exit 1 for an incomplete record with the JSON still printed, exit 2 for misuse).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `collect.mjs` y del punto de entrada `record.mjs`. Cada caso corre sobre una
 * máquina CONSTRUIDA en un directorio temporal, con sustitutos de `capture.mjs budget` y `replay.mjs latency`.
 * Espacio de estados: el registro (secciones, comandos, hora, ningún agregado), que recolectar es solo
 * lectura, el veredicto de completitud y el punto de entrada (JSON en stdout, resumen bilingüe en stderr,
 * salidas 0, 1 y 2).
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRecord, problemsOf } from './collect.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('baseline-record');

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

/** What `action` returns; a throw is a failed check, never a crash of the selftest. @es Lo que devuelve `action`; un fallo es un check fallido. */
function attempt(action) {
  try {
    return action();
  } catch (error) {
    failures.push(`threw — ${error.message}`);

    return {};
  }
}

const scratch = mkdtempSync(path.join(tmpdir(), 'collect-selftest-'));
const git = (dir, ...args) => spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' });

/** A repo with one commit holding `files`. @es Un repo con un commit con `files`. */
function makeRepo(dir, files = { 'a.txt': 'one\n' }) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');

  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), content);
  }

  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'first');
}

/** Every file below `dir` as `path size mtime`, directories included. @es Cada fichero bajo `dir` con ruta, tamaño y mtime. */
function snapshot(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? [`${full}/`, ...snapshot(full)] : [`${full} ${statSync(full).size} ${statSync(full).mtimeMs}`];
  });
}

/** The JSON of `text`, or `{}`. @es El JSON de `text`, o `{}`. */
const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const REPORT = (raw) => `budget OVER: ${raw} raw characters (harness-counted ${raw - 1}) against 147,000 (global ceiling), margin -1. @es x\nfiles by weight, raw / counted. @es y\n  ${raw} / ${raw - 1}  ${path.join(scratch, 'full', 'projects', 'b100-am-ui', '.claude', 'CLAUDE.md')}\n`;
const LATENCY = { runs: 20, runsMs: [1], firstMs: 1, medianMs: 1, p95Ms: 2, failedRuns: 0, liveTranscripts30min: 1, finishedWorkerTranscripts6h: 2, transcriptBytes: 3, repos: [{ name: 'x', dirty: false }], scenario: 'clean' };

/** A stand-in script that logs its arguments and prints `stdout`, exiting `code`. @es Un script sustituto que registra sus argumentos e imprime `stdout`. */
function standIn(name, stdout, code) {
  const file = path.join(scratch, `${name}.mjs`);
  const log = path.join(scratch, `${name}.log`);

  writeFileSync(file, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');\nprocess.stdout.write(${JSON.stringify(stdout)});\nprocess.exit(${code});\n`);
  appendFileSync(log, '');

  return { file, calls: () => readFileSync(log, 'utf8').trim().split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)) };
}

/** The whole constructed machine. @es La máquina construida entera. */
function makeMachine(name, { replayCode = 0, replayOut = JSON.stringify(LATENCY) } = {}) {
  const root = path.join(scratch, name);
  const home = path.join(root, 'home');
  const projects = path.join(root, 'projects');
  const b100 = path.join(projects, 'b100-am-ui');
  const backupGitDir = path.join(root, 'b100-backup.git');
  const discovery = path.join(projects, 'di_1700002_discovery_fe');

  makeRepo(home, { 'settings.json': JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: 'x' }] }] } }), 'hook-dispatch/manifests/stop.json': JSON.stringify({ event: 'Stop', guards: ['a', 'b'] }), 'guard-a/state/j.jsonl': '{"a":1}\n{"a":2}\n', 'guard-a/guard.mjs.hook-registration.json': '{}' });
  makeRepo(path.join(projects, 'clean-product'));
  makeRepo(path.join(projects, 'dirty-product'));
  writeFileSync(path.join(projects, 'dirty-product', 'new.txt'), 'x');
  makeRepo(discovery);
  writeFileSync(path.join(discovery, '.git', 'info', 'exclude'), '.claude/\n');
  mkdirSync(path.join(discovery, '.claude'), { recursive: true });
  writeFileSync(path.join(discovery, '.claude', 'CLAUDE.md'), 'twelve bytes');
  mkdirSync(path.join(b100, '.claude'), { recursive: true });
  spawnSync('git', ['init', '-q', '-b', 'trunk', '--bare', backupGitDir]);
  writeFileSync(path.join(b100, '.claude', 'f.txt'), 'x');
  spawnSync('git', [`--git-dir=${backupGitDir}`, `--work-tree=${path.join(b100, '.claude')}`, 'add', 'f.txt']);
  spawnSync('git', [`--git-dir=${backupGitDir}`, `--work-tree=${path.join(b100, '.claude')}`, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'x']);

  const capture = standIn(`${name}-capture`, REPORT(1000), 1);
  const replay = standIn(`${name}-replay`, replayOut, replayCode);
  const options = { home, fleet: path.join(root, 'fleet'), projectsRoot: projects, b100, discovery, backupGitDir, capture: capture.file, replay: replay.file, runs: 20, tmp: scratch, latencyTimeoutMs: 600_000, now: () => '2026-10-04T20:00:00.000Z' };

  return { root, options, capture, replay, home, projects, discovery, b100, backupGitDir };
}

// --- the record ---
const machine = makeMachine('full');
const trees = [machine.home, machine.projects, machine.backupGitDir];
const before = trees.flatMap(snapshot);
const record = attempt(() => buildRecord(machine.options));
const after = trees.flatMap(snapshot);

check('record: collecting changes nothing in any constructed tree, the git indexes included', after, before);
check('record: the schema and the time it was taken', [record.schema, record.recordedAt], ['baseline-record/v1', '2026-10-04T20:00:00.000Z']);
check('record: the budget is measured twice, global and project, from the right projects', [record.budget?.global?.measured, record.budget?.project?.measured, record.budget?.project?.command?.endsWith(`--project ${machine.b100}`)], [true, true, true]);
check('record: the budget command is called twice', machine.capture.calls().map((call) => call[0]), ['budget', 'budget']);
check('record: journal lines per guard', record.journals?.perGuard, { 'guard-a': 2 });
check('record: the registry counts', [record.registry?.settings?.totalHooks, record.registry?.manifests?.totalGuards, record.registry?.sidecars], [1, 2, 1]);
check('record: the two in-scope tips with their branches', record.tips?.map((tip) => [tip.name, tip.branch, /^[0-9a-f]{40}$/.test(tip.tip ?? '')]), [['~/.claude', 'main', true], ['b100-am-ui/.claude', 'trunk', true]]);
check('record: the b100 tip is read through the backup git dir', record.tips?.[1]?.gitDir, machine.backupGitDir);
check('record: every product repo has its before-image, the dirty one with its path', Object.entries(Object.fromEntries((record.productRepos ?? []).map((repo) => [repo.name, repo.lines]))).sort(), [['clean-product', []], ['di_1700002_discovery_fe', []], ['dirty-product', ['?? new.txt']]]);
check('record: the discovery .claude/ is inventoried and its status read in the discovery repo with the pathspec', [record.discoveryClaude?.inventory?.totalFiles, record.discoveryClaude?.porcelain?.command, record.discoveryClaude?.porcelain?.lines], [1, `git -C ${machine.discovery} --no-optional-locks status --porcelain -- .claude/`, []]);
check('record: the latency section is the replay output, with its command and exit code', [record.stopLatency?.measured, record.stopLatency?.exitCode, record.stopLatency?.result?.medianMs], [true, 0, 1]);
check('record: replay is called in latency mode with the manifest, the run count, the real projects root and both repos', machine.replay.calls()[0], ['latency', '--manifest', path.join(machine.root, 'fleet', 'hook-dispatch', 'manifests', 'stop.json'), '--runs', '20', '--projects-root', path.join(machine.home, 'projects'), '--cwd', machine.home, '--repo', `~/.claude|${machine.home}|${path.join(machine.home, '.git')}`, '--repo', `b100-am-ui/.claude|${path.join(machine.b100, '.claude')}|${machine.backupGitDir}`]);
check('record: no aggregate anywhere in the record or in any command it ran', /aggregate/i.test(JSON.stringify(record) + JSON.stringify(machine.replay.calls()) + JSON.stringify(machine.capture.calls())), false);
check('record: the latency command is recorded verbatim', record.stopLatency?.command, `node ${machine.replay.file} ${machine.replay.calls()[0]?.join(' ')}`);

// --- completeness ---
check('problems: a complete record has none, and a dirty product repo is data, not a problem', attempt(() => problemsOf(record)), []);

/** A copy of the record with `change` applied. @es Una copia del registro con `change` aplicado. */
const broken = (change) => {
  const copy = structuredClone(record);

  try {
    change(copy);
  } catch {
    return ['the record to break has no such piece'];
  }

  return attempt(() => problemsOf(copy));
};

check('problems: an unmeasured global budget', broken((copy) => { copy.budget.global.measured = false; }), ['budget-global']);
check('problems: an unmeasured project budget', broken((copy) => { copy.budget.project.measured = false; }), ['budget-project']);
check('problems: a tip that is missing names the repo', broken((copy) => { copy.tips[1].tip = undefined; }), ['tip:b100-am-ui/.claude']);
check('problems: a product repo whose status failed names it', broken((copy) => { copy.productRepos[0].measured = false; }), [`repo:${record.productRepos?.[0]?.name}`]);
check('problems: a discovery git status that failed', broken((copy) => { copy.discoveryClaude.porcelain.measured = false; }), ['discovery-status']);
check('problems: a missing discovery directory is not a failure of the measurement', broken((copy) => { copy.discoveryClaude.inventory = { exists: false }; }), []);
check('problems: a latency that was not measured', broken((copy) => { copy.stopLatency.measured = false; }), ['stop-latency']);
check('problems: unreadable settings', broken((copy) => { copy.registry.settings = 'unreadable'; }), ['registry-settings']);
check('problems: several at once are listed in section order', broken((copy) => { copy.stopLatency.measured = false; copy.budget.global.measured = false; }), ['budget-global', 'stop-latency']);

// --- the latency section when the replay misbehaves ---
{
  const garbage = attempt(() => buildRecord(makeMachine('garbage', { replayOut: 'not json' }).options));

  check('latency: output that is not JSON is not a measurement even with exit 0', [garbage.stopLatency?.measured, garbage.stopLatency?.exitCode, garbage.stopLatency?.result], [false, 0, undefined]);

  const hang = makeMachine('hang');

  writeFileSync(hang.replay.file, 'setTimeout(() => {}, 6000);\n');

  const started = Date.now();
  const hung = attempt(() => buildRecord({ ...hang.options, latencyTimeoutMs: 600 }));

  check('latency: a replay that hangs is killed at the timeout and is not a measurement', [hung.stopLatency?.measured, hung.stopLatency?.exitCode, Date.now() - started < 5500], [false, null, true]);
}

// --- the entry point ---
{
  const cli = (...args) => spawnSync(process.execPath, [path.join(HERE, 'record.mjs'), ...args], { encoding: 'utf8' });
  const flags = (m) => ['--home', m.home, '--fleet', path.join(m.root, 'fleet'), '--projects', m.projects, '--b100', m.b100, '--discovery', m.discovery, '--backup-git-dir', m.backupGitDir, '--capture', m.capture.file, '--replay', m.replay.file, '--runs', '3'];
  const ok = makeMachine('cli-ok');
  const run = cli(...flags(ok));
  const printed = json(run.stdout);

  check('cli: a complete record exits 0', run.status, 0);
  check('cli: stdout is exactly the JSON record', [printed.schema, /^\d{4}-\d{2}-\d{2}T/.test(printed.recordedAt ?? '')], ['baseline-record/v1', true]);
  check('cli: stdout is the record pretty-printed', run.stdout.startsWith('{\n  "schema": "baseline-record/v1"'), true);
  check('cli: stderr carries no JSON and stdout carries no summary', [run.stderr.includes('"schema"'), run.stdout.includes(' @es ')], [false, false]);

  const defaulted = makeMachine('cli-default');

  cli(...flags(defaulted).slice(0, -2));
  check('cli: without --runs the record runs 20', defaulted.replay.calls()[0]?.slice(3, 5), ['--runs', '20']);
  check('cli: the run count reaches replay', ok.replay.calls()[0]?.slice(3, 5), ['--runs', '3']);

  const summary = run.stderr.split('\n').filter((line) => line !== '');

  check('cli: stderr is the summary, and every line has its @es half', [summary.length > 5, summary.every((line) => /^\S.* @es \S/.test(line))], [true, true]);

  const bad = makeMachine('cli-bad', { replayCode: 1 });
  const incomplete = cli(...flags(bad));

  check('cli: an incomplete record exits 1 and still prints the JSON', [incomplete.status, json(incomplete.stdout).schema], [1, 'baseline-record/v1']);
  check('cli: the incomplete piece is named NOT MEASURED in the summary', /NOT MEASURED: Stop latency/.test(incomplete.stderr), true);

  const misuse = cli('--nope');

  check('cli: an unknown flag exits 2, prints no JSON, and refuses in both languages', [misuse.status, misuse.stdout, /REFUSED.* @es RECHAZADO.*inválidos/.test(misuse.stderr)], [2, '', true]);
  check('cli: the refusal names the usage in both languages', [/Usage: record\.mjs/.test(misuse.stderr), /Uso: record\.mjs/.test(misuse.stderr)], [true, true]);
  check('cli: a run count of zero exits 2', cli(...flags(ok).slice(0, -2), '--runs', '0').status, 2);
  check('cli: a run count that is not an integer exits 2', [cli(...flags(ok).slice(0, -2), '--runs', 'abc').status, cli(...flags(ok).slice(0, -2), '--runs', '2.5').status], [2, 2]);
}

rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
