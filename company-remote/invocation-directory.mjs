/**
 * The directory a git invocation ACTS in: the directory the line's own `cd`s resolved to, then every `-C`
 * global option applied in order (a relative `-C` folds onto what came before, an absolute one replaces it).
 * `undefined` when the line's `cd` could not be followed.
 *
 * @es El directorio en el que ACTÚA una invocación de git: el que resolvieron los `cd` de la propia línea
 * y después cada `-C` global aplicado en orden (uno relativo se pliega sobre lo anterior, uno absoluto lo
 * reemplaza). `undefined` si no se pudo seguir el `cd` de la línea.
 */

import path from 'node:path';

/**
 * @param invocation An item of `gitInvocations()`: `{ gitOptions, directory }`.
 * @es Un elemento de `gitInvocations()`: `{ gitOptions, directory }`.
 */
export function invocationDirectory({ gitOptions, directory }) {
  let current = directory;

  for (let index = 0; index < gitOptions.length; index += 1) {
    if (gitOptions[index] !== '-C') continue;

    const value = gitOptions[index + 1];

    if (value === undefined) continue;

    if (current === undefined) current = path.isAbsolute(value) ? value : undefined;
    else current = path.resolve(current, value);
  }

  return current;
}
