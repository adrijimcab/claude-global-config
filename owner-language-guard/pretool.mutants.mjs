#!/usr/bin/env node
/**
 * Mutant campaign of the PreToolUse language guard: each mutant reverts ONE decision and
 * `pretool.selftest.mjs` must go red. Uses the fleet's shared runner (read only); a missing runner exits 2
 * (NOT MEASURED), never a verdict.
 * @es Campaña de mutantes del guard de idioma en PreToolUse: cada mutante revierte UNA decisión y el selftest
 * debe ponerse en rojo. Sin runner compartido sale con 2 (NO MEDIDO).
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const EXIT_NOT_MEASURED = 2;

const G = 'owner-language-guard';

const MUTANTS = [
  // interstitial.mjs
  ['any user entry stops being the boundary', `${G}/interstitial.mjs`, "if (entry?.type === 'user' && entry.isSidechain !== true) return", "if (false) return"],
  ['sidechain user entries close the step', `${G}/interstitial.mjs`, "entry?.type === 'user' && entry.isSidechain !== true", "entry?.type === 'user'"],
  ['texts come back in reverse order of writing', `${G}/interstitial.mjs`, 'return { texts: texts.reverse(), complete: true };', 'return { texts, complete: true };'],
  ['an unparsable line aborts instead of being skipped', `${G}/interstitial.mjs`, '    } catch {\n      continue;\n    }', '    } catch {\n      break;\n    }'],
  ['the ceiling judges texts of unknown age', `${G}/interstitial.mjs`, 'if (window >= MAX_WINDOW) return [];', 'if (window >= MAX_WINDOW) return result.texts;'],
  ['the ceiling is lowered below a large tool result', `${G}/interstitial.mjs`, 'const MAX_WINDOW = 8 << 20;', 'const MAX_WINDOW = 1 << 20;'],
  ['the ceiling is never applied', `${G}/interstitial.mjs`, 'if (window >= MAX_WINDOW) return [];', ''],
  ['the whole-file case is dropped', `${G}/interstitial.mjs`, 'if (result.complete || window >= size) return result.texts;', 'if (result.complete) return result.texts;'],

  // pretool.mjs
  ['subagent callers are judged', `${G}/pretool.mjs`, 'isSubagentCaller(payload) || ', ''],
  ['the guard never refuses', `${G}/pretool.mjs`, 'if (first === undefined) return undefined;', 'return undefined;'],
  ['the refusal is not a deny', `${G}/pretool.mjs`, "permissionDecision: 'deny'", "permissionDecision: 'ask'"],
  ['the BOM is not stripped', `${G}/pretool.mjs`, 'raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw', 'raw'],
  ['a failure of its own blocks the call', `${G}/pretool.mjs`, '  } catch {\n    return undefined;\n  }\n}', '  } catch {\n    return { decision: "block" };\n  }\n}'],
  ['the CLI does not print the deny', `${G}/pretool.mjs`, 'if (output !== undefined) process.stdout.write(JSON.stringify(output));', ''],
  ['the CLI does not run as the main process', `${G}/pretool.mjs`, 'if (process.argv[1] !== undefined && path.resolve', 'if (false && path.resolve'],

  // pretool-messages.mjs
  ['the refusal drops the Spanish half', `${G}/pretool-messages.mjs`, "es: 'GUARD DE IDIOMA DEL DUEÑO: la línea", "es: 'OWNER LANGUAGE GUARD: la línea"],
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(EXIT_NOT_MEASURED);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: [G, 'hook-state', 'bilingual-output', 'hook-caller'],
  selftest: `${G}/pretool.selftest.mjs`,
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 120_000
});

process.exit(survivors === 0 ? 0 : 1);
