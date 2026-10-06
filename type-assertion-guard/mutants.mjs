#!/usr/bin/env node
/**
 * The decisions of the type-assertion guard, each broken once, that `selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de la guardia, rotas una a una, que `selftest.mjs` debe cazar.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- what counts as an assertion (collect-assertions.mjs)
  ['`as const` stops being excluded — type-level debt gets counted as a real assertion', 'type-assertion-guard/collect-assertions.mjs', "if (!isAsConstType(node.type, ts)) assertions.push(assertionRecordOf(node, sourceFile, 'as'));", "assertions.push(assertionRecordOf(node, sourceFile, 'as'));"],
  ['the `const` type-reference check becomes case-sensitive-wrong, so `as const` no longer matches its own exemption', 'type-assertion-guard/collect-assertions.mjs', "typeNode.typeName.text === 'const' &&", "typeNode.typeName.text === 'CONST' &&"],
  ['the legacy angle-bracket form `<T>x` stops being collected', 'type-assertion-guard/collect-assertions.mjs', '} else if (ts.isTypeAssertionExpression(node)) {', '} else if (false) {'],
  ['the postfix non-null `!` stops being collected', 'type-assertion-guard/collect-assertions.mjs', '} else if (ts.isNonNullExpression(node)) {', '} else if (false) {'],

  // --- the decision itself (assertion-diff.mjs)
  ['an off-by-one turns "unchanged" into "raised" — an untouched or moved assertion gets refused', 'type-assertion-guard/assertion-diff.mjs', 'return afterList.length > beforeList.length;', 'return afterList.length >= beforeList.length;'],
  ['the count comparison stops deciding anything — nothing is ever refused', 'type-assertion-guard/assertion-diff.mjs', 'return afterList.length > beforeList.length;', 'return false;'],

  // --- reconstructing before/after (simulate-edit.mjs)
  ['a missing `old_string` stops being reported — the edit is silently mis-simulated instead of failing open', 'type-assertion-guard/simulate-edit.mjs', 'if (index === -1) return undefined;', 'if (false) return undefined;'],
  ["a Write's ENOENT stops being read as \"new file\" — every brand-new file becomes a reported malfunction instead of before=0", 'type-assertion-guard/simulate-edit.mjs', "if (error && error.code === 'ENOENT') return { missing: true };", 'if (false) return { missing: true };'],

  // --- resolving the compiler (resolve-typescript.mjs)
  ['the wrong module name is required — every repository becomes "no TypeScript resolvable", even ones that have it', 'type-assertion-guard/resolve-typescript.mjs', "const ts = requireFromAnchor('typescript');", "const ts = requireFromAnchor('__type-assertion-guard-nonexistent__');"],

  // --- the refusal text (refusal-text.mjs)
  ['the "no bypass flag" line is dropped from the refusal', 'type-assertion-guard/refusal-text.mjs', "'There is no bypass flag and no allowlist for this guard. The fix belongs in the code, never in an exception.',", "''," ],

  // --- the shim (guard.mjs)
  ['`MultiEdit` stops being a guarded tool', 'type-assertion-guard/guard.mjs', "const GUARDED_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);", "const GUARDED_TOOLS = new Set(['Edit', 'Write']);"],
  ["`.ts` stops being a guarded extension — the guard's own primary target goes dark", 'type-assertion-guard/guard.mjs', "const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);", "const TS_EXTENSIONS = new Set(['.tsx', '.mts', '.cts']);"],
  ['the Spanish half of a malfunction report is dropped from stderr', 'type-assertion-guard/guard.mjs', "  process.stderr.write(`[type-assertion-guard] @es ${message} — fallando ABIERTO: no poder verificar no es lo mismo que estar limpio.\\n`);", ''],
  ['the raise-check stops gating the refusal — an unchanged or moved assertion count gets refused too', 'type-assertion-guard/guard.mjs', 'if (!raisesAssertionCount(beforeAssertions, afterAssertions)) return undefined;', 'if (false) return undefined;']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['type-assertion-guard', 'mutation-proof', 'hook-state', 'bilingual-output'],
  selftest: 'type-assertion-guard/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail'
});

process.exit(survivors === 0 ? 0 : 1);
