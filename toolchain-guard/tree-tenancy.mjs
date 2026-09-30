/**
 * Whether a directory's `node_modules` belongs to ANOTHER checkout's dependency tree.
 *
 * THE QUESTION THIS DECIDES, in words, before any probe (`guard-that-cannot-go-red`, sixth face): "if a
 * package manager reified a lockfile here, would it write into a tree some other checkout owns?" Not
 * "is there a link here" — a link is not automatically somebody else's tree, and this repository's
 * provisioner deliberately links a worktree's workspace packages back to the worker's OWN tree so it can
 * lint its own commit. Foreignness is the property, and it is measured by resolving where the links go.
 *
 * THE SHAPE THAT DESTROYED THIS MACHINE, measured 2026-09-17. An agent worktree's `node_modules` is a
 * REAL directory — `fsutil reparsepoint query` calls it "not a reparse point" — while ALL 1208 of its
 * top-level children are junctions into the main checkout: `.bin`, `@angular`, `typescript`, every one.
 * The main checkout's own tree returned 0 of 1208. A probe that asked only "is `node_modules` a link?"
 * would have called the farm a healthy private tree and allowed the install that emptied `@angular/core`
 * and left 675 abandoned npm staging directories in a tree measured healthy minutes earlier.
 *
 * THE FILESYSTEM VIEW IS INJECTED, and that is not a testing convenience. Two things follow from it.
 * The self-test exercises every link topology — farm, wholesale link, local-only links, absent tree —
 * with ZERO real links, on a machine whose shared tree has already been destroyed twice and where
 * creating or deleting a junction to prove a point is how it happens a third time. And the fixtures stop
 * being LIVE MUTABLE STATE: the live worktrees legitimately come and go, and a self-test pinned to them
 * reddens on a correct machine, which is how a guard gets switched off
 * (`guard-that-cannot-go-red`, fourth face). The same reason `stalePatterns(probe)` takes one.
 *
 * COST, and why it is affordable. Classifying a farm resolves every child link — 1208 syscalls on this
 * machine. That is far too slow for every Bash call and entirely irrelevant, because tenancy is only
 * ever asked once a package-manager MUTATION has already been found in the line. No sampling, therefore:
 * a sampled answer would be a bounded search reported as coverage.
 *
 * @es Si el `node_modules` de un directorio pertenece al árbol de OTRO checkout. La pregunta no es «hay
 * un enlace aquí» —un enlace no es automáticamente el árbol de otro, y el aprovisionador de este repo
 * enlaza a propósito los paquetes de workspace al árbol PROPIO del worker—, sino si un reify escribiría
 * en un árbol ajeno. MEDIDO: en un worktree, `node_modules` es un directorio REAL y sus 1208 hijos son
 * junctions al checkout principal; preguntar solo «¿es `node_modules` un enlace?» habría permitido la
 * instalación que vació `@angular/core`. La vista del sistema de ficheros se INYECTA: el auto-test
 * recorre todas las topologías sin crear ni borrar un solo enlace, y los fixtures dejan de ser estado
 * vivo mutable, que es lo que pone en rojo un guard sobre una máquina correcta.
 */

import { lstatSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * What a directory's dependency tree is, as far as tenancy is concerned.
 * @es Lo que es el árbol de dependencias de un directorio, en lo que a tenencia respecta.
 */
export const TENANCY = Object.freeze({
  /** No `node_modules` at all. A reify here creates its own tree and endangers nothing. @es Sin `node_modules`. */
  ABSENT: 'absent',
  /** Its own tree: a real directory whose links, if any, stay inside this checkout. @es Su propio árbol. */
  OWN: 'own',
  /** A real directory whose children are junctions into another checkout's tree. @es Un farm de junctions por entrada. */
  FARM: 'farm',
  /** `node_modules` is ITSELF a link into another checkout's tree. @es El propio `node_modules` es un enlace. */
  LINKED: 'linked',
  /** The filesystem would not say. The caller must fail OPEN on this. @es El sistema de ficheros no contestó. */
  UNKNOWN: 'unknown'
});

/** The Windows device prefix a junction's raw target carries. @es El prefijo de dispositivo de Windows. */
const DEVICE_PREFIX = '\\\\?\\';

/** One spelling of a path, for comparison only. @es Una sola grafía de una ruta, solo para comparar. */
const forComparison = (target, platform) => {
  const slashed = target.split('\\').join('/');

  return platform === 'win32' ? slashed.toLowerCase() : slashed;
};

/**
 * Whether `target` sits inside `root`.
 *
 * The separator boundary is required, not cosmetic: without it `C:/repo/node_modules_old` reads as
 * inside `C:/repo/node_modules`, and a neighbouring directory would be graded as this tree's own.
 * @es Si `target` está dentro de `root`. El límite de separador es obligatorio: sin él, un directorio
 * vecino se graduaría como propio de este árbol.
 */
function isInside(target, root, platform) {
  const inner = forComparison(target, platform);
  const outer = forComparison(root, platform);

  return inner === outer || inner.startsWith(outer.endsWith('/') ? outer : `${outer}/`);
}

/**
 * The deepest directory every one of `targets` sits inside — the tree they collectively point at.
 *
 * COMPUTED, never assumed. A refusal that named "the main checkout" because the path looked like it
 * would be answering a different question than the one it measured; the links themselves say where they
 * go, and 1207 of them agreeing on `<main>/node_modules` is what makes the refusal's last line true.
 * REJOINED WITH THE PLATFORM SEPARATOR, so a refusal printing this line beside a `realpathSync.native`
 * one does not show the same machine in two spellings — the reason `asNamedOnDisk` exists next door.
 * @es El directorio más profundo que contiene a TODOS los `targets`: el árbol al que apuntan. CALCULADO,
 * nunca supuesto — son los enlaces los que dicen adónde van. Se rehace con el separador de la
 * plataforma para no mostrar la misma máquina en dos grafías dentro del mismo rechazo.
 */
function commonDirectory(targets, platform) {
  const split = (target) => target.split('\\').join('/').split('/');
  const [first, ...rest] = targets;
  let shared = split(first).slice(0, -1);

  for (const target of rest) {
    const segments = split(target).slice(0, -1);
    let kept = 0;

    while (kept < shared.length && kept < segments.length && forComparison(shared[kept], platform) === forComparison(segments[kept], platform)) kept += 1;

    shared = shared.slice(0, kept);
  }

  return shared.join(platform === 'win32' ? '\\' : '/');
}

/**
 * The CHECKOUT that owns the tree at `target` — the directory a reconcile must actually be run in.
 *
 * THE TREE AND ITS OWNER ARE DIFFERENT PLACES, and conflating them made the first draft of this
 * guard's refusal print `cd …/node_modules && npm install`, which would install a nested tree INSIDE
 * the dependency tree it was trying to repair. Caught by reading the refusal the guard really produced
 * against the live worktree, not by any assertion — which is why the selftest now asserts the `cd`
 * target is a checkout root and never a `node_modules`.
 *
 * Everything from the first `node_modules` segment onward is dropped, so a link into
 * `<main>/node_modules/@angular/core` names `<main>` and not the scope directory. A target with no
 * such segment is its own answer: it is somebody's workspace directory, and there is nothing to strip.
 *
 * @es El CHECKOUT que posee el árbol de `target`: el directorio donde de verdad hay que reconciliar.
 * EL ÁRBOL Y SU DUEÑO SON SITIOS DISTINTOS, y confundirlos hizo que el primer borrador del rechazo
 * imprimiera `cd …/node_modules && npm install`, que instalaría un árbol anidado DENTRO del que
 * intentaba reparar. Se descubrió LEYENDO el rechazo real contra el worktree vivo, no por una
 * aserción; por eso el auto-test ahora exige que el destino del `cd` sea una raíz de checkout.
 */
function ownerOf(target, platform) {
  const separator = platform === 'win32' ? '\\' : '/';
  const segments = target.split('\\').join('/').split('/');
  const at = segments.findIndex((segment) => forComparison(segment, platform) === 'node_modules');

  return at <= 0 ? target : segments.slice(0, at).join(separator);
}

/**
 * The real filesystem, as the three questions tenancy asks of it.
 *
 * `resolve` falls back to `readlink` because a DANGLING link still has a target worth naming: measured
 * on this machine, `final-stack/node_modules/.package-lock.json` is a junction whose target no longer
 * exists, and `realpathSync` throws on it. Reporting it as unknowable would drop a real link out of the
 * census on the exact tree the census is about.
 * @es El sistema de ficheros real, en las tres preguntas que hace la tenencia. `resolve` recurre a
 * `readlink` porque un enlace COLGADO sigue teniendo un destino que nombrar.
 */
export const filesystemProbe = Object.freeze({
  kindOf(target) {
    let stat;

    try {
      stat = lstatSync(target);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return 'absent';

      throw error;
    }

    if (stat.isSymbolicLink()) return 'link';

    return stat.isDirectory() ? 'directory' : 'other';
  },

  childrenOf(target) {
    return readdirSync(target, { withFileTypes: true }).map((entry) => ({ name: entry.name, link: entry.isSymbolicLink() }));
  },

  resolve(target) {
    try {
      return realpathSync.native(target);
    } catch {
      try {
        const raw = readlinkSync(target);
        const bare = raw.startsWith(DEVICE_PREFIX) ? raw.slice(DEVICE_PREFIX.length) : raw;

        return path.resolve(path.dirname(target), bare);
      } catch {
        return undefined;
      }
    }
  }
});

/**
 * The census of a real `node_modules` directory's children: how many are links, and where they go.
 * @es El censo de los hijos de un `node_modules` real: cuántos son enlaces y adónde van.
 */
function census(treePath, root, probe, platform) {
  const children = probe.childrenOf(treePath);
  const links = children.filter((child) => child.link);
  const foreign = [];
  let local = 0;
  let unresolved = 0;

  for (const link of links) {
    const target = probe.resolve(path.join(treePath, link.name));

    if (target === undefined) unresolved += 1;
    else if (isInside(target, root, platform)) local += 1;
    else foreign.push(target);
  }

  return { total: children.length, links: links.length, foreign, local, unresolved };
}

/**
 * What the `node_modules` at `directory` is, for a caller deciding whether a reify may run there.
 *
 * @param directory The directory the mutation runs in, in any spelling — Windows 8.3 short names
 *   included. It is resolved through the probe FIRST, because `C:\Users\ADRIAN~1.JIM\…` and
 *   `C:\Users\adrian.jimenez\…` are the same folder, and a containment test that compares them as
 *   written silently grades every local link as foreign.
 * @param probe The filesystem view; defaults to the real one.
 * @returns `{ state, root, total, links, target, owner }`. `target` is the tree the foreign links
 *   resolve into and `owner` is the checkout that owns it — the place a reconcile must be run, which is
 *   NOT the same directory. Both are `undefined` unless the state is `FARM` or `LINKED`.
 * @es Qué es el `node_modules` de `directory`. La ruta se resuelve por el probe ANTES de comparar:
 * el nombre corto 8.3 y el largo son la misma carpeta, y compararlos tal cual grada como ajeno todo
 * enlace local.
 */
export function tenancyOf(directory, probe = filesystemProbe, platform = process.platform) {
  try {
    const root = probe.resolve(directory);

    // A directory the filesystem cannot resolve does not exist, and a reify there fails on its own. A
    // refusal would add noise and nothing else — the same call the cherry-pick guard makes for a place
    // a pick cannot land.
    if (root === undefined) return { state: TENANCY.ABSENT };

    const treePath = path.join(root, 'node_modules');
    const kind = probe.kindOf(treePath);

    if (kind === 'absent' || kind === 'other') return { state: TENANCY.ABSENT, root };

    if (kind === 'link') {
      const target = probe.resolve(treePath);

      if (target === undefined || isInside(target, root, platform)) return { state: TENANCY.OWN, root };

      return { state: TENANCY.LINKED, root, total: 1, links: 1, target, owner: ownerOf(target, platform) };
    }

    const { total, links, foreign } = census(treePath, root, probe, platform);

    // No foreign link, so nothing here belongs to anyone else — including a tree whose links are all
    // LOCAL (the provisioner's workspace packages) and one whose links all DANGLE. A dangling link has
    // no live target to carry a write into, so it endangers no other tree; saying so is the honest
    // reason for allowing it, rather than leaving the case unstated.
    if (foreign.length === 0) return { state: TENANCY.OWN, root, total, links };

    const target = commonDirectory(foreign, platform);

    return { state: TENANCY.FARM, root, total, links, target, owner: ownerOf(target, platform) };
  } catch {
    // FAIL OPEN. An unreadable directory, a permission error, a probe that threw — none of them is
    // evidence about tenancy, and a guard that can wedge every shell on the machine is worse than the
    // hazard it closes.
    return { state: TENANCY.UNKNOWN };
  }
}
