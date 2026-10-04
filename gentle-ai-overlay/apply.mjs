#!/usr/bin/env node
/**
 * Re-apply every broken customization that can be placed safely (agent tools lines), then re-check
 * everything and exit with that final verdict. Idempotent: a second run changes nothing. Prose in
 * CLAUDE.md is never moved — it is reported, and apply exits non-zero while it stays broken.
 *
 * `--dry-run` prints what apply would do and writes nothing; its exit code is the CURRENT verdict.
 *
 * @es `--dry-run` imprime lo que haría apply y no escribe nada; su código de salida es el veredicto ACTUAL.
 *
 *   node apply.mjs [--dry-run] [--home <dir>] [--mod-cache <dir>]
 */
import { contextFromArgv } from './context.mjs';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { applyAll, evaluateAll, planAll } from './invariants.mjs';
import { exitCodeFor, formatResult } from './report.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const context = contextFromArgv(argv);
const outcomes = dryRun ? planAll(CUSTOMIZATIONS, context) : applyAll(CUSTOMIZATIONS, context);
outcomes.forEach((outcome) => console.log(`${outcome.outcome.toUpperCase().padEnd(9)} ${outcome.id} — ${outcome.detail}`));
if (outcomes.length === 0) console.log('nothing reapplicable was broken @es nada reaplicable estaba roto');

console.log(dryRun ? '--- current verdict (dry run, nothing written) @es veredicto actual (simulación, nada escrito) ---' : '--- verdict after apply @es veredicto tras aplicar ---');
const results = evaluateAll(CUSTOMIZATIONS, context);
results.forEach((result) => console.log(formatResult(result)));
process.exitCode = exitCodeFor(results);
