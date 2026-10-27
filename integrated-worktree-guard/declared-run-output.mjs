/**
 * Which IGNORED entries of a worktree are DECLARED process output rather than work: files a running
 * process writes inside the worktree and nobody keeps, named by the process that writes them.
 *
 * WHY A DECLARATION AND NOT A SKIP. The owner's rule (`gitignored-deliverable-destroyed-by-worktree-
 * autoclean`) is that an ignored file nobody declared counts as work: a path is exempt only where a
 * declaration names the process that produces it. The mutation runner writes `scratch/mutation-proof/
 * mutant-*` inside the worktree it runs from (`sandboxRootOf` in `mutation-proof/run-mutants.mjs`), and every sandbox
 * there is a disposable copy; deleting the worktree loses nothing. Each declaration below states its
 * producer. The runner is vendored byte-identical and so cannot export its path, so the selftest reads the
 * runner's source and fails when the path it writes to stops being the one declared here.
 *
 * GIT COLLAPSES a wholly ignored directory to one entry (`scratch/`), which hides what is inside it. An
 * entry that CONTAINS a declared path is therefore expanded one level at a time, and whatever lies beside
 * the declared path stays work: `scratch/keep-me.txt` next to `scratch/mutation-proof/` is still work.
 * A directory that cannot be read is returned whole, as work: never guessed clean.
 *
 * @es Qué entradas IGNORADAS de un worktree son salida de proceso DECLARADA y no trabajo: ficheros que un
 * proceso escribe dentro del worktree y nadie conserva, nombrados por el proceso que los escribe. Es una
 * declaración y no una omisión porque la regla del dueño es que un ignorado sin declarar cuenta como
 * trabajo. Cada declaración dice su productor; el runner es vendorizado y no puede exportar su ruta, así que el selftest lee su fuente y falla si la ruta que escribe deja de ser la declarada aquí. Git COLAPSA un
 * directorio ignorado entero a una entrada (`scratch/`); una entrada que CONTIENE una ruta declarada se
 * expande un nivel cada vez, y lo que está junto a la ruta declarada sigue siendo trabajo. Un directorio
 * ilegible se devuelve entero, como trabajo.
 */

import { readdirSync } from 'node:fs';
import path from 'node:path';

import { readJsonObject } from '../project-profile/facts.mjs';
import { RECEIPT } from '../worktree-install/own-install.mjs';
import { hashFile } from '../worktree-install/verdict-store.mjs';

/** The declared process outputs, each as worktree-relative segments with the process that writes it. @es Las salidas de proceso declaradas. */
export const DECLARED_RUN_OUTPUT = Object.freeze([
  { producer: 'mutation-proof/run-mutants.mjs (sandboxes of the mutation runner)', segments: ['scratch', 'mutation-proof'] }
]);

/** An entry as segments, with no trailing slash. @es Una entrada como segmentos, sin barra final. */
const segmentsOf = (entry) => entry.split('/').filter((segment) => segment !== '');

/** Whether `inner` starts with every segment of `outer`. @es Si `inner` empieza por todos los segmentos de `outer`. */
const startsWith = (inner, outer) => outer.length <= inner.length && outer.every((segment, at) => inner[at] === segment);

/**
 * Whether `segments` name a `node_modules` that the worktree's OWN install produced from the lockfile beside it,
 * as its receipt (`worktree-install/own-install.mjs`) proves: the receipt names a lockfile in the same folder
 * (a bare file name, never a path) whose sha256 is still the one installed from. Such a tree is reproducible
 * from the tracked lockfile, so deleting it loses nothing; it is declared output of the installer, the
 * worktree's default since `junctioned-node-modules-broke-vitest-coverage`. A tree with no receipt, a receipt
 * naming a path, or a lockfile that moved on since the install stays WORK: someone may have changed it.
 * @es Si `segments` nombran un `node_modules` que produjo la instalación PROPIA del worktree desde el lockfile
 * de al lado, según su recibo: el recibo nombra un lockfile de la misma carpeta (nombre suelto, nunca una
 * ruta) cuyo sha256 sigue siendo el instalado. Es reproducible desde el lockfile versionado. Sin recibo, con
 * una ruta o con un lockfile que cambió después, sigue siendo TRABAJO.
 */
export function isReceiptedInstall(worktree, segments) {
  if (segments.at(-1) !== 'node_modules') return false;

  const receipt = readJsonObject(path.join(worktree, ...segments, RECEIPT));
  const lockfile = receipt?.lockfile;

  if (typeof lockfile !== 'string' || lockfile === '' || lockfile !== path.basename(lockfile) || lockfile.includes('/') || lockfile.includes('\\')) return false;

  return typeof receipt.lockfileHash === 'string' && hashFile(path.join(worktree, ...segments.slice(0, -1), lockfile)) === receipt.lockfileHash;
}

/**
 * The part of the ignored `entry` (relative to `worktree`) that is NOT declared process output.
 * @param {string} worktree The worktree directory.
 * @param {string} entry An ignored entry as git reports it, `/`-separated, a directory ending in `/`.
 * @returns {string[]} The entries that remain work; empty when all of it is declared output.
 * @es La parte de la entrada ignorada que NO es salida de proceso declarada.
 */
export function undeclaredPartOf(worktree, entry) {
  const segments = segmentsOf(entry);

  if (isReceiptedInstall(worktree, segments)) return [];

  for (const { segments: declared } of DECLARED_RUN_OUTPUT) {
    if (startsWith(segments, declared)) return [];

    if (startsWith(declared, segments)) {
      try {
        return readdirSync(path.join(worktree, ...segments)).flatMap((child) => undeclaredPartOf(worktree, [...segments, child].join('/')));
      } catch {
        return [entry];
      }
    }
  }

  return [entry];
}
