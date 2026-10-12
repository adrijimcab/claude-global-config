#!/usr/bin/env node
/**
 * The decisions that keep a `--no-mechanism` reason bilingual — the house-form check, the standalone `@es`
 * marker, both halves non-empty, and the reason printed once as written — each broken once, that
 * `closure-language.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones que mantienen bilingüe un motivo de `--no-mechanism` —la comprobación de la forma de
 * la casa, el marcador `@es` suelto, ambas mitades no vacías y el motivo impreso una vez tal cual— rotas
 * una a una; las debe cazar `closure-language.selftest.mjs`. El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const CLOSURE = 'failure-capture/closure.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  ['a reason with no Spanish half is accepted', CLOSURE, 'if (houseHalves(reason) === undefined) return {', 'if (false) return {'],
  ['the marker is accepted inside another word', CLOSURE, "const standalone = (at === 0 || reason[at - 1] === ' ') && (after === reason.length || reason[after] === ' ');", 'const standalone = true;'],
  ['an empty English half is accepted', CLOSURE, 'return english.length > 0 && spanish.length > 0 ? { english, spanish } : undefined;', 'return spanish.length > 0 ? { english, spanish } : undefined;'],
  ['an empty Spanish half is accepted', CLOSURE, 'return english.length > 0 && spanish.length > 0 ? { english, spanish } : undefined;', 'return english.length > 0 ? { english, spanish } : undefined;'],
  ['the reason is printed twice', COMMAND, '    speaker.data(`  ${closure.reason}`);', '    speaker.data(`  ${closure.reason}`);\n    speaker.data(`  ${closure.reason}`);'],
  ['the reason is not printed', COMMAND, '    speaker.data(`  ${closure.reason}`);', '    speaker.data(\'\');']
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'], selftest: 'failure-capture/closure-language.selftest.mjs', mutants: MUTANTS });

process.exit(survivors === 0 ? 0 : 1);
