#!/usr/bin/env node
/**
 * The decisions of `hook-state/messages.mjs`, each broken once, that `messages.selftest.mjs` must catch. The
 * runner and its rules live in `../mutation-proof/run-mutants.mjs`; `crashKills: 'fail'` makes a mutant that
 * only crashes the selftest count as a survivor.
 *
 * @es Las decisiones de `messages.mjs`, rotas una a una, que `messages.selftest.mjs` debe detectar. Un
 * mutante que solo hace caer el selftest cuenta como superviviente (`crashKills: 'fail'`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMutants } from '../mutation-proof/run-mutants.mjs';

const M = 'hook-state/messages.mjs';

const MUTANTS = [
  // --- both halves are required ---
  ['a missing Spanish half is accepted', M, "typeof entry.es !== 'string' || entry.es === ''", 'false'],
  ['an empty Spanish half is accepted', M, "|| entry.es === ''", ''],
  ['a missing English half is accepted', M, "typeof entry.en !== 'string' || entry.en === ''", 'false'],
  ['an empty English half is accepted', M, "|| entry.en === ''", ''],
  ['the throw of a missing Spanish half loses its own @es half', M, ' @es El mensaje «${id}» no tiene mitad en español.', ''],

  // --- ids and parameters ---
  ['an inherited property name is an id', M, '!Object.hasOwn(table, id)', '!(id in table)'],
  ['an unknown id is looked up anyway', M, '!Object.hasOwn(table, id)', 'false'],
  ['a parameter nobody passed is printed as undefined', M, '!Object.hasOwn(params, name)', 'false'],
  ['only the first placeholder of a text is filled', M, '/\\{(\\w+)\\}/g', '/\\{(\\w+)\\}/'],

  // --- the rendered line ---
  ['the Spanish half comes first', M, 'fill(id, table[id].en, params)} @es ${fill(id, table[id].es, params)}', 'fill(id, table[id].es, params)} @es ${fill(id, table[id].en, params)}'],
  ['the halves are not marked with @es', M, '} @es ${', '} / ${'],
  ['the Spanish half keeps its placeholders', M, 'fill(id, table[id].es, params)}`;', 'table[id].es}`;'],

  // --- the shipped table ---
  ['a shipped message loses its Spanish half', M, "es: 'Tipo de registro de journal desconocido «{kind}»; tipos permitidos: {allowed}.'", "es: ''"],
  ['a shipped message repeats its English half as the Spanish one', M, "es: 'Tipo de registro de journal desconocido «{kind}»; tipos permitidos: {allowed}.'", "es: 'Unknown journal record kind \"{kind}\"; allowed kinds: {allowed}.'"],
  ['a shipped message names a placeholder in one half only', M, "es: 'El campo «{field}» del registro de journal falta o tiene un tipo erróneo ({expected}).'", "es: 'El campo «{field}» del registro de journal falta o tiene un tipo erróneo ({expected}) {extra}.'"]
];

const survivors = runMutants({
  fleetRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  paths: ['hook-state'],
  selftest: 'hook-state/messages.selftest.mjs',
  mutants: MUTANTS,
  crashKills: 'fail',
  timeoutMs: 300_000
});

process.exit(survivors === 0 ? 0 : 1);
