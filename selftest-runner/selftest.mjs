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
 *   - WHAT THE OPERATOR CAN CHOOSE: nothing. An option that would filter or skip is refused.
 *
 * @es Auto-test del runner de selftests de todo el repositorio, contra repos git CONSTRUIDOS aquí. Estados:
 * qué ficheros son selftests (patrones, casi-aciertos, sin seguir, ignorados directos o a profundidad 3),
 * qué raíz (absoluta, relativa, subdirectorio, no repo, nada descubierto), cómo termina uno (verde, salida
 * no cero, señal, timeout, fichero ausente) y qué puede elegir el operador (nada: se rechaza todo filtro).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverSelftests } from './discovery.mjs';
import { runSelftests } from './run.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.mjs');
const GREEN = 'process.exit(0)\n';
const RED = "console.log('BOOM-MARK'); process.exit(1)\n";
const sandboxes = [];
let failures = 0;
let assertions = 0;

/**
 * Records one assertion and reports it when it fails.
 * @es Registra una aserción y la informa cuando falla.
 * @param {boolean} ok
 * @param {string} label
 */
function check(ok, label) {
  assertions += 1;
  if (!ok) {
    failures += 1;
    console.error(`FAIL ${label} @es FALLO ${label}`);
  }
}

/** Runs git inside a fixture. @es Ejecuta git dentro de un fixture. */
function git(cwd, ...args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

/** A directory that is not inside any git repository. @es Directorio fuera de todo repo git. */
function bareDir() {
  const dir = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'selftest-runner-')));
  sandboxes.push(dir);
  return dir;
}

/** Writes a fixture file, creating its directories. @es Escribe un fichero del fixture, creando sus directorios. */
function put(root, relative, content) {
  mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  writeFileSync(path.join(root, relative), content);
}

/**
 * Builds a repository: `tracked` files are added to the index, `loose` files are written afterwards
 * (untracked, or ignored when `ignore` matches them).
 * @es Construye un repo: `tracked` va al índice; `loose` se escribe después (sin seguir, o ignorado).
 */
function repo({ tracked = {}, loose = {}, ignore = '' }) {
  const root = bareDir();
  git(root, 'init', '-q');
  put(root, '.gitignore', ignore);
  for (const [name, content] of Object.entries(tracked)) put(root, name, content);
  git(root, 'add', '-A');
  for (const [name, content] of Object.entries(loose)) put(root, name, content);
  const top = git(root, 'rev-parse', '--show-toplevel').stdout.trim();
  check(realpathSync.native(top) === root, `fixture is its own repository top level: ${root}`);
  return root;
}

/** Runs the real runner as a process. @es Ejecuta el runner real como proceso. */
function cli(cwd, ...args) {
  return spawnSync(process.execPath, [RUN, ...args], { cwd, encoding: 'utf8' });
}

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

// ── Verdict: red paths leave the rest running ────────────────────────────────────────────────────
const sentinel = 'later-selftest-ran';
const withRed = repo({
  tracked: {
    'a/selftest.mjs': RED,
    'z/selftest.mjs': `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(sentinel)}, 'ran');\n`,
  },
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
const timedOut = runSelftests({ root: slow, timeoutMs: 700 });
check(timedOut.exitCode === 1 && timedOut.report.join('\n').includes('timed out'), 'a selftest that outlives the timeout is RED');
check(timedOut.report.some((line) => /^RED\s+a\/selftest\.mjs \(exit timeout\)/.test(line)), 'the timed-out selftest is named RED with the timeout status');

const signalDeath = { status: null, signal: 'SIGKILL', stdout: '', stderr: '' };
const signalled = runSelftests({ root: allGreen, spawn: () => signalDeath });
check(signalled.exitCode === 1 && signalled.report.join('\n').includes('killed by SIGKILL'), 'a death by signal with no exit status is RED on every host');

const missing = repo({ tracked: { 'a/selftest.mjs': GREEN, 'b/selftest.mjs': GREEN } });
rmSync(path.join(missing, 'a', 'selftest.mjs'));
const gone = cli(missing, '--root', missing);
check(gone.status === 1 && /RED\s+a\/selftest\.mjs/.test(gone.stdout), 'a tracked selftest deleted from disk is RED, not omitted');
check(gone.stdout.includes('file missing on disk'), 'a deleted selftest is reported as missing, not run and failed by accident');

// ── Nothing to filter with ───────────────────────────────────────────────────────────────────────
const filtered = cli(allGreen, '--root', allGreen, '--only', 'a/selftest.mjs');
check(filtered.status === 2, `an option that would filter is refused: ${filtered.status}`);

for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true });
console.log(`selftest-runner selftest: ${assertions - failures}/${assertions} assertions passed @es aserciones superadas`);
process.exit(failures === 0 ? 0 : 1);
