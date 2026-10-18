/**
 * The bilingual refusal for a script that holds useless escapes, in the house form
 * (`bilingual-output/message.mjs`): it names the file, each line and escape, says the backslash will be
 * lost, and gives the three fixes.
 *
 * @es La negativa bilingüe para un script con escapes inútiles, en la forma de la casa: nombra el fichero,
 * cada línea y escape, dice que la barra se perderá y da las tres correcciones.
 */

import { render } from '../bilingual-output/message.mjs';

const BS = String.fromCharCode(92);
const MAX_LISTED = 10;

export const USELESS_ESCAPE_MESSAGE = {
  en: [
    'USELESS-ESCAPE GUARD REFUSED this write: {file} holds a backslash that JavaScript silently drops.',
    '',
    'WHY. Inside a string or template literal, a backslash before a character that is not an escape is discarded,',
    'so the text this script writes loses it (a regex source written this way came out without its backslashes).',
    '',
    'FOUND, by line:',
    '{findings}',
    '',
    'FIX, any of these: double the backslash ({bs}{bs}s for {bs}s); or write the text as a regular expression literal,',
    'where the escape is valid; or change the target file with the Edit tool instead of generating it from a script.'
  ],
  es: [
    'USELESS-ESCAPE GUARD RECHAZÓ esta escritura: {file} tiene una barra invertida que JavaScript descarta en silencio.',
    '',
    'POR QUÉ. Dentro de una cadena o plantilla, una barra antes de un carácter que no es un escape se descarta,',
    'así que el texto que escribe este script la pierde (una fuente de regex escrita así salió sin sus barras).',
    '',
    'ENCONTRADO, por línea:',
    '{findings}',
    '',
    'CORRECCIÓN, cualquiera: duplicar la barra ({bs}{bs}s en vez de {bs}s); o escribir el texto como literal de expresión',
    'regular, donde el escape es válido; o cambiar el fichero destino con la herramienta Edit en vez de generarlo con un script.'
  ]
};

/** @param {string} file @param {{ line: number, escape: string }[]} findings */
export function refusalText(file, findings) {
  const listed = findings.slice(0, MAX_LISTED).map(({ line, escape }) => `  line ${line}: ${escape}`);

  if (findings.length > MAX_LISTED) listed.push(`  ... +${findings.length - MAX_LISTED} more`);

  return render(USELESS_ESCAPE_MESSAGE, { file, findings: listed.join('\n'), bs: BS });
}
