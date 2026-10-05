/**
 * The locator scan: which source files call `homedir()`. It only produces a LEAD list. The run decides what
 * was polluted; a candidate annotates a finding and never makes or clears one (a search locates, it does
 * not render a verdict). Files of an ignored directory are not listed by git, which is one more reason the
 * list can only be a lead.
 *
 * @es El escáner de candidatos: qué ficheros fuente llaman a `homedir()`. Solo produce una lista de PISTAS.
 * La corrida decide qué se contaminó; un candidato anota un hallazgo y nunca lo crea ni lo borra. Los
 * ficheros de un directorio ignorado no los lista git: otra razón por la que la lista solo es una pista.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const NEEDLE = 'homedir()';

/** The lines of a file; a tracked file the run deleted has none. @es Las líneas de un fichero; uno seguido que la corrida borró no tiene ninguna. */
function linesOf(file) {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n') : [];
}

/**
 * @returns `[{ file, line, mechanism }]` for every use of `homedir()` in a `.mjs` file of `root` that git
 *   knows (tracked, or untracked and not ignored); `mechanism` is the first path segment.
 * @es Cada uso de `homedir()` en un `.mjs` de `root` que git conoce; `mechanism` es el primer segmento.
 */
export function locateHomedirUses({ root, env = process.env }) {
  const listed = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.mjs'], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });

  const uses = [];

  for (const file of listed.stdout.split('\0').filter((name) => name !== '').sort()) {
    linesOf(path.join(root, file)).forEach((text, index) => {
      if (text.includes(NEEDLE)) uses.push({ file, line: index + 1, mechanism: file.split('/')[0] });
    });
  }

  return uses;
}

/** Marks each change whose first path segment is a candidate mechanism. @es Marca cada cambio cuyo primer segmento es un mecanismo candidato. */
export function annotate(changes, uses) {
  const mechanisms = new Set(uses.map((use) => use.mechanism));

  return changes.map((change) => ({ ...change, candidate: mechanisms.has(change.path.split('/')[0]) }));
}
