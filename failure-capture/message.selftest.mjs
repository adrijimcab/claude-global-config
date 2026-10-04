#!/usr/bin/env node
/**
 * Discrimination proof of the bilingual message form (`message.mjs`): how a one-line and a multi-line
 * message render, how placeholders fill (and refuse to stay unfilled), that literal braces survive, and that
 * `messageProblems` flags each way a table can lose a half: a missing or empty half, an untranslated copy,
 * and halves that name different placeholders. A table that is clean must report nothing.
 *
 * @es Prueba de discriminación de la forma del mensaje bilingüe: cómo se renderiza uno de una línea y uno de
 * varias, cómo se rellenan los marcadores (y que no se quedan sin rellenar), que las llaves literales
 * sobreviven, y que `messageProblems` marca cada forma de perder una mitad. Una tabla limpia no informa nada.
 */

import { messageProblems, placeholdersOf, render } from './message.mjs';

let passed = 0;
const failures = [];
const equal = (name, actual, expected) => (JSON.stringify(actual) === JSON.stringify(expected) ? (passed += 1) : failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

equal('a one-line message is English, @es, Spanish', render({ en: 'Hello.', es: 'Hola.' }), 'Hello. @es Hola.');
equal('a multi-line message is its English lines then its Spanish lines marked @es', render({ en: ['one', 'two'], es: ['uno', 'dos'] }), 'one\ntwo\n  @es uno\n  @es dos');
equal('halves of different line counts still render, English first', render({ en: ['one'], es: ['uno', 'dos'] }), 'one\n  @es uno\n  @es dos');
equal('placeholders are filled in both halves', render({ en: 'Key {key} in {file}.', es: 'Clave {key} en {file}.' }, { key: 'k', file: 'f' }), 'Key k in f. @es Clave k en f.');
equal('a placeholder repeated in a line is filled everywhere', render({ en: '{n} and {n}', es: '{n} y {n}' }, { n: 3 }), '3 and 3 @es 3 y 3');
equal('a placeholder with no parameter throws instead of printing braces', throws(() => render({ en: 'Key {key}.', es: 'Clave {key}.' }, {})), true);
equal('a parameter value that looks like a placeholder is printed as it is, not filled again', render({ en: 'x {a}', es: 'x {a}' }, { a: '{b}', b: 'no' }), 'x {b} @es x {b}');
equal('literal braces that are not a plain name survive', render({ en: 'Use {"keys":[1]}.', es: 'Usa {"keys":[1]}.' }), 'Use {"keys":[1]}. @es Usa {"keys":[1]}.');
equal('placeholders are listed in order, literal braces excluded', placeholdersOf('a {x} {"k":1} {y} {}'), ['x', 'y']);

const CLEAN = { greet: { en: 'Hello {who}.', es: 'Hola {who}.' }, bye: { en: ['Bye.', 'See you.'], es: ['Adiós.', 'Hasta luego.'] } };

equal('a clean table reports nothing', messageProblems(CLEAN), []);
equal('a message with no Spanish half is flagged', messageProblems({ ...CLEAN, bad: { en: 'Only English.' } }).length, 1);
equal('a message with an empty Spanish half is flagged', messageProblems({ ...CLEAN, bad: { en: 'Hi.', es: ['  '] } }).length, 1);
equal('a Spanish half that copies the English one is flagged', messageProblems({ ...CLEAN, bad: { en: 'Same.', es: 'Same.' } }).length, 1);
equal('a Spanish half that drops a placeholder is flagged', messageProblems({ ...CLEAN, bad: { en: 'Key {key}.', es: 'Clave.' } }).length, 1);
equal('a Spanish half that adds a placeholder is flagged', messageProblems({ ...CLEAN, bad: { en: 'Key.', es: 'Clave {key}.' } }).length, 1);
equal('the same placeholders in another order are not a problem', messageProblems({ ...CLEAN, ok: { en: '{a} then {b}.', es: '{b} tras {a}.' } }), []);
equal('...whichever half is the reordered one', messageProblems({ ...CLEAN, ok: { en: '{b} then {a}.', es: '{a} tras {b}.' } }), []);

console.log(`message selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
