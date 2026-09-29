/**
 * Corre UNA guardia dentro del proceso del dispatcher, aislada de las demás.
 *
 * El contrato de una guardia despachable es mínimo: exporta `evaluate(raw)`, que devuelve la salida
 * de hook (o `undefined`) sin imprimir nada, y NO lee stdin cuando `globalThis[IN_PROCESS]` es `true`.
 * Ejecutada directamente, la misma guardia sigue siendo un hook completo; por eso sus selftests no
 * cambian.
 *
 * Lo que este módulo garantiza, porque una guardia rota no puede llevarse puestas a las otras:
 *   - un `import` que falla, un `evaluate` que lanza o una guardia sin `evaluate` quedan como error de
 *     ESA guardia, con nombre, nunca como un permiso limpio;
 *   - un `process.exit` dentro de la guardia se convierte en error: en N procesos solo mataba al suyo,
 *     acá mataría a todos;
 *   - lo que la guardia escriba en stdout se captura: en el protocolo, stdout ES la decisión, y un
 *     `console.log` perdido corrompería el JSON de todas.
 */

import { pathToFileURL } from 'node:url';

/** La marca que le dice a una guardia «estás dentro del dispatcher: no leas stdin». */
export const IN_PROCESS = Symbol.for('hook-dispatch.in-process');

class GuardExit extends Error {
  constructor(code) {
    super(`la guardia llamó process.exit(${String(code)}) durante evaluate`);
  }
}

/**
 * Devuelve `{ output }` o `{ error }`. Nunca lanza. `importer` existe para que el selftest pruebe los
 * fallos de import sin escribir guardias rotas en disco.
 */
export async function runGuard(guard, raw, { importer = (file) => import(pathToFileURL(file).href) } = {}) {
  const originalExit = process.exit;
  const originalWrite = process.stdout.write;
  let printed = '';

  globalThis[IN_PROCESS] = true;
  process.exit = (code) => {
    throw new GuardExit(code);
  };
  process.stdout.write = (chunk) => {
    printed += String(chunk);
    return true;
  };

  try {
    const module = await importer(guard.file);

    if (typeof module?.evaluate !== 'function') return { error: 'no exporta evaluate(raw): no es despachable' };

    const output = await module.evaluate(raw);

    if (printed.trim().length > 0) return { error: `escribió en stdout durante evaluate (${printed.trim().slice(0, 120)})` };

    return { output };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    process.exit = originalExit;
    process.stdout.write = originalWrite;
  }
}
