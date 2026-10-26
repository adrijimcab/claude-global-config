/**
 * The paths a commit left stale, kept per repository so the NEXT commit in it can be judged. One small file per
 * repository (`stale-<key>.json`, the key a digest of its top-level directory) holding entries
 * `{ path, code, blob, since }`: the path, its two status columns, the blob id of the stale index entry the
 * guard saw, and when it first saw THAT blob.
 *
 * RECORDING ONLY ADDS (`recordStale`): the entries of a new measurement are merged into the record by path, so
 * two commits in a row, or two directories of one repository in one line, never forget each other. An entry
 * whose blob is unchanged keeps its `since`: its age runs from its FIRST recording, never refreshed. A path
 * leaves the record only through `retainStale`, which the refusal calls with what a LIVE re-measure still finds
 * stale: a settled path, a partial or whole `git add` (the blob changed), or a path that was moved.
 *
 * ROTATE RULE. An entry older than `MAX_AGE_MS` since its first recording is ignored when read and removed by
 * the next write; a file left empty is deleted, and an unreadable file untouched for that long is deleted too, so
 * a repository that is never committed to again leaves nothing behind. A torn or unreadable file reads as
 * "nothing recorded" (the guard then allows, and the live `git status` is the authority anyway).
 * `hook-state/rotate.mjs` classifies `stale-*.json` as operative state it keeps.
 *
 * @es Las rutas que un commit dejó desactualizadas, por repositorio, para juzgar el SIGUIENTE commit. Un
 * fichero pequeño por repositorio guarda entradas `{ path, code, blob, since }`: la ruta, sus dos columnas, el
 * blob de la entrada vieja del índice que vio la guardia y cuándo vio ESE blob por primera vez. REGISTRAR SOLO
 * AÑADE: las entradas de una medición nueva se funden por ruta, así dos commits seguidos, o dos directorios de un
 * repositorio en una línea, no se olvidan entre sí. Una entrada con el mismo blob conserva su `since`: su edad
 * corre desde el PRIMER registro, nunca se renueva. Una ruta sale del registro solo por `retainStale`, que la
 * negativa llama con lo que una medición VIVA aún halla desactualizado. ROTACIÓN: una entrada de más de
 * `MAX_AGE_MS` desde su primer registro se ignora al leer y la borra la siguiente escritura; un fichero vacío se
 * borra, y uno ilegible sin tocar ese tiempo también. Uno roto se lee como «nada registrado».
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stateDirectory } from './diary.mjs';

/** How long an entry may stay, counted from its first recording. @es Cuánto puede quedarse una entrada, desde su primer registro. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PREFIX = 'stale-';
const SUFFIX = '.json';
const KEY_LENGTH = 16;

/** A path for comparison: forward slashes, lower case. @es Una ruta para comparar. */
export const comparable = (candidate) => path.resolve(candidate).split('\\').join('/').toLowerCase();

const nameFor = (toplevel) => `${PREFIX}${createHash('sha256').update(comparable(toplevel)).digest('hex').slice(0, KEY_LENGTH)}${SUFFIX}`;
const fileFor = (toplevel) => path.join(stateDirectory(), nameFor(toplevel));

/** Whether an entry names a path and a blob. @es Si una entrada nombra una ruta y un blob. */
const isEntry = (entry) => typeof entry?.path === 'string' && typeof entry?.blob === 'string';

/** Whether an entry is still within its age limit; a missing or unreadable first-seen time is not. @es Si una entrada sigue dentro de su límite de edad; una hora ausente o ilegible no lo está. */
const isLive = (entry, now) => now - Date.parse(entry.since) <= MAX_AGE_MS;

/** The live, well-formed entries of one record file; throws when it cannot be read or parsed. @es Las entradas vivas de un fichero. */
function entriesIn(file, now) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));

  // A record whose entries are not a list throws here and reads as empty, like a torn one.
  return parsed.entries.filter((entry) => isEntry(entry) && isLive(entry, now));
}

/** Writes a record file, or removes it when it holds nothing. @es Escribe un fichero de registro, o lo quita si está vacío. */
function writeRecord(file, toplevel, entries) {
  if (entries.length === 0) {
    rmSync(file, { force: true });
    return;
  }

  mkdirSync(stateDirectory(), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ toplevel, entries })}\n`, 'utf8');
}

/** Removes the entries past their limit from every record, and the files they leave empty or unreadable for too long. @es Quita las entradas vencidas de cada registro. */
export function pruneOld(now = Date.now()) {
  try {
    for (const name of readdirSync(stateDirectory())) {
      if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) continue;

      const file = path.join(stateDirectory(), name);

      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));

        writeRecord(file, parsed.toplevel, parsed.entries.filter((entry) => isEntry(entry) && isLive(entry, now)));
      } catch {
        if (now - statSync(file).mtimeMs > MAX_AGE_MS) rmSync(file, { force: true });
      }
    }
  } catch {
    /* nothing to prune, or not prunable now */
  }
}

/** The live entries recorded for a repository, or `[]` when there are none or the file is unreadable. @es Las entradas vivas de un repositorio. */
export function recordedStale(toplevel, now = Date.now()) {
  try {
    return entriesIn(fileFor(toplevel), now);
  } catch {
    return [];
  }
}

/**
 * Adds stale entries (`[{ path, code, blob }]`, paths relative to `toplevel`) to the record of a repository. An
 * entry for a path already recorded with the SAME blob keeps its first-seen time; a new blob starts its own.
 * Nothing already recorded is removed.
 * @es Añade entradas desactualizadas al registro de un repositorio, sin quitar nada de lo registrado.
 */
export function recordStale(toplevel, entries, now = Date.now()) {
  try {
    const kept = recordedStale(toplevel, now);
    const merged = new Map(kept.map((entry) => [entry.path, entry]));

    for (const entry of entries) {
      const known = merged.get(entry.path);

      if (known === undefined || known.blob !== entry.blob) merged.set(entry.path, { path: entry.path, code: entry.code, blob: entry.blob, since: new Date(now).toISOString() });
    }

    writeRecord(fileFor(toplevel), toplevel, [...merged.values()]);
    pruneOld(now);
  } catch {
    /* a record that cannot be kept only means the next commit is not judged */
  }
}

/**
 * Makes the record of a repository exactly `entries`, which a live measurement found still stale (each carries
 * its original `since`); an empty list forgets the repository.
 * @es Deja el registro de un repositorio exactamente en `entries`, lo que una medición viva halló aún desactualizado.
 */
export function retainStale(toplevel, entries) {
  try {
    writeRecord(fileFor(toplevel), toplevel, entries);
  } catch {
    /* the record stays as it was */
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
