/**
 * The adapter that ends ONE process without touching what is below it: the counterpart of `killTree` (which ends a
 * process and everything below it) for the case where a process below it belongs to someone else.
 *
 *   killProcess(pid, { signal, ownPid }) -> { pid, outcome, detail? }
 *
 * `outcome` is `killed`, `already-dead` (the process was gone: a normal answer, a sweep and a natural exit race),
 * `failed` (with `detail`) or `refused` (an id that must never be signalled: not an integer, 1 or below, or the
 * caller itself). On Windows `process.kill` ends the process at once; its children are left as they are.
 *
 * @es El adaptador que termina UN proceso sin tocar lo que hay debajo: la contraparte de `killTree` (que termina un
 * proceso y todo lo de abajo) para cuando un proceso de abajo es de otro. `outcome` es `killed`, `already-dead` (el
 * proceso ya no estaba: respuesta normal, un barrido y una salida natural compiten), `failed` (con `detail`) o
 * `refused` (un id que nunca debe señalizarse: no entero, 1 o menos, o el propio llamador). En Windows `process.kill`
 * termina el proceso al instante; sus hijos quedan como están.
 */

/**
 * @param {number} pid
 * @param {{ signal?: (pid: number, name: string) => void, ownPid?: number }} [ports] seams for the signal and the caller's pid. @es costuras para la señal y el pid del llamador.
 */
export function killProcess(pid, { signal = process.kill, ownPid = process.pid } = {}) {
  if (!Number.isInteger(pid) || pid <= 1 || pid === ownPid) return { pid, outcome: 'refused' };

  try {
    signal(pid, 'SIGKILL');

    return { pid, outcome: 'killed' };
  } catch (error) {
    if (error?.code === 'ESRCH') return { pid, outcome: 'already-dead' };

    return { pid, outcome: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}
