/**
 * The paths a commit left stale, kept per repository so the NEXT commit in it can be judged. One small file per
 * repository (`stale-<key>.json`, the key a digest of its top-level directory): a repository's file is written
 * whole by whoever last measured it, so two sessions never merge half-records, and a torn or unreadable file
 * reads as "nothing recorded" (the guard then allows, and the live `git status` is the authority anyway).
 *
 * ROTATE RULE. A file leaves when the repository is measured clean (`clearStale`), and any file untouched for
 * `MAX_AGE_MS` is removed by the next write (`pruneOld`), so a repository that is never committed to again
 * leaves nothing behind. `hook-state/rotate.mjs` classifies `stale-*.json` as operative state it keeps.
 *
 * @es Las rutas que un commit dejó desactualizadas, por repositorio, para juzgar el SIGUIENTE commit. Un
 * fichero pequeño por repositorio (`stale-<clave>.json`, la clave es un resumen de su directorio raíz): lo
 * escribe entero quien lo midió por última vez, y uno roto o ilegible se lee como «nada registrado» (la guardia
 * permite, y el `git status` vivo manda). REGLA DE ROTACIÓN: un fichero se va cuando el repositorio se mide
 * limpio, y el que lleva `MAX_AGE_MS` sin tocarse lo borra la siguiente escritura.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stateDirectory } from './diary.mjs';

/** How long an untouched record may stay. @es Cuánto puede quedarse un registro sin tocar. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PREFIX = 'stale-';
const SUFFIX = '.json';
const KEY_LENGTH = 16;

/** A path for comparison: forward slashes, lower case. @es Una ruta para comparar. */
export const comparable = (candidate) => path.resolve(candidate).split('\\').join('/').toLowerCase();

const fileFor = (toplevel) => path.join(stateDirectory(), `${PREFIX}${createHash('sha256').update(comparable(toplevel)).digest('hex').slice(0, KEY_LENGTH)}${SUFFIX}`);

/** Removes the records nobody touched for `MAX_AGE_MS`. @es Quita los registros sin tocar en `MAX_AGE_MS`. */
export function pruneOld(now = Date.now()) {
  try {
    for (const name of readdirSync(stateDirectory())) {
      if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) continue;

      const file = path.join(stateDirectory(), name);

      if (now - statSync(file).mtimeMs > MAX_AGE_MS) rmSync(file, { force: true });
    }
  } catch {
    /* nothing to prune, or not prunable now */
  }
}

/** Records the stale `entries` (`[{ path, code }]`, paths relative to `toplevel`) of a repository. @es Registra las rutas desactualizadas de un repositorio. */
export function recordStale(toplevel, entries, now = Date.now()) {
  try {
    mkdirSync(stateDirectory(), { recursive: true });
    writeFileSync(fileFor(toplevel), `${JSON.stringify({ toplevel, at: new Date(now).toISOString(), entries })}\n`, 'utf8');
    pruneOld(now);
  } catch {
    /* a record that cannot be kept only means the next commit is not judged */
  }
}

/** The entries recorded for a repository, or `[]` when there are none or the file is unreadable. @es Las rutas registradas de un repositorio. */
export function recordedStale(toplevel) {
  try {
    const parsed = JSON.parse(readFileSync(fileFor(toplevel), 'utf8'));

    // A record whose entries are not a list throws here and reads as empty, like a torn one.
    return parsed.entries.filter((entry) => typeof entry?.path === 'string');
  } catch {
    return [];
  }
}

/** Forgets a repository's record. @es Olvida el registro de un repositorio. */
export function clearStale(toplevel) {
  try {
    rmSync(fileFor(toplevel), { force: true });
  } catch {
    /* already gone */
  }
}

/** Whether any repository has a record: the cheap test that lets an unaffected commit skip every git call. @es Si algún repositorio tiene registro. */
export function anyRecorded() {
  try {
    return readdirSync(stateDirectory()).some((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX));
  } catch {
    return false;
  }
}
