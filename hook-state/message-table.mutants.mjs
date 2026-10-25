#!/usr/bin/env node
/**
 * The decisions of `hook-state/message-table.mjs`, each broken once, that `message-table.selftest.mjs` must
 * catch. The runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a
 * mutant that only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `message-table.mjs`, rotas una a una, que `message-table.selftest.mjs` debe
 * detectar. Un mutante que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const T = 'hook-state/message-table.mjs';

const MUTANTS = [
  // --- both halves, by the house shape ---
  ['a message loses its Spanish half', T, "es: 'Tipo de registro de journal desconocido «{kind}»; tipos permitidos: {allowed}.'", "es: ''"],
  ['a message repeats its English half as the Spanish one', T, "es: 'El contador de disparos {file} no es un contador válido y se dejó intacto.'", "es: 'The fires counter {file} is not a valid counter and was left untouched.'"],
  ['the halves of a message name different placeholders', T, "es: 'El campo «{field}» del registro de journal falta o tiene un tipo erróneo ({expected}).'", "es: 'El campo «{field}» del registro de journal falta o tiene un tipo erróneo ({expected}) {extra}.'"],
  ['a message loses its English half', T, "en: 'A mechanism name must be a plain name (letters, digits, \"-\" and \"_\"), got {value}.'", "en: ''"],

  // --- the exact texts ---
  ['the English text of a message changes', T, 'allowed kinds: {allowed}.', 'allowed: {allowed}.'],
  ['the Spanish text of a message loses its accent', T, 'tipo erróneo ({expected})', 'tipo erroneo ({expected})'],
  ['the Spanish quotes of a message become ASCII', T, 'desconocido «{kind}»', 'desconocido "{kind}"'],

  // --- the table and its consumption ---
  ['the Spanish text of a dismiss message loses its accent', T, 'La opción {option}', 'La opcion {option}'],
  ['a dismiss message says the block is lifted when it is a report', T, 'the block stays in force.', 'the block is lifted.'],
  ['the already-dismissed message loses its once-only half', T, '; a dismissal is recorded once.', '.'],
  ['a dismiss message id is renamed', T, "'already-dismissed': {", "'already-dismissed-x': {"],
  ['a message id is renamed', T, "'bad-mechanism': {", "'bad-mechanisms': {"],
  ['the break-journal fault no longer says the lock was taken', T, ' The lock was taken all the same.', ''],
  ['the breaker release fault no longer says who clears the breaker', T, ' It is left for a later break to clear once this process has exited.', ''],
  ['the breaker release fault loses its Spanish half', T, "es: 'No se pudo soltar el breaker {file} ({code}): {detail}. Queda para que una rotura posterior lo quite cuando este proceso haya terminado.'", "es: ''"],
  ['the lock fault no longer says it is not contention', T, '. This is a fault, not another writer holding it.', '.'],
  ['the ceiling break message no longer names the reused pid', T, ': a reused pid must not wedge the lock.', '.'],
  ['the lock fault message loses its Spanish half', T, "es: 'No se pudo crear el lock {file} ({code}): {detail}. Es un fallo, no otro escritor que lo tiene.'", "es: ''"],
  ['the table is consumed by printing instead of by rendering a line', T, 'line: bilingual', 'say: bilingual']
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state', 'bilingual-output'],
  selftest: 'hook-state/message-table.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
