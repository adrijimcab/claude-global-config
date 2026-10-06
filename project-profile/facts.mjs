/**
 * The raw facts a project profile is decided from, read from disk with FILE READS ONLY: no process is spawned
 * (no `npm ls`, no `git`), because the SessionStart hook that uses it must cost a few milliseconds. What it
 * reads: the project root (`findProjectRoot`), its `package.json`, the INSTALLED version of each package the
 * profile asks about (`node_modules/<pkg>/package.json`, walking up to the repository top so a hoisted
 * workspace install is found), the parsed `angular.json` when there is one, the names of the files at the
 * root (eslint config, lockfiles) and the lockfiles found between the root and the repository top.
 *
 * Root search: from the starting directory upwards, the first directory with a `package.json`; the walk stops
 * at the repository top (the first directory holding `.git`, file or folder) and never considers the home
 * directory itself or the filesystem root, so a stray `~/package.json` is never "the project". When nothing
 * is found and the start is a repository top, its direct children are tried (a workspace in a subfolder,
 * e.g. `Discovery-FE/`): the children whose manifest names a package from `preferred` win, in name order.
 *
 * Nothing is decided here: an unreadable or malformed file is reported as `undefined`, and `profile.mjs`
 * decides what that means.
 *
 * @es Los hechos crudos de los que se decide el perfil de un proyecto, leídos del disco SOLO con lecturas de
 * ficheros: no se lanza ningún proceso (ni `npm ls` ni `git`), porque el hook SessionStart que lo usa debe
 * costar pocos milisegundos. Lee la raíz del proyecto, su `package.json`, la versión INSTALADA de cada paquete
 * por el que pregunta el perfil (subiendo hasta la cima del repositorio para encontrar instalaciones izadas
 * de un workspace), el `angular.json` parseado si existe, los nombres de los ficheros de la raíz y los
 * lockfiles entre la raíz y la cima del repositorio. La búsqueda de la raíz sube desde el directorio inicial
 * hasta el primero con `package.json`, se detiene en la cima del repositorio y nunca toma el home ni la raíz
 * del sistema de ficheros; si no encuentra nada y el inicio es la cima de un repositorio, prueba sus hijos
 * directos (un workspace en una subcarpeta), y ganan los que nombran un paquete de `preferred`. Aquí no se
 * decide nada: un fichero ilegible o malformado se informa como `undefined`.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Lockfile name → package manager. @es Nombre de lockfile → gestor de paquetes. */
export const LOCKFILES = Object.freeze({ 'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'pnpm-lock.yaml': 'pnpm', 'yarn.lock': 'yarn', 'bun.lock': 'bun', 'bun.lockb': 'bun' });

const MANIFEST = 'package.json';
const SKIPPED_CHILDREN = new Set(['node_modules', 'dist', 'coverage', 'tmp', 'out']);

/** The parsed JSON object in `file`, or `undefined` when absent, unreadable or not an object. @es El objeto JSON de `file`, o `undefined`. */
export function readJsonObject(file) {
  try {
    const raw = readFileSync(file, 'utf8');
    const value = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);

    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Whether `dir` is a repository top (holds `.git`, a folder or a worktree's file). @es Si `dir` es la cima de un repositorio. */
const isRepositoryTop = (dir) => existsSync(path.join(dir, '.git'));

/** The directories from `start` up to its repository top (inclusive), or up to below `home`/the filesystem root. @es Los directorios desde `start` hasta la cima del repositorio. */
export function ancestry(start, home) {
  const chain = [];
  let dir = path.resolve(start);

  for (;;) {
    const parent = path.dirname(dir);

    if (dir === parent || (home !== undefined && dir === path.resolve(home))) return chain;

    chain.push(dir);

    if (isRepositoryTop(dir) || chain.length >= 64) return chain;

    dir = parent;
  }
}

/** Every dependency name a manifest declares, in any section. @es Todo nombre de dependencia que declara un manifiesto. */
const declaredNames = (manifest) => ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((section) => Object.keys(manifest?.[section] ?? {}));

/**
 * The project root for `start`: `{ root, manifest }`, or `undefined` outside any JS/TS project.
 * @es La raíz del proyecto para `start`, o `undefined` fuera de todo proyecto JS/TS.
 */
export function findProjectRoot(start, { home, preferred = [] } = {}) {
  const chain = ancestry(start, home);

  for (const dir of chain) {
    if (existsSync(path.join(dir, MANIFEST))) return { root: dir, manifest: readJsonObject(path.join(dir, MANIFEST)) };
  }

  const top = chain[0];

  if (top === undefined || !isRepositoryTop(top)) return undefined;

  let entries;

  try {
    entries = readdirSync(top, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const name = frameworkChild(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name), (child) => (existsSync(path.join(top, child, MANIFEST)) ? readJsonObject(path.join(top, child, MANIFEST)) ?? {} : undefined), preferred);

  return name === undefined ? undefined : { root: path.join(top, name), manifest: readJsonObject(path.join(top, name, MANIFEST)) };
}

/**
 * Among the child folder `names` of a repository top, the first by name (never by directory order, which the
 * filesystem decides) that is not a dot or build folder and whose manifest (`manifestOf(name)`, `undefined` when
 * it has none) declares a package from `preferred`; `undefined` when none does.
 * @es Entre los hijos `names` de la cima de un repositorio, el primero por nombre (nunca por el orden del
 * directorio) que no es carpeta oculta ni de build y cuyo manifiesto declara un paquete de `preferred`.
 */
export function frameworkChild(names, manifestOf, preferred) {
  return [...names].sort().filter((name) => !name.startsWith('.') && !SKIPPED_CHILDREN.has(name)).find((name) => {
    const manifest = manifestOf(name);

    return manifest !== undefined && declaredNames(manifest).some((declared) => preferred.includes(declared));
  });
}

/** The version of `pkg` installed for `root`, searching `node_modules` up to the repository top. @es La versión instalada de `pkg` para `root`. */
export function installedVersion(pkg, chain) {
  for (const dir of chain) {
    const manifest = readJsonObject(path.join(dir, 'node_modules', ...pkg.split('/'), MANIFEST));

    if (typeof manifest?.version === 'string') return manifest.version;
  }

  return undefined;
}

/**
 * Every fact `profile.mjs` decides from, for the project that holds `start`; `undefined` outside a JS/TS
 * project. `packages` are the names whose installed versions are read.
 * @es Todos los hechos de los que decide `profile.mjs`; `undefined` fuera de un proyecto JS/TS.
 */
export function readFacts(start, { home, packages = [], preferred = [] } = {}) {
  const found = findProjectRoot(start, { home, preferred });

  if (found === undefined) return undefined;

  const chain = ancestry(found.root, home);
  let rootFiles = [];

  try {
    rootFiles = readdirSync(found.root);
  } catch {
    rootFiles = [];
  }

  const declared = new Set(declaredNames(found.manifest));
  const installed = Object.fromEntries(packages.filter((pkg) => declared.has(pkg)).map((pkg) => [pkg, installedVersion(pkg, chain)]).filter(([, version]) => version !== undefined));
  const lockfiles = chain.flatMap((dir) => Object.keys(LOCKFILES).filter((name) => existsSync(path.join(dir, name))));

  return {
    root: found.root,
    start: path.resolve(start),
    manifest: found.manifest,
    installed,
    angularJson: rootFiles.includes('angular.json') ? readJsonObject(path.join(found.root, 'angular.json')) : undefined,
    rootFiles,
    lockfiles,
  };
}
