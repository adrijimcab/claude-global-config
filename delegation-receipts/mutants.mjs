#!/usr/bin/env node
/**
 * The decisions of the delegation-receipts guard, each broken once, that `selftest.mjs` must catch.
 * The runner and its rules live in `../mutation-proof/run-mutants.mjs`, which mutates a COPY.
 *
 * WHY THIS EXISTS RATHER THAN A GREEN SELFTEST. This guard closes the seventh recurrence of a lesson
 * whose rule was ALREADY binding contract text when the incident happened. Under the stop-the-line
 * directive a repeat closes only on a mechanism PROVEN to discriminate, and watching a selftest pass is
 * not watching it work: a guard that cannot go red produces output byte-identical to a healthy one.
 * Every line below breaks one decision; a SURVIVOR means the selftest would have stayed green over that
 * breakage.
 *
 * BOTH FAILURE DIRECTIONS, because they are not symmetric and both are fatal. A guard that stops seeing
 * the hazard lets the next hour of work go to nobody while the reply says it is delegated. A guard that
 * starts refusing turns which DID retry — or which never delegated at all — is switched off within the
 * day, which stops nothing. So the table carries "a refusal never opens a debt" AND "a launch no longer
 * pays one".
 *
 * @es Las decisiones del guard, rotas una a una, que `selftest.mjs` debe cazar; se muta una COPIA.
 * Existe porque esto cierra una séptima recurrencia cuyo texto YA era contrato: un repetido se cierra
 * con un mecanismo PROBADO, y ver pasar un auto-test no es verlo funcionar. Se mutan LAS DOS
 * direcciones: dejar de ver el peligro deja el trabajo sin nadie; empezar a rechazar turnos legítimos
 * desactiva el guard.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const MUTANTS = [
  // --- THE CLASSIFICATION: what a receipt says happened.
  ['a refusal is read as a launch', 'delegation-receipts/turn-delegations.mjs', "attempt.outcome = block.is_error === true ? 'refused' : 'launched';", "attempt.outcome = 'launched';"],
  ['every result is read as a refusal, so a clean turn is refused', 'delegation-receipts/turn-delegations.mjs', "attempt.outcome = block.is_error === true ? 'refused' : 'launched';", "attempt.outcome = 'refused';"],
  ['a success with no is_error field is read as a refusal', 'delegation-receipts/turn-delegations.mjs', 'attempt.outcome = block.is_error === true ? ', 'attempt.outcome = block.is_error !== false ? '],
  ['SendMessage stops counting, so the retry resume-before-fresh demands is invisible', 'delegation-receipts/turn-delegations.mjs', "new Set(['Agent', 'Task', 'SendMessage'])", "new Set(['Agent', 'Task'])"],
  ['a result is paired to an attempt by position instead of by id', 'delegation-receipts/turn-delegations.mjs', 'const attempt = isId(block.tool_use_id) ? byId.get(block.tool_use_id) : unanswered.shift();', 'const attempt = attempts[attempts.length - 1];'],

  // --- THE TURN'S SCOPE: which receipts belong to the turn that is ending.
  ['the turn boundary is never recognised', 'delegation-receipts/turn-delegations.mjs', 'if (opensTurn(entry)) {', 'if (false) {'],
  ['a tool result opens a turn, so the scope collapses to the last one', 'delegation-receipts/turn-delegations.mjs', "return !content.some((block) => block?.type === 'tool_result');", 'return true;'],
  ['an assistant entry opens a turn', 'delegation-receipts/turn-delegations.mjs', "if (entry.type !== 'user') return false;", 'if (false) return false;'],
  ["a sub-agent's own sidechain traffic is read as this turn's", 'delegation-receipts/turn-delegations.mjs', 'if (entry?.isSidechain === true) continue;', ''],
  ['the window never widens, so a turn larger than 2 MiB loses its boundary', 'delegation-receipts/turn-delegations.mjs', 'const WINDOWS = [2 * 1024 * 1024, 32 * 1024 * 1024];', 'const WINDOWS = [2 * 1024 * 1024];'],
  ['the tail is taken from the START of the file instead of its end', 'delegation-receipts/turn-delegations.mjs', 'const read = readSync(fd, buffer, 0, buffer.length, from);', 'const read = readSync(fd, buffer, 0, buffer.length, 0);'],


  // --- THE UNKNOWABLE, which may never read as clean: a failed measurement that looks like a clean
  //     result is the defect this fleet has mechanised against most.
  ['an unreadable transcript reads as a clean turn', 'delegation-receipts/guard.mjs', 'if (attempts === undefined) return undefined;', 'if (attempts === undefined) return [];'],
  ['a transcript that cannot be opened throws instead of standing aside', 'delegation-receipts/turn-delegations.mjs', '  } catch {\n    return undefined;\n  } finally {', '  } finally {'],


  // --- THE LEDGER: what opens a debt and what pays one.
  // These two replace the STATEMENT rather than deleting it: deleting one arm of an if/else leaves a
  // dangling `else`, and a mutant killed by a syntax error is a kill for the wrong reason — the
  // selftest would have gone red without ever exercising the decision.
  // @es Sustituyen la SENTENCIA en vez de borrarla: borrar una rama deja un `else` colgando, y un
  // mutante matado por un error de sintaxis es rojo por el motivo equivocado.
  // --- THE b100 INCIDENT (2026-10-18): request-blob copies of the conversation, and calls repeated by id.
  // @es EL INCIDENTE DE b100: copias de la conversación en los request-blob y llamadas repetidas por id.
  ['request-blob copies of the conversation are read as the conversation', 'delegation-receipts/turn-delegations.mjs', "if (entry?.type !== 'assistant' && entry?.type !== 'user') continue;", ''],
  ['only assistant records are read, so every tool result is lost', 'delegation-receipts/turn-delegations.mjs', "if (entry?.type !== 'assistant' && entry?.type !== 'user') continue;", "if (entry?.type !== 'assistant') continue;"],
  ['a call repeated in two records is counted as two attempts', 'delegation-receipts/turn-delegations.mjs', 'if (identified && byId.has(block.id)) continue;', ''],
  ['calls with no id are folded into one attempt', 'delegation-receipts/turn-delegations.mjs', 'const identified = isId(block.id);', 'const identified = true;'],
  ['the empty string counts as an id', 'delegation-receipts/turn-delegations.mjs', "return typeof value === 'string' && value !== '';", "return typeof value === 'string';"],
  ['an id-less result answers the NEWEST unanswered call', 'delegation-receipts/turn-delegations.mjs', 'unanswered.shift()', 'unanswered.pop()'],
  ['id-less calls are never queued, so their results are lost', 'delegation-receipts/turn-delegations.mjs', 'else unanswered.push(attempt);', ''],
  ['an id-less call of another tool is never queued, so its result answers a delegation', 'delegation-receipts/turn-delegations.mjs', 'if (!isId(block.id)) unanswered.push(null);', ''],
  ['an id-less call of another tool is queued even when it has an id', 'delegation-receipts/turn-delegations.mjs', 'if (!isId(block.id)) unanswered.push(null);', 'unanswered.push(null);'],
  ['an id-less result paired to another tool call still classifies a delegation', 'delegation-receipts/turn-delegations.mjs', 'if (attempt === undefined || attempt === null) continue;', 'if (attempt === undefined) continue;'],
  ['an id-less result is looked up by its missing id', 'delegation-receipts/turn-delegations.mjs', 'isId(block.tool_use_id) ? byId.get(block.tool_use_id) : unanswered.shift()', 'byId.get(block.tool_use_id)'],
  ['a refusal never opens a debt', 'delegation-receipts/unlaunched.mjs', 'owed.push(attempt);', 'undefined;'],
  ['a launch no longer pays a debt, so every retried turn is refused', 'delegation-receipts/unlaunched.mjs', "else if (attempt.outcome === 'launched') payNewestFromEarlierBatch(owed, attempt);", 'else undefined;'],
  ['an attempt with no result PAYS a debt', 'delegation-receipts/unlaunched.mjs', "if (attempt.outcome === 'launched') payNewestFromEarlierBatch(", "if (attempt.outcome !== 'refused') payNewestFromEarlierBatch("],
  // --- ONE BATCH: calls of one model message cannot be each other's retry. @es UN LOTE: las llamadas de un mismo mensaje no son reintento entre sí.
  ['a launch pays a refusal from its OWN batch', 'delegation-receipts/unlaunched.mjs', 'refused.batch === undefined || refused.batch !== launch.batch', 'true'],
  ['a refusal with no batch is never paid', 'delegation-receipts/unlaunched.mjs', 'refused.batch === undefined || ', ''],
  ['a launch with nothing it may pay removes the newest debt anyway', 'delegation-receipts/unlaunched.mjs', 'if (debt !== -1) owed.splice(debt, 1);', 'owed.splice(debt, 1);'],
  ['a launch pays the OLDEST payable debt instead of the newest', 'delegation-receipts/unlaunched.mjs', 'const debt = owed.findLastIndex(', 'const debt = owed.findIndex('],
  ['the model message of a call is no longer recorded, so every batch looks alike', 'delegation-receipts/turn-delegations.mjs', 'batch: entry.message?.id,', 'batch: undefined,'],


  // --- THE RECORDED ESCAPE, whose whole value is that it is narrow and written down.
  ['an abandonment pays a refusal that came after it', 'delegation-receipts/unlaunched.mjs', 'return refusedAt === undefined || refusedAt <= at;', 'return true;'],
  ['an abandonment never pays, so a deliberate stop cannot be expressed', 'delegation-receipts/unlaunched.mjs', 'if (index !== -1) owed.splice(index, 1);', ''],
  ["another session's abandonment pays this session's debt", 'delegation-receipts/abandon.mjs', 'if (record?.session === sessionId) records.push(record);', 'records.push(record);'],
  ['the escape accepts a reason that says nothing', 'delegation-receipts/abandon.mjs', 'reason.trim().length < 25', 'false'],

  // --- THE BOUNDS, which are what make blocking safe.
  ['stop_hook_active no longer bounds it, so the obligation can be raised twice', 'delegation-receipts/guard.mjs', 'if (payload?.stop_hook_active === true) return;', ''],
  ['the independent cooldown is gone', 'delegation-receipts/guard.mjs', 'if (now - previous < COOLDOWN_MS) {', 'if (false) {'],
  ['a BOM-prefixed payload is swallowed, so a failed parse reads as a clean turn', 'delegation-receipts/guard.mjs', 'return main(parsePayload(raw));', 'return main(JSON.parse(raw));'],
  ['the guard no longer runs when the file is EXECUTED', 'delegation-receipts/guard.mjs', 'runWhenMain(import.meta.url, hookMain(evaluate));', ''],

  // --- THE REFUSAL'S OWN CONTENT. A control that decides correctly but explains poorly gets routed
  //     around, which is the same end state as one that cannot fire, reached by another road.
  ['the refusal stops naming which attempt was not launched', 'delegation-receipts/guard.mjs', '`  - ${attempt.tool}: ${attempt.label}', '`  - (a delegation)'],
  ['the refusal stops quoting the guard that refused', 'delegation-receipts/guard.mjs', "attempt.reason ?? '(no reason recorded)'", "''"],
  ['an attempt is named by its mechanism instead of by what the author wrote', 'delegation-receipts/turn-delegations.mjs', 'const named = from(input?.description) ?? from(input?.to) ?? from(input?.recipient) ?? from(input?.summary);', 'const named = undefined;'],
  ['the refusal stops printing the runnable abandonment command', 'delegation-receipts/guard.mjs', '`     node "${ABANDON_CLI}" --session ${sessionId} \\\\`,', "'     (abandon it somehow)',"],
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['delegation-receipts', 'hook-state', 'bilingual-output'],
  selftest: 'delegation-receipts/selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
});

process.exit(survivors === 0 ? 0 : 1);
