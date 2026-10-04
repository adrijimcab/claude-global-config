#!/usr/bin/env node
/**
 * The decisions of what a recurrence of an ALREADY PROMOTED lesson says, each broken once, that
 * `promoted-recurrence.selftest.mjs` must catch. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de lo que dice una reincidencia de una lección YA PROMOVIDA, rotas una a una; las
 * debe cazar `promoted-recurrence.selftest.mjs`. El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MODULE = 'failure-capture/promoted-recurrence.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  ['a promoted stub is no longer recognised, so a second promotion is demanded', MODULE, 'line.startsWith(PROMOTED_PREFIX)', 'false'],
  ['every ledger line is read as promoted, so an unpromoted lesson is never told to promote', MODULE, 'line.startsWith(PROMOTED_PREFIX)', 'true'],
  ['the command never consults the promoted reading', COMMAND, 'if (isPromotedStub(found?.ledger.lines[found.index])) {', 'if (false) {'],
  ['the recurrence reads the line of the wrong lesson', COMMAND, 'isPromotedStub(found?.ledger.lines[found.index])', 'isPromotedStub(readLedgers(LEDGERS)[0].lines.find((line) => line.startsWith(\'- [promoted] \')))'],
  ['the promoted text to read is not named', MODULE, "    ...listed,\n", ''],
  ['only the first file is named, so a text in another runtime is never extended', MODULE, 'const listed = files.map(', 'const listed = files.slice(0, 1).map('],
  ['the instruction to extend in every file is dropped', MODULE, 'EXTEND the text with the new face in EVERY file that carries the key.', 'look at the text.'],
  ['the exit "the face is already named" is dropped', MODULE, 'If it is, say so in your report:', 'If it is, move on:'],
  ['the Spanish half is dropped', MODULE, '  @es 4. Si lo es,', '  4. Si lo es,'],
  ['the Spanish headline is dropped', MODULE, '  @es YA PROMOVIDA', '  YA PROMOVIDA'],
  ['the files named are the orchestrator rules even for a worker lesson', COMMAND, "(target === 'claude-md' ? [ORCHESTRATOR_RULES] : WORKER_CONTRACTS)", '[ORCHESTRATOR_RULES]']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/promoted-recurrence.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
