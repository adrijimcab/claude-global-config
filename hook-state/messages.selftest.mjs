#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/messages.mjs`: the bilingual message table of the hook-state module.
 * THE STATE SPACE: a known id with and without parameters, an unknown id, an entry with no Spanish half, an
 * entry with an empty half, a parameter the text names but the caller did not pass, and the shipped table
 * itself (every printed line carries its `@es` half).
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `messages.mjs`: la tabla de mensajes bilingües del módulo hook-state.
 * Espacio de estados: id conocido con y sin parámetros, id desconocido, entrada sin mitad en español,
 * entrada con una mitad vacía, parámetro que el texto nombra y el llamador no pasó, y la tabla real (cada
 * línea impresa lleva su mitad `@es`).
 */

import { MESSAGES, bilingual } from './messages.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** The error message `action` throws, or `undefined` when it does not throw. @es Mensaje del error, o `undefined`. */
function thrown(action) {
  try {
    action();
  } catch (error) {
    return error.message;
  }

  return undefined;
}

const TABLE = {
  both: { en: 'Hello {name}.', es: 'Hola {name}.' },
  plain: { en: 'Plain.', es: 'Llano.' },
  noEs: { en: 'Only English.' },
  emptyEs: { en: 'Only English.', es: '' },
  emptyEn: { en: '', es: 'Solo español.' }
};

check('English first, then the @es half, parameters filled in both', bilingual('both', { name: 'Ana' }, TABLE), 'Hello Ana. @es Hola Ana.');
check('a message without parameters renders as written', bilingual('plain', {}, TABLE), 'Plain. @es Llano.');
check('an unknown id throws, with its own @es half', /Unknown message id "nope"\. @es /.test(thrown(() => bilingual('nope', {}, TABLE)) ?? ''), true);
check('an inherited property name is not an id', /Unknown message id/.test(thrown(() => bilingual('toString', {}, TABLE)) ?? ''), true);
check('an entry without @es throws', /has no Spanish half/.test(thrown(() => bilingual('noEs', {}, TABLE)) ?? ''), true);
check('an entry with an empty Spanish half throws', /has no Spanish half/.test(thrown(() => bilingual('emptyEs', {}, TABLE)) ?? ''), true);
check('an entry with an empty English half throws', /has no English half/.test(thrown(() => bilingual('emptyEn', {}, TABLE)) ?? ''), true);
check('a parameter the text names but the caller omitted throws', /parameter "name"/.test(thrown(() => bilingual('both', {}, TABLE)) ?? ''), true);
check('the throw of a missing half is itself bilingual', /@es /.test(thrown(() => bilingual('noEs', {}, TABLE)) ?? ''), true);

for (const id of Object.keys(MESSAGES)) {
  let line;
  try {
    const params = Object.fromEntries([...(MESSAGES[id].en + MESSAGES[id].es).matchAll(/\{(\w+)\}/g)].map((match) => [match[1], 'X']));
    line = bilingual(id, params);
  } catch (error) {
    failures.push(`shipped message "${id}" does not render — ${error.message}`);

    continue;
  }

  const [english, spanish = ''] = line.split(' @es ');
  const placeholders = (text) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();

  check(`shipped message "${id}" names the same placeholders in both halves`, placeholders(MESSAGES[id].en), placeholders(MESSAGES[id].es));

  check(`shipped message "${id}" prints one @es half`, line.split(' @es ').length, 2);
  check(`shipped message "${id}" has text in both halves`, english.length > 0 && spanish.length > 0, true);
  check(`shipped message "${id}" has a Spanish half different from the English one`, english !== spanish, true);
  check(`shipped message "${id}" leaves no placeholder behind`, /\{\w+\}/.test(line), false);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  console.error(`${failures.length} failed, ${passed} passed`);
  process.exit(1);
}

console.log(`${passed} passed`);
