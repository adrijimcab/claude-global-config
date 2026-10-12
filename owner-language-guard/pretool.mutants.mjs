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
  ['bookkeeping attachments close the step', `${G}/interstitial.mjs`, "if (entry?.type === 'user' && entry.isSidechain !== true) return", "if ((entry?.type === 'user' || entry?.type === 'attachment') && entry.isSidechain !== true) return"],
  ['sidechain user entries close the step', `${G}/interstitial.mjs`, "entry?.type === 'user' && entry.isSidechain !== true", "entry?.type === 'user'"],
  ['texts come back in reverse order of writing', `${G}/interstitial.mjs`, 'return { texts: texts.reverse(), complete: true, anchored };', 'return { texts, complete: true, anchored };'],
  ['an unparsable line aborts instead of being skipped', `${G}/interstitial.mjs`, '    } catch {\n      continue;\n    }', '    } catch {\n      break;\n    }'],
  ['the window loop exits instead of growing', `${G}/interstitial.mjs`, '    window *= 2;', '    break;'],
  ['the ceiling judges texts of unknown age', `${G}/interstitial.mjs`, 'if (window >= MAX_WINDOW) return { ...result, texts: [] };', 'if (window >= MAX_WINDOW) return result;'],
  ['the ceiling is lowered below a large tool result', `${G}/interstitial.mjs`, 'const MAX_WINDOW = 8 << 20;', 'const MAX_WINDOW = 1 << 20;'],
  ['the ceiling is never applied', `${G}/interstitial.mjs`, 'if (window >= MAX_WINDOW) return { ...result, texts: [] };', ''],
  ['the whole-file case is dropped', `${G}/interstitial.mjs`, 'if (!result.anchored || result.complete || window >= size) return result;', 'if (!result.anchored || result.complete) return result;'],

  ['the anchor is never required', `${G}/interstitial.mjs`, 'anchored = carriesToolUse(entry, toolUseId);', 'anchored = true;'],
  ['any tool_use counts as the anchor', `${G}/interstitial.mjs`, 'block.id === toolUseId', 'true'],
  ['the wait gives up at once', `${G}/interstitial.mjs`, 'if (now() >= deadline) return', 'if (true) return'],
  ['an anchor that never lands judges nothing', `${G}/interstitial.mjs`, 'return scanOnce(transcriptPath, undefined).texts;', 'return [];'],
  ['the default sleep does not sleep', `${G}/interstitial.mjs`, 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)', 'undefined'],
  ['the poll interval is ignored', `${G}/interstitial.mjs`, 'sleep(pollMs);', 'sleep(0);'],

  // pretool.mjs
  ['the tool_use_id never reaches the reader', `${G}/pretool.mjs`, 'readTexts(transcript, toolUseId)', 'readTexts(transcript)'],
  ['an empty tool_use_id is taken as an anchor', `${G}/pretool.mjs`, ' && payload.tool_use_id.length > 0', ''],
  ['subagent callers are judged', `${G}/pretool.mjs`, 'isSubagentCaller(payload) || ', ''],
  ['an empty transcript_path reaches the reader', `${G}/pretool.mjs`, ' || transcript.length === 0) return undefined;', ') return undefined;'],
  ['the refusal omits the excerpt', `${G}/pretool.mjs`, '{ excerpt: first.excerpt }', '{}'],
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
