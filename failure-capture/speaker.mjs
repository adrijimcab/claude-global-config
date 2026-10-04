/**
 * The one way `capture.mjs` prints: a message of a table, rendered in the house bilingual form
 * (`message.mjs`), or a line of pure data. Funnelling every output through here is what lets a proof show
 * that no sentence of the command is English only: the command holds no `console.*` call of its own, and a
 * message id the table does not carry throws instead of printing nothing.
 *
 * @es La única manera en que `capture.mjs` imprime: un mensaje de una tabla, renderizado en la forma
 * bilingüe de la casa, o una línea de puro dato. Encauzar toda salida por aquí permite probar que ninguna
 * frase del comando es solo inglés: el comando no tiene ningún `console.*` propio, y un id de mensaje que la
 * tabla no lleva lanza en vez de no imprimir nada.
 */

import { render } from './message.mjs';

/**
 * A speaker over `table`. `say` and `complain` print a message to the standard output and error; `data`
 * and `dataError` print a line as it is — a listing row, a command to copy, or text a module already
 * rendered bilingual; `blank` prints an empty line. `sink` replaces the console, so a proof can capture
 * what is printed.
 * @es Un speaker sobre `table`. `say` y `complain` imprimen un mensaje; `data` y `dataError` imprimen una línea tal cual (fila de listado, comando a copiar o texto que un módulo ya renderizó bilingüe); `blank`, una vacía. `sink` sustituye la consola.
 */
export function makeSpeaker(table, sink = console) {
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
