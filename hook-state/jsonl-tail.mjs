/**
 * Bounded reader of append-only JSONL files (the guard journals and the session transcripts): the last N
 * complete records read backwards in chunks, and the records appended after a saved offset. Neither ever
 * loads the whole file. Bytes are cut and joined, strings never, so a multi-byte character split by a chunk
 * boundary decodes intact.
 *
 * A RECORD is one line that parses as JSON. A blank or corrupt line is skipped, which is also what drops a
 * torn last line (a writer stopped mid-line) without a special case. `readFrom` is stricter about the tail:
 * a line with no newline yet is NOT consumed even if it parses, because its writer may still be appending.
 *
 * @es Lector acotado de ficheros JSONL de solo añadir (journals de guards y transcripts): los últimos N
 * registros completos leídos hacia atrás por trozos, y los añadidos tras un offset guardado. Ninguno carga el
 * fichero entero. Se cortan y unen bytes, nunca cadenas, así que un carácter multibyte partido por el borde
 * de un trozo se decodifica entero. Un REGISTRO es una línea que parsea como JSON; una línea vacía o corrupta
 * se omite, y así cae también la última línea rota sin caso especial. `readFrom` es más estricto con la cola:
 * una línea sin salto todavía NO se consume aunque parsee, porque su escritor puede seguir añadiendo.
 */

import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const NEWLINE = 0x0a;
export const DEFAULT_CHUNK_BYTES = 64 * 1024;
const NOTHING = () => undefined;

/**
 * Reads `length` bytes at `start`, repeating after a short read and stopping at the first empty one, so a file
 * truncated or replaced mid-read yields the bytes it still had, never padding and never an endless loop. Every
 * read is reported to `io.onRead`.
 * @es Lee `length` bytes desde `start`, repitiendo tras una lectura corta y parando en la primera vacía: un
 * fichero truncado o reemplazado a mitad devuelve los bytes que aún tenía, sin relleno y sin bucle infinito.
 * Cada lectura se informa a `io.onRead`.
 */
function readChunk(fd, start, length, io) {
  const buffer = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const got = io.readBytes(fd, buffer, filled, length - filled, start + filled);
    if (got === 0) break;
    io.onRead(got);
    filled += got;
  }

  return buffer.subarray(0, filled);
}

/** The lines of `bytes`, split on LF bytes. @es Las líneas de `bytes`, partidas en bytes LF. */
function splitLines(bytes) {
  const lines = [];
  let from = 0;
  for (let at = bytes.indexOf(NEWLINE); at !== -1; at = bytes.indexOf(NEWLINE, from)) {
    lines.push(bytes.subarray(from, at));
    from = at + 1;
  }
  lines.push(bytes.subarray(from));

  return lines;
}

/** `{ value }` for a line that parses, `undefined` for one that does not. @es `{ value }` si la línea parsea, `undefined` si no. */
function parseLine(bytes) {
  try {
    return { value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    return undefined;
  }
}

/** Whether a line holds nothing but whitespace (a blank line is not damage). @es Si una línea solo tiene espacios (una línea vacía no es un daño). */
const isBlank = (bytes) => bytes.toString('utf8').trim() === '';

/**
 * The last `n` records of `file`, oldest first, reading backwards one chunk at a time and stopping as soon as
 * `n` are found.
 * @es Los últimos `n` registros de `file`, el más antiguo primero, leyendo hacia atrás por trozos y parando en cuanto hay `n`.
 * @param options.chunkBytes Bytes per read. @es Bytes por lectura.
 * @param options.onRead Called with the bytes of every read. @es Se llama con los bytes de cada lectura.
 * @param options.readBytes Replaces `fs.readSync` (a test seam for short reads). @es Sustituye a `fs.readSync` (punto de prueba para lecturas cortas).
 * @param options.onSkip Called once per non-blank line that did not parse (a torn or corrupt record), so a caller can report damage it would otherwise not see; blank lines are not counted, and only the lines actually examined are. @es Se llama una vez por cada línea no vacía que no parseó (un registro roto o corrupto), para que quien llama informe un daño que si no pasaría inadvertido; las líneas vacías no cuentan, y solo las realmente examinadas.
 */
export function lastRecords(file, n, { chunkBytes = DEFAULT_CHUNK_BYTES, onRead = NOTHING, readBytes = readSync, onSkip = NOTHING } = {}) {
  const io = { onRead, readBytes, onSkip };
  const fd = openSync(file, 'r');
  try {
    const found = [];
    let carry = Buffer.alloc(0);
    let end = fstatSync(fd).size;
    while (end > 0 && found.length < n) {
      const start = Math.max(0, end - chunkBytes);
      const lines = splitLines(Buffer.concat([readChunk(fd, start, end - start, io), carry]));
      carry = start > 0 ? lines.shift() : Buffer.alloc(0);
      for (let at = lines.length - 1; at >= 0 && found.length < n; at -= 1) {
        const parsed = parseLine(lines[at]);
        if (parsed !== undefined) found.push(parsed.value);
        else if (!isBlank(lines[at])) io.onSkip();
      }
      end = start;
    }

    return found.reverse();
  } finally {
    closeSync(fd);
  }
}

/**
 * The records of every complete (newline-terminated) line from `offset`, and the offset just after the last
 * of them. An offset inside a line is re-aligned to the next newline; 0 and an offset right after a newline
 * are already aligned. An offset past the end means the file was replaced, so it is read from 0.
 * @es Los registros de cada línea completa (terminada en salto) desde `offset`, y el offset justo tras la última.
 * Un offset dentro de una línea se realinea al siguiente salto; 0 y un offset justo tras un salto ya están
 * alineados. Un offset pasado el final indica fichero reemplazado, y se lee desde 0. Solo se lee hasta el
 * tamaño medido al entrar: lo que otro escritor añada durante la lectura queda para la llamada siguiente.
 * Reading stops at the size measured on entry: what a writer appends meanwhile waits for the next call.
 * @returns `{ records, offset }`. @es `{ records, offset }`.
 */
export function readFrom(file, offset, { chunkBytes = DEFAULT_CHUNK_BYTES, onRead = NOTHING, readBytes = readSync, onSkip = NOTHING } = {}) {
  const io = { onRead, readBytes, onSkip };
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const from = offset > size ? 0 : offset;
    let skipping = from > 0 && readChunk(fd, from - 1, 1, io)[0] !== NEWLINE;
    const records = [];
    let carry = Buffer.alloc(0);
    let position = from;
    while (position < size) {
      let data = readChunk(fd, position, Math.min(chunkBytes, size - position), io);
      if (data.length === 0) break;
      position += data.length;
      if (skipping) {
        const at = data.indexOf(NEWLINE);
        if (at === -1) continue;
        data = data.subarray(at + 1);
        skipping = false;
      }
      const buffer = Buffer.concat([carry, data]);
      const last = buffer.lastIndexOf(NEWLINE);
      if (last !== -1) {
        for (const line of splitLines(buffer.subarray(0, last))) {
          const parsed = parseLine(line);
          if (parsed !== undefined) records.push(parsed.value);
          else if (!isBlank(line)) io.onSkip();
        }
      }
      carry = buffer.subarray(last + 1);
    }

    return { records, offset: skipping ? from : position - carry.length };
  } finally {
    closeSync(fd);
  }
}
