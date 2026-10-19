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

import { halvesOf, messageProblems, placeholdersOf, render } from './message.mjs';

let passed = 0;
const failures = [];
const equal = (name, actual, expected) => (JSON.stringify(actual) === JSON.stringify(expected) ? (passed += 1) : failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));
const attempt = (fn) => { try { return fn(); } catch (error) { return `threw: ${error instanceof Error ? error.message : String(error)}`; } };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

equal('a one-line message is English, @es, Spanish', render({ en: 'Hello.', es: 'Hola.' }), 'Hello. @es Hola.');
equal('a multi-line message is its English lines then its Spanish lines marked @es', render({ en: ['one', 'two'], es: ['uno', 'dos'] }), 'one\ntwo\n  @es uno\n  @es dos');
equal('halves of different line counts still render, English first', render({ en: ['one'], es: ['uno', 'dos'] }), 'one\n  @es uno\n  @es dos');
equal('placeholders are filled in both halves', render({ en: 'Key {key} in {file}.', es: 'Clave {key} en {file}.' }, { key: 'k', file: 'f' }), 'Key k in f. @es Clave k en f.');
equal('a placeholder repeated in a line is filled everywhere', render({ en: '{n} and {n}', es: '{n} y {n}' }, { n: 3 }), '3 and 3 @es 3 y 3');
equal('a placeholder with no parameter throws instead of printing braces', throws(() => render({ en: 'Key {key}.', es: 'Clave {key}.' }, {})), true);
equal('a parameter value that looks like a placeholder is printed as it is, not filled again', render({ en: 'x {a}', es: 'x {a}' }, { a: '{b}', b: 'no' }), 'x {b} @es x {b}');
equal('literal braces that are not a plain name survive', attempt(() => render({ en: 'Use {"keys":[1]}.', es: 'Usa {"keys":[1]}.' })), 'Use {"keys":[1]}. @es Usa {"keys":[1]}.');
equal('placeholders are listed in order, literal braces excluded', placeholdersOf('a {x} {"k":1} {y} {}'), ['x', 'y']);

const CLEAN = { greet: { en: 'Hello {who}.', es: 'Hola {who}.' }, bye: { en: ['Bye.', 'See you.'], es: ['Adiós.', 'Hasta luego.'] } };

equal('a clean table reports nothing', messageProblems(CLEAN), []);
equal('a message with no Spanish half is flagged, in both languages', messageProblems({ ...CLEAN, bad: { en: 'Only English.' } }), ['bad: a half is missing or empty. @es bad: falta una mitad o está vacía.']);
equal('a Spanish copy is flagged, in both languages', messageProblems({ ...CLEAN, bad: { en: 'Same.', es: 'Same.' } }), ['bad: the Spanish half is a copy of the English one. @es bad: la mitad española es una copia de la inglesa.']);
equal('different placeholders are flagged, in both languages', messageProblems({ ...CLEAN, bad: { en: 'Key {key}.', es: 'Clave.' } }), ['bad: the halves name different placeholders. @es bad: las mitades nombran marcadores distintos.']);
equal('a message with an empty Spanish half is flagged', messageProblems({ ...CLEAN, bad: { en: 'Hi.', es: ['  '] } }).length, 1);
equal('a Spanish half that copies the English one is flagged', messageProblems({ ...CLEAN, bad: { en: 'Same.', es: 'Same.' } }).length, 1);
equal('a Spanish half that drops a placeholder is flagged', messageProblems({ ...CLEAN, bad: { en: 'Key {key}.', es: 'Clave.' } }).length, 1);
equal('a Spanish half that adds a placeholder is flagged', messageProblems({ ...CLEAN, bad: { en: 'Key.', es: 'Clave {key}.' } }).length, 1);
equal('the same placeholders in another order are not a problem', messageProblems({ ...CLEAN, ok: { en: '{a} then {b}.', es: '{b} tras {a}.' } }), []);
equal('...whichever half is the reordered one', messageProblems({ ...CLEAN, ok: { en: '{b} then {a}.', es: '{a} tras {b}.' } }), []);
// A datum written in one language is passed once per half: `{xEn}` in English and `{xEs}` in Spanish are one datum.
// @es Un dato escrito en un idioma se pasa una vez por mitad: `{xEn}` en inglés y `{xEs}` en español son un mismo dato.
equal('a datum split into its English and Spanish halves is not a problem', messageProblems({ ...CLEAN, ok: { en: 'Failed: {reasonEn}.', es: 'Falló: {reasonEs}.' } }), []);
equal('a split datum renders each half in its own language, with one @es', render({ en: 'Failed: {reasonEn}.', es: 'Falló: {reasonEs}.' }, { reasonEn: 'boom', reasonEs: 'pum' }), 'Failed: boom. @es Falló: pum.');
equal('the Spanish half of a datum in the English half is flagged', messageProblems({ ...CLEAN, bad: { en: 'Failed: {reasonEs}.', es: 'Falló: {reasonEs}.' } }).length, 1);
equal('the English half of a datum in the Spanish half is flagged', messageProblems({ ...CLEAN, bad: { en: 'Failed: {reasonEn}.', es: 'Falló: {reasonEn}.' } }).length, 1);
equal('a split datum against a plain one is flagged', messageProblems({ ...CLEAN, bad: { en: 'Failed: {reasonEn}.', es: 'Falló: {reason}.' } }).length, 1);
equal('a split datum whose stems differ is flagged', messageProblems({ ...CLEAN, bad: { en: 'Failed: {reasonEn}.', es: 'Falló: {causeEs}.' } }).length, 1);
equal('a one-line bilingual text splits at its first @es', attempt(() => halvesOf('boom @es pum')), { en: 'boom', es: 'pum' });
equal('a later @es stays in the Spanish half', attempt(() => halvesOf('a @es b @es c')), { en: 'a', es: 'b @es c' });
equal('a text in one language only is both halves', attempt(() => halvesOf('boom')), { en: 'boom', es: 'boom' });
equal('a value that is not text is read as its text', attempt(() => halvesOf(42)), { en: '42', es: '42' });
equal('a name that is only the suffix is a plain placeholder', messageProblems({ ...CLEAN, bad: { en: 'Failed: {En}.', es: 'Falló: {Es}.' } }).length, 1);

// G8-a: a message without its @es half is refused when rendered, by name, in both languages — never printed English only.
// @es G8-a: un mensaje sin su mitad @es se rechaza al renderizarlo, por nombre y en ambos idiomas; nunca se imprime solo en inglés.
const REFUSAL = 'a message half is missing or empty. @es a un mensaje le falta una mitad o está vacía.';
const refusalOf = (message) => attempt(() => render(message));

equal('a message with no Spanish half is refused when rendered', refusalOf({ en: 'Only English.' }), `threw: ${REFUSAL}`);
equal('a message with an empty Spanish half is refused when rendered', refusalOf({ en: 'Hi.', es: '' }), `threw: ${REFUSAL}`);
equal('a message whose Spanish lines are all blank is refused when rendered', refusalOf({ en: 'Hi.', es: ['  ', ''] }), `threw: ${REFUSAL}`);
equal('a message with no English half is refused when rendered', refusalOf({ es: 'Solo español.' }), `threw: ${REFUSAL}`);
equal('a message with both halves still renders', refusalOf({ en: 'Hi.', es: 'Hola.' }), 'Hi. @es Hola.');

console.log(`message selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
