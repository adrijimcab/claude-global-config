#!/usr/bin/env node
/**
 * The decisions of `run-tool.mjs`, each broken once, that `run-tool.selftest.mjs` must catch. The runner and
 * its rules (green baseline, exactly-once target, parse check) live in `../../mutation-proof/run-mutants.mjs`;
 * crash-only kills count as survivors (`crashKills: 'fail'`). Each row names the decision it removes.
 *
 * Known residual: the `?? EXIT_NOT_RUN` fallback for a child with no exit status is not distinguished by any
 * case (a signal death cannot be built portably on Windows), so it has no mutant.
 *
 * @es Las decisiones de `run-tool.mjs`, rotas una a una, que `run-tool.selftest.mjs` debe cazar. Una muerte
 * solo por crash cuenta como superviviente. Residual conocido: el `?? EXIT_NOT_RUN` de un hijo sin código de
 * salida no lo distingue ningún caso (una muerte por señal no se construye de forma portable en Windows).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../../mutation-proof/run-mutants.mjs';
import { makeSpeaker } from '../../bilingual-output/speaker.mjs';

const T = 'gates-kit/angular/run-tool.mjs';

const MUTANTS = [
  ['the refusal exit code is not 3', T, 'const EXIT_NOT_RUN = 3;', 'const EXIT_NOT_RUN = 4;'],
  ['a refusal is printed on the success stream', T, 'speaker.complain(id, params);', 'speaker.say(id, params);'],
  ['a call without a binary name is not refused', T, 'if (packageName === undefined || binName === undefined) refuse', 'if (packageName === undefined) refuse'],
  ['an unset toolchain variable is not refused', T, "if (process.env.GATES_KIT_TOOLCHAIN === undefined || process.env.GATES_KIT_TOOLCHAIN === '') refuse('unset');", "if (process.env.GATES_KIT_TOOLCHAIN === '') refuse('unset');"],
  ['an empty toolchain variable is not refused', T, "if (process.env.GATES_KIT_TOOLCHAIN === undefined || process.env.GATES_KIT_TOOLCHAIN === '') refuse('unset');", "if (process.env.GATES_KIT_TOOLCHAIN === undefined) refuse('unset');"],
  ['a relative toolchain path is not resolved', T, 'path.resolve(process.env.GATES_KIT_TOOLCHAIN)', 'process.env.GATES_KIT_TOOLCHAIN'],
  ['a missing package is not refused', T, "refuse('missingPackage', { package: packageName, toolchain });", 'manifestPath = undefined;'],
  ['a string bin is not accepted', T, "typeof bin === 'string' ? bin : bin?.[binName]", 'bin?.[binName]'],
  ['an object bin ignores the binary name', T, "typeof bin === 'string' ? bin : bin?.[binName]", "typeof bin === 'string' ? bin : Object.values(bin ?? {})[0]"],
  ['a missing binary is not refused', T, "if (relative === undefined) refuse('missingBin', { package: packageName, bin: binName });", ''],
  ['the tool output is not forwarded', T, "stdio: 'inherit'", "stdio: 'pipe'"],
  ['the environment is not forwarded', T, 'env: process.env', 'env: {}'],
  ['the tool arguments are dropped', T, '...args], {', '], {'],
  ['the tool exit code is not passed through', T, 'process.exit(run.status ?? EXIT_NOT_RUN);', 'process.exit(0);'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const survivors = runMutants({ fleetRoot, paths: ['gates-kit', 'mutation-proof', 'bilingual-output'], selftest: 'gates-kit/angular/run-tool.selftest.mjs', mutants: MUTANTS, crashKills: 'fail' });
const speaker = makeSpeaker({
  clean: { en: 'run-tool campaign: 0 survivors.', es: 'campaña de run-tool: 0 supervivientes.' },
  survived: { en: 'run-tool campaign: {count} survivor(s).', es: 'campaña de run-tool: {count} superviviente(s).' },
});

if (survivors === 0) speaker.say('clean');
else speaker.complain('survived', { count: survivors });

process.exit(survivors === 0 ? 0 : 1);
