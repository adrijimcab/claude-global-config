#!/usr/bin/env node
/**
 * Self-test for the worktree landing, the mechanism of `unverified-commit-published-by-another-sessions-sync`.
 * Every fixture is CONSTRUCTED here in the system temp directory — a bare remote, a main clone, and a
 * worktree of it — and never the live repository. The fixture's test command is a stand-in runner whose
 * verdict is a committed `verdict` file, so the worktree and the main checkout can disagree about it.
 *
 * THE STATE SPACE, enumerated from what the landing decides:
 *   - WHICH TWO CHECKOUTS: a worktree of the repository; the same checkout twice; a separate clone.
 *   - THE WORKTREE: committed; a modified tracked file; an untracked file; an ignored file (near miss).
 *   - THE MAIN CHECKOUT: on the shared branch or on another one; a dirty landed path; a dirty path that is
 *     NOT landed (near miss); an untracked file at a landed path; an ignored file at a landed path with
 *     different content, and with identical content (near miss).
 *   - THE RANGE: a HEAD ahead of the tip; exactly at the tip (near miss); behind a moved tip (replay
 *     commands printed); behind a moved remote tip.
 *   - THE VERIFICATION: green; red (exit 1, red lines); not measured (exit 2); timed out; no test command;
 *     the head moved while it ran; it left the worktree dirty.
 *   - THE PUBLICATION: landed and confirmed; the push rejected; the remote tip not the landed commit.
 *   - THE COMMAND LINE: check mode lands nothing; an unknown, missing or repeated option is refused.
 * Every refused state asserts its designed reason, and that neither the main checkout's branch, its
 * working tree, nor the remote moved.
 *
 * @es Auto-test del aterrizaje de worktrees, el mecanismo de
 * `unverified-commit-published-by-another-sessions-sync`. Cada fixture se CONSTRUYE aquí en el directorio
 * temporal del sistema (un remoto bare, un clon principal y un worktree suyo), nunca el repositorio real. La
 * orden de pruebas del fixture es un runner sustituto cuyo veredicto es un fichero `verdict` commiteado. Se
 * recorren todos los estados que decide el aterrizaje; cada rechazo comprueba su razón diseñada y que ni la
 * rama del principal, ni su árbol de trabajo, ni el remoto se movieron.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isolateState } from '../hook-state/locations.mjs';
import { land } from './land.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('worktree-landing');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LAND = path.join(HERE, 'land.mjs');
const KEY = 'unverified-commit-published-by-another-sessions-sync';
const HANG_TIMEOUT_MS = 1000;
const CHILD_TIMEOUT_MS = 120_000;

/** The fixture's test command: its verdict is the committed `verdict` file of the root it is given. @es La orden de pruebas del fixture. */
const FAKE_RUNNER = `import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const root = process.argv[3];
const verdict = readFileSync(path.join(root, 'verdict'), 'utf8').trim();
const green = () => console.log('GREEN  fake/selftest.mjs (exit 0)\\n1/1 green');
if (verdict === 'hang') setTimeout(() => {}, 120000);
else if (verdict === 'dirty') { writeFileSync(path.join(root, 'left-behind.txt'), 'x'); green(); }
else if (verdict === 'commit') {
  writeFileSync(path.join(root, 'late.txt'), 'late');
  spawnSync('git', ['-C', root, 'add', 'late.txt']);
  spawnSync('git', ['-C', root, 'commit', '-q', '-m', 'late']);
  green();
} else if (verdict === '0') green();
else {
  console.log('GREEN  other/selftest.mjs (exit 0)\\nRED    fake/selftest.mjs (exit 1)\\n    BOOM-MARK\\n1/2 green');
  process.exit(Number(verdict));
}
`;

const scratchRoot = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'worktree-landing-')));
process.on('exit', () => rmSync(scratchRoot, { recursive: true, force: true }));

/**
 * FAIL-FAST, for the mutation campaign only. A mutant is killed by ONE failed assertion, and this selftest
 * takes about 40 s because every state builds real git repositories, so letting a killed mutant run the other
 * assertions to the end is most of a campaign's time. `WORKTREE_LANDING_SELFTEST_FAIL_FAST=1`, set by
 * `mutants.mjs`, ends the run at the first failure (exit 1, the failure printed first). A run with no such
 * variable always completes, so a human or a gate still sees EVERY failure.
 * @es FALLO RÁPIDO, solo para la campaña de mutantes. Un mutante muere con UNA aserción fallida, y este
 * selftest tarda unos 40 s porque cada estado construye repositorios git reales; dejar que un mutante muerto
 * ejecute las demás aserciones es la mayor parte del tiempo de una campaña. Con la variable fijada por
 * `mutants.mjs` la corrida termina en el primer fallo; sin ella siempre se completa y se ven TODOS los fallos.
 */
