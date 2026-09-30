/**
 * Resolves the `typescript` compiler package that the REPOSITORY OWNING a given file would itself use
 * — never a copy vendored under `~/.claude/`, which has no `node_modules` of its own and must not grow
 * one just to run a hook.
 *
 * MEASURED (this session, fresh `node` processes, no cross-call caching): `createRequire` from a
 * synthetic filename inside the target file's directory reproduces Node's own CommonJS resolution —
 * walking `node_modules` up through every parent directory, exactly like a real script living in that
 * repository would. On this machine that resolves TypeScript 5.8.3 for `b100-am-ui`, `plugin-eslint`
 * and `plugin-stylelint`, 5.9.3 for `discovery-api`, 5.9.2 for `di_1700002_conversion_js`, and correctly
 * FAILS (`Cannot find module 'typescript'`) for `b100-publisher` and `di_1700002_discovery_fe`, which
 * carry no TypeScript of their own. There is no global fallback: `~/.claude` itself has no `typescript`
 * package, and none is added by this guard — a repository without one is a repository this guard
 * cannot verify, and that is reported as such, never silently treated as clean.
 *
 * The anchor filename passed to `createRequire` does not need to exist; only the DIRECTORY it names is
 * used to start the walk, so a not-yet-written file (a `Write` creating a brand-new path) resolves the
 * same as an existing one.
 *
 * @es Resuelve el compilador `typescript` que usaría el PROPIO REPOSITORIO dueño de un fichero — nunca
 * una copia guardada bajo `~/.claude/`, que no tiene `node_modules` propio y no debe ganar uno solo para
 * correr un hook. MEDIDO esta sesión, en procesos `node` frescos (sin caché entre llamadas):
 * `createRequire` desde un nombre sintético dentro del directorio del fichero reproduce la resolución
 * CommonJS de Node — subiendo por `node_modules` de cada directorio padre, igual que lo haría un script
 * real de ese repositorio. En esta máquina resuelve TypeScript 5.8.3 para `b100-am-ui`, `plugin-eslint`
 * y `plugin-stylelint`, 5.9.3 para `discovery-api`, 5.9.2 para `di_1700002_conversion_js`, y FALLA
 * correctamente para `b100-publisher` y `di_1700002_discovery_fe`, que no traen TypeScript propio. No
 * hay respaldo global: `~/.claude` no tiene paquete `typescript`, y esta guardia no le agrega uno — un
 * repositorio sin él es un repositorio que esta guardia no puede verificar, y así se informa, nunca se
 * trata como limpio en silencio.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @param {string} anchorFilePath Absolute (or cwd-resolved) path of the file being written. Only its
 *   directory is used; the file itself need not exist yet.
 * @returns {{ ts: object } | { error: string }} The `typescript` module, or why it could not be loaded.
 */
export function resolveTypeScript(anchorFilePath) {
  try {
    const anchorDir = path.dirname(path.resolve(anchorFilePath));
    const syntheticAnchor = path.join(anchorDir, '__type-assertion-guard-anchor__.cjs');
    const requireFromAnchor = createRequire(pathToFileURL(syntheticAnchor));
    const ts = requireFromAnchor('typescript');

    if (typeof ts?.createSourceFile !== 'function') return { error: "the resolved 'typescript' module has no createSourceFile — unexpected shape, refusing to guess" };

    return { ts };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
