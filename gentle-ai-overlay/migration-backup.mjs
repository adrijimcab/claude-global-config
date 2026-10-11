/**
 * A SAVED SET of paths of a home, and putting it back: before a change, every listed path is copied as it is (or
 * recorded as absent) under a backup directory with a manifest; a restore makes each path exactly what it was,
 * which deletes a path that did not exist then. One responsibility: the save and its inverse, for any list.
 *
 * Links are refused, never followed (lesson `recursive-delete-followed-a-junction`): Node reports a Windows
 * junction as a symbolic link, so a path, or any entry inside a saved directory, that is a link stops the save or
 * the restore before anything is copied or removed.
 *
 * @es Un CONJUNTO GUARDADO de rutas de un home, y su vuelta atrás: antes de un cambio, cada ruta de la lista se
 * copia tal cual (o se registra como ausente) bajo un directorio de respaldo con un manifiesto; restaurar deja
 * cada ruta exactamente como estaba, lo que borra una ruta que entonces no existía. Los enlaces se rechazan, nunca
 * se siguen: Node informa un junction de Windows como enlace simbólico, así que una ruta, o una entrada dentro de
 * un directorio guardado, que sea un enlace detiene el guardado o la restauración antes de copiar o borrar nada.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MANIFEST = 'manifest.json';
const FILES = 'files';

const refuse = (english, spanish) => {
  throw new Error(`${english} @es ${spanish}`);
};

/** Throws when `target` or anything under it is a link. @es Lanza si `target` o algo bajo él es un enlace. */
export function assertNoLink(target) {
  const stat = lstatSync(target);
  if (stat.isSymbolicLink()) refuse(`${target} is a link or junction; refusing to follow it`, `${target} es un enlace o junction; se rechaza seguirlo`);
  if (stat.isDirectory()) readdirSync(target).forEach((name) => assertNoLink(path.join(target, name)));
}

/** The absolute path of `relative` under `home`, refusing one that climbs out. @es La ruta absoluta de `relative` bajo `home`, rechazando una que salga. */
export function inside(home, relative) {
  const absolute = path.resolve(home, relative);
  const back = path.relative(path.resolve(home), absolute);
  if (back === '' || back.startsWith('..') || path.isAbsolute(back)) refuse(`${relative} is not inside ${home}`, `${relative} no está dentro de ${home}`);
  return absolute;
}

/**
 * Save `paths` (relative to `home`) into `into`, which must not exist yet. Returns the manifest written.
 * @es Guarda `paths` (relativas a `home`) en `into`, que todavía no debe existir. Devuelve el manifiesto escrito.
 * @returns {{ entries: { path: string, existed: boolean }[] }}
 */
export function saveSet({ home, paths, into }) {
  if (existsSync(into)) refuse(`${into} already exists; a backup is never overwritten`, `${into} ya existe; un respaldo nunca se sobrescribe`);
  const sources = paths.map((relative) => ({ relative, absolute: inside(home, relative) }));
  sources.filter(({ absolute }) => existsSync(absolute)).forEach(({ absolute }) => assertNoLink(absolute));
  mkdirSync(path.join(into, FILES), { recursive: true });
  const entries = sources.map(({ relative, absolute }) => {
    const existed = existsSync(absolute);
    if (existed) cpSync(absolute, path.join(into, FILES, relative), { recursive: true, preserveTimestamps: true });
    return { path: relative, existed };
  });
  const manifest = { entries };
  writeFileSync(path.join(into, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

/**
 * Put every saved path of `from` back under `home`: the current one is removed, then the saved copy, if the path
 * existed, is copied back. Returns the entries restored.
 * @es Devuelve cada ruta guardada de `from` a `home`: se quita la actual y, si la ruta existía, se copia la guardada.
 * @returns {{ path: string, existed: boolean }[]}
 */
export function restoreSet({ home, from }) {
  const { entries } = JSON.parse(readFileSync(path.join(from, MANIFEST), 'utf8'));
  const targets = entries.map((entry) => ({ ...entry, absolute: inside(home, entry.path), saved: path.join(from, FILES, entry.path) }));
  targets.filter(({ absolute }) => existsSync(absolute)).forEach(({ absolute }) => assertNoLink(absolute));
  targets.filter(({ existed, saved }) => existed && !existsSync(saved)).forEach(({ saved }) => refuse(`${saved} is missing from the backup`, `falta ${saved} en el respaldo`));
  for (const { absolute, existed, saved } of targets) {
    rmSync(absolute, { recursive: true, force: true });
    if (existed) {
      mkdirSync(path.dirname(absolute), { recursive: true });
      cpSync(saved, absolute, { recursive: true, preserveTimestamps: true });
    }
  }
  return entries;
}
