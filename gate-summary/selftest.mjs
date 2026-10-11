#!/usr/bin/env node
/**
 * Discrimination proof of the gate summary, driven through its real command line over the state space the
 * verdict ranges over: clean green, green with error marks, a non-zero exit, a command that does not exist,
 * a command killed by the timeout, a huge log, and two runs at once. Each case is asserted on what it
 * prints, the exit code it returns and the log it leaves.
 *
 * @es Prueba de discriminación del resumen de gates, conducida por su línea de órdenes real sobre el
 * espacio de estados del veredicto: verde limpio, verde con marcas de error, salida distinta de cero, una
 * orden inexistente, una orden abatida por el límite de tiempo, un log enorme y dos corridas a la vez.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { messageProblems } from '../bilingual-output/message.mjs';
import { MESSAGES } from './messages.mjs';
import { isMarker, tail } from './markers.mjs';
import { parseOptions } from './options.mjs';
import { newRunId, openRun } from './run-directory.mjs';
import { resolveCommand } from './run-command.mjs';
import { classify, exitCodeOf } from './verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.mjs');
const FIXTURE = path.join(HERE, 'fixture-command.mjs');
const state = mkdtempSync(path.join(os.tmpdir(), 'gate-summary-selftest-'));

let passed = 0;
const failures = [];
const equal = (name, actual, expected) => (JSON.stringify(actual) === JSON.stringify(expected) ? (passed += 1) : failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));

/** Runs the summary and describes what it did. @es Corre el resumen y describe lo que hizo. */
function summarize(options, command) {
  const result = spawnSync(process.execPath, [RUN, '--state', state, ...options, '--', ...command], { encoding: 'utf8' });
  const lines = result.stdout.split('\n').filter((line) => line !== '');
  const log = lines.find((line) => line.startsWith('LOG='))?.slice(4);

  return { exit: result.status, head: lines[0]?.split(' ').slice(0, 2).join(' '), lines, log, logText: log !== undefined && existsSync(log) ? readFileSync(log, 'utf8') : '' };
}

const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const fixture = (mode) => [process.execPath, FIXTURE, mode];

const clean = summarize([], fixture('clean'));
equal('clean: GREEN with the real exit code', clean.head, 'GREEN EXIT=0');
equal('clean: exits 0', clean.exit, 0);
equal('clean: "0 errors" is not a marker, so nothing is excerpted', clean.lines.length, 2);
equal('clean: the full log ends with EXIT=', clean.logText.trimEnd().endsWith('EXIT=0'), true);

const marks = summarize([], fixture('marks'));
equal('marks: GREEN-WITH-MARKS, not GREEN', marks.head, 'GREEN-WITH-MARKS EXIT=0');
equal('marks: still exits 0', marks.exit, 0);
equal('marks: says so in both languages', marks.lines.some((line) => line.includes(' @es ') && line.startsWith('exit 0, but')), true);
equal('marks: the excerpt holds the marker line', marks.lines.includes('TypeError: swallowed in a logger'), true);
equal('marks: the excerpt does not hold a clean line', marks.lines.includes('still passed'), false);

const failed = summarize([], fixture('fail'));
equal('fail: RED with the command\'s own exit code', failed.head, 'RED EXIT=3');
equal('fail: exits with that code', failed.exit, 3);
equal('fail: excerpt holds the cause', failed.lines.includes('Error: the real cause'), true);

const missing = summarize([], ['definitely-not-a-command-gate-summary']);
equal('missing: NOT-RUN, never RED', missing.head, 'NOT-RUN EXIT=127');
equal('missing: exits 127', missing.exit, 127);
equal('missing: the explanation is bilingual', missing.lines.some((line) => line.includes('could not be started') && line.includes(' @es ')), true);

const killed = summarize(['--timeout', '1'], fixture('sleep'));
equal('killed: KILLED, never RED', killed.head, 'KILLED EXIT=124');
equal('killed: exits 124', killed.exit, 124);
equal('killed: the log still records EXIT=', killed.logText.trimEnd().endsWith('EXIT=124'), true);
equal('killed: says it is not a verdict about the code, in both languages', killed.lines.some((line) => line.startsWith('killed (timeout or signal)') && line.includes(' @es ')), true);
equal('every run prints the log path', clean.log !== undefined && clean.log.endsWith('output.log'), true);

