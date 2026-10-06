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
  ['growth is demanded even with no recurrence, so re-closing an old promotion is blocked', 'failure-capture/text-growth.mjs', 'if (recurred && now <= then)', 'if (now <= then)'],
  ['the baseline is the OLDEST same-file closure instead of the newest', 'failure-capture/closure.mjs', 'entry.at > newest.at ? entry : newest', 'entry.at < newest.at ? entry : newest'],
  ['the closure record does not carry its faces', 'failure-capture/closure.mjs', 'target, scope, faces, date:', 'target, scope, date:'],
  ['the file is recorded in a raw spelling, not the one the comparison uses', 'failure-capture/text-growth.mjs', '[contractFileId(file), countFaces(read(file), key)]', '[file, countFaces(read(file), key)]'],
  ['growth is satisfied by standing still', 'failure-capture/text-growth.mjs', 'if (recurred && now <= then)', 'if (recurred && now < then)'],

  // --- the checks that were already there
  ['the rule text no longer has to have landed', 'failure-capture/capture.mjs', "for (const file of contractFilesOf(target, key)) if (!readFileOr(file, '').includes(key)) missing.push", 'for (const file of contractFilesOf(target, key)) if (false) missing.push'],
  ['the orchestrator contract is read from the old CLAUDE.md again', 'failure-capture/capture.mjs', "const ORCHESTRATOR_RULES = path.join(homedir(), '.claude', 'rules', 'promoted-rules.md');", "const ORCHESTRATOR_RULES = path.join(homedir(), '.claude', 'CLAUDE.md');"],
  ['a key that is in no ledger line can be promoted', 'failure-capture/capture.mjs', 'if (!keys.has(key)) {', 'if (false) {'],

  // --- the ledger lock: promote writes only while it holds it (the module is proved by ledger-lock.mutants.mjs)
  ['promote takes some other lock, so a held ledger lock is ignored', 'failure-capture/capture.mjs', 'const collapsed = withLock(LOCK_FILE, () => {', "const collapsed = withLock(path.join(STATE_DIR, 'other.lock'), () => {"],
  ['promote does not notice that the lock was refused, and reports a closure that never happened', 'failure-capture/capture.mjs', 'if (!collapsed.held) {', 'if (false) {'],
  ['promote reads the ledger before it holds the lock, so it writes back a stale copy', 'failure-capture/capture.mjs', 'const collapsed = withLock(LOCK_FILE, () => {\n    const ledgers = readLedgers(LEDGERS);\n    const found = locateKey(ledgers, key, readMarker);', 'const early = readLedgers(LEDGERS);\n  const collapsed = withLock(LOCK_FILE, () => {\n    const ledgers = early;\n    const found = locateKey(ledgers, key, readMarker);'],
  ['the stub of a promoted lesson loses its recurrence counter', 'failure-capture/promotion.mjs', 'marker: original.slice(marker.open, marker.close) })', 'marker: `<!--fc:${marker.key}#1-->` })'],
  ['the refusal to promote loses its Spanish half', 'failure-capture/capture.mjs', "speaker.complain('promote.locked');", "console.error('promote: the ledger is locked by another writer — re-run in a moment. Nothing was changed.');"],

  // --- alcance: cada lección en el ledger de su alcance (ledgers.mjs, 2026-09-28)
  ['una lección nueva ignora su alcance y cae siempre en el home', 'failure-capture/capture.mjs', 'const ledger = ledgerForScope(ledgers, entry.scope);', "const ledger = ledgerForScope(ledgers, 'global');"],
  ['una recurrencia no busca la clave: se duplica en el ledger del alcance nuevo', 'failure-capture/capture.mjs', 'const found = locateKey(ledgers, entry.key, readMarker);', 'const found = undefined;'],
  ['keys lee solo el primer ledger', 'failure-capture/capture.mjs', 'for (const ledger of readLedgers(LEDGERS)) {\n    for (const line of ledger.lines ?? []) {', 'for (const ledger of readLedgers(LEDGERS).slice(0, 1)) {\n    for (const line of ledger.lines ?? []) {'],
  ['promote colapsa solo en el home, así la clave del proyecto nunca se cierra', 'failure-capture/capture.mjs', 'const found = locateKey(ledgers, key, readMarker);\n\n    if (found === undefined) return;', 'const found = locateKey(ledgers.slice(0, 1), key, readMarker);\n\n    if (found === undefined) return;'],
  ['el ledger nuevo nace sin encabezado', 'failure-capture/ledgers.mjs', 'ledger.lines ??= ledger.header.split(\'\\n\');', "ledger.lines ??= [''];"],
  // The 2026-09-30 split-store incident: a capture without --session stamped `unknown`.
  ['the harness session id is ignored, so a capture without --session is stamped unknown again', 'failure-capture/capture.mjs', 'const fromHarness = process.env.CLAUDE_CODE_SESSION_ID;', 'const fromHarness = undefined;'],
  ['the stamp ignores the session it was given, so any stamp satisfies every session', 'failure-capture/turn-guard.mjs', 'stamped.session === sessionId && ', '']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'bilingual-output', 'mutation-proof'],
  selftest: 'failure-capture/selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
