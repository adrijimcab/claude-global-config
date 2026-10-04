#!/usr/bin/env node
/**
 * The decisions of `vendored.mjs` (the `sync` and `check` command line over the vendored modules), each
 * broken once, that `selftest.mjs` must catch. The runner lives in `../mutation-proof/run-mutants.mjs` and
 * mutates a COPY. The list of vendored paths is DATA, not a decision, so it is not mutated: the selftest
 * reads it from the module under test, and a second copy of it there would only detect change.
 * @es Las decisiones de `vendored.mjs` (la línea de órdenes `sync`/`check`), rotas una a una, que
 * `selftest.mjs` debe cazar. La lista de rutas vendorizadas es DATO, no decisión, así que no se muta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const VENDORED = 'vendored/vendored.mjs';

const MUTANTS = [
  // --- WHERE: which roots the command line copies between.
  ['the copies land beside the script instead of under the install root', VENDORED, "const TARGET_ROOT = path.resolve(HERE, '..');", 'const TARGET_ROOT = HERE;'],
  ['the reference fleet is looked up in the wrong folders', VENDORED, "path.join(os.homedir(), 'Desktop', 'Projects', 'b100-am-ui', '.claude')", "path.join(os.homedir(), 'Projects', 'Desktop', 'b100-am-ui', '.claude')"],
  ['the provenance record is written to another file', VENDORED, "path.join(HERE, 'PROVENANCE.json')", "path.join(HERE, 'PROVENANCE.txt')"],

  // --- SYNC: what it copies and what it records.
  ['sync copies nothing', VENDORED, 'copyFileSync(path.join(SOURCE_ROOT, relative), target);', "writeFileSync(target, '');"],
  ['sync does not create the folder of a nested module', VENDORED, '    mkdirSync(path.dirname(target), { recursive: true });\n', ''],
  ['sync records a made-up hash', VENDORED, 'return { path: relative, sha256: sha256Of(target) };', "return { path: relative, sha256: 'x' };"],
  ['sync records the wrong source root', VENDORED, 'JSON.stringify({ sourceRoot: SOURCE_ROOT,', 'JSON.stringify({ sourceRoot: TARGET_ROOT,'],
  ['sync stops reporting in Spanish', VENDORED, ' @es ${files.length} módulo(s) vendorizado(s) desde ${SOURCE_ROOT}', ''],

  // --- CHECK: which findings fail it.
  ['check compares the copies against themselves instead of the reference fleet', VENDORED, '{ vendorRoot: TARGET_ROOT, sourceRoot: SOURCE_ROOT }', '{ vendorRoot: TARGET_ROOT, sourceRoot: TARGET_ROOT }'],
  ['check never fails', VENDORED, 'return failures.length === 0 ? 0 : 1;', 'return 0;'],
  ['check prints failures before the notes', VENDORED, '[...notes, ...failures]', '[...failures, ...notes]'],
  ['check stops reporting in Spanish', VENDORED, ' @es procedencia: ${record.files.length} módulo(s) vendorizado(s), ${failures.length} fallo(s)', ''],

  // --- THE COMMAND LINE: how it is dispatched.
  ['sync is never recognised', VENDORED, "if (command === 'sync') return sync();", "if (command === 'syncx') return sync();"],
  ['check is never recognised', VENDORED, "if (command === 'check') return check();", "if (command === 'checkx') return check();"],
  ['an unknown command exits 0', VENDORED, '  return 2;\n}', '  return 0;\n}'],
  ['the usage line stops being bilingual', VENDORED, ' @es uso: vendored.mjs check | sync', ''],
  ['importing the module runs a command', VENDORED, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['vendored', 'fleet-kit/vendor/provenance.mjs', 'fleet-kit/vendor/sources.mjs', 'fleet-kit/vendor/PROVENANCE.json'],
  selftest: 'vendored/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
