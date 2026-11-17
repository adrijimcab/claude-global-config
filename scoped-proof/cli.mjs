#!/usr/bin/env node
/**
 * Prints the specs a change reaches, one path per line relative to the project root, ready for the runner's include
 * option: the scoped proof of a change runs every spec that imports a changed file, never only the specs of the
 * feature folder (lesson changed-file-own-spec-left-out-of-scoped-run, recurred 2x).
 *
 *   node cli.mjs --root <project> --tsconfig <its tsconfig> -- <changed file>...
 *       exit 0 the list (empty when no spec reaches the change), 2 not measured (bad arguments, no typescript, a
 *       tsconfig that cannot be read, a changed file outside the root)
 *
 * Changed files may be given relative to the root or absolute; `git diff --name-only <base>` output from the project
 * root fits as is.
 *
 * @es Imprime los specs que alcanza un cambio, una ruta por línea relativa a la raíz del proyecto, lista para la opción
 * include del runner: la prueba acotada de un cambio corre todo spec que importa un fichero cambiado, nunca solo los de
 * la carpeta de la feature. Salida 0 con la lista (vacía si ningún spec alcanza el cambio), 2 no medido (argumentos
 * erróneos, sin typescript, tsconfig ilegible, un fichero cambiado fuera de la raíz).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importGraph, loadTypeScript } from './import-graph.mjs';
import { relatedSpecs } from './related-specs.mjs';

const EXIT_NOT_MEASURED = 2;
const USAGE = 'Usage: node cli.mjs --root <project> --tsconfig <tsconfig> -- <changed file>... @es Uso: node cli.mjs --root <proyecto> --tsconfig <tsconfig> -- <fichero cambiado>...';

/** The path form two spellings of one file share on this platform. @es La forma de ruta que comparten dos escrituras de un fichero. */
const keyOf = (file) => {
  const resolved = path.resolve(file);

  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

/** The parsed arguments, or undefined when they do not fit the usage. @es Los argumentos, o undefined si no encajan. */
export function optionsOf(argv) {
  const separator = argv.indexOf('--');

  if (separator !== 4 || argv[0] !== '--root' || argv[2] !== '--tsconfig' || argv.length === separator + 1) return undefined;

  return { root: path.resolve(argv[1]), tsconfig: argv[3], changed: argv.slice(separator + 1) };
}

/**
 * The specs a change reaches, relative to the root. Throws when a changed file lies outside the root.
 * @es Los specs que alcanza un cambio, relativos a la raíz. Lanza si un fichero cambiado está fuera de la raíz.
 */
export function specsFor({ root, tsconfig, changed, typescript = loadTypeScript(root) }) {
  const absolute = changed.map((file) => path.resolve(root, file));
  const outside = absolute.filter((file) => path.relative(root, file).startsWith('..'));

  if (outside.length > 0) throw new Error(`changed file(s) outside ${root}: ${outside.join(', ')} @es fichero(s) cambiado(s) fuera de ${root}`);

  const imports = importGraph({ root, tsconfig: path.resolve(root, tsconfig), typescript });

  return relatedSpecs({ imports, changed: absolute, isSpec: (file) => file.endsWith('.spec.ts'), keyOf }).map((file) => path.relative(root, file).split(path.sep).join('/'));
}

function main() {
  const options = optionsOf(process.argv.slice(2));

  if (options === undefined) {
    console.error(USAGE);

    return EXIT_NOT_MEASURED;
  }

  try {
    const specs = specsFor(options);

    if (specs.length > 0) console.log(specs.join('\n'));

    return 0;
  } catch (error) {
    console.error(`NOT MEASURED — ${error instanceof Error ? error.message : String(error)} @es NO MEDIDO`);

    return EXIT_NOT_MEASURED;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) process.exitCode = main();
