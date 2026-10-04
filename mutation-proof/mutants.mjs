#!/usr/bin/env node
/**
 * The decisions of the mutation runner's assertion/crash classification, each broken once, that
 * `selftest.mjs` must catch. The runner mutates a COPY of `mutation-proof/`, so this campaign runs the
 * runner on itself. Every mutant keeps the code runnable and changes what it DECIDES, so a kill is an
 * assertion kill, never a crash.
 * @es Las decisiones de la clasificación aserción/crash del corredor, rotas una a una, que `selftest.mjs`
 * debe cazar. El corredor muta una COPIA de `mutation-proof/`: esta campaña lo corre sobre sí mismo. Cada
 * mutante deja el código ejecutable y cambia lo que DECIDE, así que toda muerte es por aserción.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from './run-mutants.mjs';

const KIND = 'mutation-proof/kill-kind.mjs';
const RUNNER = 'mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- THE CLASSIFIER: what makes a red a crash.
  ['an exit 0 is classified as a kill', KIND, "if (run.status === 0) return { kind: 'none' };", 'if (false) return { kind: "none" };'],
  ['a silent non-zero exit is read as an assertion', KIND, 'if (stdout.trim().length === 0 && stderr.trim().length === 0) return {', 'if (false) return {'],
  ['a failure reported only on stderr is read as silent', KIND, 'stdout.trim().length === 0 && stderr.trim().length === 0', 'stdout.trim().length === 0 || stderr.trim().length === 0'],
  ['an uncaught AssertionError is read as a crash', KIND, "  if (ASSERTION_ERROR.test(stderr)) return { kind: 'assertion' };\n", ''],
  ['the fatal trailer alone no longer makes a crash', KIND, '!FATAL_TRAILER.test(stderr) && !STACK_FRAME.test(stderr)', '!STACK_FRAME.test(stderr)'],
  ['a stack trace without the trailer no longer makes a crash', KIND, '!FATAL_TRAILER.test(stderr) && !STACK_FRAME.test(stderr)', '!FATAL_TRAILER.test(stderr)'],
  ['a crash needs both signals instead of either', KIND, '!FATAL_TRAILER.test(stderr) && !STACK_FRAME.test(stderr)', '!FATAL_TRAILER.test(stderr) || !STACK_FRAME.test(stderr)'],
  ['the crash line is the source excerpt instead of the named error', KIND, 'if (named !== null) return named[0].trimEnd();', 'if (false) return named[0].trimEnd();'],
  ['a crash with no named error reports nothing', KIND, "return stderr.split('\\n').find((line) => line.trim().length > 0)?.trimEnd() ?? '';", "return '';"],

  // --- THE FRAMES: where a crash was thrown.
  ['the crash keeps one frame instead of three', KIND, 'const FRAMES_REPORTED = 3;', 'const FRAMES_REPORTED = 1;'],
  ["the runtime's own frames are reported as the place that threw", KIND, ' && !NODE_INTERNAL_FRAME.test(line))', ')'],
  ['the frame keeps its leading "at"', KIND, ".map((line) => line.trim().replace(/^at /, ''));", '.map((line) => line.trim());'],
  ['the crash line never names where it was thrown', RUNNER, "frames === undefined || frames.length === 0 ? '' :", "true ? '' :"],

  // --- THE RUNNER: what the classification does to the verdict.
  ['a crash is never recognised by the runner', RUNNER, "const kill = killed ? classifyKill(verdict.run) : { kind: 'none' };", "const kill = { kind: 'none' };"],
  ['a survivor is counted as an assertion kill', RUNNER, "return killed ? 'assertion' : 'survived';", "return 'assertion';"],
  ['the crash count is dropped from the tally', RUNNER, "if (kind === 'assertion' || kind === 'crash') tally[kind] += 1;", "if (kind === 'assertion') tally[kind] += 1;"],
  ['the weak-proof notice is never printed', RUNNER, 'if (tally.crash > 0) console.log(', 'if (false) console.log('],
  ['the weak-proof notice is printed for every campaign', RUNNER, 'if (tally.crash > 0) console.log(', 'if (tally.crash >= 0) console.log('],
  ['the default policy fails on a crash', RUNNER, "crashKills = 'report' }", "crashKills = 'fail' }"],
  ['the fail policy never counts a crash as a survivor', RUNNER, "(crashKills === 'fail' ? tally.crash : 0)", '0'],
  ['an unknown policy is accepted', RUNNER, 'if (!CRASH_POLICIES.has(crashKills)) throw', 'if (false) throw'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['mutation-proof'],
  selftest: 'mutation-proof/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
