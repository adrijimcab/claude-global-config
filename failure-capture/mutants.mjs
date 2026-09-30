#!/usr/bin/env node
/**
 * The decisions of the failure-capture loop's ESCALATION arm — what may close a recurring lesson —
 * each broken once, that `selftest.mjs` must catch. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * This campaign matters more than most, because this is the mechanism that decides whether every OTHER
 * lesson has been closed honestly. A blind spot here does not lose one guard; it lets any green script
 * in the fleet close any lesson, and lets a rule that has already failed be promoted again unchanged —
 * which is `promotion-to-contract-read-as-prevention` itself.
 *
 * @es Las decisiones del brazo de ESCALADA del loop, rotas una a una. Importa más que otras campañas
 * porque es el mecanismo que decide si las demás lecciones se cerraron honradamente: un punto ciego
 * aquí deja que cualquier script verde cierre cualquier lección, y que una regla que ya falló se
 * repromocione intacta.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- what may close a lesson at all
  ['a mechanism and a reason together are accepted, so a closure means neither', 'failure-capture/closure.mjs', 'if (mechanism !== undefined && reason !== undefined) {', 'if (false) {'],
  ['a mechanism with no proof beside it closes the lesson', 'failure-capture/closure.mjs', 'if (!existsSync(selftest)) return { ok: false, problem:', 'if (false) return { ok: false, problem:'],
  ['a proof that never names the lesson closes it — any green script in the fleet would do', 'failure-capture/closure.mjs', 'if (!named) return { ok: false, problem:', 'if (false) return { ok: false, problem:'],
  ['the proof is found but never RUN, so a red one closes the lesson', 'failure-capture/closure.mjs', '    execFileSync(process.execPath, [selftest],', '    String([selftest],'],
  ['the module-named proof stops being preferred, so a red one is closed over by the directory\'s', 'failure-capture/closure.mjs', 'const selftest = moduleNamed !== undefined && existsSync(moduleNamed) ? moduleNamed : path.join(directory, SELFTEST_NAME);', 'const selftest = path.join(directory, SELFTEST_NAME);'],
  ['a reason too thin to be a reason is accepted', 'failure-capture/closure.mjs', 'export const MINIMUM_REASON_LENGTH = 25;', 'export const MINIMUM_REASON_LENGTH = 1;'],
  ['a multi-line reason is accepted, orphaning the one-line ledger entry it is written into', 'failure-capture/closure.mjs', "if (reason.includes('\\n') || reason.includes('\\r'))", 'if (false)'],

  // --- the text must grow when the lesson comes back
  ['the growth check is never consulted: the same paragraph is re-promoted over a lesson it failed to prevent', 'failure-capture/capture.mjs', 'if (stale !== undefined) {', 'if (false) {'],
  ['growth is demanded even with no recurrence, so re-closing an old promotion is blocked', 'failure-capture/capture.mjs', 'if (!recurred) return undefined;', ''],
  ['growth is satisfied by standing still', 'failure-capture/capture.mjs', 'if (now > last.tokenCount) return undefined;', 'if (now >= last.tokenCount) return undefined;'],
  ['closures recorded before token counts existed are read as a baseline of zero', 'failure-capture/capture.mjs', "typeof entry.tokenCount === 'number'", 'true'],
  ['the token count is not recorded, so the next promotion has no baseline at all', 'failure-capture/closure.mjs', 'const base = { kind: \'promotion\', key, target, tokenCount,', 'const base = { kind: \'promotion\', key, target,'],

  // --- the checks that were already there
  ['the rule text no longer has to have landed', 'failure-capture/capture.mjs', "if (!readFileOr(ORCHESTRATOR_RULES, '').includes(key)) missing.push", 'if (false) missing.push'],
  ['the orchestrator contract is read from the old CLAUDE.md again', 'failure-capture/capture.mjs', "const ORCHESTRATOR_RULES = path.join(homedir(), '.claude', 'rules', 'promoted-rules.md');", "const ORCHESTRATOR_RULES = path.join(homedir(), '.claude', 'CLAUDE.md');"],
  ['a key that is in no ledger line can be promoted', 'failure-capture/capture.mjs', 'if (!keys.has(key)) {', 'if (false) {'],

  // --- alcance: cada lección en el ledger de su alcance (ledgers.mjs, 2026-09-28)
  ['una lección nueva ignora su alcance y cae siempre en el home', 'failure-capture/capture.mjs', 'const ledger = ledgerForScope(ledgers, entry.scope);', "const ledger = ledgerForScope(ledgers, 'global');"],
  ['una recurrencia no busca la clave: se duplica en el ledger del alcance nuevo', 'failure-capture/capture.mjs', 'const found = locateKey(ledgers, entry.key, readMarker);', 'const found = undefined;'],
  ['keys lee solo el primer ledger', 'failure-capture/capture.mjs', 'for (const ledger of readLedgers(LEDGERS)) {\n    for (const line of ledger.lines ?? []) {', 'for (const ledger of readLedgers(LEDGERS).slice(0, 1)) {\n    for (const line of ledger.lines ?? []) {'],
  ['promote colapsa solo en el home, así la clave del proyecto nunca se cierra', 'failure-capture/capture.mjs', 'const found = locateKey(readLedgers(LEDGERS), key, readMarker);', 'const found = locateKey(readLedgers(LEDGERS).slice(0, 1), key, readMarker);'],
  ['el ledger nuevo nace sin encabezado', 'failure-capture/ledgers.mjs', 'ledger.lines ??= ledger.header.split(\'\\n\');', "ledger.lines ??= [''];"],
  // The 2026-09-30 split-store incident: a capture without --session stamped `unknown`.
  ['the harness session id is ignored, so a capture without --session is stamped unknown again', 'failure-capture/capture.mjs', 'const fromHarness = process.env.CLAUDE_CODE_SESSION_ID;', 'const fromHarness = undefined;'],
  ['the stamp ignores the session it was given, so any stamp satisfies every session', 'failure-capture/turn-guard.mjs', 'stamped.session === sessionId && ', '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
