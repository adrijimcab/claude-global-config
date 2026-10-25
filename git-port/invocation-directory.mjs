/**
 * The directory a git invocation ACTS in: the directory the line's own `cd`s resolved to, then every `-C`
 * global option applied in order (a relative `-C` folds onto what came before, an absolute one replaces it,
 * even when the `cd` could not be followed). `undefined` when no directory is knowable.
 *
 * @es El directorio en el que ACTÚA una invocación de git: el que resolvieron los `cd` de la propia línea y
 * después cada `-C` global aplicado en orden (uno relativo se pliega sobre lo anterior, uno absoluto lo
 * reemplaza, aunque no se haya podido seguir el `cd`). `undefined` si no se puede conocer ningún directorio.
 */

import path from 'node:path';

/**
 * @param invocation An item of `gitInvocations()`: `{ gitOptions, directory }`.
 * @param until Fold only the options before this index (the directory in force when option `until` applies).
 * @es Un elemento de `gitInvocations()`. @es `until`: pliega solo las opciones anteriores a este índice.
 */
export function invocationDirectory({ gitOptions, directory }, until = gitOptions.length) {
  let current = directory;

  for (let index = 0; index < until; index += 1) {
    if (gitOptions[index] !== '-C') continue;

    const value = gitOptions[index + 1];

    if (typeof value !== 'string') continue;

    if (current === undefined) current = path.isAbsolute(value) ? value : undefined;
    else current = path.resolve(current, value);
  }

  return current;
}
