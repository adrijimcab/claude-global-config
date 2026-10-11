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
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { discoverSelftests } from './discovery.mjs';
import { RUN, cli, fixtureKit } from './fixtures.mjs';
import { runSelftests } from './run.mjs';
import { writeLineSync } from './stream.mjs';
import { isolateState } from '../hook-state/locations.mjs';

// Every guard this selftest spawns or imports keeps its state in a temp directory: never the live one a real
// session reads, and never a line a previous run left behind.
// @es Cada guardia que este selftest lanza o importa guarda su estado en un directorio temporal: nunca en el
// vivo que lee una sesión real, ni con líneas de una corrida anterior.
isolateState('selftest-runner');

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

// ── Streaming: a line is delivered when its selftest ends, not when the whole run ends ─────────────
const streamed = repo({ tracked: { 'a/selftest.mjs': GREEN, 'b/selftest.mjs': RED, 'c/selftest.mjs': GREEN } });
const lines = [];
const linesSeenAtSpawn = [];
const watched = runSelftests({
  root: streamed,
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

const quiet = runSelftests({ root: streamed });
check(quiet.report.join('\n') === watched.report.join('\n'), 'without a hook the report is the same, so existing callers are unaffected');

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

// ── Nothing to filter with ───────────────────────────────────────────────────────────────────────
const filtered = cli(allGreen, '--root', allGreen, '--only', 'a/selftest.mjs');
check(filtered.status === 2, `an option that would filter is refused: ${filtered.status}`);
check(filtered.stderr.startsWith('Usage: node run.mjs [--root <dir>].') && filtered.stderr.includes(' @es Uso:') && filtered.stdout === '', `the refusal is bilingual usage on stderr: ${filtered.stderr}`);

finish();
