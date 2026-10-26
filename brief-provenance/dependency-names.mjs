/**
 * The THIRD-PARTY dependency NAMES a brief's project declares: the keys of `dependencies`,
 * `devDependencies` and `peerDependencies` (plain objects only) of its root `package.json` and of the
 * workspace `package.json` files that are cheap to find (a plain workspace directory, or a `dir/*` entry
 * listed one level deep). The project's own code is left out: a value that points into its tree
 * (`workspace:`, `file:`, `link:`, `portal:`) and the `name` of every manifest read (a sibling workspace
 * depended on by a plain version range). A scoped key is also named by its scope and its tail (see
 * `mentionsOf`). Nothing else is read: no network, never the contents of `node_modules`.
 *
 * WHERE THE PROJECT COMES FROM. The checkout paths of the brief's `TENANCY:` lines (the path the brief
 * itself declares as the worker's tree); when it declares none, the `cwd` of the hook payload. Neither
 * known: the face has nothing to read and says so. A checkout whose root holds no `package.json` (the npm
 * project nested one folder down) is read from the `package.json` files one level below it, `node_modules`
 * and dot-folders excepted, as a union.
 *
 * CONTAINED. Nothing outside the checkout is read: a workspace entry is normalised, and one that climbs out
 * (`..`) or is absolute is not followed but recorded as undecided.
 *
 * NEVER FAILS CLOSED, NEVER SILENT. A root without any manifest, a manifest that does not parse (a UTF-8
 * BOM is stripped first) or is not an object, and an escaping workspace entry are each reported in
 * `undecided` with the file and the reason; the caller journals them and allows. A workspace entry with no
 * manifest is routine and reported nowhere. The reading goes through a port (`files`), so the proof can
 * hand it a constructed project.
 *
 * @es Los NOMBRES de dependencias DE TERCEROS que declara el proyecto de un brief: claves de
 * `dependencies`, `devDependencies` y `peerDependencies` (solo objetos planos) del `package.json` raíz y de
 * los de workspace baratos de hallar. El código propio queda fuera: un valor que apunta a su árbol
 * (`workspace:`, `file:`, `link:`, `portal:`) y el `name` de cada manifiesto leído (un workspace hermano del
 * que se depende con un rango de versión normal). Una clave con ámbito también se nombra por su ámbito y su
 * cola (ver `mentionsOf`). EL PROYECTO sale de las rutas `TENANCY:` del brief o, si no hay, del `cwd` del
 * payload; si su raíz no tiene `package.json`, se leen los de un nivel más abajo (salvo `node_modules` y
 * carpetas con punto), en unión. CONTENIDO: nada fuera del checkout; una entrada de workspace que sale
 * (`..`) o es absoluta no se sigue y queda como no decidida. NUNCA FALLA CERRADO NI CALLA: cada manifiesto
 * ausente en la raíz, ilegible (se quita antes el BOM) o no objeto, y cada entrada que escapa, va a
 * `undecided` con su fichero y motivo.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { namedCheckouts } from '../brief-tenancy/named-checkouts.mjs';
import { tenancyLines } from '../brief-tenancy/tenancy-declaration.mjs';

/** The sections of a manifest whose keys are package names. @es Las secciones cuyas claves son nombres de paquete. */
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'];

/** The value prefixes that name a package of the project's own tree. @es Los prefijos de valor de un paquete del propio árbol. */
const LOCAL_PREFIXES = ['workspace:', 'file:', 'link:', 'portal:'];

/** The folder one level down that is never read as a nested project. @es La carpeta que nunca se lee como proyecto anidado. */
const INSTALLED = 'node_modules';

/** The real file system, as the port the reading needs. @es El sistema de ficheros real, como puerto. */
export const diskFiles = Object.freeze({
  read: (file) => readFileSync(file, 'utf8'),
  list: (directory) => readdirSync(directory)
});

/** The project directories a brief points at, in order. @es Los directorios de proyecto a los que apunta un brief. */
export function projectDirectories(text, payload) {
  const declared = namedCheckouts(tenancyLines(text).join('\n'));

  if (declared.length > 0) return declared;

  const cwd = payload?.cwd;

  return typeof cwd === 'string' && cwd.length > 0 ? [cwd] : [];
}

const messageOf = (error) => (error instanceof Error ? error.message : String(error));

/**
 * One manifest: `{ missing: true }` when it cannot be read, `{ manifest }` when it parses to an object, or
 * `{ reason }` when it does not.
 * @es Un manifiesto: ausente, leído como objeto, o con el motivo por el que no lo es.
 */