const FAIL_FAST = process.env.WORKTREE_LANDING_SELFTEST_FAIL_FAST === '1';
writeFileSync(path.join(scratchRoot, 'gitconfig'), '');
process.env.GIT_CONFIG_GLOBAL = path.join(scratchRoot, 'gitconfig');
process.env.GIT_CONFIG_NOSYSTEM = '1';
process.env.GIT_AUTHOR_NAME = 'fixture';
process.env.GIT_AUTHOR_EMAIL = 'fixture@example.invalid';
process.env.GIT_COMMITTER_NAME = 'fixture';
process.env.GIT_COMMITTER_EMAIL = 'fixture@example.invalid';

let failures = 0;
let assertions = 0;
let fixtures = 0;

/**
 * Records one assertion and reports it when it fails.
 * @es Registra una aserción y la informa cuando falla.
 */
function check(ok, label) {
  assertions += 1;
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label} @es FALLO ${label}`);
    if (FAIL_FAST) process.exit(1);
  }
}

/** Runs git in a fixture and requires success: a broken fixture must crash the selftest, never pass it. @es Ejecuta git y exige éxito. */
function must(cwd, ...args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
  if (result.status !== 0) throw new Error(`fixture git ${args.join(' ')} failed in ${cwd}: ${result.stderr}${result.error?.message ?? ''}`);
  return result.stdout.trim();
}

/** Writes a fixture file, creating its directories. @es Escribe un fichero del fixture. */
function put(root, relative, content) {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), content);
}

/** Writes a hook into the bare remote. @es Escribe un hook en el remoto bare. */
function hook(remote, name, body) {
  writeFileSync(path.join(remote, 'hooks', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

/**
 * The starting point every fixture shares: a bare remote and a main clone on `master`, one base commit,
 * pushed. It is built ONCE with real git and COPIED per fixture, because building it per fixture cost ten
 * git processes each and, on Windows, process creation is what a run is made of (MEASURED: building and
 * measuring fixtures was half of this selftest's 55 s, and a mutation campaign repeats the whole selftest
 * for every mutant). Only the main clone's recorded remote URL names a path, so the copy points it at its own remote.
 * @es El punto de partida común de todos los fixtures: un remoto bare y un clon principal en `master`, con
 * un commit base, empujado. Se construye UNA vez con git de verdad y se COPIA por fixture, porque
 * construirlo cada vez costaba diez procesos git y, en Windows, crear procesos es de lo que está hecha una
 * corrida (MEDIDO: construir y medir fixtures era la mitad de los 55 s, y una campaña repite el selftest
 * entero por cada mutante). Solo la URL del remoto del clon principal nombra una ruta, y la copia la apunta a su propio remoto.
 */
const seed = (() => {
  const base = path.join(scratchRoot, 'seed');
  const remote = path.join(base, 'remote.git');
  const main = path.join(base, 'main');

  mkdirSync(base);
  must(base, 'init', '--bare', '-q', '-b', 'master', remote);
  must(base, 'init', '-q', '-b', 'master', main);
  put(main, 'selftest-runner/run.mjs', FAKE_RUNNER);
  put(main, 'verdict', '0\n');
  put(main, 'a.txt', 'a\n');
  put(main, 'z.txt', 'z\n');
  put(main, '.gitignore', 'gen/\nignored/\n');
  must(main, 'add', '-A');
  must(main, 'commit', '-q', '-m', 'base');
  must(main, 'remote', 'add', 'origin', remote);
  must(main, 'push', '-q', 'origin', 'master');

  return { base, remote, main };
})();

/**
 * Copies the seed, then adds a worktree on branch `work`. `work` files are committed in the worktree;
 * `forced` ones are committed with `add -f` (ignored in the main).
 * @es Copia la semilla y le añade un worktree en la rama `work`. Los ficheros de `work` se commitean en el
 * worktree; los `forced` con `add -f` (ignorados en el principal).
 */
function layout({ work = {}, forced = {}, removed = [] } = {}) {
  fixtures += 1;
  const base = path.join(scratchRoot, `f${fixtures}`);
  mkdirSync(base);
  const remote = path.join(base, 'remote.git');
  const main = path.join(base, 'main');
  const worktree = path.join(base, 'work');
  cpSync(seed.remote, remote, { recursive: true });
  cpSync(seed.main, main, { recursive: true });
  must(main, 'remote', 'set-url', 'origin', remote);
  must(main, 'worktree', 'add', '-q', '-b', 'work', worktree, 'master');
  for (const [name, content] of Object.entries(work)) put(worktree, name, content);
  for (const [name, content] of Object.entries(forced)) put(worktree, name, content);
  for (const name of removed) must(worktree, 'rm', '-q', name);
  if (Object.keys(work).length + Object.keys(forced).length + removed.length > 0) {
    must(worktree, 'add', '-A');
    for (const name of Object.keys(forced)) must(worktree, 'add', '-f', name);
    must(worktree, 'commit', '-q', '-m', 'work');
  }
  return { base, remote, main, worktree };
}

/**
 * A branch tip read from the files git keeps (the loose ref, else `packed-refs`), not through a git process:
 * the value is the same and a read costs microseconds where a `rev-parse` or an `ls-remote` (a transport
 * round trip) cost 30 to 110 ms each. A ref that is nowhere crashes the selftest, like a broken fixture.
 * @es Un extremo de rama leído de los ficheros de git (la ref suelta, o `packed-refs`), no con un proceso
 * git: el valor es el mismo y una lectura cuesta microsegundos donde un `rev-parse` o un `ls-remote` cuestan
 * de 30 a 110 ms. Una ref que no está en ningún sitio hace fallar el selftest, como un fixture roto.
 */
function refOf(gitDir, ref) {
  const loose = path.join(gitDir, ...ref.split('/'));
  if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
  const packed = path.join(gitDir, 'packed-refs');
  const line = existsSync(packed) ? readFileSync(packed, 'utf8').split('\n').find((entry) => entry.endsWith(` ${ref}`)) : undefined;
  if (line === undefined) throw new Error(`ref ${ref} is neither loose nor packed in ${gitDir}`);
  return line.split(' ')[0];
}

/** Every file under `directory` but `.git`, with its content hash: the whole working tree, ignored files included. @es Todos los ficheros salvo `.git`, con el hash de su contenido. */
function treeDigest(directory, prefix = '') {
  return readdirSync(path.join(directory, prefix), { withFileTypes: true })
    .filter((entry) => entry.name !== '.git' || prefix !== '')
    .flatMap((entry) => {
      const relative = path.posix.join(prefix, entry.name);
      return entry.isDirectory() ? treeDigest(directory, relative) : [`${relative}:${createHash('sha1').update(readFileSync(path.join(directory, relative))).digest('hex')}`];
    })
    .sort();
}

/** The shared branch tip, the remote tip, HEAD, and every file of the main checkout: what a refusal must not move. @es Lo que un rechazo no debe mover. */
function snapshotOf(fixture) {
  const gitDir = path.join(fixture.main, '.git');
  return JSON.stringify([refOf(gitDir, 'refs/heads/master'), refOf(fixture.remote, 'refs/heads/master'), readFileSync(path.join(gitDir, 'HEAD'), 'utf8'), treeDigest(fixture.main)]);
}

/** Lands the fixture through the exported function. @es Aterriza el fixture con la función exportada. */
function landFixture(fixture, extra = {}) {
  return land({ worktree: fixture.worktree, main: fixture.main, branch: 'master', remote: 'origin', ...extra });
}

/** Runs the real command line. @es Ejecuta la línea de órdenes real. */
function cli(...args) {
  return spawnSync(process.execPath, [LAND, ...args], { encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
}

/** A fixture's arguments on the command line. @es Los argumentos de un fixture en la línea de órdenes. */
function argsOf(fixture) {
  return ['--worktree', fixture.worktree, '--main', fixture.main, '--branch', 'master', '--remote', 'origin'];
}

/**
 * Asserts a refusal: its exit, its designed reason line, an expected text, and that nothing moved.
 * @es Comprueba un rechazo: su salida, su razón diseñada, un texto esperado y que nada se movió.
 */
function expectRefused(name, fixture, { exitCode = 2, label = 'REFUSED', reason, text, extra }) {
  const before = snapshotOf(fixture);
  const result = landFixture(fixture, extra);
  const report = result.lines.join('\n');
  check(result.exitCode === exitCode, `${name}: exit ${exitCode}, got ${result.exitCode}: ${report}`);
  check(result.lines[0] === `${label} [${reason}]`, `${name}: first line names the reason ${reason}: ${result.lines[0]}`);
  check(report.includes(text), `${name}: the report says "${text}": ${report}`);
  check(report.includes('@es '), `${name}: the report is bilingual: ${report}`);
  check(result.lines.at(-1) === 'Nothing landed. @es No aterrizó nada.', `${name}: the report ends saying nothing landed`);
  check(snapshotOf(fixture) === before, `${name}: neither the shared branch, the main checkout, nor the remote moved`);
  return report;
}

/** Asserts a landing: exit 0, the range line, and both tips at the worktree HEAD. @es Comprueba un aterrizaje. */
function expectLanded(name, fixture, result = landFixture(fixture)) {
  const head = refOf(path.join(fixture.main, '.git'), 'refs/heads/work');
  const report = result.lines.join('\n');
  check(result.exitCode === 0, `${name}: exit 0, got ${result.exitCode}: ${report}`);
  check(result.lines[0].startsWith('LANDED ') && result.lines[0].includes(`..${head} on master`), `${name}: the report names the landed range: ${report}`);
  check(refOf(path.join(fixture.main, '.git'), 'refs/heads/master') === head, `${name}: the shared branch is at the worktree HEAD`);
  check(refOf(fixture.remote, 'refs/heads/master') === head, `${name}: the remote tip is the worktree HEAD`);
  return report;
}

/** A fixture file's content, or undefined when it is absent, so a wrong state fails an assertion and never crashes the run. @es Contenido de un fichero, o undefined si falta. */
function read(root, relative) {
  const file = path.join(root, relative);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

try {
  // ── The happy path, and the landed range ──────────────────────────────────────────────────────
  const happy = layout({ work: { 'a.txt': 'a2\n', 'b.txt': 'b\n' } });
  const happyTip = must(happy.main, 'rev-parse', 'master');
  const happyReport = expectLanded('happy path', happy);
  check(happyReport.includes(`LANDED ${happyTip}..`) && happyReport.includes('(1 commit(s))') && happyReport.includes(' work'), `happy path: the range starts at the old tip and lists the landed commit: ${happyReport}`);
  check(read(happy.main, 'b.txt') === 'b\n' && read(happy.main, 'a.txt') === 'a2\n', 'happy path: the main working tree holds the landed files');

  // ── Near miss: a branch exactly at the tip lands nothing and refuses nothing ─────────────────
  const atTip = layout();
  const atTipReport = expectLanded('exactly at the tip', atTip);
  check(atTipReport.includes('(0 commit(s))'), `exactly at the tip: zero commits land: ${atTipReport}`);

  // ── The worktree ──────────────────────────────────────────────────────────────────────────────
  const modified = layout({ work: { 'b.txt': 'b\n' } });
  put(modified.worktree, 'a.txt', 'uncommitted\n');
  expectRefused('worktree with a modified file', modified, { reason: 'worktree-uncommitted', text: '    a.txt' });

  const untracked = layout({ work: { 'b.txt': 'b\n' } });
  put(untracked.worktree, 'new.txt', 'n\n');
  expectRefused('worktree with an untracked file', untracked, { reason: 'worktree-uncommitted', text: '    new.txt' });

  const ignoredInWork = layout({ work: { 'b.txt': 'b\n' } });
  put(ignoredInWork.worktree, 'ignored/x.txt', 'x\n');
  expectLanded('near miss: an ignored file in the worktree', ignoredInWork);

  // ── Which two checkouts ───────────────────────────────────────────────────────────────────────
  const same = layout();
  expectRefused('the same checkout twice', { ...same, worktree: same.main }, { reason: 'same-checkout', text: 'are the same checkout' });

  const separate = layout();
  const clone = path.join(separate.base, 'clone');
  must(separate.base, 'clone', '-q', separate.remote, clone);
  expectRefused('a separate clone', { ...separate, worktree: clone }, { reason: 'different-repository', text: 'is not a worktree of the repository' });

  // ── The main checkout ─────────────────────────────────────────────────────────────────────────
  const offBranch = layout({ work: { 'b.txt': 'b\n' } });
  must(offBranch.main, 'switch', '-q', '-c', 'other');
  expectRefused('main checkout off the shared branch', offBranch, { reason: 'main-not-on-shared-branch', text: 'is on other, not on the shared branch master' });

  const dirtyLanded = layout({ work: { 'a.txt': 'a2\n' } });
  put(dirtyLanded.main, 'a.txt', 'theirs\n');
  expectRefused('a landed path dirty in the main checkout', dirtyLanded, { reason: 'landed-path-dirty-in-main', text: '    a.txt' });
  check(read(dirtyLanded.main, 'a.txt') === 'theirs\n', 'a landed path dirty in the main checkout: their work is intact');

  const dirtyElsewhere = layout({ work: { 'a.txt': 'a2\n' } });
  put(dirtyElsewhere.main, 'z.txt', 'theirs\n');
  expectLanded('near miss: a dirty path that is not landed', dirtyElsewhere);
  check(read(dirtyElsewhere.main, 'z.txt') === 'theirs\n', 'near miss: their unlanded work survives the fast-forward');

  const untrackedLanded = layout({ work: { 'b.txt': 'b\n' } });
  put(untrackedLanded.main, 'b.txt', 'theirs\n');
  expectRefused('an untracked file at a landed path', untrackedLanded, { reason: 'landed-path-dirty-in-main', text: '    b.txt' });

  const ignoredDiffers = layout({ forced: { 'gen/out.txt': 'landed\n' } });
  put(ignoredDiffers.main, 'gen/out.txt', 'theirs\n');
  expectRefused('an ignored file with different content at a landed path', ignoredDiffers, { reason: 'ignored-file-differs-at-landed-path', text: '    gen/out.txt' });
  check(read(ignoredDiffers.main, 'gen/out.txt') === 'theirs\n', 'an ignored file with different content: it is intact');

  const ignoredSame = layout({ forced: { 'gen/out.txt': 'landed\n' } });
  put(ignoredSame.main, 'gen/out.txt', 'landed\n');
  expectLanded('near miss: an ignored file with identical content at a landed path', ignoredSame);

  // ── The range ─────────────────────────────────────────────────────────────────────────────────
  const behind = layout({ work: { 'b.txt': 'b\n' } });
  put(behind.main, 'c.txt', 'c\n');
  must(behind.main, 'add', 'c.txt');
  must(behind.main, 'commit', '-q', '-m', 'moved');
  const behindHead = must(behind.worktree, 'rev-parse', 'HEAD');
  const behindTip = must(behind.main, 'rev-parse', 'master');
  const behindBase = must(behind.main, 'merge-base', 'master', 'work');
  const behindReport = expectRefused('the shared tip moved', behind, { reason: 'shared-tip-not-contained', text: `does not contain the current tip ${behindTip}` });
  check(behindReport.includes(`git -C "${behind.worktree}" switch -c work-onto-${behindTip.slice(0, 7)} ${behindTip}`), `the shared tip moved: the replay branch command is printed: ${behindReport}`);
  check(behindReport.includes(`git -C "${behind.worktree}" cherry-pick ${behindBase}..${behindHead}`), `the shared tip moved: the replay cherry-pick command is printed: ${behindReport}`);
  check(must(behind.worktree, 'rev-parse', 'HEAD') === behindHead, 'the shared tip moved: nothing was replayed automatically');

  const remoteAhead = layout({ work: { 'b.txt': 'b\n' } });
  const other = path.join(remoteAhead.base, 'other');
  must(remoteAhead.base, 'clone', '-q', remoteAhead.remote, other);
  put(other, 'r.txt', 'r\n');
  must(other, 'add', 'r.txt');
  must(other, 'commit', '-q', '-m', 'elsewhere');
  must(other, 'push', '-q', 'origin', 'master');
  expectRefused('the remote tip moved', remoteAhead, { reason: 'remote-tip-not-contained', text: 'which the worktree HEAD' });

  // ── The verification ──────────────────────────────────────────────────────────────────────────
  const red = layout({ work: { verdict: '1\n' } });
  const redReport = expectRefused('verification red', red, { exitCode: 1, label: 'RED', reason: 'verification-red', text: 'RED    fake/selftest.mjs (exit 1)' });
  check(redReport.includes('BOOM-MARK') && !redReport.includes('GREEN  other/selftest.mjs'), `verification red: the red lines are printed and the green ones are not: ${redReport}`);

  expectRefused('verification not measured', layout({ work: { verdict: '2\n' } }), { reason: 'verification-not-measured', text: 'ended with exit 2' });
  expectRefused('verification timed out', layout({ work: { verdict: 'hang\n' } }), { reason: 'verification-timed-out', text: `did not finish within ${HANG_TIMEOUT_MS / 1000}s`, extra: { verifyTimeoutMs: HANG_TIMEOUT_MS } });
  expectRefused('no test command', layout({ work: { 'b.txt': 'b\n' }, removed: ['selftest-runner/run.mjs'] }), { reason: 'test-command-missing', text: 'has no test command' });
  expectRefused('the head moved while verifying', layout({ work: { verdict: 'commit\n' } }), { reason: 'moved-during-verification', text: 'what would land is not what was verified' });
  expectRefused('the verification left the worktree dirty', layout({ work: { verdict: 'dirty\n' } }), { reason: 'worktree-uncommitted', text: '    left-behind.txt' });

  // ── The publication ───────────────────────────────────────────────────────────────────────────
  const rejected = layout({ work: { 'b.txt': 'b\n' } });
  hook(rejected.remote, 'pre-receive', 'exit 1');
  const rejectedRemote = must(rejected.main, 'ls-remote', 'origin', 'refs/heads/master');
  const rejectedResult = landFixture(rejected);
  const rejectedReport = rejectedResult.lines.join('\n');
  check(rejectedResult.exitCode === 2 && rejectedResult.lines[0] === 'REFUSED [push-failed]', `push rejected: exit 2 naming push-failed: ${rejectedReport}`);
  check(rejectedReport.includes('is now at the VERIFIED commit') && rejectedReport.includes('@es '), `push rejected: the report says the branch holds the verified commit, unpublished: ${rejectedReport}`);
  check(must(rejected.main, 'ls-remote', 'origin', 'refs/heads/master') === rejectedRemote, 'push rejected: the remote did not move');

  const reverted = layout({ work: { 'b.txt': 'b\n' } });
  hook(reverted.remote, 'post-receive', 'while read old new ref; do git update-ref "$ref" "$old"; done');
  const revertedResult = landFixture(reverted);
  const revertedReport = revertedResult.lines.join('\n');
  check(revertedResult.exitCode === 2 && revertedResult.lines[0] === 'REFUSED [remote-tip-mismatch]', `remote tip not the landed commit: exit 2 naming remote-tip-mismatch: ${revertedReport}`);
  check(revertedReport.includes('the landing is NOT confirmed'), `remote tip not the landed commit: the report says it is not confirmed: ${revertedReport}`);

  // ── The command line ──────────────────────────────────────────────────────────────────────────
  const viaCli = layout({ work: { 'b.txt': 'b\n' } });
  const cliBefore = snapshotOf(viaCli);
  const checked = cli(...argsOf(viaCli), '--check');
  check(checked.status === 0 && checked.stdout.startsWith('READY ') && checked.stdout.includes('nothing was landed'), `check mode: exit 0 READY: ${checked.status} ${checked.stdout}${checked.stderr}`);
  check(snapshotOf(viaCli) === cliBefore, 'check mode: nothing moved');
  const landedViaCli = cli(...argsOf(viaCli));
  expectLanded('the command line lands', viaCli, { exitCode: landedViaCli.status, lines: landedViaCli.stdout.trimEnd().split('\n') });

  const refusedViaCli = layout({ work: { verdict: '1\n' } });
  const redViaCli = cli(...argsOf(refusedViaCli));
  check(redViaCli.status === 1 && redViaCli.stderr.startsWith('RED [verification-red]'), `the command line exits 1 on red: ${redViaCli.status} ${redViaCli.stderr}`);

  const usageCases = [
    ['an unknown option', [...argsOf(viaCli), '--skip-verification', 'yes']],
    ['an unknown flag', [...argsOf(viaCli), '--force']],
    ['a missing option', argsOf(viaCli).slice(0, 6)],
    ['a repeated option', [...argsOf(viaCli), '--branch', 'master']],
    ['an option with no value', [...argsOf(viaCli).slice(0, 6), '--remote']],
  ];
  for (const [name, args] of usageCases) {
    const refused = cli(...args);
    check(refused.status === 2 && refused.stderr.includes('Usage: node land.mjs') && refused.stderr.includes('@es Uso:'), `${name} is refused with the usage: ${refused.status} ${refused.stderr}`);
  }

  // ── The incident it closes is named ───────────────────────────────────────────────────────────
  check(readFileSync(LAND, 'utf8').includes(KEY), `land.mjs names the incident key ${KEY}`);
  check(existsSync(path.join(HERE, 'mutants.mjs')), 'the mutation campaign sits beside the selftest');
} finally {
  rmSync(scratchRoot, { recursive: true, force: true });
}

console.log(`${assertions - failures}/${assertions} assertions passed @es ${assertions - failures}/${assertions} aserciones correctas`);
process.exit(failures === 0 && assertions > 0 ? 0 : 1);
