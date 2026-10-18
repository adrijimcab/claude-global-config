#!/usr/bin/env node
/**
 * Selftest of the mutation runner: how it tells a kill by ASSERTION from a kill by CRASH, and what it does
 * with each. Part one drives the classifier with constructed run results; part two runs the real runner
 * over a fleet this file BUILDS (never one read from the repository), so the verdicts cannot drift with
 * the mechanisms the repository holds.
 * @es Selftest del corredor de mutantes: cómo distingue una muerte por ASERCIÓN de una por CRASH y qué hace
 * con cada una. La parte uno alimenta al clasificador con resultados construidos; la parte dos corre el
 * corredor real sobre un fleet que este fichero CONSTRUYE, nunca uno leído del repositorio.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { classifyKill } from './kill-kind.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER_URL = pathToFileURL(path.join(HERE, 'run-mutants.mjs')).href;

let assertions = 0;
let failures = 0;

function check(ok, label) {
  assertions += 1;
  if (ok) return;

  failures += 1;
  console.error(`FAIL ${label} @es FALLO ${label}`);
}

const FATAL_TAIL = '\n\nNode.js v22.22.0\n';
const run = (stdout, stderr, status = 1) => ({ status, signal: null, stdout, stderr });

// --- Part one: the classifier over every state it ranges over.
// @es Parte uno: el clasificador sobre cada estado de su dominio.

const asserted = classifyKill(run('PASS a\nFAIL b\n1/2 passed\n', ''));
check(asserted.kind === 'assertion', 'a reported failed check with a clean stderr is an ASSERTION kill');

const reportedOnStderr = classifyKill(run('', 'FAIL b @es FALLO b\n1 passed, 1 failed\n'));
check(reportedOnStderr.kind === 'assertion', 'a failure reported only on stderr is still an ASSERTION kill');

const thrown = classifyKill(run('PASS a\n', `/x/target.mjs:3\n  return missing.x;\n         ^\n\nReferenceError: missing is not defined\n    at decide (file:///x/target.mjs:3:10)${FATAL_TAIL}`));
check(thrown.kind === 'crash', 'an uncaught throw is a CRASH kill');
check(thrown.firstLine === 'ReferenceError: missing is not defined', 'and the crash names the thrown error, not the source excerpt above it');
check(JSON.stringify(thrown.frames) === JSON.stringify(['decide (file:///x/target.mjs:3:10)']), 'and it carries the frames of its trace, with the first one naming where it threw');
const longTrace = 'Error: x\n    at one (a.mjs:1:1)\n    at node:internal/modules/run_main:1:1\n    at two (b.mjs:2:2)\n    at three (c.mjs:3:3)\n    at four (d.mjs:4:4)\n';
check(classifyKill(run('', `${longTrace}${FATAL_TAIL}`)).frames?.join('|') === 'one (a.mjs:1:1)|two (b.mjs:2:2)|three (c.mjs:3:3)', 'at most three frames are kept and the ones that are the runtime internals are skipped');

const nearMiss = classifyKill(run('PASS a\n', `AssertionError [ERR_ASSERTION]: the decision is wrong\n    at file:///x/selftest.mjs:9:1${FATAL_TAIL}`));
check(nearMiss.kind === 'assertion', 'an uncaught AssertionError is an ASSERTION kill: node:assert IS the check');

const traceOnly = classifyKill(run('PASS a\nFAIL b\n', 'TypeError: handled\n    at somewhere (file:///x/y.mjs:1:1)\n'));
check(traceOnly.kind === 'assertion', 'a stack trace on stderr WITHOUT the fatal trailer is an ASSERTION kill: the selftest printed it itself, inside a failure report');

const reportWithTrace = classifyKill(run('', 'FAIL no test command: exit 2, got 1: RED [verification-red]\n    at TracingChannel.traceSync (node:diagnostics_channel:328:14)\n'));
check(reportWithTrace.kind === 'assertion', 'a failed check that embeds the trace of the code it observed (a report quoting a child) is an ASSERTION kill');

const thrownString = classifyKill(run('PASS a\n', `/x/target.mjs:3\nthrow 'boom';\n^\nboom\n(Use node --trace-uncaught to show where the exception was thrown)${FATAL_TAIL}`));
check(thrownString.kind === 'crash', 'an uncaught throw of a non-Error carries the fatal trailer and no stack frame: still a CRASH');
check(thrownString.firstLine === '/x/target.mjs:3', 'and with no named error the crash falls back to the first printed line');

const silent = classifyKill(run('', ''));
check(silent.kind === 'crash' && silent.firstLine.includes('no output'), 'a non-zero exit that printed nothing reported no check: CRASH');

const exitedZero = classifyKill(run('all fine\n', '', 0));
check(exitedZero.kind === 'none', 'an exit 0 is not a kill at all');

// --- Part two: the real runner over a constructed fleet.
// @es Parte dos: el corredor real sobre un fleet construido.

const FLEET_SELFTEST = `
import { decide, tag } from './target.mjs';
import assert from 'node:assert';

let failed = 0;
const check = (ok, label) => { if (!ok) { failed += 1; console.log('FAIL ' + label); } };

check(decide(5) === true, 'positive');
check(decide(0) === false, 'zero is not positive');
if (process.env.NEVER_SET) assert.strictEqual(tag(), 'x');
console.log(tag.length + '/' + tag.length + ' ignored');
process.exit(failed === 0 ? 0 : 1);
`;

const FLEET_TARGET = `
export function decide(x) {
  return x > 0;
}

export function tag() {
  return 'unobserved-detail';
}
`;

function buildFleet() {
  const root = mkdtempSync(path.join(tmpdir(), 'mutation-runner-selftest-'));

  mkdirSync(path.join(root, 'thing'));
  writeFileSync(path.join(root, 'thing', 'target.mjs'), FLEET_TARGET);
  writeFileSync(path.join(root, 'thing', 'selftest.mjs'), FLEET_SELFTEST);
  // The fixture is a fleet of its own, so its campaign derives the fleet from it and never from the caller's environment.
  mkdirSync(path.join(root, 'selftest-runner'));
  writeFileSync(path.join(root, 'selftest-runner', 'run.mjs'), '// the fixture runner marks this tree as a fleet\n');

  return root;
}

function campaignOver(root, mutants, extraOptions = '') {
  const file = path.join(root, 'campaign.mjs');

  writeFileSync(
    file,
    `import { runMutants } from ${JSON.stringify(RUNNER_URL)};
const survivors = runMutants({ fleetRoot: ${JSON.stringify(root)}, paths: ['thing'], selftest: 'thing/selftest.mjs', mutants: ${JSON.stringify(mutants)}${extraOptions} });
process.exit(survivors === 0 ? 0 : 1);
`
  );

  return spawnSync(process.execPath, [file], { encoding: 'utf8', timeout: 120_000 });
}

const ASSERTION_MUTANT = ['the comparison admits zero', 'thing/target.mjs', 'return x > 0;', 'return x >= 0;'];
const CRASH_MUTANT = ['the decision reads a name that does not exist', 'thing/target.mjs', 'return x > 0;', 'return missing.value;'];
const SURVIVOR_MUTANT = ['an unobserved detail changes', 'thing/target.mjs', "'unobserved-detail'", "'other-detail'"];

const root = buildFleet();

try {
  const mixed = campaignOver(root, [ASSERTION_MUTANT, CRASH_MUTANT]);

  check(mixed.status === 0, `a campaign whose crash kill is only reported exits 0 by default (exit ${mixed.status})`);
  check(/^KILLED   the comparison admits zero/m.test(mixed.stdout), 'an assertion kill is printed as KILLED');
  check(/^CRASHED  the decision reads a name that does not exist .*ReferenceError: missing is not defined/m.test(mixed.stdout), 'a crash kill is printed as CRASHED with the first line of its stderr');
check(/^CRASHED  .* \[at .*target\.mjs:\d+:\d+/m.test(mixed.stdout), 'and with the frame that threw, so the place to harden is known');
  check(mixed.stdout.includes('2/2 mutants killed (1 by assertion, 1 by crash)'), 'the tally separates assertion kills from crash kills');
  check(mixed.stdout.includes('WEAK PROOF'), 'a campaign holding a crash kill says so in its closing lines');

  const strict = campaignOver(root, [ASSERTION_MUTANT, CRASH_MUTANT], ", crashKills: 'fail'");

  check(strict.status === 1, 'with crashKills "fail" a crash kill fails the campaign');
  check(strict.stdout.includes('2/2 mutants killed (1 by assertion, 1 by crash)'), 'and the tally is the same, so the policy changes the verdict, not the measurement');

  const clean = campaignOver(root, [ASSERTION_MUTANT], ", crashKills: 'fail'");

  check(clean.status === 0 && !clean.stdout.includes('WEAK PROOF'), 'a campaign of assertion kills passes even under "fail" and prints no warning');

  const survived = campaignOver(root, [ASSERTION_MUTANT, SURVIVOR_MUTANT]);

  check(survived.status === 1 && /^SURVIVED an unobserved detail changes/m.test(survived.stdout), 'a survivor still fails the campaign and is printed as SURVIVED');

  const invalid = campaignOver(root, [ASSERTION_MUTANT], ", crashKills: 'maybe'");

  check(invalid.status === 2 && invalid.stderr.includes('crashKills'), 'an unknown crashKills value measures nothing (exit 2) instead of picking a policy');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(`${assertions - failures}/${assertions} assertions passed @es ${assertions - failures}/${assertions} aserciones correctas`);
process.exit(failures === 0 ? 0 : 1);
