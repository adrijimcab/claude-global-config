#!/usr/bin/env node
/**
 * DISCRIMINATION PROOF for `hook-state/input-digest.mjs`, the digest policy of every journal. THE STATE SPACE:
 * a string input (checked against the published sha256 test vector of "abc"), an object input (digested as its
 * JSON, never passed raw to the hash) and two different inputs. That the hook journal re-exports this same
 * function is proved by `journal.selftest.mjs`, which isolates the journal's state.
 *
 * @es PRUEBA DE DISCRIMINACIÓN de `input-digest.mjs`, la política de digest de todo journal. Espacio de estados:
 * una cadena (contra el vector de prueba publicado de sha256 para "abc"), un objeto (digerido como su JSON, nunca
 * pasado tal cual al hash) y dos entradas distintas. Que el journal de hooks reexporta esta misma función lo
 * prueba `journal.selftest.mjs`, que aísla el estado del journal.
 */

import { digestInput } from './input-digest.mjs';

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

if (failures.length > 0) {
  console.log(`FAIL ${failures.length} of ${passed + failures.length} checks. @es FALLO ${failures.length} de ${passed + failures.length} comprobaciones.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`PASS ${passed} checks. @es PASAN ${passed} comprobaciones.`);
