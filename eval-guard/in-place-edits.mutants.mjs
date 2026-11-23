#!/usr/bin/env node
/**
 * The decisions of the source-write rule (in-place-edits.mjs and its call in guard.mjs), each broken once, that
 * `in-place-edits.selftest.mjs` must catch. A survivor is a missing assertion, never a mutant to soften.
 * @es Las decisiones de la regla de escritura de fuentes, rotas una a una, que su selftest debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const I = 'eval-guard/in-place-edits.mjs';
const G = 'eval-guard/guard.mjs';

const MUTANTS = [
  ['ts is not a source extension', I, "new Set(['ts', 'tsx',", "new Set(['tsx',"],
  ['html is not a source extension', I, "'cjs', 'html', 'scss'", "'cjs', 'scss'"],
  ['json is not a source extension', I, "'css', 'json', 'vue'", "'css', 'vue'"],
  ['the extension is compared in its case', I, 'CODE_EXTENSIONS.has(extension.toLowerCase())', 'CODE_EXTENSIONS.has(extension)'],
  ['the extension may be anywhere in the word', I, '/\\.([A-Za-z0-9]+)$/', '/\\.([A-Za-z0-9]+)/'],
  ['a copy writes text', I, "new Set(['cp', 'mv',", "new Set(['mv',"],
  ['a move writes text', I, "new Set(['cp', 'mv', 'PowerShell Copy-Item'", "new Set(['cp', 'PowerShell Copy-Item'"],
  ['a non-source write is refused', I, ' && isSourceFile(one.path));', ');'],
  ['the delegated check is not consulted', G, "?? (delegated ? sourceWriteRefusal(payload) : undefined)", ''],
  ['the parent session is covered too', G, '(delegated ? sourceWriteRefusal(payload) : undefined)', 'sourceWriteRefusal(payload)'],
  ['the refusal has no reason of its own', G, "  if (refusal.kind === 'in-place-edit') return inPlaceEditReason(refusal);\n", ''],
  ['the reason does not name the writer', G, '`EVAL-GUARD REFUSED this command: ${refusal.program} writes', '`EVAL-GUARD REFUSED this command: a command writes'],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['eval-guard', 'hook-caller', 'hook-state', 'shell-command', 'write-targets', 'cherry-pick-guard', 'bilingual-output'],
  selftest: 'eval-guard/in-place-edits.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
