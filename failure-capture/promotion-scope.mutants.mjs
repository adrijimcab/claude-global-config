#!/usr/bin/env node
/**
 * The decisions of WHERE a promotion lands and HOW its text growth is measured (`promotion-target.mjs`,
 * `text-growth.mjs` and their wiring in `capture.mjs`), each broken once, that `promotion-scope.selftest.mjs`
 * must catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de DÓNDE aterriza una promoción y CÓMO se mide el crecimiento de su texto, rotas una a
 * una; las debe cazar `promotion-scope.selftest.mjs`. El runner y sus reglas viven en `../mutation-proof/run-mutants.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const TARGET = 'failure-capture/promotion-target.mjs';
const GROWTH = 'failure-capture/text-growth.mjs';
const CLOSURE = 'failure-capture/closure.mjs';
const COMMAND = 'failure-capture/capture.mjs';

const MUTANTS = [
  // --- where it lands: the lesson's own scope
  ['every lesson targets the global file, so a project lesson leaks into it', TARGET, 'scope === GLOBAL_SCOPE ? GLOBAL_TARGET : PROJECT_TARGET', 'GLOBAL_TARGET'],
  ['every lesson targets the project contract, so a global lesson never reaches the global file', TARGET, 'scope === GLOBAL_SCOPE ? GLOBAL_TARGET : PROJECT_TARGET', 'PROJECT_TARGET'],
  ['a lesson with no scope is guessed a target instead of refused', TARGET, "if (typeof scope !== 'string' || scope.length === 0) throw", 'if (false) throw'],
  ['the files of a project promotion are the global rules file', TARGET, 'target === GLOBAL_TARGET ? [globalRules] : workerContracts', '[globalRules]'],
  ['the command reads the scope of the wrong ledger', COMMAND, 'promotionTargetOf(locateKey(readLedgers(LEDGERS), key, readMarker)?.ledger.scope)', 'promotionTargetOf(readLedgers(LEDGERS)[0].scope)'],

  // --- how growth is measured: per file, in faces
  ['only the first file is checked for growth', GROWTH, 'for (const file of files) {', 'for (const file of files.slice(0, 1)) {'],
  ['growth is read from a missing baseline as zero faces', GROWTH, 'if (last === undefined) continue;', 'if (last === undefined) { stale.push({ file, now: 0, then: 0, date: \'\' }); continue; }'],
  ['the baseline is measured on whatever file was recorded last', CLOSURE, "typeof entry.faces?.[id] === 'number'", "typeof entry.faces === 'object'"],
  ['the closure record carries no scope', CLOSURE, 'target, scope, faces, date:', 'target, faces, date:'],
  ['the record is stamped with the global scope whatever the lesson', COMMAND, 'scope: ledger.scope,', "scope: 'global',"],
  ['only the first file is measured into the closure record', COMMAND, 'faces: facesByFile({ files: contractFilesOf(target),', 'faces: facesByFile({ files: contractFilesOf(target).slice(0, 1),']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/promotion-scope.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
