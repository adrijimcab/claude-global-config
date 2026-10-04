#!/usr/bin/env node
/**
 * Discrimination proof of the speaker (`speaker.mjs`): a message goes to the stream it belongs to
 * (`say` to the output, `complain` to the error stream), rendered in the house form with its data; data
 * lines and blank lines are printed as they are, on their own stream; and a message id the table does not
 * carry throws instead of printing nothing.
 *
 * @es Prueba de discriminación del speaker: un mensaje va al flujo que le corresponde (`say` a la salida,
 * `complain` al error), renderizado en la forma de la casa con sus datos; las líneas de dato y las vacías se
 * imprimen tal cual, en su flujo; y un id que la tabla no lleva lanza en vez de no imprimir nada.
 */

import { makeSpeaker } from './speaker.mjs';

let passed = 0;
const failures = [];
const equal = (name, actual, expected) => (JSON.stringify(actual) === JSON.stringify(expected) ? (passed += 1) : failures.push(`${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`));

const TABLE = { hello: { en: 'Hello {who}.', es: 'Hola {who}.' } };
const attempt = (fn) => { try { return fn(); } catch (error) { return `threw: ${error instanceof Error ? error.message : String(error)}`; } };
const sink = () => {
  const printed = { log: [], error: [] };

  return { printed, log: (text) => printed.log.push(text), error: (text) => printed.error.push(text) };
};

{
  const out = sink();
  const speaker = makeSpeaker(TABLE, out);

  attempt(() => speaker.say('hello', { who: 'you' }));
  equal('say prints the rendered message on the output', out.printed, { log: ['Hello you. @es Hola you.'], error: [] });
}

{
  const out = sink();

  attempt(() => makeSpeaker(TABLE, out).complain('hello', { who: 'me' }));
  equal('complain prints the rendered message on the error stream', out.printed, { log: [], error: ['Hello me. @es Hola me.'] });
}

{
  const out = sink();
  const speaker = makeSpeaker(TABLE, out);

  attempt(() => speaker.data('  key (3x)'));
  speaker.dataError('  bilingual text from a module @es texto bilingüe de un módulo');
  speaker.blank();
  equal('data, dataError and blank print as they are, each on its own stream', out.printed, { log: ['  key (3x)', ''], error: ['  bilingual text from a module @es texto bilingüe de un módulo'] });
}

{
  const out = sink();
  const speaker = makeSpeaker(TABLE, out);
  const thrownFor = (call) => { try { call(); return ''; } catch (error) { return error instanceof Error ? error.message : String(error); } };
  const refusalFor = (id) => `no message "${id}" in the table. @es el mensaje "${id}" no está en la tabla.`;

  equal('an id the table does not carry is refused by name, bilingual, on say', thrownFor(() => speaker.say('nope')), refusalFor('nope'));
  equal('...and on complain', thrownFor(() => speaker.complain('nope')), refusalFor('nope'));
  equal('...and nothing was printed', out.printed, { log: [], error: [] });
  equal('an id named like an object property is not a message', thrownFor(() => speaker.say('toString')), refusalFor('toString'));
  equal('line returns the rendered text without printing', attempt(() => speaker.line('hello', { who: 'x' })), 'Hello x. @es Hola x.');
}

// G8-a at load: a table with a message lacking its @es half is refused when the speaker is made, naming the id,
// so no emitter over it can print English only. @es G8-a al cargar: una tabla con un mensaje sin su mitad @es se rechaza al crear el speaker, nombrando el id.
{
  const loadingFor = (table) => attempt(() => makeSpeaker(table, sink()));

  equal('a table whose message has no Spanish half is refused at load, naming the id', loadingFor({ ...TABLE, bare: { en: 'Only English.' } }), 'threw: message table is not bilingual. @es la tabla de mensajes no es bilingüe.\n  - bare: a half is missing or empty. @es bare: falta una mitad o está vacía.');
  equal('a table whose Spanish half copies the English one is refused at load', loadingFor({ ...TABLE, same: { en: 'Same.', es: 'Same.' } }), 'threw: message table is not bilingual. @es la tabla de mensajes no es bilingüe.\n  - same: the Spanish half is a copy of the English one. @es same: la mitad española es una copia de la inglesa.');
  equal('a clean table loads', typeof loadingFor(TABLE).say, 'function');
}

console.log(`speaker selftest: ${String(passed)} passed, ${String(failures.length)} failed`);
for (const failure of failures) console.error(`  FAIL ${failure}`);
process.exit(failures.length === 0 ? 0 : 1);
