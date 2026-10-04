#!/usr/bin/env node
/**
 * The decisions of `baseline-record/options.mjs`, each broken once, that `options.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `options.mjs`, rotas una a una, que `options.selftest.mjs` debe detectar. Un mutante
 * que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const O = 'baseline-record/options.mjs';

const MUTANTS = [
  // --- the real machine ---
  ['the machine home is not the OS home', O, 'home: homedir(), tmp', "home: 'nowhere', tmp"],
  ['the machine temp directory is not the OS one', O, 'tmp: tmpdir(), fleet', "tmp: 'nowhere', fleet"],
  ['the machine fleet is the directory of this module', O, "path.dirname(fileURLToPath(import.meta.url)), '..')", 'path.dirname(fileURLToPath(import.meta.url)))'],
  ['the machine fleet is two levels up', O, "path.dirname(fileURLToPath(import.meta.url)), '..')", "path.dirname(fileURLToPath(import.meta.url)), '..', '..')"],

  // --- the defaults ---
  ['the Claude home is the machine home itself', O, "path.join(machine.home, '.claude');", 'machine.home;'],
  ['the Claude home is a different directory', O, "path.join(machine.home, '.claude');", "path.join(machine.home, '.claude-home');"],
  ['the fleet default is the Claude home', O, 'values.fleet ?? machine.fleet', 'values.fleet ?? home'],
  ['the projects root is Desktop only', O, "path.join(machine.home, 'Desktop', 'Projects')", "path.join(machine.home, 'Desktop')"],
  ['the projects root is Projects under the home', O, "path.join(machine.home, 'Desktop', 'Projects')", "path.join(machine.home, 'Projects')"],
  ['the latency timeout is in seconds', O, 'LATENCY_TIMEOUT_MS = 900_000', 'LATENCY_TIMEOUT_MS = 900'],
  ['the latency timeout is not carried into the options', O, 'latencyTimeoutMs: LATENCY_TIMEOUT_MS', 'latencyTimeoutMs: undefined'],
  ['the default run count is 2', O, "values.runs ?? '20'", "values.runs ?? '2'"],
  ['the default b100 is another project', O, "path.join(projectsRoot, 'b100-am-ui')", "path.join(projectsRoot, 'b100')"],
  ['the default b100 is not under the projects root', O, "path.join(projectsRoot, 'b100-am-ui')", "path.join(machine.home, 'b100-am-ui')"],
  ['the default discovery is another project', O, "path.join(projectsRoot, 'di_1700002_discovery_fe')", "path.join(projectsRoot, 'discovery')"],
  ['the default discovery is not under the projects root', O, "path.join(projectsRoot, 'di_1700002_discovery_fe')", "path.join(machine.home, 'di_1700002_discovery_fe')"],
  ['the backup git dir is not under .claude-backups', O, "path.join(machine.home, '.claude-backups', 'b100-am-ui-claude-tooling.git')", "path.join(machine.home, 'b100-am-ui-claude-tooling.git')"],
  ['the backup git dir is another repository', O, "'b100-am-ui-claude-tooling.git'", "'b100-am-ui.git'"],
  ['the default capture script is looked for in the machine home', O, "path.join(home, 'failure-capture', 'capture.mjs')", "path.join(machine.home, 'failure-capture', 'capture.mjs')"],
  ['the default capture script is another file', O, "'failure-capture', 'capture.mjs'", "'failure-capture', 'budget.mjs'"],
  ['the default replay script is looked for in the machine fleet', O, "path.join(fleet, 'hook-dispatch', 'replay.mjs')", "path.join(machine.fleet, 'hook-dispatch', 'replay.mjs')"],
  ['the default replay script is another file', O, "'hook-dispatch', 'replay.mjs'", "'hook-dispatch', 'dispatch.mjs'"],
  ['the temp directory is not carried', O, 'home, fleet, projectsRoot, runs, tmp: machine.tmp,', 'home, fleet, projectsRoot, runs, tmp: machine.home,'],
  ['the clock is not a time', O, 'now: () => new Date().toISOString()', "now: () => 'now'"],

  // --- the options given ---
  ['a given home is ignored', O, 'values.home ?? path.join', 'path.join'],
  ['a given fleet is ignored', O, 'values.fleet ?? machine.fleet', 'machine.fleet'],
  ['a given projects root is ignored', O, 'values.projects ?? path.join', 'path.join'],
  ['a given b100 is ignored', O, 'values.b100 ?? path.join', 'path.join'],
  ['a given discovery is ignored', O, 'values.discovery ?? path.join', 'path.join'],
  ['a given backup git dir is ignored', O, "values['backup-git-dir'] ?? path.join", 'path.join'],
  ['a given capture script is ignored', O, 'values.capture ?? path.join', 'path.join'],
  ['a given replay script is ignored', O, 'values.replay ?? path.join', 'path.join'],
  ['a given run count is ignored', O, "Number(values.runs ?? '20')", "Number('20')"],

  // --- the run count ---
  ['text is accepted as a run count', O, '!Number.isInteger(runs) || runs < 1', 'runs < 1'],
  ['a fractional run count is accepted', O, '!Number.isInteger(runs) || runs < 1', '!Number.isFinite(runs) || runs < 1'],
  ['zero runs are accepted', O, 'runs < 1) throw', 'runs < 0) throw'],
  ['one run is refused', O, 'runs < 1) throw', 'runs < 2) throw'],
  ['a run count is never refused', O, 'if (!Number.isInteger(runs) || runs < 1) throw', 'if (false) throw'],
  ['the refusal does not name the option', O, '`--runs must be a positive integer, got ${values.runs}`', '`bad count ${values.runs}`']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['baseline-record'],
  selftest: 'baseline-record/options.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
