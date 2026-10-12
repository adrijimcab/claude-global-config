/**
 * The one way the tooling compares folders: a path resolved through the filesystem (symlinks, junctions, short
 * Windows names) when it exists, and merely made absolute when it does not. Two paths name the same folder
 * when their resolved forms have an empty relative path between them (Windows compares case-insensitively).
 *
 * @es La única forma en que el tooling compara carpetas: una ruta resuelta por el sistema de ficheros
 * (enlaces, junctions, nombres cortos de Windows) cuando existe, y solo hecha absoluta cuando no. Dos rutas
 * nombran la misma carpeta si su ruta relativa resuelta es vacía (Windows compara sin distinguir mayúsculas).
 */

import { realpathSync } from 'node:fs';
import path from 'node:path';

/** @es La ruta resuelta de `directory`, o su forma absoluta si no existe. */
export function realpathOf(directory) {
  try {
    return realpathSync.native(directory);
  } catch {
    return path.resolve(directory);
  }
}

/** Whether two paths name the same folder. @es Si dos rutas nombran la misma carpeta. */
export function sameFolder(left, right) {
  return path.relative(realpathOf(left), realpathOf(right)) === '';
}
