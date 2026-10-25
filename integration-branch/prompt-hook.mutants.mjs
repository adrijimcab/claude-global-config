#!/usr/bin/env node
/**
 * Mutant campaign of the integration-branch drift warning: each mutant breaks ONE decision and
 * `prompt-hook.selftest.mjs` must go red by a failed check, never by a crash (`crashKills: 'fail'`). Uses the
 * fleet's shared runner (read only); a missing runner exits 2 (NOT MEASURED), never a verdict.
 *
 * @es Campaña de mutantes del aviso de deriva de la rama de integración: cada mutante rompe UNA decisión y
 * `prompt-hook.selftest.mjs` debe ponerse en rojo por un check fallido, nunca por un crash. Sin runner
 * compartido sale con 2 (NO MEDIDO), nunca un veredicto.
 *
 * Retired, because the decision moved into the port and hook-io's own mutants pin it: "runs when imported"
 * ('main runs always'), "BOM is not stripped" (the BOM mutants of `parsePayload`), "does not print the notice"
 * ('hookMain prints a missing decision as null'), "exits non-zero" and the trailing line break ('hookMain
 * prints without the line break'). @es Retirados porque la decisión pasó al puerto y los mutantes propios de
 * hook-io la fijan: «corre al importarse» ('main runs always'), «el BOM no se quita» (los mutantes de
 * `parsePayload`), «no imprime el aviso» ('hookMain prints a missing decision as null') y el salto de línea
 * final ('hookMain prints without the line break').
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNNER = path.resolve(import.meta.dirname, '..', 'mutation-proof', 'run-mutants.mjs');
const EXIT_NOT_MEASURED = 2;

const HOOK = 'integration-branch/prompt-hook.mjs';
const MESSAGES = 'integration-branch/messages.mjs';

const MUTANTS = [
  // prompt-hook.mjs
  ['subagent callers are warned', HOOK, 'if (isSubagentCaller(payload)) return undefined;', ''],
  ['a clone in sync is warned', HOOK, "const NOTICE_BY_VERDICT = {", "const NOTICE_BY_VERDICT = { 'in-sync': 'drift-set',"],
  ['a drift with a pushable ref gets the missing-ref notice', HOOK, "{ set: 'drift-set', 'missing-remote-ref': 'drift-missing-ref' }", "{ set: 'drift-missing-ref', 'missing-remote-ref': 'drift-missing-ref' }"],
  ['a drift without the ref gets the set notice', HOOK, "{ set: 'drift-set', 'missing-remote-ref': 'drift-missing-ref' }", "{ set: 'drift-set', 'missing-remote-ref': 'drift-set' }"],
  ['a drift without the ref is silent', HOOK, "{ set: 'drift-set', 'missing-remote-ref': 'drift-missing-ref' }", "{ set: 'drift-set' }"],
  ['a drift with the ref is silent', HOOK, "{ set: 'drift-set', 'missing-remote-ref': 'drift-missing-ref' }", "{ 'missing-remote-ref': 'drift-missing-ref' }"],
  ['the notice names a different sync command', HOOK, 'sync: SYNC_COMMAND', "sync: 'sync.mjs'"],
  ['the notice names the cwd, not the main checkout', HOOK, 'const { main, want, source } = state;', 'const { want, source } = state;\n    const main = payload.cwd;'],
  ['an unset origin/HEAD is not tolerated', HOOK, "const current = state.current ?? '(unset @es sin fijar)';", 'const current = state.current;'],
  ['the notice is delivered for the wrong event', HOOK, "context('UserPromptSubmit',", "context('PreToolUse',"],
  ['the notice blocks the prompt', HOOK, "    return context('UserPromptSubmit', speaker.line(notice, { main, want, source, current, sync: SYNC_COMMAND }));", "    return { decision: 'block', ...context('UserPromptSubmit', speaker.line(notice, { main, want, source, current, sync: SYNC_COMMAND })) };"],
  ['a failure of its own blocks the prompt', HOOK, '  } catch {\n    return undefined;\n  }\n}\n\nrunWhenMain', '  } catch {\n    return { decision: "block" };\n  }\n}\n\nrunWhenMain'],
  ['the payload is not read through the port parser', HOOK, 'const payload = parsePayload(raw);', 'const payload = JSON.parse(raw);'],
  ['the CLI does not run the evaluation', HOOK, 'hookMain(evaluate)', 'hookMain(() => undefined)'],
  ['the CLI does not run as the main process', HOOK, 'runWhenMain(import.meta.url, hookMain(evaluate));', ''],

  // messages.mjs: the English and the Spanish half each carry the command that fixes the drift
  ['the English notice drops the sync command', MESSAGES, 'will start from the wrong branch. Fix it with: node "{sync}" "{main}"', 'will start from the wrong branch. Fix it with: node "{sync}"'],
  ['the Spanish notice drops the sync command', MESSAGES, 'partirán de la rama equivocada. Se arregla con: node "{sync}" "{main}"', 'partirán de la rama equivocada. Se arregla con: node "{sync}"'],
  ['the English missing-ref notice drops the owner decision', MESSAGES, 'The owner decides the fetch or the push; then run:', 'Then run:'],
  ['the Spanish missing-ref notice drops the owner decision', MESSAGES, 'El dueño decide el fetch o el push; luego ejecuta:', 'Luego ejecuta:']
];

if (!existsSync(RUNNER)) {
  console.error(`NOT MEASURED — shared runner missing at ${RUNNER}. @es NO MEDIDO — falta el runner compartido en ${RUNNER}.`);
  process.exit(EXIT_NOT_MEASURED);
}

const { runMutants } = await import(pathToFileURL(RUNNER).href);

const survivors = runMutants({
  fleetRoot: path.resolve(import.meta.dirname, '..'),
  paths: ['integration-branch', 'hook-state', 'bilingual-output', 'hook-caller', 'worktree-landing', 'hook-io'],
  selftest: 'integration-branch/prompt-hook.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 180_000
});

process.exit(survivors === 0 ? 0 : 1);
