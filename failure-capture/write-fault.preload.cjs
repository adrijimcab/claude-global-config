/**
 * Test helper, loaded with `node --require`: the `FC_FAULT_AT`-th rename (1 by default) INTO a path that holds
 * `FC_FAULT_RENAME_MATCH` lands and then THROWS, as a write whose bytes reached the disk but whose call reported a
 * failure. Every other rename, the restores after it included, works. It reproduces, deterministically, a failure
 * between the two writes of a route, which is what the route's transaction must undo. Nothing loads it but a selftest.
 *
 * @es Ayudante de pruebas, cargado con `node --require`: el renombrado número `FC_FAULT_AT` (1 por omisión) HACIA una
 * ruta que contiene `FC_FAULT_RENAME_MATCH` se completa y luego LANZA, como una escritura cuyos bytes llegaron al disco
 * pero cuya llamada informó un fallo. Todo otro renombrado, incluidas las restauraciones posteriores, funciona.
 * Reproduce, de forma determinista, un fallo entre las dos escrituras de una ruta, que es lo que la transacción de la
 * ruta debe deshacer. Solo lo carga un selftest.
 */

const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');

const match = process.env.FC_FAULT_RENAME_MATCH;
const at = Number(process.env.FC_FAULT_AT ?? 1);
const realRename = fs.renameSync;
let seen = 0;

if (match) {
  fs.renameSync = function renameSync(from, to, ...rest) {
    const result = realRename.call(this, from, to, ...rest);

    if (String(to).includes(match)) {
      seen += 1;
      if (seen === at) throw new Error('injected write fault');
    }

    return result;
  };
  syncBuiltinESMExports();
}
