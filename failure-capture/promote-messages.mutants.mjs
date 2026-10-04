#!/usr/bin/env node
/**
 * The decisions of what `capture.mjs promote` says — the instructions a recurring lesson owes, each
 * refusal, the growth refusal and the report of a closed promotion — each broken once: a sentence going back
 * to English only, a variant of a message chosen wrongly, a closure problem losing its Spanish half, a table
 * half losing its mirror. `promote-messages.selftest.mjs` must catch every one. The runner and its rules
 * live in `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de lo que dice `capture.mjs promote` —las instrucciones que debe una lección
 * recurrente, cada negativa, la negativa por crecimiento y el informe de una promoción cerrada—, rotas una
 * a una: una frase que vuelve a solo inglés, una variante de mensaje mal elegida, un problema de cierre que
 * pierde su mitad española, una mitad de la tabla que pierde su espejo. Las debe cazar
 * `promote-messages.selftest.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const COMMAND = 'failure-capture/capture.mjs';
const TABLE = 'failure-capture/promote-messages.mjs';
const CLOSURE = 'failure-capture/closure.mjs';

/** A mutant that puts an English-only text where the message was. @es Un mutante que pone un texto solo en inglés donde estaba el mensaje. */
const english = (label, from, to) => [`${label} goes back to English only`, COMMAND, from, to];

const MUTANTS = [
  // --- refusals
  english('the invalid-key refusal', "speaker.complain('promote.keyInvalid');", "console.error('promote REFUSED');"),
  english('the not-a-lesson refusal', "speaker.complain('promote.notALesson', { key });", "console.error('promote REFUSED');"),
  english('the no-closure refusal', "speaker.complain('promote.noClosure');", "console.error('promote REFUSED');"),
  english('the not-landed refusal', "speaker.complain('promote.notLanded');", "console.error('promote REFUSED');"),
  english('the missing global token', "missing.push(speaker.line('promote.missing.token', { key, file: ORCHESTRATOR_RULES }))", "missing.push('the token is absent')"),
  english('the missing contract token', "missing.push(speaker.line('promote.missing.token', { key, file }))", "missing.push('the token is absent')"),
  english('the missing parity anchor', "missing.push(speaker.line('promote.missing.anchor', { key, gate: PARITY_GATE }))", "missing.push('the anchor is absent')"),
  english('the growth refusal header', "speaker.complain('promote.alreadyPromoted');", "console.error('promote REFUSED');"),
  english('the parity-red refusal', "speaker.complain('promote.parityRed');", "console.error('promote REFUSED');"),
  english('the mechanism refusal', "speaker.complain('promote.mechanismFailed');", "console.error('promote REFUSED');"),
  english('the locked-ledger refusal', "speaker.complain('promote.locked');", "console.error('promote REFUSED');"),

  // --- the growth refusal
  english('the growth refusal of a file', "speaker.line('growth.file', { key, date, file, now, then })", "`${file} has not grown`"),
  ['the growth advice is dropped', COMMAND, ", speaker.line('growth.advice')].join", '].join'],

  // --- the instructions
  english('the global instructions', "speaker.line('instructions.global', { file: ORCHESTRATOR_RULES, key })", '`add the rule to ${ORCHESTRATOR_RULES}`'),
  english('the way to close', "speaker.line('instructions.close', { number })", '`${number}. close it`'),
  english('the note on the way to close', "speaker.line('instructions.close.note')", "'the mechanism must name the key'"),
  english('the global tail', "speaker.line('instructions.global.tail')", "'it refuses'"),
  english('a contract step', "speaker.line('instructions.contract.step', { number: at + 1, file, key })", '`add the rule to ${file}`'),
  ['the contract steps all carry the same number', COMMAND, "{ number: at + 1, file, key }", '{ number: 1, file, key }'],
  english('the parity step', "speaker.line('instructions.contract.parity', { number: contractSteps.length + 1, key, gate: PARITY_GATE })", '`add ${key} to ${PARITY_GATE}`'),
  ['the parity step is dropped', COMMAND, 'const paritySteps = PARITY_GATE === undefined ? [] : [', 'const paritySteps = [] ?? ['],
  ['the headline never says there is a parity gate', COMMAND, "speaker.line(PARITY_GATE === undefined ? 'instructions.contract' : 'instructions.contract.gate', ", "speaker.line('instructions.contract', "],
  ['the warning about several contract files is dropped', COMMAND, "...(WORKER_CONTRACTS.length > 1 ? [speaker.line('instructions.contract.many')] : []),", '...[],'],
  ['the warning about several contract files is always given', COMMAND, "WORKER_CONTRACTS.length > 1 ? [speaker.line('instructions.contract.many')]", "WORKER_CONTRACTS.length > 0 ? [speaker.line('instructions.contract.many')]"],
  ['the tail never says the parity gate runs', COMMAND, "speaker.line(PARITY_GATE === undefined ? 'instructions.contract.tail' : 'instructions.contract.tail.gate')", "speaker.line('instructions.contract.tail')"],

  // --- a closed promotion
  english('the promoted headline', "speaker.say('promote.done', { key });", "console.log('PROMOTED');"),
  ['a project promotion says it landed in the global file', COMMAND, "target === GLOBAL_TARGET ? 'promote.landed.global' : 'promote.landed.contract'", "'promote.landed.global'"],
  ['the files it landed in are not listed', COMMAND, "files: contractFilesOf(target).join(', ')", "files: ''"],
  ['a project promotion claims only a token in the file', COMMAND, "if (target !== PROJECT_TARGET) return ['promote.proof.token', {}];", "if (true) return ['promote.proof.token', {}];"],
  ['a promotion with a parity gate claims no gate ran', COMMAND, "PARITY_GATE === undefined ? 'promote.proof.contracts' : 'promote.proof.contractsGate'", "'promote.proof.contracts'"],
  ['a promotion with no parity gate claims one ran', COMMAND, "PARITY_GATE === undefined ? 'promote.proof.contracts' : 'promote.proof.contractsGate'", "'promote.proof.contractsGate'"],
  ['a mechanism closure is reported as a reason', COMMAND, "closure.kind === 'mechanism' ? 'promote.closed.mechanism' : 'promote.closed.reason'", "'promote.closed.reason'"],
  ['the reason of a closure is not reported', COMMAND, ": { reason: closure.reason });", ": { reason: '' });"],
  english('the stub notice', "speaker.say('promote.stub');", "console.log('The ledger line is now a stub.');"),

  // --- the closure problems and the table
  ['every closure problem loses its Spanish half', CLOSURE, 'const both = (english, spanish) => `${english} @es ${spanish}`;', 'const both = (english, spanish) => english;'],
  ['a Spanish half drops a placeholder of its English half', TABLE, 'Añade la regla a {file} e incluye en ella el token literal "{key}".', 'Añade la regla a {file} e incluye en ella el token literal.'],
  ['a Spanish half is a copy of its English half', TABLE, "es: 'PROMOVIDA \"{key}\".'", "es: 'PROMOTED \"{key}\".'"],
  ['a Spanish half is empty', TABLE, "es: 'La línea del ledger ahora es un muñón, así que la lección cuesta una fracción de los tokens que costaba.'", "es: ''"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'mutation-proof'],
  selftest: 'failure-capture/promote-messages.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
