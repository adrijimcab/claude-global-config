/**
 * Which specs a change reaches: every spec file that imports a changed file, directly or through any chain of
 * imports, plus a changed file that is itself a spec. A pure decision over an import graph, with no file system and
 * no compiler behind it; `import-graph.mjs` builds the graph from a real project.
 *
 *   relatedSpecs({ imports, changed, isSpec, keyOf }) -> string[]   sorted, each spec once
 *
 * `imports` maps a file to the files it imports (already resolved). The walk goes BACKWARDS, from each changed file
 * to the files that import it, and keeps going until no new importer appears, so a spec at the application root that
 * reaches a changed service through a component is listed too. `keyOf` folds a path into the form two spellings of
 * the same file share (case on Windows, separators), so the graph and the changed list may come from different
 * sources.
 *
 * @es Qué specs alcanza un cambio: todo spec que importa un fichero cambiado, directamente o por cualquier cadena de
 * imports, más un fichero cambiado que ya es spec. Es una decisión pura sobre un grafo de imports, sin sistema de
 * ficheros ni compilador detrás; `import-graph.mjs` construye el grafo desde un proyecto real. El recorrido va HACIA
 * ATRÁS, de cada fichero cambiado a los que lo importan, hasta que no aparece ningún importador nuevo, así que un spec
 * de la raíz de la aplicación que llega a un servicio cambiado a través de un componente también sale. `keyOf` pliega
 * una ruta a la forma que comparten dos escrituras del mismo fichero (mayúsculas en Windows, separadores).
 */

/**
 * @param {{ imports: Map<string, string[]>, changed: string[], isSpec: (file: string) => boolean, keyOf: (file: string) => string }} input
 * @returns {string[]}
 */
export function relatedSpecs({ imports, changed, isSpec, keyOf }) {
  const importers = new Map();
  const spelling = new Map();

  for (const [file, targets] of imports) {
    spelling.set(keyOf(file), file);

    for (const target of targets) {
      const key = keyOf(target);
      const list = importers.get(key) ?? [];

      list.push(file);
      importers.set(key, list);
    }
  }

  const reached = new Set();
  const pending = changed.map(keyOf);

  while (pending.length > 0) {
    const key = pending.pop();

    if (reached.has(key)) continue;
    reached.add(key);

    for (const importer of importers.get(key) ?? []) pending.push(keyOf(importer));
  }

  const specs = [...reached].map((key) => spelling.get(key) ?? changed.find((file) => keyOf(file) === key)).filter((file) => file !== undefined && isSpec(file));

  return [...new Set(specs)].sort();
}
