#!/usr/bin/env node
/**
 * The decisions of `hook-state/input-digest.mjs`, each broken once, that `input-digest.selftest.mjs` must catch:
 * the hash algorithm and how a non-string input is turned into text. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that only crashes the selftest count
 * as a survivor.
 *
 * @es Las decisiones de `input-digest.mjs`, rotas una a una, que su selftest debe detectar: el algoritmo de hash
 * y cómo una entrada que no es cadena se convierte en texto. Un mutante que solo hace caer el selftest cuenta
 * como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const D = 'hook-state/input-digest.mjs';

const MUTANTS = [
  ['the digest is sha1', D, "createHash('sha256')", "createHash('sha1')"],
  ['an object is digested without JSON', D, "typeof input === 'string' ? input : JSON.stringify(input)", 'input'],
  ['a string is digested as JSON', D, "typeof input === 'string' ? input : JSON.stringify(input)", 'JSON.stringify(input)']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/input-digest.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
