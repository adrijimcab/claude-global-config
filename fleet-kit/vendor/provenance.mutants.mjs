#!/usr/bin/env node
/**
 * The decisions of `provenance.mjs` (the vendored-code provenance check), each broken once, that
 * `../../vendored/selftest.mjs` must catch. The runner is the global `../../mutation-proof/run-mutants.mjs`
 * and mutates a COPY, so this campaign needs no project checkout. Every mutant keeps the code runnable.
 * @es Las decisiones de `provenance.mjs` (la comprobación de procedencia), rotas una a una, que el selftest
 * de `vendored/` debe cazar. El corredor es el global y muta una COPIA.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../../mutation-proof/run-mutants.mjs';

const PROVENANCE = 'fleet-kit/vendor/provenance.mjs';

const MUTANTS = [
  // --- THE HASH: what makes two files the same.
  ['the hash is SHA-1', PROVENANCE, "createHash('sha256')", "createHash('sha1')"],
  ['the hash is printed as base64', PROVENANCE, ".digest('hex')", ".digest('base64')"],

  // --- THE FINDINGS: what each state of a vendored module means.
  ['a missing copy is not reported', PROVENANCE, 'if (!existsSync(vendored)) failures.push(', 'if (false) failures.push('],
  ['an edited copy is read as untouched', PROVENANCE, 'else if (sha256Of(vendored) !== sha256) failures.push(', 'else if (sha256Of(vendored) === sha256) failures.push('],
  ['an absent source is a failure-free silence', PROVENANCE, 'if (!existsSync(source)) notes.push(', 'if (existsSync(source)) notes.push('],
  ['a source that moved on is read as unchanged', PROVENANCE, 'else if (sha256Of(source) !== sha256) failures.push(', 'else if (sha256Of(source) === sha256) failures.push('],
  ['the missing-copy line stops being bilingual', PROVENANCE, ' @es FALTA EN EL KIT', ''],
  ['the edited-copy line stops being bilingual', PROVENANCE, ' @es EDITADO EN EL KIT', ''],
  ['the absent-source line stops being bilingual', PROVENANCE, ' @es fuente ausente', ''],
  ['the moved-source line stops being bilingual', PROVENANCE, ' @es la fuente avanzó: correr vendor/sync.mjs y luego selftest-all.mjs', ''],

  // --- THE DEFAULT ROOTS: where the command line looks when it is given none.
  ['the copies are looked up in the reference fleet by default', PROVENANCE, 'vendorRoot = VENDOR_ROOT', 'vendorRoot = SOURCE_ROOT'],
  ['the sources are looked up in the kit by default', PROVENANCE, 'sourceRoot = SOURCE_ROOT }', 'sourceRoot = VENDOR_ROOT }'],
  ['the options object stops defaulting', PROVENANCE, 'sourceRoot = SOURCE_ROOT } = {}) {', 'sourceRoot = SOURCE_ROOT }) {'],

  // --- THE COMMAND LINE: its verdict and its output.
  ['the command line never fails', PROVENANCE, 'process.exitCode = failures.length === 0 ? 0 : 1;', 'process.exitCode = 0;'],
  ['the command line prints failures before the notes', PROVENANCE, '[...notes, ...failures]', '[...failures, ...notes]'],
  ['the summary line stops being bilingual', PROVENANCE, ' @es procedencia: ${record.files.length} módulo(s) vendorizado(s), ${failures.length} fallo(s)', ''],
  ['importing the module runs the check', PROVENANCE, 'path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))', 'true'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'),
  paths: ['vendored', 'fleet-kit/vendor/provenance.mjs', 'fleet-kit/vendor/sources.mjs', 'fleet-kit/vendor/PROVENANCE.json'],
  selftest: 'vendored/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
