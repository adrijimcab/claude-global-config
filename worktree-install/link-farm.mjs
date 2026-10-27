/**
 * The JUNCTION form a probe is run against, and removed again when the probe refuses it: a real `node_modules`
 * directory in the worktree whose every top-level entry is a link into the main checkout's tree. Per entry and
 * never one link for the whole directory, so whatever a runner writes at the top of `node_modules` (a `.vite`
 * cache) lands in the worktree and not in the main checkout.
 *
 * WORKSPACE-LOCAL PACKAGES POINT AT THE WORKTREE'S OWN COPY. An entry of the main tree that links back into the
 * main checkout outside `node_modules` (a `file:` dependency) is linked to the same relative path inside the
 * worktree, because that is the copy the worker edits (b100-am-ui measured the opposite resolving to MAIN's
 * copy, so a worker could not lint its own commit). b100-am-ui keeps its own owner of this shape,
 * `.claude/fleet-env/environment.mjs`, with its manifests; this is the kit form for projects without one.
 *
 * REMOVAL ONLY UNLINKS. `unlinkFarm` removes the links it finds and then the directory only if nothing else is
 * in it; a real directory is never recursed into, because removing a junction the wrong way follows it and
 * deletes the main checkout's packages (`recursive-delete-followed-a-junction`).
 *
 * @es La forma JUNCTION contra la que se corre la sonda, y que se quita si la sonda la rechaza: un
 * `node_modules` real en el worktree cuyas entradas son enlaces al árbol principal, por entrada y nunca un
 * enlace único, para que lo que un runner escriba arriba (`.vite`) caiga en el worktree. Los paquetes locales
 * del workspace (`file:`) apuntan a la copia PROPIA del worktree. Quitarla solo desenlaza: nunca se recorre un
 * directorio real, porque borrar mal una junction la sigue y destruye los paquetes del principal.
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import path from 'node:path';

/** Whether `inner` is `outer` or inside it. @es Si `inner` está dentro de `outer`. */
const isInside = (inner, outer) => {
  const relative = path.relative(outer, inner);

  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

/**
 * Builds the farm: `<worktreeProject>/node_modules` linking each entry of `<mainProject>/node_modules`.
 * Returns `{ created, local, refused }`; refuses (creates nothing) when the worktree already has a
 * `node_modules` of any kind, because that tree is not this module's to replace.
 * @es Construye la granja. No toca un `node_modules` que ya exista en el worktree.
 */
export function linkFarm({ mainTop, mainProject, worktreeTop, worktreeProject }) {
  const source = path.join(mainProject, 'node_modules');
  const farm = path.join(worktreeProject, 'node_modules');

  if (existsSync(farm) || lstatOrUndefined(farm) !== undefined) return { created: 0, local: [], refused: 'the worktree already has a node_modules' };
  if (!existsSync(source)) return { created: 0, local: [], refused: 'the main checkout has no node_modules' };

  mkdirSync(farm, { recursive: true });

  let created = 0;
  const local = [];

  for (const name of readdirSync(source)) {
    const entry = path.join(source, name);
    let target = entry;

    if (lstatSync(entry).isSymbolicLink()) {
      const pointed = path.resolve(source, readlinkSync(entry));

      if (isInside(pointed, mainTop) && !isInside(pointed, source)) {
        target = path.join(worktreeTop, path.relative(mainTop, pointed));
        local.push(name);
      }
    }

    symlinkSync(target, path.join(farm, name), 'junction');
    created += 1;
  }

  return { created, local, refused: undefined };
}

/**
 * Removes one LINK: `rmdir` first (a Windows directory junction needs it), `unlink` second (a file or POSIX
 * symlink), so neither shape is guessed from the platform. The same order as b100's `removeLink`.
 * @es Quita un ENLACE: `rmdir` primero (junction de Windows) y `unlink` después.
 */
function removeLinkOnly(target) {
  try {
    rmdirSync(target);
  } catch {
    unlinkSync(target);
  }
}

/** `lstat` or `undefined`. @es `lstat` o `undefined`. */
function lstatOrUndefined(target) {
  try {
    return lstatSync(target);
  } catch {
    return undefined;
  }
}

/**
 * Removes a farm built by {@link linkFarm}: every LINK in `<worktreeProject>/node_modules`, then the directory
 * when it is empty. Returns `{ removed, kept }`, where `kept` names what was not a link.
 * @es Quita la granja: cada ENLACE, y el directorio si queda vacío.
 */
export function unlinkFarm(worktreeProject) {
  const farm = path.join(worktreeProject, 'node_modules');
  const stat = lstatOrUndefined(farm);

  if (stat === undefined) return { removed: true, kept: [] };

  if (stat.isSymbolicLink()) {
    removeLinkOnly(farm);

    return { removed: true, kept: [] };
  }

  const kept = [];

  for (const name of readdirSync(farm)) {
    const entry = path.join(farm, name);

    if (lstatSync(entry).isSymbolicLink()) removeLinkOnly(entry);
    else kept.push(name);
  }

  if (kept.length === 0) rmdirSync(farm);

  return { removed: kept.length === 0, kept };
}