function readManifest(file, files) {
  let raw;

  try {
    raw = files.read(file);
  } catch {
    return { missing: true };
  }

  let manifest;

  try {
    manifest = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (error) {
    return { reason: messageOf(error) };
  }

  return manifest !== null && typeof manifest === 'object' ? { manifest } : { reason: 'package.json is not a JSON object' };
}

/**
 * The parts of a scoped name that are common English words, so never a name on their own: `@playwright/test`
 * adds `playwright` but not `test`, and `@types/node` adds neither `types` nor `node`. A prefilter hit only costs
 * one judge call, so the list stays short.
 * @es Las partes de un nombre con ámbito que son palabras inglesas corrientes y nunca son un nombre por sí solas.
 */
const COMMON_WORDS = new Set(['test', 'core', 'cli', 'common', 'types', 'utils', 'kit', 'node']);

/**
 * The names a dependency key is mentioned by in prose: the key itself and, for a scoped `@scope/tail`, the scope
 * without its `@` and the tail, each unless it is a common word. Prose says "Playwright" for `@playwright/test`.
 * @es Los nombres con que la prosa menciona una dependencia: la clave y, si tiene ámbito, el ámbito sin `@` y la
 * cola, cada uno salvo que sea palabra común. La prosa dice «Playwright» por `@playwright/test`.
 */
function mentionsOf(name) {
  if (!name.startsWith('@') || !name.includes('/')) return [name];

  const slash = name.indexOf('/');
  const parts = [name.slice(1, slash), name.slice(slash + 1)];

  return [name, ...parts.filter((part) => !COMMON_WORDS.has(part.toLowerCase()))];
}

/** Whether a dependency value points inside the project's own tree. @es Si un valor de dependencia apunta al propio árbol. */
const isLocal = (value) => typeof value === 'string' && LOCAL_PREFIXES.some((prefix) => value.startsWith(prefix));

/**
 * Adds the third-party names of one manifest, and the manifest's own package name to `own`: a package the
 * project itself defines (a sibling workspace, whatever version spec points at it) is never third-party.
 * @es Añade los nombres de terceros de un manifiesto, y el nombre propio del manifiesto a `own`: un paquete que
 * define el propio proyecto (un workspace hermano, con cualquier versión) nunca es de terceros.
 */
function addNames(manifest, context) {
  // A manifest with no string name adds a value no dependency key can equal, so it needs no test.
  context.own.add(manifest.name);

  for (const section of SECTIONS) {
    const entries = manifest[section];

    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) continue;

    for (const [name, value] of Object.entries(entries)) if (!isLocal(value)) context.keys.add(name);
  }
}

/** Whether a normalised workspace entry leaves its directory. @es Si una entrada normalizada sale de su directorio. */
const escapes = (entry) => entry === '..' || entry.startsWith('../') || path.win32.isAbsolute(entry);

/** The workspace directories a manifest names, inside its own directory. @es Los directorios de workspace que nombra un manifiesto. */
function workspaceDirectories(manifest, directory, context) {
  const entries = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages;

  if (!Array.isArray(entries)) return [];

  const found = [];

  for (const entry of entries) {
    if (typeof entry !== 'string') continue;

    const normalized = path.posix.normalize(entry.split('\\').join('/'));

    if (escapes(normalized)) {
      context.undecided.push({ file: `${directory}/package.json`, reason: `workspace entry "${entry}" leaves the checkout, so it is not read` });
      continue;
    }

    if (normalized.endsWith('/*')) {
      const parent = `${directory}/${normalized.slice(0, -2)}`;

      try {
        for (const child of context.files.list(parent)) found.push(`${parent}/${child}`);
      } catch {
        /* a glob that lists nothing contributes nothing; the root manifest still decides */
      }
    } else {
      // Any other shape is tried as a plain directory; one that does not exist is routine (see `collect`).
      found.push(`${directory}/${normalized}`);
    }
  }

  return found;
}

/**
 * Reads one `package.json` into the names, its workspaces too when `withWorkspaces`; a manifest that exists
 * but cannot be used goes to `undecided`.
 * @returns whether a manifest file was there.
 * @es Lee un `package.json` en los nombres (y sus workspaces si `withWorkspaces`); uno que existe pero no
 * sirve va a `undecided`. Devuelve si el fichero estaba.
 */
function collect(directory, context, withWorkspaces) {
  const file = `${directory}/package.json`;
  const read = readManifest(file, context.files);

  if (read.missing) return false;

  if (read.manifest === undefined) {
    context.undecided.push({ file, reason: read.reason });

    return true;
  }

  addNames(read.manifest, context);

  if (withWorkspaces) for (const child of workspaceDirectories(read.manifest, directory, context)) collect(child, context, false);

  return true;
}

/** Reads one checkout: its root manifest, or else the manifests one level down. @es Lee un checkout: su manifiesto raíz o los de un nivel más abajo. */
function collectCheckout(directory, context) {
  if (collect(directory, context, true)) return;

  let children = [];

  try {
    children = context.files.list(directory);
  } catch {
    /* an unlistable checkout has no nested project; it is reported just below */
  }

  let found = false;

  for (const child of children) {
    if (child === INSTALLED || child.startsWith('.')) continue;

    if (collect(`${directory}/${child}`, context, true)) found = true;
  }

  if (!found) context.undecided.push({ file: `${directory}/package.json`, reason: 'no package.json in the checkout nor one level below it' });
}

/**
 * The dependency names of every given project directory.
 *
 * @returns `{ names, undecided }` — `undecided` lists each manifest or entry that could not be used, with its reason.
 * @es Los nombres de dependencia de cada directorio; `undecided` lista cada manifiesto o entrada que no se
 * pudo usar, con su motivo.
 */
export function dependencyNamesOf(directories, files = diskFiles) {
  const context = { files, keys: new Set(), own: new Set(), undecided: [] };

  for (const directory of directories) collectCheckout(directory, context);

  // A key the project defines itself adds no mention: `acme` of a sibling `@acme/ui` stays out, unless a
  // third-party key (`@acme/other`) produces it too. @es Una clave que define el propio proyecto no aporta
  // menciones: `acme` de un hermano `@acme/ui` queda fuera, salvo que una clave de terceros también la produzca.
  const names = new Set();

  for (const key of context.keys) if (!context.own.has(key)) for (const mention of mentionsOf(key)) names.add(mention);

  return { names, undecided: context.undecided };
}
