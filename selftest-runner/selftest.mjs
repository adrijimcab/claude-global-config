#!/usr/bin/env node
/**
 * Self-test for the repository-wide selftest runner, against git repositories CONSTRUCTED here and never
 * the live one (`guard-that-cannot-go-red`: a fixture resting on live state rots on its own). Every
 * fixture is proved to be its own repository top level before anything runs in it.
 *
 * THE STATE SPACE, enumerated from what the runner decides:
 *   - WHICH FILES ARE SELFTESTS: both name patterns; near misses (`myselftest.mjs`, `selftest.mjs.bak`,
 *     `selftest.md`, a directory named `selftest.mjs`); an untracked file that is not ignored; an ignored
 *     directory holding one directly (run, labelled UNTRACKED) versus an ignored copy at depth 3 (not run).
 *   - WHICH ROOT: absolute, relative, a subdirectory; not a repository; nothing discovered.
 *   - HOW ONE ENDS: green; non-zero exit; killed by a signal; timeout; a listed file missing. Each red
 *     one must leave the later selftests running, and the exit status must be 1.
 *   - WHETHER IT MAY START: only when FULL_CHAIN_LOCK_TOKEN holds the full-chain lock now: a held lock with its token runs;
 *     a missing, empty, forged, copied-from-a-finished-chain (stale holder) token, and a state with no lock file, are each
 *     refused with exit 2, the bilingual message and the exact locked command, and no selftest ran; the real
 *     `full-chain-lock/run.mjs` wrapping the runner supplies the token end to end, and so does the printed command.
 *   - WHAT THE OPERATOR CAN CHOOSE: nothing. An option that would filter or skip is refused.
 *   - WHEN A LINE APPEARS: each selftest's GREEN or RED line is delivered the moment that selftest ends,
 *     before the next one starts, in process (the `onLine` hook) and through the real command line (a
 *     handshake: the second selftest only passes once the parent has SEEN the first one's line).
 *   - HOW A LINE IS WRITTEN: whole, with its newline, across partial writes and a pipe that is momentarily full.
 * Where a selftest runs and what counts as an escape from its sandbox are `sandbox.selftest.mjs`'s.
 *
 * @es Auto-test del runner de selftests de todo el repositorio, contra repos git CONSTRUIDOS aquí. Estados:
 * qué ficheros son selftests (patrones, casi-aciertos, sin seguir, ignorados directos o a profundidad 3),
 * qué raíz (absoluta, relativa, subdirectorio, no repo, nada descubierto), cómo termina uno (verde, salida
 * no cero, señal, timeout, fichero ausente) y qué puede elegir el operador (nada: se rechaza todo filtro).
 * Dónde corre un selftest y qué cuenta como fuga de su sandbox es de `sandbox.selftest.mjs`.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { discoverSelftests } from './discovery.mjs';
import { RUN, cli, cliWith, fixtureKit, holdLockForRunner } from './fixtures.mjs';
import { LOCK_TOKEN_VARIABLE, lockedCommand, startedUnderLock } from './lock-gate.mjs';
import { MESSAGES } from './messages.mjs';
import { PEAK_BYTES_PER_SUITE, childBudgetOf, concurrencyOf, concurrencyPlan, describeConcurrency, main, runSelftests } from './run.mjs';
import { writeLineSync } from './stream.mjs';
import { makeSpeaker } from '../bilingual-output/speaker.mjs';
import { tokenHoldsLock } from '../full-chain-lock/lock-token.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('selftest-runner');

// Every runner this selftest starts is started under a REAL lock held in that isolated state, as `full-chain-lock/run.mjs`
// would start it; the refusals below override the token or the state they are about.
// @es Cada runner que este selftest inicia se inicia bajo un lock REAL tomado en ese estado aislado, como lo iniciaría
// `full-chain-lock/run.mjs`; las negativas de más abajo sustituyen el token o el estado del que tratan.
holdLockForRunner();

const GREEN = 'process.exit(0)\n';
const RED = "console.log('BOOM-MARK'); process.exit(1)\n";
const { check, bareDir, repo, finish } = fixtureKit('selftest-runner selftest');

/** Discovered paths, an untracked one marked with `*`. @es Rutas descubiertas; las sin seguir llevan `*`. */
function found(root) {
  return discoverSelftests(root).entries.map((entry) => `${entry.path}${entry.untracked ? '*' : ''}`).sort();
}

// ── Discovery: names, near misses, untracked, ignored ────────────────────────────────────────────
const named = repo({
  tracked: {
    'a/selftest.mjs': GREEN,
    'b/x.selftest.mjs': GREEN,
    'c/myselftest.mjs': GREEN,
    'c/selftest.mjs.bak': GREEN,
    'c/selftest.md': GREEN,
    'd/selftest.mjs/inner.txt': 'a directory named like a selftest',
  },
  loose: {
    'e/selftest.mjs': GREEN,
    'ignored/selftest.mjs': GREEN,
    'ignored/selftest.mjs.bak': GREEN,
    'ignored/z.selftest.mjs/inner.txt': 'an ignored directory named like a selftest',
    'ignored/deep/selftest.mjs': GREEN,
    'scratch/x/y/selftest.mjs': GREEN,
  },
  ignore: 'ignored/\nscratch/\n',
});
check(
  JSON.stringify(found(named)) === JSON.stringify(['a/selftest.mjs', 'b/x.selftest.mjs', 'e/selftest.mjs', 'ignored/selftest.mjs*']),
  `discovery finds both patterns, the untracked file and the ignored direct one, nothing else: ${found(named)}`,
);

// ── Discovery: roots ─────────────────────────────────────────────────────────────────────────────
check(JSON.stringify(found(path.join(named, 'a'))) === JSON.stringify(found(named)), 'a subdirectory root reaches the top level');
const viaRelative = cli(path.dirname(named), '--root', path.basename(named));
check(viaRelative.status === 0 && viaRelative.stdout.includes('4/4 green'), `a relative root works: ${viaRelative.status}`);
check(viaRelative.stdout.includes('ignored/selftest.mjs (exit 0) UNTRACKED'), 'the report labels an ignored directory selftest UNTRACKED');

