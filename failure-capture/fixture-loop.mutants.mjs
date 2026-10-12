#!/usr/bin/env node
/**
 * The decisions of the fixture provisioner (`fixture-loop.mjs`), each broken once, that
 * `fixture-loop.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones del aprovisionador de fixtures, rotas una a una; las debe cazar
 * `fixture-loop.selftest.mjs`. El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const PROVISIONER = 'failure-capture/fixture-loop.mjs';

const MUTANTS = [
  ['the loop modules are not copied', PROVISIONER, 'copyModules(sources.loop, loop, accept);', 'mkdirSync(loop, { recursive: true });'],
  ['the filter is ignored', PROVISIONER, 'copyModules(sources.loop, loop, accept);', 'copyModules(sources.loop, loop, () => true);'],
  ['the shared modules are not copied', PROVISIONER, "copyModules(sources.shared, shared, (file) => !file.includes('selftest') && !file.includes('mutants'));", 'mkdirSync(shared, { recursive: true });'],
  ['the selftests and campaigns are copied too', PROVISIONER, "const isProduct = (file) => !file.includes('selftest') && !file.includes('mutants');", 'const isProduct = () => true;'],
  ['the parity engine is not copied', PROVISIONER, 'copyModules(sources.engine ?? REAL_SOURCES.engine, path.join(loop, \'..\', ENGINE_DIRECTORY), isProduct);', 'void ENGINE_DIRECTORY;'],
  ['the parity engine is copied with its selftests', PROVISIONER, 'path.join(loop, \'..\', ENGINE_DIRECTORY), isProduct);', 'path.join(loop, \'..\', ENGINE_DIRECTORY), () => true);'],
  ['a missing shared module is not reported', PROVISIONER, 'if (missing.length > 0) throw', 'if (false) throw'],
  ['a present shared module is reported as missing', PROVISIONER, '.filter((name) => !existsSync(path.join(shared, name)))', '.filter((name) => existsSync(path.join(shared, name)))'],
  ['the missing modules are not sorted', PROVISIONER, '.sort();\n}', ';\n}'],
  ['a string that mentions an import counts as one', PROVISIONER, "/^import [^\\n]*from '", "/from '"],
  ['the missing modules are not named', PROVISIONER, "${missing.join(', ')}. @es faltan", '. @es faltan']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'bilingual-output', 'agent-contract-parity', 'mutation-proof', 'hook-state'],
  selftest: 'failure-capture/fixture-loop.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
