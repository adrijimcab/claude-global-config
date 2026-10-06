#!/usr/bin/env node
/**
 * The decisions of what `capture.mjs` says when it records, lists, dismisses, inits or reports status,
 * each broken once — a sentence going back to English only, a message losing its data, a table half losing
 * its mirror — that `capture-messages.selftest.mjs` must catch. The runner and its rules live in
 * `../mutation-proof/run-mutants.mjs`.
 *
 * @es Las decisiones de lo que dice `capture.mjs` al registrar, listar, descartar, iniciar o informar del
 * estado, rotas una a una —una frase que vuelve a solo inglés, un mensaje que pierde su dato, una mitad de
 * la tabla que pierde su espejo—; las debe cazar `capture-messages.selftest.mjs`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const COMMAND = 'failure-capture/capture.mjs';
const TABLE = 'failure-capture/capture-messages.mjs';

/** A mutant that puts an English-only line where the message was. @es Un mutante que pone una línea solo en inglés donde estaba el mensaje. */
const english = (label, from, to) => [`${label} goes back to English only`, COMMAND, from, to];

const MUTANTS = [
  english('the empty key list', "speaker.say('keys.none');", "console.log('(no keyed lessons yet)');"),
  english('the key list header', "speaker.say('keys.header');", "console.log('EXISTING LESSON KEYS');"),
  ['a key row loses its count', COMMAND, 'speaker.data(`  ${key}  (${String(count)}x)`);', 'speaker.data(`  ${key}`);'],
  english('the capture refusal header', "speaker.complain('capture.refused');", "console.error('capture REFUSED');"),
  english('the key problem', "problems.push(speaker.line('capture.problem.key'))", "problems.push('--key is invalid')"),
  english('the actor problem', "problems.push(speaker.line('capture.problem.actor'))", "problems.push('--actor is invalid')"),
  english('the short lesson problem', "problems.push(speaker.line('capture.problem.lessonShort'))", "problems.push('--lesson is short')"),
  english('the missing RULE problem', "problems.push(speaker.line('capture.problem.lessonRule'))", "problems.push('--lesson has no RULE')"),
  ['the scope problem forgets that no project holds the directory', COMMAND, "speaker.line(PROJECT === undefined ? 'capture.problem.scope.noProject' : 'capture.problem.scope', ", "speaker.line('capture.problem.scope', "],
  ['the scope problem loses the allowed scopes', COMMAND, "{ allowed: SCOPES.map((one) => `\"${one}\"`).join(' / ') }", '{ allowed: \'\' }'],
  english('the spooled-behind-a-lock notice', "speaker.say('capture.deferred', { count: deferred });", "console.log('RECORDED (spooled)');"),
  ['the reason a rule was not shortened is never shown', COMMAND, 'if (mine.fallback !== undefined) speaker.data(`NOTE — ${mine.fallback}`);', 'if (false) speaker.data(mine.fallback);'],
  english('the new-lesson notice', "speaker.say('capture.new', { key });", 'console.log(`RECORDED ${key}`);'),
  english('the recurrence notice', "speaker.say('capture.recurrence', { key, count: mine.count });", 'console.log(`RECURRENCE ${key}`);'),
  english('the dismissal refusal', "speaker.complain('dismiss.refused');", "console.error('dismiss REFUSED');"),
  english('the dismissal confirmation', "speaker.say('dismiss.done');", "console.log('DISMISSED');"),
  english('the ledger line of status', "speaker.say('status.ledger', { scope: ledger.scope, file: ledger.file, bytes, tokens: Math.round(bytes / 4) });", 'console.log(`ledger ${ledger.scope}`);'),
  english('the keyed count of status', "speaker.say('status.keyed', { count: keys.size });", 'console.log(`keyed ${keys.size}`);'),
  english('the incident count of status', "speaker.say('status.incidents', { count: incidents });", 'console.log(`incidents ${incidents}`);'),
  english('the dismissal count of status', "speaker.say('status.dismissals', { count: dismissals });", 'console.log(`dismissals ${dismissals}`);'),
  english('the promotion-due header', "speaker.say('status.due');", "console.log('PROMOTION DUE');"),
  ['a promotion-due row loses its target', COMMAND, '-> ${promotionTarget(key)}`);', '`);'],
  english('the init refusal', "speaker.complain('init.noProject');", "console.error('init REFUSED');"),
  english('the init ledger line', "speaker.say(created ? 'init.ledger.created' : 'init.ledger.present', { scope: PROJECT.scope, file: PROJECT.ledgerFile });", 'console.log(`ledger ${PROJECT.ledgerFile}`);'),
  ['init says the ledger is created when it is already there', COMMAND, "speaker.say(created ? 'init.ledger.created' : 'init.ledger.present',", "speaker.say('init.ledger.created',"],
  ['init says the import is added when it is already there', COMMAND, "speaker.say(imported ? 'init.import.present' : 'init.import.added',", "speaker.say('init.import.added',"],
  english('the usage', "speaker.say('usage');", "console.log('usage');"),
  english('the condense refusal', "speaker.complain('condense.keysInvalid', { detail: error instanceof Error ? error.message : String(error) });", "console.error('condense REFUSED');"),
  english('the unreadable-configuration refusal', "speaker.complain('project.configUnreadable', { command, defect });", "console.error('REFUSED');"),
  ['an output bypasses the speaker, which only the scan for console calls can see', COMMAND, 'speaker.dataError(renderUnmeasured(error instanceof Error ? error.message : String(error)));', 'console.error(renderUnmeasured(error instanceof Error ? error.message : String(error)));'],
  ['a Spanish half drops a placeholder of its English half', TABLE, 'REINCIDENCIA: "{key}" ya se registró {count}x.', 'REINCIDENCIA: "{key}" ya se registró.'],
  ['a Spanish half is a copy of its English half', TABLE, "es: 'lecciones con clave: {count}'", "es: 'keyed lessons: {count}'"],
  ['a Spanish half is empty', TABLE, "es: 'DESCARTADA y registrada. El turno puede terminar.'", "es: ''"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['failure-capture', 'bilingual-output', 'mutation-proof', 'hook-state'],
  selftest: 'failure-capture/capture-messages.selftest.mjs',
  mutants: MUTANTS
});

process.exit(survivors === 0 ? 0 : 1);
