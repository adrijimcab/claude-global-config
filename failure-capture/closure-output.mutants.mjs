#!/usr/bin/env node
/**
 * The decisions that keep a chatty selftest from being read as a killed one — the output limit, passing it to the
 * run, and the overflow report with its limit and both languages — each broken once, that
 * `closure-output.selftest.mjs` must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones que impiden que un selftest locuaz se lea como uno abortado —el límite de salida, pasarlo a
 * la corrida y el informe de desborde con su límite y en los dos idiomas— rotas una a una; las debe cazar
 * `closure-output.selftest.mjs`. El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const CLOSURE = 'failure-capture/closure.mjs';

const MUTANTS = [
  ['the output limit shrinks back to the old 1 MiB, so a chatty selftest is stopped again', CLOSURE, 'const SELFTEST_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;', 'const SELFTEST_MAX_OUTPUT_BYTES = 1024 * 1024;'],
  ['the limit is never handed to the run, so the caller\'s limit is ignored', CLOSURE, 'timeout: SELFTEST_TIMEOUT_MS, maxBuffer });', 'timeout: SELFTEST_TIMEOUT_MS });'],
  ['an overflow is reported as a run that did not finish', CLOSURE, "if (error?.code === 'ENOBUFS') return", 'if (false) return'],
  ['an overflow is let through as a pass', CLOSURE, "if (error?.code === 'ENOBUFS') return { ok: false,", "if (error?.code === 'ENOBUFS') return { ok: true,"],
  ['the overflow report forgets the limit', CLOSURE, 'printed more than ${String(maxBuffer)} bytes and was stopped', 'printed more than the limit and was stopped'],
  ['the overflow report loses its Spanish half', CLOSURE, 'un desborde de salida', 'an output overflow'],
];

const fleetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const survivors = runMutants({ fleetRoot, paths: ['failure-capture', 'agent-contract-parity', 'bilingual-output', 'mutation-proof', 'hook-state'], selftest: 'failure-capture/closure-output.selftest.mjs', mutants: MUTANTS });

process.exit(survivors === 0 ? 0 : 1);
