/**
 * The import graph of a TypeScript project, resolved by the project's own TypeScript: every `.ts` file under the
 * project root (dependency, build and cache folders excluded) mapped to the project files it imports. Resolution is the
 * compiler's (`ts.resolveModuleName` with the options of the project's tsconfig), so path aliases such as `@core/state`
 * and `b100-am-ui/testing` resolve exactly as the build resolves them; nothing here re-implements module resolution.
 * Dynamic `import('...')` counts, because routes load their pages that way.
 *
 *   loadTypeScript(root) -> the `typescript` module the project installs, or throws naming the root
 *   importGraph({ root, tsconfig, typescript }) -> Map<file, file[]>
 *
 * An import that resolves outside the root, or into a dependency folder, is left out: a spec never needs to run
 * because a package it uses changed.
 *
 * @es El grafo de imports de un proyecto TypeScript, resuelto por el TypeScript del propio proyecto: cada fichero `.ts`
 * bajo la raíz (sin carpetas de dependencias, build ni caché) con los ficheros del proyecto que importa. La resolución
 * es la del compilador (`ts.resolveModuleName` con las opciones del tsconfig del proyecto), así que los alias como
 * `@core/state` y `b100-am-ui/testing` resuelven igual que en el build; aquí no se reimplementa la resolución. Los
 * `import('...')` dinámicos cuentan, porque las rutas cargan así sus páginas. Un import que resuelve fuera de la raíz o
 * dentro de una carpeta de dependencias se deja fuera: un spec nunca necesita correr porque cambió un paquete que usa.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Folders that hold no project source. @es Carpetas que no tienen fuente del proyecto. */
const SKIPPED = new Set(['node_modules', 'dist', '.angular', '.git', 'coverage', '.nx', 'storybook-static']);

/** The `typescript` module installed for the project at `root`. @es El módulo `typescript` instalado para el proyecto en `root`. */
export function loadTypeScript(root) {
  let typescript;

  try {
    typescript = createRequire(path.join(root, 'package.json'))('typescript');
  } catch (error) {
    throw new Error(`no typescript is installed for ${root} (${error instanceof Error ? error.message : String(error)}) @es no hay typescript instalado para ${root}`);
  }

  // TypeScript 7 (the native compiler) exports no JavaScript compiler API; a graph built without it would be empty and
  // read as "no spec reaches the change". @es TypeScript 7 no exporta API de compilador en JavaScript; un grafo sin
  // ella saldría vacío y se leería como «ningún spec alcanza el cambio».
  if (typeof typescript.resolveModuleName !== 'function' || typescript.sys === undefined) {
    throw new Error(`the typescript of ${root} exports no compiler API (version ${String(typescript.version)}) @es el typescript de ${root} no exporta la API de compilador`);
  }

  return typescript;
}

/** Every `.ts` file under `directory`, skipping the folders that hold no source. @es Cada fichero `.ts` bajo `directory`. */
function sourceFiles(directory) {
  const found = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) found.push(...sourceFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      found.push(full);
    }
  }

  return found;
}

/** The compiler options of a tsconfig, read and parsed by TypeScript itself. @es Las opciones de un tsconfig, leídas por TypeScript. */
function compilerOptionsOf(typescript, tsconfig) {
  const read = typescript.readConfigFile(tsconfig, typescript.sys.readFile);

  if (read.error !== undefined) throw new Error(`cannot read ${tsconfig}: ${typescript.flattenDiagnosticMessageText(read.error.messageText, ' ')} @es no se puede leer ${tsconfig}`);

  return typescript.parseJsonConfigFileContent(read.config, typescript.sys, path.dirname(tsconfig), undefined, tsconfig).options;
}

/** Whether a resolved file is project source under `root`. @es Si un fichero resuelto es fuente del proyecto bajo `root`. */
function isProjectSource(root, file) {
  const relative = path.relative(root, file);

  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) && !relative.split(path.sep).some((part) => SKIPPED.has(part));
}

/**
 * @param {{ root: string, tsconfig: string, typescript: any }} input
 * @returns {Map<string, string[]>}
 */
export function importGraph({ root, tsconfig, typescript }) {
  const options = compilerOptionsOf(typescript, tsconfig);
  const graph = new Map();

  for (const file of sourceFiles(root)) {
    const { importedFiles } = typescript.preProcessFile(readFileSync(file, 'utf8'), true, true);
    const targets = [];

    for (const { fileName } of importedFiles) {
      const resolved = typescript.resolveModuleName(fileName, file, options, typescript.sys).resolvedModule?.resolvedFileName;

      if (resolved !== undefined && isProjectSource(root, path.resolve(resolved))) targets.push(path.resolve(resolved));
    }

    graph.set(file, targets);
  }

  return graph;
}
