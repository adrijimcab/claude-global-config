/**
 * Test helper, loaded with `node --require`: makes every read of a file whose path holds `FC_DELAY_MATCH` take
 * `FC_DELAY_MS` longer AFTER the real read, and writes `FC_DELAY_MARK` once the real read is done. It reproduces,
 * deterministically, a process that read shared state and is slow to write it back, which is how a
 * read-modify-write without a lock loses another process's update.
 *
 * @es Ayudante de pruebas, cargado con `node --require`: hace que toda lectura de un fichero cuya ruta contenga
 * `FC_DELAY_MATCH` tarde `FC_DELAY_MS` más DESPUÉS de la lectura real, y escribe `FC_DELAY_MARK` cuando la
 * lectura real terminó. Reproduce, de forma determinista, un proceso que leyó estado compartido y tarda en
 * devolverlo, que es como un leer-modificar-escribir sin lock pierde la actualización de otro proceso.
 */

const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');

const match = process.env.FC_DELAY_MATCH;
const delayMs = Number(process.env.FC_DELAY_MS ?? 0);
const mark = process.env.FC_DELAY_MARK;
const realRead = fs.readFileSync;
let delayed = false;

if (match && delayMs > 0) {
  fs.readFileSync = function readFileSync(file, ...rest) {
    try {
      return realRead.call(this, file, ...rest);
    } finally {
      if (!delayed && String(file).includes(match)) {
        delayed = true;
        if (mark) fs.writeFileSync(mark, 'read');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      }
    }
  };
  syncBuiltinESMExports();
}
