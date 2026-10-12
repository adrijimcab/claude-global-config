/**
 * The parent/child relations of a process listing: the ancestors of a process, the descendants of a process,
 * and which of a set of processes are the roots of their trees. A listing can hold a parent cycle (a pid
 * reused while its child lives), so every walk remembers where it has been and always ends.
 * @es Las relaciones padre/hijo de un listado de procesos: los ancestros de un proceso, sus descendientes, y
 * cuáles de un conjunto son raíz de su árbol. Un listado puede traer un ciclo de padres (un pid reutilizado
 * mientras vive su hijo), así que todo recorrido recuerda por dónde pasó y siempre termina.
 */

/** The pids from `pid` up through its parents, `pid` included. @es Los pids desde `pid` hacia arriba, `pid` incluido. */
export function lineageOf(rows, pid) {
  const parentOf = new Map(rows.map((entry) => [entry.pid, entry.parentPid]));
  const lineage = new Set();
  let current = pid;

  // At most one step per row: a parent cycle ends the walk instead of looping. @es Como mucho un paso por fila: un ciclo de padres termina el recorrido.
  for (let step = 0; current !== undefined && step <= rows.length; step += 1) {
    lineage.add(current);
    current = parentOf.get(current);
  }

  return lineage;
}

/** The rows below `pid`, at any depth, without repeats. @es Las filas por debajo de `pid`, a cualquier profundidad. */
export function descendantsOf(rows, pid) {
  const found = new Map();
  const queue = [pid];

  while (queue.length > 0) {
    const parent = queue.shift();

    for (const entry of rows) {
      if (entry.parentPid === parent && entry.pid !== pid && !found.has(entry.pid)) {
        found.set(entry.pid, entry);
        queue.push(entry.pid);
      }
    }
  }

  return [...found.values()];
}

/**
 * The members of `members` that have no other member above them: the processes whose death takes the rest with
 * it. Members of a cycle have each other above, so the lowest pid of what is left uncovered is made a root.
 * @es Los miembros de `members` sin otro miembro por encima: los procesos cuya muerte arrastra al resto. En un
 * ciclo cada miembro tiene al otro por encima, así que el pid más bajo de lo que queda sin cubrir se hace raíz.
 */
export function rootsOf(rows, members) {
  const pids = new Set(members.map((entry) => entry.pid));
  const roots = [];
  const covered = new Set();
  const cover = (root) => {
    roots.push(root);
    covered.add(root.pid);
    for (const below of descendantsOf(rows, root.pid)) covered.add(below.pid);
  };

  for (const member of members) {
    const above = [...lineageOf(rows, member.pid)].filter((pid) => pid !== member.pid && pids.has(pid));

    if (above.length === 0) cover(member);
  }

  for (const member of [...members].sort((left, right) => left.pid - right.pid)) if (!covered.has(member.pid)) cover(member);

  return roots;
}
