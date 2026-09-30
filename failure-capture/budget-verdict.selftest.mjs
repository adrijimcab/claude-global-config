#!/usr/bin/env node
/**
 * Proof of `budget-verdict.mjs`: whether a measured loaded instruction set fits its ceiling. Every expectation
 * is an exact number worked out by hand from a constructed set, never from the code under test. The states
 * the decision ranges over: at, one under and one over each ceiling; the stricter of the global and the
 * project ceiling wins and a looser project ceiling never relaxes the global one; RAW length decides even
 * when the harness-counted figure is under; files are listed by weight; a file over the harness per-file
 * limit is reported and never decides.
 *
 * @es Prueba de `budget-verdict.mjs`: si un conjunto de instrucciones cargado y medido cabe en su techo.
 * Cada expectativa es un número exacto calculado a mano sobre un conjunto construido. Los estados: justo en,
 * uno debajo y uno encima de cada techo; manda el más estricto entre el global y el del proyecto, y uno más
 * laxo nunca relaja el global; decide la longitud BRUTA aunque la contada por el harness esté debajo; los
 * ficheros salen por peso; uno sobre el límite por fichero se informa y nunca decide.
 */

import { GLOBAL_CEILING, budgetVerdict } from './budget-verdict.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);

  if (same) passed += 1;
  else failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** A loaded-set result holding one file of `raw` characters, `counted` of which the harness counts. @es Un resultado de loadedSet con un fichero. */
const setOf = (raw, counted = raw) => ({ files: [{ path: 'a.md', raw, counted }], missing: [], rawTotal: raw, countedTotal: counted });

const pick = (verdict) => [verdict.status, verdict.source, verdict.ceiling, verdict.margin];

check('the global ceiling is 147,000', GLOBAL_CEILING, 147_000);

// --- the global ceiling: one under, at, one over
check('one under the global ceiling is within, margin 1', pick(budgetVerdict({ loaded: setOf(146_999) })), ['within', 'global', 147_000, 1]);
check('exactly at the global ceiling is within, margin 0', pick(budgetVerdict({ loaded: setOf(147_000) })), ['within', 'global', 147_000, 0]);
check('one over the global ceiling is over, margin -1', pick(budgetVerdict({ loaded: setOf(147_001) })), ['over', 'global', 147_000, -1]);

// --- a stricter project ceiling wins
check('one under a stricter project ceiling is within', pick(budgetVerdict({ loaded: setOf(99_999), projectCeiling: 100_000 })), ['within', 'project', 100_000, 1]);
check('exactly at a stricter project ceiling is within', pick(budgetVerdict({ loaded: setOf(100_000), projectCeiling: 100_000 })), ['within', 'project', 100_000, 0]);
check('one over a stricter project ceiling is over although the global one holds', pick(budgetVerdict({ loaded: setOf(100_001), projectCeiling: 100_000 })), ['over', 'project', 100_000, -1]);

// --- a looser project ceiling never relaxes the global one
check('a looser project ceiling does not relax the global ceiling', pick(budgetVerdict({ loaded: setOf(147_001), projectCeiling: 200_000 })), ['over', 'global', 147_000, -1]);
check('a project ceiling equal to the global one is decided by the global', pick(budgetVerdict({ loaded: setOf(10), projectCeiling: 147_000 })), ['within', 'global', 147_000, 146_990]);
check('a global ceiling may be given explicitly', pick(budgetVerdict({ loaded: setOf(60), globalCeiling: 50 })), ['over', 'global', 50, -10]);

// --- raw decides, counted is reported beside it
const rawOver = budgetVerdict({ loaded: setOf(147_500, 146_000) });

check('raw over the ceiling is over although the counted figure is under', [rawOver.status, rawOver.margin], ['over', -500]);
check('the raw and counted totals are both reported', [rawOver.rawTotal, rawOver.countedTotal], [147_500, 146_000]);
check('counted over while raw is under can not happen, and the verdict still follows raw', budgetVerdict({ loaded: setOf(100, 200) }).status, 'within');

// --- files by weight
const three = { files: [{ path: 'b', raw: 10, counted: 9 }, { path: 'c', raw: 30, counted: 28 }, { path: 'a', raw: 10, counted: 10 }], missing: [], rawTotal: 50, countedTotal: 47 };

check('files are listed heaviest first, ties by path', budgetVerdict({ loaded: three }).files.map((file) => file.path), ['c', 'a', 'b']);
check('a listed file keeps its raw and counted sizes', budgetVerdict({ loaded: three }).files[0], { path: 'c', raw: 30, counted: 28 });
check('the input is not reordered', three.files.map((file) => file.path), ['b', 'c', 'a']);

// --- the per-file limit is reported, never decided
const fat = { files: [{ path: 'big.md', raw: 40_001, counted: 40_001 }, { path: 'edge.md', raw: 40_000, counted: 40_000 }], missing: [], rawTotal: 80_001, countedTotal: 80_001 };

check('a 200k context has a 40,000 per-file limit: one file over it is reported', budgetVerdict({ loaded: fat }).overPerFile, [{ path: 'big.md', counted: 40_001, limit: 40_000 }]);
check('a file exactly at the per-file limit is not reported', budgetVerdict({ loaded: fat }).overPerFile.some((file) => file.path === 'edge.md'), false);
check('a 1M context raises the per-file limit to 150,000: nothing is reported', budgetVerdict({ loaded: fat, contextTokens: 1_000_000 }).overPerFile, []);
check('a file over the per-file limit does not change the verdict', budgetVerdict({ loaded: fat }).status, 'within');
check('the per-file check follows the counted size, not the raw one', budgetVerdict({ loaded: setOf(50_000, 39_999) }).overPerFile, []);

process.stdout.write(`failure-capture budget-verdict selftest: ${passed} passed, ${failures.length} failed\n`);
for (const failure of failures) process.stdout.write(`  FAIL ${failure}\n`);
process.exit(failures.length === 0 ? 0 : 1);
