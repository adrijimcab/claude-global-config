#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `baseline-record/options.mjs`: every default of `record.mjs`, proved against a
 * CONSTRUCTED machine description (never the real one), and every override.
 *
 * THE STATE SPACE: no option given (each default, derived from the machine's home, temp and fleet), each
 * option given alone (it wins over its default and moves the options derived from it: a custom home moves
 * the capture script, a custom fleet moves the replay script, a custom projects root moves b100 and
 * discovery), and the run count (default, valid, zero, negative, fractional, not a number).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `options.mjs`: cada valor por omisión de `record.mjs`, probado contra una
 * descripción de máquina CONSTRUIDA, y cada opción dada. Espacio de estados: ninguna opción, cada opción por
 * separado (gana al valor por omisión y mueve lo que deriva de ella) y el número de corridas.
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { optionsFrom } from './options.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns, or `threw: <message>`. @es Lo que devuelve `action`, o `threw: <mensaje>`. */
function outcome(action) {
  try {
    return action();
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

const MACHINE = { home: path.join('U', 'user'), tmp: path.join('T', 'tmp'), fleet: path.join('F', 'fleet') };
const given = (values = {}) => outcome(() => optionsFrom(values, MACHINE));
const { now, ...defaults } = given();

check('defaults: the Claude home is ~/.claude of the machine', defaults.home, path.join('U', 'user', '.claude'));
check('defaults: the fleet is the checkout the machine names', defaults.fleet, path.join('F', 'fleet'));
check('defaults: the projects root is Desktop/Projects of the machine home', defaults.projectsRoot, path.join('U', 'user', 'Desktop', 'Projects'));
check('defaults: b100 and discovery sit under the projects root', [defaults.b100, defaults.discovery], [path.join('U', 'user', 'Desktop', 'Projects', 'b100-am-ui'), path.join('U', 'user', 'Desktop', 'Projects', 'di_1700002_discovery_fe')]);
check('defaults: the backup git dir of the b100 tooling', defaults.backupGitDir, path.join('U', 'user', '.claude-backups', 'b100-am-ui-claude-tooling.git'));
check('defaults: the budget script is capture.mjs of the Claude home', defaults.capture, path.join('U', 'user', '.claude', 'failure-capture', 'capture.mjs'));
check('defaults: the replay script is the fleet\'s', defaults.replay, path.join('F', 'fleet', 'hook-dispatch', 'replay.mjs'));
check('defaults: 20 runs and the machine temp directory', [defaults.runs, defaults.tmp], [20, path.join('T', 'tmp')]);
check('defaults: the clock is a real ISO time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(now()), true);

const real = outcome(() => optionsFrom({}));

check('real machine: the Claude home is the OS home plus .claude', real.home, path.join(os.homedir(), '.claude'));
check('real machine: the temp directory is the OS one', real.tmp, os.tmpdir());
check('real machine: the fleet is the parent of the directory this module lives in', real.fleet, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
check('real machine: the projects root and the backup git dir hang from the OS home', [real.projectsRoot, real.backupGitDir], [path.join(os.homedir(), 'Desktop', 'Projects'), path.join(os.homedir(), '.claude-backups', 'b100-am-ui-claude-tooling.git')]);

const custom = { home: path.join('X', 'home'), fleet: path.join('X', 'fleet'), projects: path.join('X', 'projects'), b100: path.join('X', 'b'), discovery: path.join('X', 'd'), 'backup-git-dir': path.join('X', 'backup.git'), capture: path.join('X', 'c.mjs'), replay: path.join('X', 'r.mjs'), runs: '5' };
const all = given(custom);

check('overrides: every option given wins over its default', [all.home, all.fleet, all.projectsRoot, all.b100, all.discovery, all.backupGitDir, all.capture, all.replay, all.runs], [custom.home, custom.fleet, custom.projects, custom.b100, custom.discovery, custom['backup-git-dir'], custom.capture, custom.replay, 5]);
check('overrides: a custom home moves the default capture script', given({ home: path.join('X', 'home') }).capture, path.join('X', 'home', 'failure-capture', 'capture.mjs'));
check('overrides: a custom home does not move the fleet or the projects', [given({ home: path.join('X', 'home') }).fleet, given({ home: path.join('X', 'home') }).projectsRoot], [path.join('F', 'fleet'), path.join('U', 'user', 'Desktop', 'Projects')]);
check('overrides: a custom fleet moves the default replay script', given({ fleet: path.join('X', 'fleet') }).replay, path.join('X', 'fleet', 'hook-dispatch', 'replay.mjs'));
check('overrides: a custom projects root moves b100 and discovery', [given({ projects: 'P' }).b100, given({ projects: 'P' }).discovery], [path.join('P', 'b100-am-ui'), path.join('P', 'di_1700002_discovery_fe')]);
check('overrides: a custom b100 leaves discovery where the root puts it', [given({ b100: 'B' }).b100, given({ b100: 'B' }).discovery], ['B', path.join('U', 'user', 'Desktop', 'Projects', 'di_1700002_discovery_fe')]);
check('overrides: a custom discovery leaves b100 where the root puts it', [given({ discovery: 'D' }).discovery, given({ discovery: 'D' }).b100], ['D', path.join('U', 'user', 'Desktop', 'Projects', 'b100-am-ui')]);

check('runs: a valid count is a number', given({ runs: '7' }).runs, 7);
check('runs: zero is refused', /^threw: --runs must be a positive integer, got 0/.test(given({ runs: '0' })), true);
check('runs: a negative count is refused', /^threw: --runs/.test(given({ runs: '-3' })), true);
check('runs: a fractional count is refused', /^threw: --runs/.test(given({ runs: '2.5' })), true);
check('runs: text is refused', /^threw: --runs/.test(given({ runs: 'abc' })), true);
check('runs: one is the smallest valid count', given({ runs: '1' }).runs, 1);

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
