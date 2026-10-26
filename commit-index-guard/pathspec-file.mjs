/**
 * The paths a `--pathspec-from-file` commit named: the file is read once, bounded, and its entries are the
 * pathspec. Entries are separated by newlines, or by NUL with `--pathspec-file-nul`; in the newline form git
 * accepts a path in double quotes, which is read as a JSON string (a quote that does not parse makes the whole
 * read fail rather than guess a path). Standard input (`-`) cannot be read after the command ran, so it fails.
 * A failure comes back as a value with a bilingual reason; the caller journals it and judges nothing.
 *
 * @es Las rutas que nombró un commit con `--pathspec-from-file`: se lee el fichero una vez, acotado, y sus
 * entradas son el pathspec. Van separadas por saltos de línea, o por NUL con `--pathspec-file-nul`; en la forma
 * de líneas git acepta una ruta entre comillas, que se lee como cadena JSON (una comilla que no se entiende
 * hace fallar toda la lectura en vez de adivinar). La entrada estándar (`-`) no se puede leer después de que el
 * comando corrió. Un fallo vuelve como valor con razón bilingüe; quien llama lo registra y no juzga nada.
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** The most a pathspec file may hold. @es Lo máximo que puede tener un fichero de pathspec. */
export const MAX_PATHSPEC_FILE_BYTES = 1024 * 1024;

const NUL = '\0';

/** A failure as a value. @es Un fallo como valor. */
const failure = (english, spanish) => ({ ok: false, reason: `pathspec file: ${english} @es fichero de pathspec: ${spanish}` });

/** One line of a newline-separated pathspec file: a quoted path is a JSON string. @es Una línea del fichero. */
function lineEntry(line) {
  const text = line.endsWith('\r') ? line.slice(0, -1) : line;

  if (!(text.length > 1 && text.startsWith('"') && text.endsWith('"'))) return { entry: text };

  try {
    return { entry: JSON.parse(text) };
  } catch {
    return { problem: text };
  }
}

/**
 * @param spec `{ file, directory, nul }`: the value of `--pathspec-from-file`, the directory the command ran in
 *   and whether entries are NUL-separated.
 * @param ports `{ readFile, sizeOf }`, replaced by a test.
 * @returns `{ ok: true, paths }` or `{ ok: false, reason }`.
 * @es Lee el fichero de pathspec: `{ ok: true, paths }` o `{ ok: false, reason }`.
 */
export function readPathspecFile({ file, directory, nul }, { readFile = readFileSync, sizeOf = (target) => statSync(target).size } = {}) {
  if (typeof file !== 'string') return failure('no file name was given', 'no se dio nombre de fichero');
  if (file === '-') return failure('standard input cannot be read after the command ran', 'la entrada estándar no se puede leer después de que el comando corrió');
  if (typeof directory !== 'string') return failure('the directory of the command is unknown', 'se desconoce el directorio del comando');

  const target = path.resolve(directory, file);

  try {
    if (sizeOf(target) > MAX_PATHSPEC_FILE_BYTES) return failure(`${target} is larger than ${MAX_PATHSPEC_FILE_BYTES} bytes`, `${target} pesa más de ${MAX_PATHSPEC_FILE_BYTES} bytes`);

    const text = readFile(target, 'utf8');

    if (nul) return { ok: true, paths: text.split(NUL).filter((entry) => entry !== '') };

    const entries = text.split('\n').filter((line) => line !== '' && line !== '\r').map(lineEntry);
    const unreadable = entries.find((item) => item.problem !== undefined);

    if (unreadable !== undefined) return failure(`the quoted path ${unreadable.problem} is not understood`, `no se entiende la ruta entre comillas ${unreadable.problem}`);

    return { ok: true, paths: entries.map((item) => item.entry) };
  } catch (error) {
    const detail = String(error?.message ?? error);

    return failure(`${target} cannot be read: ${detail}`, `no se puede leer ${target}: ${detail}`);
  }
}
