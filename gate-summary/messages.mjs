/**
 * Every human-readable line the gate summary prints, in the house bilingual form. Verdict words, `EXIT=`
 * and `LOG=` are NOT here: a program parses them, so they are never translated.
 * @es Cada línea legible que imprime el resumen de gates, en la forma bilingüe de la casa. Las palabras de
 * veredicto, `EXIT=` y `LOG=` NO están aquí: un programa las parsea y nunca se traducen.
 */

import { render } from '../bilingual-output/message.mjs';

export const MESSAGES = Object.freeze({
  usage: { en: 'usage: run.mjs [--cwd <dir>] [--excerpt <lines>] [--timeout <seconds>] [--state <dir>] -- <command> [args...]', es: 'uso: run.mjs [--cwd <dir>] [--excerpt <líneas>] [--timeout <segundos>] [--state <dir>] -- <orden> [args...]' },
  badOption: { en: 'unknown or incomplete option: {option}.', es: 'opción desconocida o incompleta: {option}.' },
  marks: { en: 'exit 0, but the log holds {count} line(s) with error markers; read them before trusting the green.', es: 'salida 0, pero el log contiene {count} línea(s) con marcas de error; léelas antes de fiarte del verde.' },
  killed: { en: 'killed (timeout or signal); this says nothing about the code.', es: 'abatido (límite de tiempo o señal); no dice nada del código.' },
  notRun: { en: 'the command could not be started ({reason}); this says nothing about the code.', es: 'no se pudo iniciar la orden ({reason}); no dice nada del código.' },
  excerpt: { en: 'excerpt: {shown} of {total} line(s)', es: 'extracto: {shown} de {total} línea(s)' }
});

/** Renders the named message with its parameters. @es Renderiza el mensaje nombrado con sus parámetros. */
export const say = (name, params) => render(MESSAGES[name], params);
