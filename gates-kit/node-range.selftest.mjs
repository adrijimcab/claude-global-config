#!/usr/bin/env node
/**
 * Proof that the `engines.node` reader DISCRIMINATES. State space: each operator (none, `=`, `^`, `~`, `>=`,
 * `>`, `<=`, `<`) at, just under and just over its bounds, with a full, a partial and a wildcard version; a
 * bare `*`; a caret over a zero major and minor; alternatives (`||`) and conjunctions (spaces), an operator
 * separated from its version by a space; the exact ranges the live toolchains' lockfiles hold; and every
 * unreadable input (a range with an empty alternative, an unknown comparator, a version that is not exact),
 * which must throw, never answer.
 *
 * @es Prueba de que el lector de `engines.node` DISCRIMINA: cada operador en, justo bajo y justo sobre sus
 * límites, con versión completa, parcial y comodín; un `*` suelto; caret sobre major y minor cero;
 * alternativas y conjunciones; un operador separado por un espacio; los rangos reales de los lockfiles; y cada
 * entrada ilegible, que debe lanzar y nunca responder.
 */

import { parseVersion, satisfies } from './node-range.mjs';

let passed = 0;
const failures = [];

/** Records one assertion. @es Registra una aserción. */
function check(label, condition) {
  if (condition) passed += 1;
  else failures.push(label);
}

/** The verdict, or `threw` when the reader throws. @es El veredicto, o `threw` si lanza. */
function verdict(version, range) {
  try {
    return satisfies(version, range);
  } catch {
    return 'threw';
  }
}

/** Checks `range` against versions that must and must not satisfy it. @es Comprueba versiones dentro y fuera. */
function bounds(range, inside, outside) {
  for (const version of inside) check(`${version} satisfies ${range}`, verdict(version, range) === true);
  for (const version of outside) check(`${version} does not satisfy ${range}`, verdict(version, range) === false);
}

bounds('22.12.0', ['22.12.0'], ['22.12.1', '22.11.9']);
bounds('=22.12.0', ['22.12.0'], ['22.12.1']);
bounds('18', ['18.0.0', '18.99.99'], ['17.99.99', '19.0.0']);
bounds('6.*', ['6.0.0', '6.5.1'], ['5.9.9', '7.0.0']);
bounds('20.11', ['20.11.0', '20.11.9'], ['20.10.9', '20.12.0']);
bounds('20.x', ['20.0.0', '20.99.0'], ['21.0.0']);
bounds('*', ['0.0.1', '99.0.0'], []);
bounds('>=22.12.0', ['22.12.0', '30.0.0'], ['22.11.99']);
bounds('>= 10.*', ['10.0.0', '22.0.0'], ['9.99.99']);
bounds('>=18', ['18.0.0'], ['17.99.99']);
bounds('>22.12.0', ['22.12.1'], ['22.12.0']);
bounds('>18', ['19.0.0'], ['18.99.99']);
bounds('>18.1', ['18.2.0'], ['18.1.99']);
bounds('<22.12.0', ['22.11.99'], ['22.12.0']);
bounds('<7', ['6.99.99'], ['7.0.0']);
bounds('<=0.7.0', ['0.7.0', '0.6.99'], ['0.7.1']);
bounds('<=20', ['20.99.99'], ['21.0.0']);
bounds('<=20.1', ['20.1.99'], ['20.2.0']);
bounds('^20.19.0', ['20.19.0', '20.99.0'], ['20.18.99', '21.0.0']);
bounds('^22', ['22.0.0', '22.99.99'], ['21.99.99', '23.0.0']);
bounds('^0.7.2', ['0.7.2', '0.7.9'], ['0.7.1', '0.8.0']);
bounds('^0.0.3', ['0.0.3'], ['0.0.4', '0.0.2']);
bounds('^0', ['0.9.9'], ['1.0.0']);
bounds('^0.0', ['0.0.9'], ['0.1.0']);
bounds('~1.2.3', ['1.2.3', '1.2.9'], ['1.2.2', '1.3.0']);
bounds('~1.2', ['1.2.0', '1.2.9'], ['1.3.0', '1.1.9']);
bounds('~1', ['1.0.0', '1.9.9'], ['2.0.0', '0.9.9']);
bounds('>=6 <7 || >=8', ['6.5.0', '8.0.0'], ['7.0.0', '5.9.9']);
bounds('>=16 || 14 >=14.17', ['14.17.0', '16.0.0'], ['14.16.9', '15.0.0']);
bounds('>=0.6.11 <=0.7.0 || >=0.7.3', ['0.6.11', '0.7.0', '0.7.3'], ['0.7.1', '0.6.10']);
bounds('^22.22.3 || ^24.15.0 || >=26.0.0', ['22.22.3', '24.15.0', '26.0.0', '30.1.0'], ['22.22.0', '23.0.0', '24.14.9', '25.9.9']);
bounds('^22||^24||>=26', ['22.0.0', '24.1.0', '26.0.0'], ['23.0.0', '25.0.0', '21.9.9']);
bounds('^18.19.1 || ^20.11.1 || >=22.0.0', ['18.19.1', '20.11.1', '22.0.0'], ['18.19.0', '19.0.0', '21.9.9']);
bounds('18 || 20 || >=22', ['18.1.0', '20.0.0', '22.0.0'], ['19.0.0', '21.0.0']);
bounds('6.* || 8.* || >= 10.*', ['6.1.0', '8.0.0', '10.0.0'], ['7.0.0', '9.9.9']);

check('a v prefix is read', verdict('v22.12.0', '>=22.12.0') === true);
check('a version is read as three numbers', parseVersion('22.12.3').join() === '22,12,3');

for (const [version, range, label] of [
  ['22.12.0', '', 'an empty range'],
  ['22.12.0', '>=18 ||', 'an empty alternative'],
  ['22.12.0', '>=abc', 'an unreadable comparator'],
  ['22.12.0', '>=1.2.3.4', 'a four-part version in a range'],
  ['22.12.0', '!22', 'an unknown operator'],
  ['22.12', '>=18', 'a partial host version'],
  ['22.12.0-rc.1', '>=18', 'a prerelease host version'],
  ['', '>=18', 'an empty host version'],
  ['latest', '>=18', 'a tag as host version'],
]) check(`${label} throws`, verdict(version, range) === 'threw');

if (failures.length > 0) {
  console.error(`gates-kit node-range selftest FAILED @es el selftest de node-range de gates-kit FALLÓ (${failures.length} of ${passed + failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`gates-kit node-range selftest: ${passed} checks passed @es ${passed} comprobaciones correctas`);
