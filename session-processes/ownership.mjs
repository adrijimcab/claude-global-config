/**
 * Which processes belong to a session, and how each one is to be ended: a pure decision over a process listing, with
 * no operating system behind it.
 *
 *   processesToEnd({ rows, sessionTemp, hookPid }) -> [{ pid, name, tree }]
 *
 * A process belongs to the session when its TEMP is EXACTLY the session's private folder (`session-temp/`): every
 * command of the session inherits it, and it survives the death of the parent, which is what makes an orphan
 * recognisable. Never ended, whatever its TEMP says: the hook itself, its ancestors (the harness, the session's
 * `claude`) and its descendants (the reader it started). A process whose TEMP is anything else is another session's, a
 * detached chain's (`full-chain-lock` gives each its own TEMP) or nobody's, and is left alone; so is one whose
 * environment could not be read.
 *
 * `tree` says how to end it: `true` ends it with everything below it (`taskkill /T`), which is done only when EVERY
 * process below it also carries the session's TEMP, so a tree end can never reach a process of another session. A
 * marked process below a marked process that is ended as a tree is not listed again.
 *
 * @es Qué procesos pertenecen a una sesión y cómo se termina cada uno: una decisión pura sobre un listado de procesos,
 * sin sistema operativo detrás. Un proceso pertenece a la sesión cuando su TEMP es EXACTAMENTE la carpeta privada de la
 * sesión (`session-temp/`): la heredan todos los comandos de la sesión y sobrevive a la muerte del padre, lo que hace
 * reconocible a un huérfano. Nunca se termina, diga lo que diga su TEMP: el propio hook, sus ancestros (el harness, el
 * `claude` de la sesión) y sus descendientes (el lector que inició). Un proceso con cualquier otro TEMP es de otra
 * sesión, de una cadena desacoplada (`full-chain-lock` da a cada una el suyo) o de nadie, y se deja; también el que no
 * se pudo leer. `tree` indica cómo terminarlo: `true` lo termina con todo lo de abajo (`taskkill /T`), solo cuando TODO
 * lo de abajo lleva también el TEMP de la sesión, así un fin de árbol nunca alcanza un proceso de otra sesión. Un
 * proceso marcado bajo uno marcado que se termina como árbol no se lista otra vez.
 */

import { descendantsOf, lineageOf } from '../process-reaper/process-tree.mjs';

/** A TEMP as one comparable text: `/` separators, no trailing separator, no case. @es Un TEMP como texto comparable: separadores `/`, sin separador final, sin mayúsculas. */
const comparable = (temp) => temp.split('\\').join('/').replace(/\/+$/, '').toLowerCase();

/** Whether a process carries exactly the session's TEMP. @es Si un proceso lleva exactamente el TEMP de la sesión. */
function carries(row, sessionTemp) {
  return typeof row.temp === 'string' && row.temp !== '' && comparable(row.temp) === comparable(sessionTemp);
}

/**
 * The processes to end for a session.
 * @param {{ rows: { pid: number, parentPid: number, name: string, temp: string|undefined }[], sessionTemp: string, hookPid: number }} input
 * @returns {{ pid: number, name: string, tree: boolean }[]} sorted by pid.
 * @es Los procesos a terminar para una sesión, ordenados por pid.
 */
export function processesToEnd({ rows, sessionTemp, hookPid }) {
  const spared = new Set([...lineageOf(rows, hookPid), ...descendantsOf(rows, hookPid).map((row) => row.pid)]);
  const marked = new Map(rows.filter((row) => carries(row, sessionTemp) && !spared.has(row.pid)).map((row) => [row.pid, row]));
  const endsAsTree = (row) => descendantsOf(rows, row.pid).every((below) => marked.has(below.pid));
  const treeEnders = new Set([...marked.values()].filter(endsAsTree).map((row) => row.pid));
  const listed = [];

  for (const row of marked.values()) {
    // A parent cycle (a pid reused while its child lives) covers nobody: both members stay listed. @es Un ciclo de padres no cubre a nadie: ambos miembros quedan en la lista.
    const coveredAbove = [...lineageOf(rows, row.pid)].some((pid) => pid !== row.pid && treeEnders.has(pid) && !lineageOf(rows, pid).has(row.pid));

    if (!coveredAbove) listed.push({ pid: row.pid, name: row.name, tree: treeEnders.has(row.pid) });
  }

  return listed.sort((left, right) => left.pid - right.pid);
}
