/**
 * The dependency NAMES a brief's project declares: `dependencies`, `devDependencies` and
 * `peerDependencies` of its root `package.json` and of the workspace `package.json` files that are cheap
 * to find (a plain workspace directory, or a `dir/*` entry listed one level deep). Nothing else is read:
 * no network, and never the contents of `node_modules`.
 *
 * WHERE THE PROJECT COMES FROM. The checkout paths of the brief's `TENANCY:` lines (the path the brief
 * itself declares as the worker's tree); when it declares none, the `cwd` of the hook payload. Neither
 * known: the face has nothing to read and says so.
 *
 * NEVER FAILS CLOSED, NEVER SILENT. A missing or unreadable `package.json` is reported in `undecided`
 * with its reason; the caller journals it and allows. The reading goes through a port (`files`), so the
 * proof can hand it a constructed project without touching a disk.
 *
 * @es Los NOMBRES de dependencia que declara el proyecto de un brief: `dependencies`, `devDependencies` y
 * `peerDependencies` del `package.json` raíz y de los de workspace baratos de hallar (directorio plano, o
 * entrada `dir/*` a un nivel). Nada más: sin red, y jamás el contenido de `node_modules`. EL PROYECTO sale
 * de las rutas de las líneas `TENANCY:` del brief; si no hay, del `cwd` del payload. NUNCA FALLA CERRADO
 * NI CALLA: un `package.json` ausente o ilegible va a `undecided` con su motivo, y quien llama lo registra
 * y permite. La lectura pasa por un puerto (`files`) para probarla sin disco.
 */

import { readFileSync, readdirSync } from 'node:fs';

import { namedCheckouts } from '../brief-tenancy/named-checkouts.mjs';
import { tenancyLines } from '../brief-tenancy/tenancy-declaration.mjs';

/** The sections of a manifest whose keys are package names. @es Las secciones cuyas claves son nombres de paquete. */
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'];

/** The real file system, as the port the reading needs. @es El sistema de ficheros real, como puerto. */
export const diskFiles = Object.freeze({
  read: (path) => readFileSync(path, 'utf8'),
  list: (path) => readdirSync(path)
});

/** The project directories a brief points at, in order. @es Los directorios de proyecto a los que apunta un brief. */
export function projectDirectories(text, payload) {
  const declared = namedCheckouts(tenancyLines(text).join('\n'));

  if (declared.length > 0) return declared;

  const cwd = payload?.cwd;

  return typeof cwd === 'string' && cwd.length > 0 ? [cwd] : [];
}

/** The workspace directories a manifest names, relative to its own directory. @es Los directorios de workspace que nombra un manifiesto. */
function workspaceDirectories(manifest, directory, files) {
  const entries = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;

  if (!Array.isArray(entries)) return [];

  const found = [];

  for (const entry of entries) {
    if (typeof entry !== 'string') continue;

    if (entry.endsWith('/*')) {
      const parent = `${directory}/${entry.slice(0, -2)}`;

      try {
        for (const child of files.list(parent)) found.push(`${parent}/${child}`);
      } catch {
        /* a glob that lists nothing contributes nothing; the root manifest still decides */
      }
    } else {
      // Any other shape is tried as a plain directory; one that does not exist is routine (see `collect`).
      found.push(`${directory}/${entry}`);
    }
  }

  return found;
}

/**
 * Reads one `package.json` into `names`, or records why it could not in `undecided`.
 * @es Lee un `package.json` en `names`, o anota en `undecided` por qué no pudo.
 */
function collect(directory, files, names, undecided, isRoot) {
  const file = `${directory}/package.json`;
  let manifest;

  try {
    manifest = JSON.parse(files.read(file));
  } catch (error) {
    // A workspace entry without a manifest is routine; a project root without one is the face's blind spot.
    if (isRoot) undecided.push({ file, reason: error instanceof Error ? error.message : String(error) });

    return;
  }

  if (manifest === null || typeof manifest !== 'object') {
    if (isRoot) undecided.push({ file, reason: 'package.json is not a JSON object' });

    return;
  }

  for (const section of SECTIONS) {
    const entries = manifest[section];

    if (entries !== null && typeof entries === 'object') for (const name of Object.keys(entries)) names.add(name);
  }

  if (isRoot) for (const child of workspaceDirectories(manifest, directory, files)) collect(child, files, names, undecided, false);
}

/**
 * The dependency names of every given project directory.
 *
 * @returns `{ names, undecided }` — `undecided` lists each root manifest that could not be read, with its reason.
 * @es Los nombres de dependencia de cada directorio; `undecided` lista cada manifiesto raíz que no se
 * pudo leer, con su motivo.
 */
export function dependencyNamesOf(directories, files = diskFiles) {
  const names = new Set();
  const undecided = [];

  for (const directory of directories) collect(directory, files, names, undecided, true);

  return { names, undecided };
}
