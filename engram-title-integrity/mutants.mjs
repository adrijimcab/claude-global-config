#!/usr/bin/env node
/**
 * Proof that `selftest.mjs` can go RED — the check on the check.
 *
 * WHY. `guard-that-cannot-go-red` is a promoted rule in this project because a `Stop` guard once
 * filtered on a field name that did not exist: every comparison saw `undefined`, the filter emptied,
 * and a guard that COULD NOT FIRE produced output byte-identical to a clean fleet. A test suite has
 * exactly the same failure mode. `52/52 passed` is evidence about the guard only if the suite is
 * capable of printing anything else, and nothing in a green run demonstrates that.
 *
 * HOW. Each mutation below breaks ONE thing in a sandbox copy and requires the copied suite to fail. The
 * shared runner, `../mutation-proof/run-mutants.mjs`, does the copying and owns every rule that makes a
 * kill mean something: a green unmutated baseline, a target that occurs exactly once, a mutated file that
 * still parses, and no verdict at all over an empty set (exit 2). This file used to carry its own loop,
 * which accepted a target occurring twice, counted a syntax error as a catch, and never ran the suite
 * unmutated; it now carries only the mutations.
 *
 * Each mutation is a DIFFERENT way the guard could silently stop working, and each must be caught by
 * a different group of cases. A mutation that no case catches is a hole in the suite, and this file
 * reports it as a failure rather than a curiosity.
 *
 * Exit codes: 0 every mutation was caught · 1 a mutation survived · 2 nothing could be measured.
 *
 * @es Prueba de que el selftest PUEDE ponerse EN ROJO: el control sobre el control. Cada mutación rompe
 * UNA cosa en una copia; el runner compartido impone la base verde, el objetivo exactamente una vez, el
 * parseo del mutante y la negativa ante un conjunto vacío.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MODULE = 'engram-title-integrity';

/**
 * Each mutation names a realistic way this guard could rot, not an arbitrary character swap.
 * @es Cada mutación nombra una forma realista de que el guard se pudra, no un cambio arbitrario.
 */
const MUTANTS = [
  [
    'blankness collapses to a presence check (whitespace stops being blank)',
    `${MODULE}/blank-title.mjs`,
    "  if (typeof value !== 'string') return false;\n  for (const character of value) {\n    if (!WHITESPACE_CODEPOINTS.includes(character.codePointAt(0))) return false;\n  }\n  return true;",
    "  if (typeof value !== 'string') return false;\n  return value.length === 0;"
  ],
  ['the guard stops covering the plugin-mounted engram', `${MODULE}/guard.mjs`, "export const SAVE_TOOLS = new Set(['mcp__engram__mem_save', 'mcp__plugin_engram_engram__mem_save']);", "export const SAVE_TOOLS = new Set(['mcp__engram__mem_save']);"],
  ['the guard can no longer fire at all (allows everything)', `${MODULE}/guard.mjs`, '  if (!isBlankTitle(title)) return undefined;', '  if (true) return undefined;'],
  ['the guard denies everything (no longer discriminates in the allow direction)', `${MODULE}/guard.mjs`, '  if (!isBlankTitle(title)) return undefined;', '  if (false) return undefined;'],
  ['NBSP is dropped from the whitespace set', `${MODULE}/blank-title.mjs`, '  0x00a0, // NO-BREAK SPACE — inserted silently by copy-paste, looks identical to a space', '  // 0x00a0 removed'],
  ['fail-open is lost (an unparseable payload throws instead of allowing)', `${MODULE}/guard.mjs`, '  } catch {\n    return undefined;\n  }\n\n  let refusal;', '  } catch (error) {\n    throw error;\n  }\n\n  let refusal;'],
  ['the refusal stops naming the near miss', `${MODULE}/guard.mjs`, "    empty: 'NEAR MISS —", "    empty: 'Missing title —"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: [MODULE, 'hook-state', 'bilingual-output'],
  selftest: `${MODULE}/selftest.mjs`,
  mutants: MUTANTS,
  crashKills: 'fail'
});

if (survivors > 0) console.error('A surviving mutation is a hole in selftest.mjs: the guard could rot that way undetected.');

process.exit(survivors === 0 ? 0 : 1);
