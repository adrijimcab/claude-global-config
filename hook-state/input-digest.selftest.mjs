#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/input-digest.mjs`, the digest policy of every journal. THE STATE SPACE:
 * a string input (checked against the published sha256 test vector of "abc"), an object input (digested as its
 * JSON, never passed raw to the hash), two different inputs, and the hook journal's re-export, which must be
 * this same function so every journal digests alike.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `input-digest.mjs`, la política de digest de todo journal. Espacio de estados:
 * una cadena (contra el vector de prueba publicado de sha256 para "abc"), un objeto (digerido como su JSON, nunca
 * pasado tal cual al hash), dos entradas distintas y la reexportación del journal de hooks, que debe ser esta
 * misma función para que todo journal digiera igual.
 */

import { digestInput } from './input-digest.mjs';
import * as journal from './journal.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;

    return;
  }

  failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** What `action` returns, or the message it threw: a throw is a failed check, never a crash. @es Lo que devuelve `action`, o el mensaje que lanzó. */
function attempt(action) {
  try {
    return action();
  } catch (error) {
    return `threw: ${error.message}`;
  }
}

check('a string is digested as its sha256 hex', attempt(() => digestInput('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
check('an object is digested as its JSON', attempt(() => digestInput({ a: 1 })), attempt(() => digestInput('{"a":1}')));
check('two different inputs have two digests', attempt(() => digestInput('a') === digestInput('b')), false);
check('the hook journal re-exports this same function', journal.digestInput === digestInput, true);

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
