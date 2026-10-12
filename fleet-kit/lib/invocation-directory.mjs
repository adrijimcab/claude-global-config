/**
 * The directory a git invocation (from the vendored `gitInvocations`) acts in: the directory the line's
 * own `cd`s left it in, then each `-C` applied in order, as git applies them. `undefined` when the line
 * makes the directory unknowable (a `cd` to an expanded variable).
 * `--git-dir` / `GIT_DIR` do not change the directory; `invocation-repository.mjs` resolves them.
 *
 * @es El directorio donde actúa una invocación git: el que dejaron los `cd` de la línea, y luego cada
 * `-C` en orden, como los aplica git. `undefined` si la línea lo hace incognoscible.
 */

import path from 'node:path';

export function effectiveDirectory(invocation) {
  let directory = invocation.directory;

  for (let index = 0; index < invocation.gitOptions.length; index += 1) {
    if (invocation.gitOptions[index] === '-C' && directory !== undefined) directory = path.resolve(directory, invocation.gitOptions[index + 1] ?? '.');
  }

  return directory;
}
