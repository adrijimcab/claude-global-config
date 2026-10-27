/**
 * The VERDICT CACHE: one recorded probe verdict per project, valid only for the lockfile and the probe it was
 * measured with, so the probe runs once per dependency tree and never on every worktree spawn.
 *
 * INVALIDATION IS BY IDENTITY, never by time. A record carries the sha256 of the lockfile and the probe's
 * plan key; `strategy.mjs` treats a record whose hash or plan differs from the project's current ones as no
 * record at all. A lockfile change therefore re-probes on the next spawn, and nothing has to remember to
 * clear the cache. Recording again replaces the project's one record.
 *
 * AN UNREADABLE STORE IS NO RECORD, which is the safe direction: no record means the own install, which needs
 * no proof. Never a throw that could stop a provisioning, never an empty object read as "proven".
 *
 * @es La CACHÉ DE VEREDICTOS: un veredicto por proyecto, válido solo para el lockfile y la sonda con que se
 * midió, para que la sonda corra una vez por árbol y no en cada worktree. La invalidación es por IDENTIDAD,
 * nunca por tiempo: un registro con otro hash de lockfile u otro plan no cuenta, así que un cambio de lockfile
 * vuelve a sondear sin que nadie tenga que acordarse de vaciar nada. Un almacén ilegible es «sin registro»,
 * que lleva a la instalación propia: la dirección segura.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ancestry } from '../project-profile/facts.mjs';
import { stateDir } from '../hook-state/locations.mjs';

/** The lockfiles of each package manager, in the order a manager itself prefers them. @es Los lockfiles de cada gestor. */
export const LOCKFILES_OF = Object.freeze({
  npm: ['npm-shrinkwrap.json', 'package-lock.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb']
});

/** The default store file. @es El fichero de almacén por defecto. */
export const defaultStoreFile = () => path.join(stateDir('worktree-install'), 'verdicts.json');

/** sha256 of a file's bytes, or `undefined` when it cannot be read. @es sha256 de un fichero, o `undefined`. */
export function hashFile(file) {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return undefined;
  }
}

/** One spelling of a directory for keys: resolved through links, `/`-separated, lowercased on Windows. @es Una grafía de directorio para claves. */
export function directoryKey(directory, platform = process.platform) {
  let resolved;

  try {
    resolved = realpathSync.native(directory);
  } catch {
    resolved = path.resolve(directory);
  }

  const slashed = resolved.split('\\').join('/');

  return platform === 'win32' ? slashed.toLowerCase() : slashed;
}

/**
 * The lockfile that governs `projectRoot`: the nearest one of the profile's package manager, from the project
 * root up to its repository top (an npm workspace locks at its top). `undefined` when there is none.
 * @es El lockfile que gobierna `projectRoot`: el más cercano del gestor del perfil, hasta la cima del repo.
 */
export function lockfileOf(projectRoot, packageManager, exists = existsSync) {
  const names = LOCKFILES_OF[packageManager] ?? Object.values(LOCKFILES_OF).flat();

  for (const dir of ancestry(projectRoot)) {
    const name = names.find((candidate) => exists(path.join(dir, candidate)));

    if (name !== undefined) return path.join(dir, name);
  }

  return undefined;
}

/**
 * The identity of a project now: `{ projectKey, lockfile, lockfileHash, planKey }`, or `undefined` when it has
 * no readable lockfile. `lockfile` is absolute.
 * @es La identidad actual de un proyecto, o `undefined` si no tiene lockfile legible.
 */
export function identityOf(profile, planKey) {
  const lockfile = lockfileOf(profile.root, profile.packageManager);
  const lockfileHash = lockfile === undefined ? undefined : hashFile(lockfile);

  if (lockfileHash === undefined) return undefined;

  return { projectKey: directoryKey(profile.root), lockfile, lockfileHash, planKey };
}

/** Every record in the store, or `{}` when it is absent or unreadable. @es Todos los registros, o `{}`. */
function readStore(storeFile) {
  try {
    const value = JSON.parse(readFileSync(storeFile, 'utf8'));

    return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof value.projects === 'object' && value.projects !== null ? value.projects : {};
  } catch {
    return {};
  }
}

/** The record for `projectKey`, or `undefined`. @es El registro de `projectKey`, o `undefined`. */
export function readRecorded(storeFile, projectKey) {
  const record = readStore(storeFile)[projectKey];

  return record !== null && typeof record === 'object' ? record : undefined;
}

/**
 * Records `record` as its project's one verdict, replacing any older one. Written to a sibling file and renamed,
 * so a reader never sees half a store.
 * @es Registra `record` como el único veredicto de su proyecto. Se escribe aparte y se renombra.
 */
export function recordVerdict(storeFile, record) {
  const projects = { ...readStore(storeFile), [record.projectKey]: record };
  const staging = `${storeFile}.${process.pid}.tmp`;

  mkdirSync(path.dirname(storeFile), { recursive: true });
  writeFileSync(staging, `${JSON.stringify({ version: 1, projects }, null, 2)}\n`, 'utf8');
  renameSync(staging, storeFile);
}
