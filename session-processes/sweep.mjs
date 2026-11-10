/**
 * The sweep of a session's leftover processes: reads the process table, decides with `ownership.mjs` which processes
 * belong to the session, and ends each one as the decision says. It owns no decision and no operating-system call;
 * the table and both ways of ending a process come in as ports, so the whole flow is provable on constructed lists.
 *
 *   sweepSession({ sessionTemp, hookPid, readEnvironments, killTree, killProcess }) -> [{ pid, name, tree, outcome, detail? }]
 *
 * The listing is read ONCE, before anything is ended. The ends run one after another on purpose: a tree end removes
 * processes a later entry might name, and `already-dead` is the normal answer for those, so one fixed order (pid
 * ascending, as listed) keeps the report honest; it is a handful of `taskkill` calls, not a batch.
 *
 * @es El barrido de los procesos que dejó una sesión: lee la tabla de procesos, decide con `ownership.mjs` cuáles son
 * de la sesión y termina cada uno como dice la decisión. No tiene ninguna decisión ni llamada al sistema operativo;
 * la tabla y las dos formas de terminar un proceso entran como puertos, así todo el flujo se prueba sobre listas
 * construidas. El listado se lee UNA vez, antes de terminar nada. Los fines van uno tras otro a propósito: terminar un
 * árbol quita procesos que una entrada posterior podría nombrar, y `already-dead` es la respuesta normal para ellos,
 * así que un orden fijo (pid ascendente, como se lista) mantiene honesto el informe; son unas pocas llamadas a
 * `taskkill`, no un lote.
 */

import { processesToEnd } from './ownership.mjs';

/**
 * @param {{ sessionTemp: string, hookPid: number, readEnvironments: () => object[], killTree: (pid: number) => object, killProcess: (pid: number) => object }} input
 * @returns {object[]} one entry per process the decision listed, with the outcome of ending it. @es una entrada por proceso listado, con el resultado de terminarlo.
 */
export function sweepSession({ sessionTemp, hookPid, readEnvironments, killTree, killProcess }) {
  const targets = processesToEnd({ rows: readEnvironments(), sessionTemp, hookPid });

  return targets.map((target) => {
    const ended = target.tree ? killTree(target.pid) : killProcess(target.pid);

    return { pid: target.pid, name: target.name, tree: target.tree, outcome: ended.outcome, ...(ended.detail === undefined ? {} : { detail: ended.detail }) };
  });
}
