#!/usr/bin/env node
/**
 * Re-apply every broken customization that can be placed safely (agent tools lines), then re-check
 * everything and exit with that final verdict. Idempotent: a second run changes nothing. Prose in
 * CLAUDE.md is never moved — it is reported, and apply exits non-zero while it stays broken.
 *
 *   node apply.mjs [--home <dir>] [--mod-cache <dir>]
 */
import { contextFromArgv } from './context.mjs';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { applyAll, evaluateAll } from './invariants.mjs';
import { exitCodeFor, formatResult } from './report.mjs';

const context = contextFromArgv(process.argv.slice(2));
const outcomes = applyAll(CUSTOMIZATIONS, context);
outcomes.forEach((outcome) => console.log(`${outcome.outcome.toUpperCase().padEnd(9)} ${outcome.id} — ${outcome.detail}`));
if (outcomes.length === 0) console.log('nothing reapplicable was broken');

console.log('--- verdict after apply ---');
const results = evaluateAll(CUSTOMIZATIONS, context);
results.forEach((result) => console.log(formatResult(result)));
process.exitCode = exitCodeFor(results);