const outside = bareDir();
const notRepo = cli(outside, '--root', outside);
check(notRepo.status === 2, `a non-repository exits 2: ${notRepo.status}`);
check(notRepo.stderr.includes('@es'), 'the non-repository message is bilingual');
check(notRepo.stderr.includes('Cannot list the repository files'), 'the non-repository message names the git failure, not an empty listing');

const empty = repo({ tracked: { 'README.md': 'nothing here' } });
const none = cli(empty, '--root', empty);
check(none.status === 2, `zero discovered exits 2, never 0: ${none.status}`);
check(none.stderr.includes('@es'), 'the zero-discovered message is bilingual');

// ── Discovery: a tooling tree ignored by its code repository, with its own repository elsewhere ──
// (b100-am-ui's `.claude`: ignored by the code repo, versioned in a backup repo whose git dir lives outside.)
// `--git-dir` makes that repository the population: its tracked and not-ignored files, never the scratch copies
// its own `.gitignore` excludes. @es Un árbol de tooling ignorado por su repo de código, con su propio repo fuera.
const codeRepo = repo({
  tracked: { 'README.md': 'code' },
  loose: {
    '.claude/tool/selftest.mjs': GREEN,
    '.claude/other/x.selftest.mjs': GREEN,
    '.claude/scratch/copy/tool/selftest.mjs': RED,
    '.claude/.gitignore': 'scratch/\n',
  },
  ignore: '.claude/\n',
});
const toolingTree = path.join(codeRepo, '.claude');
const toolingGitDir = path.join(bareDir(), 'tooling.git');
const viaGitDir = (...args) => spawnSync('git', [`--git-dir=${toolingGitDir}`, `--work-tree=${toolingTree}`, ...args], { encoding: 'utf8' });
spawnSync('git', ['init', '-q', '--bare', toolingGitDir], { encoding: 'utf8' });
viaGitDir('add', 'tool/selftest.mjs', '.gitignore');
viaGitDir('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'tooling');
const ownRepo = discoverSelftests(toolingTree, { gitDir: toolingGitDir });
check(
  JSON.stringify(ownRepo.entries.map((entry) => `${entry.path}${entry.untracked ? '*' : ''}`).sort()) === JSON.stringify(['other/x.selftest.mjs', 'tool/selftest.mjs']),
  `with --git-dir the tooling tree's own repository is the population, scratch excluded: ${JSON.stringify(ownRepo.entries)}`,
);
check(path.resolve(ownRepo.root) === path.resolve(toolingTree), `with --git-dir the root is the tooling tree itself: ${ownRepo.root}`);
const ownRepoCli = cli(codeRepo, '--root', toolingTree, '--git-dir', toolingGitDir);
check(ownRepoCli.status === 0 && ownRepoCli.stdout.includes('2/2 green'), `the command line runs the tooling tree's selftests through --git-dir: ${ownRepoCli.status} ${ownRepoCli.stdout}`);
check(cli(codeRepo, '--git-dir', toolingGitDir).status === 2, '--git-dir without --root is refused');
check(cli(codeRepo, '--only', toolingTree, '--git-dir', toolingGitDir).status === 2, '--git-dir after an option that is not --root is refused');
check(cli(codeRepo, '--root', toolingTree, '--git-dir', path.join(bareDir(), 'missing.git')).status === 2, 'a --git-dir that is not a repository exits 2, never green');

// ── The git dir handed to each selftest: SELFTEST_GIT_DIR ────────────────────────────────────────
// The probe records what it was given in an ignored file, so recording it is not a change to the tree under test.
// @es La sonda anota lo que recibió en un fichero ignorado, así anotarlo no cambia el árbol bajo prueba.
const PROBE = "import { writeFileSync } from 'node:fs';\nwriteFileSync('seen.txt', JSON.stringify(process.env.SELFTEST_GIT_DIR ?? null));\n";
// A selftest that never ran leaves no note: that reads as 'no note', a failed check, never a crash.
// @es Un selftest que no corrió no deja nota: eso se lee como 'no note', un check fallido, nunca un crash.
const noteOf = (tree) => path.join(tree, 'a', 'seen.txt');
const seenBy = (tree) => (existsSync(noteOf(tree)) ? JSON.parse(readFileSync(noteOf(tree), 'utf8')) : 'no note');
const STALE = { ...process.env, SELFTEST_GIT_DIR: 'stale-value' };
const runnerWith = (env, ...args) => spawnSync(process.execPath, [RUN, ...args], { cwd: bareDir(), encoding: 'utf8', env });

const probeRepo = repo({ tracked: { 'a/selftest.mjs': PROBE }, ignore: 'seen.txt\n' });
const noGitDir = runnerWith(STALE, '--root', probeRepo);
check(noGitDir.status === 0 && seenBy(probeRepo) === null, `without --git-dir a selftest sees no SELFTEST_GIT_DIR, an inherited value removed: ${noGitDir.status} ${seenBy(probeRepo)}`);

const probeCodeRepo = repo({ tracked: { 'README.md': 'code' }, loose: { '.claude/a/selftest.mjs': PROBE }, ignore: '.claude/\n' });
const probeTree = path.join(probeCodeRepo, '.claude');
const probeGitDir = path.join(bareDir(), 'probe.git');
const probeGit = (...args) => spawnSync('git', [`--git-dir=${probeGitDir}`, `--work-tree=${probeTree}`, ...args], { encoding: 'utf8' });
spawnSync('git', ['init', '-q', '--bare', probeGitDir], { encoding: 'utf8' });
probeGit('add', 'a/selftest.mjs');
probeGit('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'probe');
writeFileSync(path.join(probeGitDir, 'info', 'exclude'), 'seen.txt\n', { flag: 'a' });
const withGitDir = runnerWith(STALE, '--root', probeTree, '--git-dir', probeGitDir);
check(withGitDir.status === 0 && seenBy(probeTree) === path.resolve(probeGitDir), `with --git-dir a selftest sees exactly that git dir, absolute, over a stale inherited value: ${withGitDir.status} ${seenBy(probeTree)} ${withGitDir.stdout}`);
const relativeGitDir = path.relative(process.cwd(), probeGitDir);
rmSync(noteOf(probeTree), { force: true });
const relativeRun = spawnSync(process.execPath, [RUN, '--root', probeTree, '--git-dir', relativeGitDir], { encoding: 'utf8' });
check(relativeRun.status === 0 && seenBy(probeTree) === path.resolve(probeGitDir), `a relative --git-dir reaches the selftest absolute: ${relativeRun.status} ${seenBy(probeTree)}`);

// ── Verdict: red paths leave the rest running ────────────────────────────────────────────────────
const sentinel = 'later-selftest-ran';
const withRed = repo({
  tracked: {
    'a/selftest.mjs': RED,
    'z/selftest.mjs': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(sentinel)}, 'ran');\n`,
  },
  // Ignored, so the sentinel is not a change to the tree under test. @es Ignorado, así el centinela no cambia el árbol.
  ignore: `${sentinel}\n`,
});
const red = cli(withRed, '--root', withRed);
check(red.status === 1, `one red selftest exits 1: ${red.status}`);
check(/RED\s+a\/selftest\.mjs/.test(red.stdout), 'the red selftest is named');
check(red.stdout.includes('BOOM-MARK'), 'a red selftest prints its own output');
check(/GREEN\s+z\/selftest\.mjs/.test(red.stdout), 'a later selftest still ran and is green');
check(existsSync(path.join(withRed, 'z', sentinel)), 'the later selftest ran with its own directory as cwd');
check(red.stdout.includes('1/2 green'), `the summary counts green over total: ${red.stdout}`);

const allGreen = repo({ tracked: { 'a/selftest.mjs': GREEN, 'b/selftest.mjs': GREEN } });
const green = cli(allGreen, '--root', allGreen);
check(green.status === 0 && green.stdout.includes('2/2 green'), `all green exits 0: ${green.status}`);
check(green.stderr === '' && red.stderr === '', `a measured run prints nothing on stderr: ${green.stderr}${red.stderr}`);

const inOwnDir = "import path from 'node:path';\nprocess.exit(path.basename(process.cwd()) === 'a' ? 0 : 1);\n";
const cwdCase = repo({ tracked: { 'a/selftest.mjs': inOwnDir } });
check(cli(cwdCase, '--root', cwdCase).status === 0, 'each selftest runs with its own directory as cwd');

const killed = repo({ tracked: { 'a/selftest.mjs': "process.kill(process.pid, 'SIGKILL')\n" } });
check(cli(killed, '--root', killed).status === 1, 'a selftest killed by a signal is RED');

// The sleeper is BOUNDED (4 s) against a 700 ms timeout: if a mutant stops honouring the timeout the
// selftest ends green after 4 s and the assertion fails, instead of the campaign hanging on a child that never ends.
// @es El durmiente está ACOTADO (4 s) frente a un timeout de 700 ms: si un mutante ignora el timeout, el
// selftest termina en verde a los 4 s y la aserción falla, en vez de colgar la campaña con un hijo eterno.
const slow = repo({ tracked: { 'a/selftest.mjs': 'setTimeout(() => {}, 4000);\n' } });
const timedOut = await runSelftests({ root: slow, timeoutMs: 700 });
check(timedOut.exitCode === 1 && timedOut.report.join('\n').includes('timed out'), 'a selftest that outlives the timeout is RED');
check(timedOut.report.some((line) => /^RED\s+a\/selftest\.mjs \(exit timeout\)/.test(line)), 'the timed-out selftest is named RED with the timeout status');

const signalDeath = { status: null, signal: 'SIGKILL', stdout: '', stderr: '' };
const signalled = await runSelftests({ root: allGreen, spawn: () => signalDeath });
check(signalled.exitCode === 1 && signalled.report.join('\n').includes('killed by SIGKILL'), 'a death by signal with no exit status is RED on every host');

const missing = repo({ tracked: { 'a/selftest.mjs': GREEN, 'b/selftest.mjs': GREEN } });
rmSync(path.join(missing, 'a', 'selftest.mjs'));
const gone = cli(missing, '--root', missing);
check(gone.status === 1 && /RED\s+a\/selftest\.mjs/.test(gone.stdout), 'a tracked selftest deleted from disk is RED, not omitted');
check(gone.stdout.includes('file missing on disk'), 'a deleted selftest is reported as missing, not run and failed by accident');

// ── Streaming: a line is delivered when its selftest ends, not when the whole run ends ─────────────
// One at a time, so "before the next one starts" is a property of the run; the parallel order is proved below.
// @es De a uno, así «antes de que arranque el siguiente» es una propiedad de la corrida; el orden en paralelo se prueba abajo.
const streamed = repo({ tracked: { 'a/selftest.mjs': GREEN, 'b/selftest.mjs': RED, 'c/selftest.mjs': GREEN } });
const lines = [];
const linesSeenAtSpawn = [];
const watched = await runSelftests({
  root: streamed,
  concurrency: 1,
  onLine: (line) => lines.push(line),
  spawn: (...args) => {
    linesSeenAtSpawn.push(lines.length);

    return spawnSync(...args);
  },
});
check(JSON.stringify(lines) === JSON.stringify(watched.report), 'the lines delivered one by one are exactly the returned report: none lost, none repeated');
check(linesSeenAtSpawn.length === 3 && linesSeenAtSpawn[0] === 0 && linesSeenAtSpawn[1] === 1, `the first selftest's line is delivered BEFORE the second one starts: ${linesSeenAtSpawn}`);
check(linesSeenAtSpawn[2] > linesSeenAtSpawn[1] && /^RED\s+b\/selftest\.mjs/.test(lines[1]), `a red selftest's line and its output are delivered before the third starts: ${linesSeenAtSpawn}`);
check(lines.at(-1) === '2/3 green @es 2/3 en verde' && watched.exitCode === 1, 'the summary line stays last and the exit status stays 1');

const quiet = await runSelftests({ root: streamed });
check(quiet.report.join('\n') === watched.report.join('\n'), 'without a hook the report is the same, so existing callers are unaffected');

// ── In parallel: really at once, same report order, same verdict, shared tree judged for the batch ─────
// @es ── En paralelo: de verdad a la vez, mismo orden de informe, mismo veredicto, árbol compartido juzgado por tanda ──
// Two selftests that each wait for the other's mark (outside the tree, so no leak): green only when they overlap.
// @es Dos selftests que esperan cada uno la marca del otro (fuera del árbol, sin fuga): verdes solo si se solapan.
const meeting = bareDir();
const waitFor = (mine, theirs) => `import { existsSync, writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(path.join(meeting, mine))}, '');\nconst deadline = Date.now() + 3000;\nwhile (!existsSync(${JSON.stringify(path.join(meeting, theirs))}) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));\nprocess.exit(existsSync(${JSON.stringify(path.join(meeting, theirs))}) ? 0 : 1);\n`;
const pair = repo({ tracked: { 'a/selftest.mjs': waitFor('a', 'b'), 'b/selftest.mjs': waitFor('b', 'a') } });
const together = await runSelftests({ root: pair, concurrency: 2 });
check(together.exitCode === 0, `concurrency 2 runs two selftests at the same time: ${together.report.join(' | ')}`);
rmSync(path.join(meeting, 'a'), { force: true });
rmSync(path.join(meeting, 'b'), { force: true });
const oneByOne = await runSelftests({ root: pair, concurrency: 1 });
check(oneByOne.exitCode === 1, `near miss: concurrency 1 runs them one after the other, so the first waits in vain: ${oneByOne.report.join(' | ')}`);

// The same pair through the real command line: it must pass the plan's concurrency on to the run.
// @es El mismo par por la línea de órdenes real: debe pasar a la corrida la concurrencia del plan.
const viaCli = (concurrency) => {
  rmSync(path.join(meeting, 'a'), { force: true });
  rmSync(path.join(meeting, 'b'), { force: true });

  return spawnSync(process.execPath, [RUN, '--root', pair], { cwd: pair, encoding: 'utf8', env: { ...process.env, SELFTEST_CONCURRENCY: concurrency } });
};
const cliTogether = viaCli('2');
check(cliTogether.status === 0 && cliTogether.stdout.includes('2/2 green'), `the command line with SELFTEST_CONCURRENCY=2 runs the pair at the same time: exit ${cliTogether.status}, ${cliTogether.stdout}`);
const cliOneByOne = viaCli('1');
check(cliOneByOne.status === 1, `near miss: the command line with SELFTEST_CONCURRENCY=1 runs them one after the other: exit ${cliOneByOne.status}`);

// The first listed selftest ends LAST; its line still comes first, and the verdict is the serial one.
// @es El primer selftest listado termina el ÚLTIMO; su línea igual va primero y el veredicto es el de la serie.
const late = repo({ tracked: { 'a/selftest.mjs': "await new Promise((resolve) => setTimeout(resolve, 800));\nprocess.exit(1);\n", 'b/selftest.mjs': GREEN, 'c/selftest.mjs': RED } });
const parallelLines = [];
const parallel = await runSelftests({ root: late, concurrency: 3, onLine: (line) => parallelLines.push(line) });
const serial = await runSelftests({ root: late, concurrency: 1 });
check(/^RED\s+a\/selftest\.mjs/.test(parallel.report[0]) && parallel.report.findIndex((line) => line.startsWith('GREEN  b/')) > 0, `the report keeps the discovery order in parallel: ${parallel.report.join(' | ')}`);
check(JSON.stringify(parallel.report) === JSON.stringify(serial.report) && parallel.exitCode === serial.exitCode, `the parallel report and verdict equal the serial ones: ${parallel.report.join(' | ')}`);
check(JSON.stringify(parallelLines) === JSON.stringify(parallel.report), 'in parallel the lines delivered one by one are exactly the returned report');

// A selftest that writes into the tree: per selftest when one at a time, for the batch in parallel; red both ways.
// @es Un selftest que escribe en el árbol: por selftest cuando van de a uno, por tanda en paralelo; rojo de las dos formas.
const writer = repo({ tracked: { 'a/selftest.mjs': "import { writeFileSync } from 'node:fs';\nwriteFileSync('leak.txt', 'x');\n", 'b/selftest.mjs': GREEN } });
const batchLeak = await runSelftests({ root: writer, concurrency: 2 });
const batchText = batchLeak.report.join('\n');
check(batchLeak.exitCode === 1 && batchText.includes('the tree changed during the parallel run: 1 path(s)') && batchText.includes(path.join(writer, 'a', 'leak.txt')), `in parallel a write into the tree turns the run RED and names the path: ${batchText}`);
check(batchText.includes('SELFTEST_CONCURRENCY=1') && batchText.includes('@es el árbol cambió durante la corrida paralela'), 'the batch refusal says how to name the selftest, in both languages');
check(batchLeak.report.at(-1) === '2/2 green @es 2/2 en verde', `the selftests themselves stay green, the batch line carries the red: ${batchLeak.report.at(-1)}`);
// force: when a broken runner never ran the writer there is no file, and the checks, not this cleanup, decide.
// @es force: si un runner roto nunca corrió al escritor no hay fichero, y deciden los checks, no esta limpieza.
rmSync(path.join(writer, 'a', 'leak.txt'), { force: true });
const serialLeak = await runSelftests({ root: writer, concurrency: 1 });
check(serialLeak.exitCode === 1 && /^RED\s+a\/selftest\.mjs/.test(serialLeak.report[0]) && !serialLeak.report.join('\n').includes('parallel run'), `one at a time the same write is named on its selftest: ${serialLeak.report.join(' | ')}`);
rmSync(path.join(writer, 'a', 'leak.txt'), { force: true });
const cleanBatch = await runSelftests({ root: allGreen, concurrency: 4 });
check(cleanBatch.exitCode === 0 && !cleanBatch.report.join('\n').includes('parallel run'), 'near miss: a parallel run that leaves the tree alone has no batch line and is green');
const tempWriter = repo({ tracked: { 'a/selftest.mjs': "import { writeFileSync } from 'node:fs';\nimport { tmpdir } from 'node:os';\nimport path from 'node:path';\nwriteFileSync(path.join(tmpdir(), 'left.txt'), 'x');\n", 'b/selftest.mjs': GREEN } });
const tempLeak = await runSelftests({ root: tempWriter, concurrency: 2 });
check(tempLeak.exitCode === 1 && /^RED\s+a\/selftest\.mjs \(exit 0\)/.test(tempLeak.report[0]) && tempLeak.report.join('\n').includes('$TMP/left.txt') && tempLeak.report.some((line) => line.startsWith('GREEN  b/')), `in parallel a selftest's own temp leak is still named on that selftest alone: ${tempLeak.report.join(' | ')}`);

// How many at once. @es Cuántos a la vez.
// The default is min(cores - 2, floor(free memory * 0.5 / PEAK_BYTES_PER_SUITE)), at least 1; the free memory is a
// parameter so the cases pass it. `perSuite(n)` is the free memory that affords exactly n selftests.
// @es El valor por defecto es min(núcleos - 2, floor(memoria libre * 0.5 / PEAK_BYTES_PER_SUITE)), mínimo 1; la
// memoria libre es un parámetro para que los casos la pasen. `perSuite(n)` es la memoria libre que da para n selftests.
const perSuite = (n) => n * PEAK_BYTES_PER_SUITE * 2;
const PLENTY = perSuite(1000);
check(PEAK_BYTES_PER_SUITE >= 741_154_816, 'the per-selftest peak is never below the highest one measured (741154816 bytes, 2026-11-04)');
check(concurrencyOf({ SELFTEST_CONCURRENCY: '3' }, 16, 0) === 3, 'SELFTEST_CONCURRENCY sets the concurrency, whatever the memory');
check(concurrencyOf({ SELFTEST_CONCURRENCY: '1' }, 16, PLENTY) === 1, 'SELFTEST_CONCURRENCY=1 runs one at a time');
check(concurrencyOf({ SELFTEST_CONCURRENCY: '64' }, 4, 0) === 64, 'SELFTEST_CONCURRENCY is not capped by the machine');
check(concurrencyOf({ SELFTEST_CONCURRENCY: '0' }, 16, PLENTY) === 14 && concurrencyOf({ SELFTEST_CONCURRENCY: 'x' }, 16, PLENTY) === 14 && concurrencyOf({ SELFTEST_CONCURRENCY: '2.5' }, 16, PLENTY) === 14, 'a value that is not a whole number of at least 1 falls back to the machine default');
check(concurrencyOf({ SELFTEST_CONCURRENCY: 'x' }, 16, perSuite(5)) === 5, 'an invalid SELFTEST_CONCURRENCY falls back to the memory bound too');
check(concurrencyOf({}, 16, PLENTY) === 14 && concurrencyOf({}, 6, PLENTY) === 4 && concurrencyOf({}, 3, PLENTY) === 1, 'cores bound: cores - 2');
check(concurrencyOf({}, 2, PLENTY) === 1 && concurrencyOf({}, 1, PLENTY) === 1, 'cores bound: at least 1 on a small machine');
check(concurrencyOf({}, 64, PLENTY) === 62, 'there is no fixed cap: 64 cores run 62');
check(concurrencyOf({}, 32, perSuite(5)) === 5 && concurrencyOf({}, 32, perSuite(5) + 1) === 5 && concurrencyOf({}, 32, perSuite(5) - 1) === 4, 'memory bound: floor(free * 0.5 / peak), exact at the boundary');
check(concurrencyOf({}, 32, perSuite(6) - 1) === 5 && concurrencyOf({}, 32, perSuite(7)) === 7, 'memory bound: half of the free memory, not all of it');
check(concurrencyOf({}, 32, 0) === 1 && concurrencyOf({}, 32, PEAK_BYTES_PER_SUITE / 2 - 1) === 1, 'with no memory at least one selftest still runs');
check(concurrencyOf({}, 8, perSuite(3)) === 3 && concurrencyOf({}, 4, perSuite(3)) === 2, 'the smaller of the two bounds wins');

// Which bound decided, and the budget handed to the children. @es Qué cota decidió y el presupuesto que se da a los hijos.
const plan = (env, cores, free) => concurrencyPlan(env, cores, free);
check(plan({ SELFTEST_CONCURRENCY: '3' }, 16, PLENTY).bound === 'override', 'the plan names SELFTEST_CONCURRENCY as the bound');
check(plan({}, 16, PLENTY).bound === 'cores' && plan({}, 4, perSuite(2)).bound === 'cores' && plan({}, 4, perSuite(2)).concurrency === 2, 'the plan names the cores when they decide, a tie included');
check(plan({}, 32, perSuite(5)).bound === 'memory', 'the plan names the memory when it decides');
check(concurrencyOf({ CONCURRENCY_BUDGET: '4' }, 16, PLENTY) === 4 && plan({ CONCURRENCY_BUDGET: '4' }, 16, PLENTY).bound === 'budget', 'a budget below the machine value caps the default');
check(concurrencyOf({ CONCURRENCY_BUDGET: '1' }, 16, PLENTY) === 1, 'a budget of 1 runs serially');
check(concurrencyOf({ CONCURRENCY_BUDGET: '100' }, 16, PLENTY) === 14 && plan({ CONCURRENCY_BUDGET: '14' }, 16, PLENTY).bound === 'cores', 'a budget above the machine value changes nothing');
check(concurrencyOf({ CONCURRENCY_BUDGET: '9' }, 32, perSuite(2)) === 2, 'a budget never raises the memory bound');
check(concurrencyOf({ CONCURRENCY_BUDGET: '2', SELFTEST_CONCURRENCY: '6' }, 16, PLENTY) === 6, 'SELFTEST_CONCURRENCY wins over the budget');
check(['x', '0', '-3', '2.5', ''].every((budget) => concurrencyOf({ CONCURRENCY_BUDGET: budget }, 16, PLENTY) === 14), 'an invalid budget is ignored');
check(plan({ CONCURRENCY_BUDGET: '100' }, 16, PLENTY).budget === 100 && plan({}, 16, PLENTY).budget === 14 && plan({ CONCURRENCY_BUDGET: 'x' }, 16, PLENTY).budget === 14, 'the runner own budget is the one it was given, else the machine value');
check(childBudgetOf(14, 4) === 3 && childBudgetOf(8, 1) === 8 && childBudgetOf(3, 4) === 1 && childBudgetOf(1, 1) === 1, 'the child budget is floor(budget / concurrency), at least 1');

const budgetEnvs = [];
const budgetSpawn = (file, args, options) => {
  budgetEnvs.push(options.env.CONCURRENCY_BUDGET);

  return spawnSync(file, args, options);
};
const budgeted = await runSelftests({ root: allGreen, concurrency: 2, childBudget: 3, spawn: budgetSpawn });
check(budgeted.exitCode === 0 && budgetEnvs.length > 0 && budgetEnvs.every((value) => value === '3'), `every child gets the divided budget in CONCURRENCY_BUDGET: ${budgetEnvs}`);
const inheritedBudget = process.env.CONCURRENCY_BUDGET;
const inheritedConcurrency = process.env.SELFTEST_CONCURRENCY;
process.env.CONCURRENCY_BUDGET = '6';
process.env.SELFTEST_CONCURRENCY = '2';
budgetEnvs.length = 0;
await runSelftests({ root: allGreen, spawn: budgetSpawn });
check(budgetEnvs.length > 0 && budgetEnvs.every((value) => value === '3'), `by default the child budget is the runner's own budget (6) over its concurrency (2): ${budgetEnvs}`);
delete process.env.CONCURRENCY_BUDGET;
budgetEnvs.length = 0;
await runSelftests({ root: allGreen, spawn: budgetSpawn });
check(budgetEnvs.length > 0 && budgetEnvs.every((value) => Number.isInteger(Number(value)) && Number(value) >= 1), `without a budget the child gets the machine value over its concurrency: ${budgetEnvs}`);
for (const [name, value] of [['CONCURRENCY_BUDGET', inheritedBudget], ['SELFTEST_CONCURRENCY', inheritedConcurrency]]) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

// The report header says what was chosen and why. @es La cabecera dice qué se eligió y por qué.
const header = (env, cores, free) => {
  const chosen = concurrencyPlan(env, cores, free);

  return describeConcurrency(chosen, childBudgetOf(chosen.budget, chosen.concurrency));
};
check(header({ SELFTEST_CONCURRENCY: '3' }, 16, PLENTY).includes('SELFTEST_CONCURRENCY') && header({ SELFTEST_CONCURRENCY: '3' }, 16, PLENTY).includes('Running 3 selftests at once'), 'the header names the override');
check(header({}, 16, PLENTY).includes('cores') && header({}, 16, PLENTY).includes('16 cores') && header({}, 16, PLENTY).includes('Running 14'), 'the header names the cores bound with its numbers');
check(header({}, 32, perSuite(5)).includes('free memory') && header({}, 32, perSuite(5)).includes('Running 5'), 'the header names the memory bound');
check(header({ CONCURRENCY_BUDGET: '4' }, 16, PLENTY).includes('CONCURRENCY_BUDGET=4') && header({ CONCURRENCY_BUDGET: '4' }, 16, PLENTY).includes('budget of 1'), 'the header names the budget bound and the budget each child gets');
check(['override', 'cores', 'memory', 'budget'].every((bound) => /@es .*selftests/.test(describeConcurrency({ concurrency: 2, bound, budget: 4, cores: 8, freeBytes: PLENTY }, 2))), 'every header is bilingual');
const headed = spawnSync(process.execPath, [RUN, '--root', allGreen], { cwd: allGreen, encoding: 'utf8', env: { ...process.env, SELFTEST_CONCURRENCY: '2' } });
check(headed.status === 0 && headed.stdout.split('\n')[0].includes('Running 2 selftests at once') && headed.stdout.includes('2/2 green'), `the command line prints the header before the report: ${headed.stdout.split('\n')[0]}`);

// The same through the real command line. The second selftest only passes once the PARENT has seen the
// first one's GREEN line on stdout; a runner that prints at the end would never let it pass.
// @es Lo mismo por la línea de órdenes real. El segundo selftest solo pasa cuando el PADRE ya vio la línea
// GREEN del primero; un runner que imprime al final no lo dejaría pasar nunca.
const handshake = repo({
  tracked: {
    'a/selftest.mjs': GREEN,
    'b/selftest.mjs': "import { existsSync } from 'node:fs';\nconst deadline = Date.now() + 8000;\nwhile (!existsSync('release') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));\nprocess.exit(existsSync('release') ? 0 : 1);\n",
  },
  ignore: 'release\n',
});
const live = await new Promise((resolve) => {
  const child = spawn(process.execPath, [RUN, '--root', handshake], { cwd: handshake });
  let stdout = '';
  let released = false;
  const guard = setTimeout(() => child.kill(), 30_000);

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (!released && stdout.includes('GREEN  a/selftest.mjs')) {
      released = true;
      writeFileSync(path.join(handshake, 'b', 'release'), 'seen');
    }
  });
  child.on('close', (code) => {
    clearTimeout(guard);
    resolve({ code, stdout, released });
  });
});
check(live.released && live.code === 0 && live.stdout.includes('GREEN  b/selftest.mjs') && live.stdout.includes('2/2 green'), `the command line prints the first line while the second selftest is still running: exit ${live.code}, released ${live.released}`);

// ── Writing one line ──────────────────────────────────────────────────────────────────────────────
const written = (writeStep, line, options) => {
  const chunks = [];
  const outcome = (() => {
    try {
      writeLineSync(line, { write: (fd, bytes, offset, length) => writeStep(chunks, fd, bytes, offset, length), ...options });

      return undefined;
    } catch (error) {
      return error;
    }
  })();

  return { text: Buffer.concat(chunks).toString('utf8'), error: outcome };
};
const takeAll = (chunks, fd, bytes, offset, length) => {
  chunks.push(Buffer.from(bytes.subarray(offset, offset + length)));

  return length;
};
const onlyFirstByte = (chunks, fd, bytes, offset) => {
  chunks.push(Buffer.from(bytes.subarray(offset, offset + 1)));

  return 1;
};

check(written(takeAll, 'GREEN  a/selftest.mjs (exit 0)').text === 'GREEN  a/selftest.mjs (exit 0)\n', 'a line is written whole, with its newline');
check(written(takeAll, 'señal ✓ verde').text === 'señal ✓ verde\n', 'a multi-byte line is written byte for byte');
check(written(onlyFirstByte, 'abc é').text === 'abc é\n', 'a write that takes one byte at a time still delivers the whole line, in order');

let refusals = 0;
const fullOnce = (chunks, fd, bytes, offset, length) => {
  if (refusals < 2) {
    refusals += 1;
    throw Object.assign(new Error('pipe full'), { code: 'EAGAIN' });
  }

  return takeAll(chunks, fd, bytes, offset, length);
};
const afterBusyPipe = written(fullOnce, 'after a busy pipe');
check(afterBusyPipe.error === undefined && afterBusyPipe.text === 'after a busy pipe\n' && refusals === 2, 'a pipe that is momentarily full (EAGAIN) is retried until the line goes through, once');

let broken = 0;
const brokenOnce = (chunks, fd, bytes, offset, length) => {
  if (broken === 0) {
    broken += 1;
    throw Object.assign(new Error('broken pipe'), { code: 'EPIPE' });
  }

  return takeAll(chunks, fd, bytes, offset, length);
};
const afterBrokenPipe = written(brokenOnce, 'closed reader');
check(afterBrokenPipe.error?.code === 'EPIPE' && broken === 1, 'any error other than EAGAIN is raised at once, never retried');

let attempts = 0;
const alwaysFull = () => {
  attempts += 1;
  if (attempts > 50) throw new Error('UNBOUNDED retry');
  throw Object.assign(new Error('pipe full'), { code: 'EAGAIN' });
};
const gaveUp = written((chunks, fd, bytes, offset, length) => alwaysFull(chunks, fd, bytes, offset, length), 'never accepted', { retries: 3 });
check(gaveUp.error?.code === 'EAGAIN' && attempts === 4, `a pipe that never drains is given up on after the bounded retries, raising EAGAIN: attempts ${attempts}`);

// ── Whether it may start: only under the full-chain lock ─────────────────────────────────────────────
const LOCK_RUN = path.join(import.meta.dirname, '..', 'full-chain-lock', 'run.mjs');
const slashed = (file) => file.split('\\').join('/');

/** Drives `main` in process with its seams: what the lock port was asked, what ran, what was said. @es Maneja `main` en proceso con sus costuras. */
async function inProcess(environment, holds, argv = ['--root', allGreen]) {
  const asked = [];
  const ran = [];
  const said = [];
  const exit = await main(argv, {
    environment,
    holdsLock: (token) => {
      asked.push(token);
      return holds(token);
    },
    execute: (options) => {
      ran.push(options);
      return Promise.resolve({ exitCode: 7 });
    },
    tell: makeSpeaker(MESSAGES, { log: (line) => said.push(line), error: (line) => said.push(line) }),
  });

  return { exit, asked, ran, said };
}

const granted = await inProcess({ [LOCK_TOKEN_VARIABLE]: 'token' }, () => true);
check(granted.exit === 7 && granted.ran.length === 1 && granted.ran[0].root === allGreen && granted.asked.join() === 'token' && granted.said.length === 0, `a token that holds the lock runs the selftests and returns their exit code: ${JSON.stringify(granted)}`);

for (const [label, environment, holds, asks] of [
  ['a missing token', {}, () => true, 0],
  ['an empty token', { [LOCK_TOKEN_VARIABLE]: '' }, () => true, 0],
  ['a token that is not text', { [LOCK_TOKEN_VARIABLE]: 42 }, () => true, 0],
  ['a token the lock does not hold (stale, copied or forged)', { [LOCK_TOKEN_VARIABLE]: 'token' }, () => false, 1],
  ['an answer of the lock port that is not exactly true', { [LOCK_TOKEN_VARIABLE]: 'token' }, () => 'yes', 1],
]) {
  const refused = await inProcess(environment, holds);

  check(refused.exit === 2 && refused.ran.length === 0, `${label}: exit 2 and no selftest runs: ${JSON.stringify(refused)}`);
  check(refused.asked.length === asks, `${label}: the lock port is asked ${asks} time(s): ${refused.asked.length}`);
  check(refused.said.length === 1 && refused.said[0].startsWith('REFUSED: the selftest runner is a full chain') && refused.said[0].includes(' @es RECHAZADO: el runner de selftests es una cadena completa'), `${label}: one bilingual refusal: ${refused.said.join('|')}`);
  check(refused.said[0].includes(' Nothing was run. Run it through the lock: ') && refused.said[0].includes(' No se ejecutó nada. Ejecútalo por el lock: '), `${label}: the refusal says nothing was run, in both languages: ${refused.said[0]}`);
  check(refused.said[0].includes(LOCK_TOKEN_VARIABLE) && refused.said[0].includes(`Run it through the lock: ${lockedCommand(['--root', allGreen], allGreen)} @es `), `${label}: the refusal names the variable and the exact locked command`);
}

check(startedUnderLock({ [LOCK_TOKEN_VARIABLE]: 'a' }, (token) => token === 'a') && !startedUnderLock({ [LOCK_TOKEN_VARIABLE]: 'a' }, (token) => token === 'b'), 'the gate asks the port about the very token it read');
const command = lockedCommand(['--root', 'with space', '--git-dir', 'g'], 'with space');
check(command.startsWith(`node ${slashed(LOCK_RUN)} --chain selftest-runner --tree `) && command.includes(` -- node ${slashed(RUN)} --root "with space" --git-dir g`) && command.includes(`--tree "${slashed(path.resolve('with space'))}" -- `), `the locked command wraps this runner and its arguments, quoting what needs it: ${command}`);

const marker = path.join(bareDir(), 'ran-marker');
const marked = repo({ tracked: { 'a/selftest.mjs': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\n` } });
const refusalOf = (result) => result.status === 2 && result.stdout === '' && result.stderr.startsWith('REFUSED:') && result.stderr.includes(' @es RECHAZADO:') && !existsSync(marker);
const stateRoot = () => bareDir();

rmSync(marker, { force: true });
const heldRun = cli(marked, '--root', marked);
check(heldRun.status === 0 && heldRun.stdout.includes('1/1 green') && existsSync(marker), `through the command line, the token this process holds runs the selftest: ${heldRun.status} ${heldRun.stdout}${heldRun.stderr}`);

for (const [label, environment] of [
  ['a missing token', { [LOCK_TOKEN_VARIABLE]: undefined }],
  ['an empty token', { [LOCK_TOKEN_VARIABLE]: '' }],
  ['a forged token', { [LOCK_TOKEN_VARIABLE]: '1:forged' }],
  ['a state with no lock file at all', { HOOK_STATE_DIR: stateRoot(), [LOCK_TOKEN_VARIABLE]: '1:no-lock-here' }],
]) {
  rmSync(marker, { force: true });

  const result = cliWith(environment, marked, '--root', marked);

  check(refusalOf(result), `through the command line, ${label} is refused with exit 2 and no selftest ran: ${result.status} ${result.stderr}`);
}

// A token that WAS valid: read from a real locked chain in a state of its own; once that chain ended it no longer holds
// anything there, and against the live lock this process holds (another holder id) it does not match either.
// @es Un token que FUE válido: leído de una cadena real con lock en un estado propio; al terminar esa cadena ya no tiene
// nada allí, y contra el lock vivo de este proceso (otro id de dueño) tampoco coincide.
const chainState = stateRoot();
const finished = spawnSync(process.execPath, [LOCK_RUN, '--chain', 'selftest-runner', '--project', 'p', '--', process.execPath, path.join(import.meta.dirname, '..', 'full-chain-lock', 'chain-child.fixture.mjs'), 'env', LOCK_TOKEN_VARIABLE], { encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: chainState } });
const copied = /FULL_CHAIN_LOCK_TOKEN=(\S+)/.exec(finished.stdout)?.[1];

check(finished.status === 0 && copied !== undefined, `a real locked chain was given a token to copy: ${finished.status} ${finished.stdout}${finished.stderr}`);
rmSync(marker, { force: true });
check(refusalOf(cliWith({ HOOK_STATE_DIR: chainState, [LOCK_TOKEN_VARIABLE]: copied }, marked, '--root', marked)), 'the token of a chain that ended holds nothing in its own state');
check(refusalOf(cliWith({ [LOCK_TOKEN_VARIABLE]: copied }, marked, '--root', marked)) && tokenHoldsLock(copied) === false, 'a token copied from another chain does not match the lock another holder has now');

const staleState = stateRoot();
const staleDir = path.join(staleState, 'full-chain-lock');
const deadPid = spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid;

mkdirSync(staleDir, { recursive: true });
writeFileSync(path.join(staleDir, 'chain.lock'), `${deadPid}:planted`);
writeFileSync(path.join(staleDir, 'holder.json'), JSON.stringify({ session: 'old', project: 'old', chain: 'old', pid: deadPid, startedAt: '2026-01-01T00:00:00.000Z', command: 'old' }));
utimesSync(path.join(staleDir, 'chain.lock'), new Date(Date.now() - 5 * 60_000), new Date(Date.now() - 5 * 60_000));
check(refusalOf(cliWith({ HOOK_STATE_DIR: staleState, [LOCK_TOKEN_VARIABLE]: `${deadPid}:planted` }, marked, '--root', marked)), 'a stale holder (dead owner, old lock) with its own token is refused');

// The real wrapper supplies the token end to end, and so does the command the refusal prints.
// @es El wrapper real da el token de punta a punta, y también lo hace el comando que imprime la negativa.
const wrapperState = stateRoot();
const wrapped = spawnSync(process.execPath, [LOCK_RUN, '--chain', 'selftest-runner', '--project', 'p', '--tree', marked, '--', process.execPath, RUN, '--root', marked], { encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: wrapperState, [LOCK_TOKEN_VARIABLE]: '1:inherited-and-wrong' } });

check(wrapped.status === 0 && wrapped.stdout.includes('1/1 green') && existsSync(marker), `the real full-chain-lock/run.mjs wrapping the runner gives it a token it accepts: ${wrapped.status} ${wrapped.stdout}${wrapped.stderr}`);
check(!existsSync(path.join(wrapperState, 'full-chain-lock', 'chain.lock')), 'the lock is released after the wrapped run');

rmSync(marker, { force: true });
const printedState = stateRoot();
const refused = cliWith({ HOOK_STATE_DIR: printedState, [LOCK_TOKEN_VARIABLE]: undefined }, marked, '--root', marked);
const printed = /Run it through the lock: (.+) @es /s.exec(refused.stderr)?.[1];
const words = printed?.match(/"[^"]*"|\S+/g)?.map((piece) => piece.replace(/^"|"$/g, ''));
const rerun = words === undefined ? undefined : spawnSync(process.execPath, words.slice(1), { cwd: marked, encoding: 'utf8', env: { ...process.env, HOOK_STATE_DIR: printedState, [LOCK_TOKEN_VARIABLE]: undefined } });

check(words?.[0] === 'node' && rerun?.status === 0 && rerun.stdout.includes('1/1 green') && existsSync(marker), `the command the refusal prints runs the selftests when typed as it is: ${printed} -> ${rerun?.status} ${rerun?.stdout}${rerun?.stderr}`);

// ── Nothing to filter with ───────────────────────────────────────────────────────────────────────
const filtered = cli(allGreen, '--root', allGreen, '--only', 'a/selftest.mjs');
check(filtered.status === 2, `an option that would filter is refused: ${filtered.status}`);
check(filtered.stderr.startsWith('Usage: node run.mjs [--root <dir> [--git-dir <dir>]].') && filtered.stderr.includes(' @es Uso:') && filtered.stdout === '', `the refusal is bilingual usage on stderr: ${filtered.stderr}`);

finish();
