/**
 * The files a `CLAUDE.md` imports with Claude Code's `@path` syntax, as absolute paths of files that exist.
 *
 * Only the project's own imports count: a path starting with `~` or an absolute path points at the owner's
 * global files, which are not this project's contract. A line is an import when, trimmed, it starts with `@`
 * and has no space in it (`@AGENT-CONTRACT.md`); `@es Texto...` and prose do not qualify. Fenced code blocks
 * are skipped, because an `@` line inside one is an example, not an import. An import whose file does not exist
 * is dropped here, so a decorator name such as `@HostListener` alone on a line cannot become a contract path.
 * One level only: what an imported file imports is the worker's to follow once it reads that file.
 *
 * @es Los ficheros que un `CLAUDE.md` importa con la sintaxis `@ruta` de Claude Code, como rutas absolutas de
 * ficheros que existen. Solo cuentan los imports del propio proyecto: una ruta con `~` o absoluta apunta a los
 * ficheros globales del dueño, que no son el contrato de este proyecto. Una línea es un import si, recortada,
 * empieza con `@` y no lleva espacios; `@es Texto...` y la prosa no califican. Los bloques de código se
 * saltan. Un import cuyo fichero no existe se descarta, así `@HostListener` solo en una línea no se vuelve
 * una ruta de contrato. Un solo nivel.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const FENCE = '```';

const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile();

/** The existing files `claudeMdFile` imports, absolute, in the order written. @es Los ficheros existentes que importa `claudeMdFile`, en el orden escrito. */
export function importedFiles(claudeMdFile) {
  const directory = path.dirname(claudeMdFile);
  const imported = [];
  let inFence = false;

  for (const rawLine of readFileSync(claudeMdFile, 'utf8').split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith(FENCE)) {
      inFence = !inFence;
      continue;
    }

    if (inFence || !line.startsWith('@') || line.includes(' ') || line.startsWith('@~')) continue;

    const target = line.slice(1);

    if (path.win32.isAbsolute(target)) continue;

    const resolved = path.resolve(directory, target);

    if (isFile(resolved) && !imported.includes(resolved)) imported.push(resolved);
  }

  return imported;
}
