/**
 * The one way a command prints (`capture.mjs` today, every new CLI next): a message of a table, rendered in the house bilingual form
 * (`message.mjs`), or a line of pure data. Funnelling every output through here is what lets a proof show
 * that no sentence of the command is English only: the command holds no `console.*` call of its own, and a
 * message id the table does not carry throws instead of printing nothing.
 *
 * @es La única manera en que un comando imprime (hoy `capture.mjs`, mañana cada CLI nuevo): un mensaje de una tabla, renderizado en la forma
 * bilingüe de la casa, o una línea de puro dato. Encauzar toda salida por aquí permite probar que ninguna
 * frase del comando es solo inglés: el comando no tiene ningún `console.*` propio, y un id de mensaje que la
 * tabla no lleva lanza en vez de no imprimir nada.
 */

import { messageProblems, render } from './message.mjs';

/**
 * A speaker over `table`. `say` and `complain` print a message to the standard output and error; `data`
 * and `dataError` print a line as it is — a listing row, a command to copy, or text a module already
 * rendered bilingual; `blank` prints an empty line. `sink` replaces the console, so a proof can capture
 * what is printed. A table with a message that lacks a half, or whose halves disagree, throws here,
 * before anything can be printed from it.
 * @es Un speaker sobre `table`. `say` y `complain` imprimen un mensaje; `data` y `dataError` imprimen una línea tal cual (fila de listado, comando a copiar o texto que un módulo ya renderizó bilingüe); `blank`, una vacía. `sink` sustituye la consola. Una tabla con un mensaje al que le falta una mitad, o cuyas mitades no coinciden, lanza aquí, antes de que se pueda imprimir nada de ella.
 */
export function makeSpeaker(table, sink = console) {
  const problems = messageProblems(table);

  if (problems.length > 0) throw new Error(`message table is not bilingual: ${problems.join('; ')}. @es la tabla de mensajes no es bilingüe: ${problems.join('; ')}.`);

  const line = (id, params) => {
    if (!Object.hasOwn(table, id)) throw new Error(`no message "${id}" in the table. @es el mensaje "${id}" no está en la tabla.`);

    return render(table[id], params);
  };

  return {
    say: (id, params) => sink.log(line(id, params)),
    complain: (id, params) => sink.error(line(id, params)),
    data: (text) => sink.log(text),
    dataError: (text) => sink.error(text),
    blank: () => sink.log(''),
    line
  };
}