const cwdDirectory = mkdtempSync(path.join(os.tmpdir(), 'gate-summary-cwd-'));
equal('--cwd: the command runs in that directory', summarize(['--cwd', cwdDirectory], fixture('cwd')).logText.includes(path.basename(cwdDirectory)), true);
rmSync(cwdDirectory, { recursive: true, force: true });
equal('stderr: is captured in the log and excerpted', summarize([], fixture('stderr')).lines.includes('Error: on stderr only'), true);

equal('classify: no exit code and no timeout is KILLED, never a pass', classify({ status: null, timedOut: false, error: undefined }, 0), 'KILLED');
equal('classify: no exit code returns 124', exitCodeOf('KILLED', { status: null }), 124);
equal('two ids made at the same instant differ', newRunId(new Date(0)) !== newRunId(new Date(0)), true);
equal('a run id that already has a directory is refused, not reused', ((id) => { openRun(state, () => id); return throws(() => openRun(state, () => id)); })('fixed-id'), true);

const huge = summarize(['--excerpt', '5'], fixture('huge'));
equal('huge: RED', huge.head, 'RED EXIT=1');
equal('huge: head + LOG + excerpt header + 5 lines, and nothing more', huge.lines.length, 8);
equal('huge: the excerpt is the END of the log', huge.lines.at(-1), 'Error: noisy line 19999');
equal('huge: the log on disk is complete', huge.logText.split('\n').length > 20000, true);
equal('huge: excerpt 0 prints no failure lines', summarize(['--excerpt', '0'], fixture('huge')).lines.length, 2);

const concurrent = await Promise.all([0, 1].map(() => new Promise((resolve) => {
  const child = spawn(process.execPath, [RUN, '--state', state, '--', ...fixture('fail')], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';

  child.stdout.on('data', (chunk) => { out += chunk; });
  child.on('close', () => resolve(out.split('\n').find((line) => line.startsWith('LOG='))));
})));
equal('concurrent: two runs, two distinct logs', new Set(concurrent).size, 2);
equal('concurrent: every log exists', concurrent.every((line) => line !== undefined && existsSync(line.slice(4))), true);

equal('usage: no command is refused', parseOptions(['--cwd', 'x']).problem, '--');
equal('usage: an empty command after -- is refused', parseOptions(['--']).problem, '--');
equal('usage: an unknown option is named', parseOptions(['--bogus', '1', '--', 'x']).problem, '--bogus');
equal('usage: an option without a value is named', parseOptions(['--cwd', '--', 'x']).problem, '--cwd');
equal('usage: a non-numeric excerpt is named', parseOptions(['--excerpt', 'abc', '--', 'x']).problem, '--excerpt');
equal('usage: the command keeps its own flags', parseOptions(['--', 'git', '--version']).argv, ['git', '--version']);
equal('usage: bad usage exits 2 and says so bilingually', ((result) => [result.status, result.stdout.includes(' @es ')])(spawnSync(process.execPath, [RUN, '--bogus'], { encoding: 'utf8' })), [2, true]);

equal('markers: a typed error name is a marker', isMarker('ReferenceError: x is not defined'), true);
equal('markers: npm ERR! is a marker', isMarker('npm ERR! code 1'), true);
equal('markers: FAILED is a marker', isMarker('3 tests FAILED'), true);
equal('markers: an identifier that merely contains "error" is not', isMarker('const errorHandler = 1'), false);
equal('markers: a clean count is not', isMarker('Found 0 errors.'), false);
equal('markers: tail keeps the end', tail(['a', 'b', 'c'], 2), ['b', 'c']);
equal('markers: tail cuts a long line', tail(['x'.repeat(400)], 1)[0].length, 301);
equal('npm resolves to node plus its CLI script, so no shell is needed', resolveCommand(['npm', 'run', 'x'])[0], process.execPath);
equal('other commands are untouched', resolveCommand(['git', 'status']), ['git', 'status']);
equal('every message keeps both halves', messageProblems(MESSAGES), []);

rmSync(state, { recursive: true, force: true });
console.log(`gate-summary selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
