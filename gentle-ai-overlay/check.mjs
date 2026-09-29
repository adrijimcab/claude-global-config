#!/usr/bin/env node
/**
 * Report whether each local customization of a gentle-ai-managed file still holds. Read-only.
 * Exit 0 all held, 1 any broken, 2 none broken but some unverifiable (see report.mjs).
 *
 *   node check.mjs [--json] [--home <dir>] [--mod-cache <dir>] [--gentle-ai-node-script <file>]
 *
 * `--json` prints `{ exitCode, results }` for tools that decide on the verdict (the sync guard reads
 * it), so no consumer ever has to scrape the human-readable lines.
 */
import { contextFromArgv } from './context.mjs';
import { CUSTOMIZATIONS } from './customizations.mjs';
import { evaluateAll } from './invariants.mjs';
import { exitCodeFor, formatResult } from './report.mjs';

const argv = process.argv.slice(2);
const results = evaluateAll(CUSTOMIZATIONS, contextFromArgv(argv));
const exitCode = exitCodeFor(results);
if (argv.includes('--json')) console.log(JSON.stringify({ exitCode, results }));
else results.forEach((result) => console.log(formatResult(result)));
process.exitCode = exitCode;
