#!/usr/bin/env node
/**
 * Proof that the gate-command rules DISCRIMINATE, and that every live gate obeys them. State space: each
 * package of the reporter table with its flag as `--flag value`, as `--flag=value`, absent, with no value
 * (last argument, followed by another flag, `--flag=` empty), and `tsc --pretty` with a value other than
 * `false`; a package outside the table; `eslint --quiet` and `--quiet=true`, and a `--quiet` on a package
 * where it is not banned; the flag spelled inside another argument; a call after `--cwd`; a command that is
 * not a launcher call; and the live gates.
 *
 * @es Prueba de que las reglas del comando de un gate DISCRIMINAN y de que todo gate real las cumple: cada
 * paquete con su flag en cada forma, ausente o sin valor, `tsc --pretty` con otro valor, un paquete fuera de la
 * tabla, `eslint --quiet` y `--quiet=true`, un `--quiet` donde no está prohibido, el flag dentro de otro
 * argumento, una llamada tras `--cwd`, un comando que no llama al lanzador, y los gates reales.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPORTER_FLAGS, commandProblems } from './gate-command-rules.mjs';
import { discoverGates, inspectGate, launcherCallOf } from './gate-layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** The problems of a launcher call of `tool` with `args`, as `id:detail`. @es Los problemas de una llamada. */
function problems(tool, ...args) {
  return commandProblems(['node', '../../run-tool.mjs', tool, ...args]).map((problem) => `${problem.id}:${problem.detail}`).join();
}

const VALUE = { typescript: 'false' };

for (const [tool, { flag }] of Object.entries(REPORTER_FLAGS)) {
  const value = VALUE[tool] ?? 'chosen';

  check(`${tool} with ${flag} <value> complies`, problems(tool, 'bin', flag, value, 'x') === '');
  check(`${tool} with ${flag}=<value> complies`, problems(tool, 'bin', `${flag}=${value}`, 'x') === '');
  check(`${tool} without ${flag} is not pinned`, problems(tool, 'bin', 'x').startsWith('reporter-not-pinned:'));
  check(`${tool} with ${flag} last and no value is not pinned`, problems(tool, 'bin', 'x', flag).startsWith('reporter-not-pinned:'));
  check(`${tool} with ${flag} followed by another flag is not pinned`, problems(tool, 'bin', flag, '--other', 'x').startsWith('reporter-not-pinned:'));
  check(`${tool} with an empty ${flag}= is not pinned`, problems(tool, 'bin', `${flag}=`, 'x').startsWith('reporter-not-pinned:'));
  check(`${tool} with ${flag} inside another argument is not pinned`, problems(tool, 'bin', `x${flag}`, value).startsWith('reporter-not-pinned:'));
}

check('a missing reporter names the package and flag', problems('eslint', 'eslint', 'x') === 'reporter-not-pinned:eslint --format');
check('tsc --pretty true is not pinned', problems('typescript', 'tsc', '--pretty', 'true') === 'reporter-not-pinned:typescript --pretty false');
check('tsc --pretty=true is not pinned', problems('typescript', 'tsc', '--pretty=true') === 'reporter-not-pinned:typescript --pretty false');
check('a package outside the table is refused and named', problems('left-pad', 'pad', '--format', 'x') === 'reporter-unknown:left-pad');
check('eslint --quiet is banned', problems('eslint', 'eslint', '--format', 'stylish', '--quiet', 'x') === 'quiet-flag:eslint --quiet');
check('eslint --quiet=true is banned', problems('eslint', 'eslint', '--format', 'stylish', '--quiet=true') === 'quiet-flag:eslint --quiet');
check('eslint --quiet without a reporter reports both', problems('eslint', 'eslint', '--quiet') === 'quiet-flag:eslint --quiet,reporter-not-pinned:eslint --format');
check('a word merely starting with --quiet is not the flag', problems('eslint', 'eslint', '--format', 'stylish', '--quietly') === '');
check('--quiet on a package where it is not banned is not refused', problems('vitest', 'vitest', '--reporter', 'default', '--quiet') === '');
check('a call after --cwd is read', commandProblems(['node', '../../run-tool.mjs', '--cwd', '{target}', 'eslint', 'eslint', '--quiet', '--format', 'stylish']).map((problem) => problem.id).join() === 'quiet-flag');
check('a command that is not a launcher call has no problem', commandProblems(['node', 'check-budgets.mjs', '{target}']).length === 0);
check('a launcher call without a package has no problem', commandProblems(['node', '../../run-tool.mjs']).length === 0);
check('the arguments start after the package', JSON.stringify(launcherCallOf(['node', '../../run-tool.mjs', 'eslint', 'eslint', '--format', 'stylish'])?.args) === '["eslint","--format","stylish"]');
check('the package name is not read as its own flag value', problems('eslint', '--format') === 'reporter-not-pinned:eslint --format');

// The live gates.
const live = discoverGates(HERE);

check('the live kit holds gates', live.length > 0);

for (const { stack, name, dir } of live) {
  const { gate } = inspectGate(dir);
  const found = gate === undefined ? [{ id: 'invalid-gate-json' }] : commandProblems(gate.command);

  check(`the live gate ${stack}/${name} pins its reporter and passes no banned flag${found.length === 0 ? '' : ` (${found.map((problem) => `${problem.id}:${problem.detail}`).join(',')})`}`, found.length === 0);
}

if (failures.length > 0) {
  console.error(`gates-kit gate-command-rules selftest FAILED @es el selftest de gate-command-rules de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit gate-command-rules selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
